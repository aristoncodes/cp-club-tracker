import { brokenHandle, cfSolves, type CfSubmission } from 'shared/cf';
import type { Bindings } from './auth';
import { checkBadges } from './badges';
import { CfError, fetchRatingHistory, fetchUserInfo, fetchUserStatus } from './cf';
import { insertSolves, markHandleBroken } from './records';

const HOUR = 3600;
const SOLVE_SYNC_HANDLES = 25;
const QUEUE_BUDGET_MS = 48_000;
const FIRST_SYNC_SUBMISSIONS = 50;
const RECENT_SUBMISSIONS = 10;
const JUDGING_MARGIN = 600;

async function reportIfBroken(db: D1Database, err: unknown): Promise<boolean> {
  const handle = err instanceof CfError ? brokenHandle(err.message) : null;
  if (handle) await markHandleBroken(db, 'cf', handle).run();
  return handle !== null;
}

type CfHandleRow = { userId: number; handle: string; syncedAt: number | null };

export const ratingHistoryIsDue = (syncedAt: number | null, now: number) => syncedAt === null || Math.floor(syncedAt / HOUR) !== Math.floor(now / HOUR);

// A handle's first fetch also reads its rating, so its first solves score correctly.
// Later fetches only write submissions newer than the last one, which keeps a once-a-minute sync inside D1's free write limit.
async function syncCfHandle(env: Bindings, row: CfHandleRow, now: number): Promise<CfSubmission[]> {
  const db = env.DB;
  try {
    if (row.syncedAt === null) {
      const [info] = await fetchUserInfo([row.handle]);
      await db.prepare('UPDATE users SET cf_rating = ? WHERE id = ?').bind(info?.rating ?? null, row.userId).run();
    }
    const submissions = await fetchUserStatus(row.handle, row.syncedAt === null ? FIRST_SYNC_SUBMISSIONS : RECENT_SUBMISSIONS);
    const since = row.syncedAt === null ? 0 : row.syncedAt - JUDGING_MARGIN;
    const solves = cfSolves(row.handle, submissions).filter((solve) => solve.solvedAt >= since);
    if (solves.length) await checkBadges(env, await insertSolves(db, solves));
    if (ratingHistoryIsDue(row.syncedAt, now)) {
      const history = await fetchRatingHistory(row.handle);
      await db
        .prepare('UPDATE users SET cf_rating_history = ? WHERE id = ?')
        .bind(
          JSON.stringify(history.map((c) => ({ at: c.ratingUpdateTimeSeconds, rating: c.newRating, contestId: c.contestId, delta: c.newRating - c.oldRating }))),
          row.userId,
        )
        .run();
    }
    await db.prepare(`UPDATE handles SET synced_at = ? WHERE user_id = ? AND platform = 'cf'`).bind(now, row.userId).run();
    return submissions;
  } catch (err) {
    if (!(await reportIfBroken(db, err))) console.error(`Solve sync failed for ${row.handle}:`, err);
    return [];
  }
}

// The only caller of Codeforces in the Worker, so the 2 s gap in cf.ts really is a gap.
export async function runCfQueue(env: Bindings, now: number): Promise<void> {
  const startedAt = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT h.user_id AS userId, h.handle, h.synced_at AS syncedAt FROM handles h JOIN users u ON u.id = h.user_id
     WHERE h.platform = 'cf' AND h.approved_at IS NOT NULL AND h.broken = 0 AND u.active = 1
     ORDER BY h.synced_at IS NOT NULL, h.synced_at LIMIT ?`,
  )
    .bind(SOLVE_SYNC_HANDLES)
    .all<CfHandleRow>();
  for (const row of results) {
    if (Date.now() - startedAt > QUEUE_BUDGET_MS) return;
    await syncCfHandle(env, row, now);
  }
}

export async function refreshRatings(db: D1Database): Promise<void> {
  const { results } = await db
    .prepare(
      `SELECT h.user_id AS userId, h.handle FROM handles h JOIN users u ON u.id = h.user_id
       WHERE h.platform = 'cf' AND h.approved_at IS NOT NULL AND h.broken = 0 AND u.active = 1`,
    )
    .all<{ userId: number; handle: string }>();
  if (!results.length) return;
  let info: { handle: string; rating?: number }[];
  try {
    info = await fetchUserInfo(results.map((r) => r.handle));
  } catch (err) {
    if (await reportIfBroken(db, err)) return;
    throw err;
  }
  const ratings = new Map(info.map((user) => [user.handle.toLowerCase(), user.rating ?? null]));
  const update = db.prepare('UPDATE users SET cf_rating = ? WHERE id = ?');
  const known = results.filter((r) => ratings.has(r.handle.toLowerCase()));
  if (known.length) await db.batch(known.map((r) => update.bind(ratings.get(r.handle.toLowerCase()) ?? null, r.userId)));
}
