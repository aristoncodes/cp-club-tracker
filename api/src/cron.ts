import { brokenHandle, cfSolves } from 'shared/cf';
import { formatIST } from 'shared/time';
import { CfError, fetchUserInfo, fetchUserStatus } from './cf';
import type { Bindings } from './auth';
import { sendPushes, type PushMessage } from './push';
import { createAttendanceRows, insertSolves, markHandleBroken } from './records';

const REMINDER_LEAD = 3600;
const RSVP_LEAD = 300;
const VERIFY_DELAY = 900;
const HOUR = 3600;
const REDISPATCH_FOR = 86400;
const CRON_TICK = 60;
const SOLVE_SYNC_MINUTES = 10;
const SOLVE_SYNC_STUDENTS = 4;
const RATING_REFRESH_SECOND_OF_DAY = 18.5 * HOUR;

type ContestRow = {
  id: number;
  platform: string;
  external_id: string;
  alt_external_id: string | null;
  name: string;
  url: string;
  start_at: number;
  end_at: number;
  counts: number;
  stage: number;
};

export function contestAction(contest: ContestRow, now: number): 'reminder' | 'rsvp' | 'catchup' | 'verify' | null {
  if (!contest.counts || contest.stage >= 4) return null;
  const sinceVerify = now - (contest.end_at + VERIFY_DELAY);
  if (contest.stage === 3) {
    const retry = sinceVerify >= HOUR && sinceVerify <= REDISPATCH_FOR && sinceVerify % HOUR < CRON_TICK;
    return retry ? 'verify' : null;
  }
  if (sinceVerify >= 0) return 'verify';
  if (contest.stage === 2) return null;
  if (now >= contest.start_at) return 'catchup';
  if (now >= contest.start_at - RSVP_LEAD) return 'rsvp';
  if (contest.stage === 0 && now >= contest.start_at - REMINDER_LEAD) return 'reminder';
  return null;
}

export const isSolveSyncTick = (now: number) => now % (SOLVE_SYNC_MINUTES * CRON_TICK) < CRON_TICK;

export function isRatingRefreshTick(now: number): boolean {
  const secondOfDay = now % 86400;
  return secondOfDay >= RATING_REFRESH_SECOND_OF_DAY && secondOfDay < RATING_REFRESH_SECOND_OF_DAY + CRON_TICK;
}

async function participantTokens(db: D1Database, platform: string): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT p.token FROM push_tokens p
       JOIN users u ON u.id = p.user_id
       JOIN handles h ON h.user_id = u.id
       WHERE u.active = 1 AND h.platform = ? AND h.approved_at IS NOT NULL`,
    )
    .bind(platform)
    .all<{ token: string }>();
  return results.map((r) => r.token);
}

function setStage(db: D1Database, contest: ContestRow, stage: number): Promise<D1Result> {
  return db.prepare('UPDATE contests SET stage = ? WHERE id = ?').bind(stage, contest.id).run();
}

async function dispatchWorkflow(env: Bindings, workflow: string, inputs: Record<string, string> = {}): Promise<void> {
  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'User-Agent': 'cp-club-tracker',
    },
    body: JSON.stringify({ ref: 'main', inputs }),
  });
  if (!response.ok) throw new Error(`GitHub dispatch returned ${response.status}: ${await response.text()}`);
}

async function advanceContest(env: Bindings, contest: ContestRow, now: number): Promise<void> {
  const db = env.DB;
  const action = contestAction(contest, now);
  if (!action) return;

  if (action === 'verify') {
    await dispatchWorkflow(env, 'participation.yml', {
      platform: contest.platform,
      contest: contest.external_id,
      alt: contest.alt_external_id ?? '',
      start: String(contest.start_at),
      end: String(contest.end_at),
    });
    await setStage(db, contest, 3);
    return;
  }

  if (action === 'reminder') {
    const startsAt = formatIST(contest.start_at).split(' · ')[1];
    const tokens = await participantTokens(db, contest.platform);
    const messages: PushMessage[] = tokens.map((to) => ({
      to,
      body: `${contest.name} starts at ${startsAt} — in 1 hour.`,
      data: { url: contest.url },
    }));
    await sendPushes(env, messages);
    await setStage(db, contest, 1);
    return;
  }

  await createAttendanceRows(db, contest).run();
  if (action === 'rsvp') {
    const tokens = await participantTokens(db, contest.platform);
    const messages: PushMessage[] = tokens.map((to) => ({
      to,
      body: `${contest.name} starts in 5 min. Giving it?`,
      categoryId: 'rsvp',
      data: { contestId: contest.id },
    }));
    await sendPushes(env, messages);
  }
  await setStage(db, contest, 2);
}

async function reportIfBroken(db: D1Database, err: unknown): Promise<boolean> {
  const handle = err instanceof CfError ? brokenHandle(err.message) : null;
  if (handle) await markHandleBroken(db, 'cf', handle).run();
  return handle !== null;
}

type CfHandleRow = { userId: number; handle: string; syncedAt: number | null };

// A handle's first fetch also reads its rating, so its first solves score correctly.
async function syncCfHandle(db: D1Database, row: CfHandleRow, now: number): Promise<void> {
  try {
    if (row.syncedAt === null) {
      const [info] = await fetchUserInfo([row.handle]);
      await db.prepare('UPDATE users SET cf_rating = ? WHERE id = ?').bind(info?.rating ?? null, row.userId).run();
    }
    await insertSolves(db, cfSolves(row.handle, await fetchUserStatus(row.handle)));
    await db.prepare(`UPDATE handles SET synced_at = ? WHERE user_id = ? AND platform = 'cf'`).bind(now, row.userId).run();
  } catch (err) {
    if (!(await reportIfBroken(db, err))) console.error(`Solve sync failed for ${row.handle}:`, err);
  }
}

async function syncCfSolves(db: D1Database, now: number, onlyNewHandles: boolean): Promise<void> {
  const { results } = await db
    .prepare(
      `SELECT h.user_id AS userId, h.handle, h.synced_at AS syncedAt FROM handles h JOIN users u ON u.id = h.user_id
       WHERE h.platform = 'cf' AND h.approved_at IS NOT NULL AND h.broken = 0 AND u.active = 1
         ${onlyNewHandles ? 'AND h.synced_at IS NULL' : ''}
       ORDER BY h.synced_at IS NOT NULL, h.synced_at LIMIT ?`,
    )
    .bind(SOLVE_SYNC_STUDENTS)
    .all<CfHandleRow>();
  for (const row of results) await syncCfHandle(db, row, now);
}

export async function syncNewlyApproved(env: Bindings, userId: number, platform: string, now: number): Promise<void> {
  const row = await env.DB.prepare(`SELECT user_id AS userId, handle, synced_at AS syncedAt FROM handles WHERE user_id = ? AND platform = ?`)
    .bind(userId, platform)
    .first<CfHandleRow>();
  if (!row) return;
  if (platform === 'cf') await syncCfHandle(env.DB, row, now);
  await dispatchWorkflow(env, 'backfill.yml', { platform, handle: row.handle });
}

async function refreshRatings(db: D1Database): Promise<void> {
  const { results } = await db
    .prepare(
      `SELECT h.user_id AS userId, h.handle FROM handles h JOIN users u ON u.id = h.user_id
       WHERE h.platform = 'cf' AND h.approved_at IS NOT NULL AND h.broken = 0 AND u.active = 1`,
    )
    .all<{ userId: number; handle: string }>();
  if (!results.length) return;
  const info = await fetchUserInfo(results.map((r) => r.handle));
  const ratings = new Map(info.map((user) => [user.handle.toLowerCase(), user.rating ?? null]));
  const update = db.prepare('UPDATE users SET cf_rating = ? WHERE id = ?');
  const known = results.filter((r) => ratings.has(r.handle.toLowerCase()));
  if (known.length) await db.batch(known.map((r) => update.bind(ratings.get(r.handle.toLowerCase()) ?? null, r.userId)));
}

async function attempt(label: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (err) {
    console.error(`Cron failed: ${label}:`, err);
  }
}

export async function runCron(env: Bindings, now: number): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT id, platform, external_id, alt_external_id, name, url, start_at, end_at, counts, stage
     FROM contests WHERE counts = 1 AND stage < 4 AND start_at <= ?`,
  )
    .bind(now + REMINDER_LEAD)
    .all<ContestRow>();
  for (const contest of results) {
    await attempt(`contest ${contest.id}`, () => advanceContest(env, contest, now));
  }
  await attempt('solve sync', () => syncCfSolves(env.DB, now, !isSolveSyncTick(now)));
  if (isRatingRefreshTick(now)) {
    await attempt('rating refresh', async () => {
      try {
        await refreshRatings(env.DB);
      } catch (err) {
        if (!(await reportIfBroken(env.DB, err))) throw err;
      }
    });
  }
}
