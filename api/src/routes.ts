import { Hono } from 'hono';
import { CHALLENGE_MIN_RATING, CHALLENGE_TARGET } from 'shared/scoring';
import { IST_OFFSET, istDay, periodStart, solveStreak } from 'shared/time';
import type { Period } from 'shared/types';
import { canFinishOnboarding, normalizeUsername, usernameError } from './accounts';
import { requireUser, type AppEnv } from './auth';

const PLATFORMS = ['cf', 'cc', 'atcoder', 'leetcode'];
const REASON_TYPES = ['exams', 'travel', 'illness', 'clash', 'forgot', 'other'];
const PERIODS = ['day', 'week', 'month'];
const FEED_SIZE = 30;
const HEATMAP_DAYS = 183;
const TOP_TAGS = 6;
const WEAK_TAGS = 2;
const RECENT_SOLVES = 8;
const PROFILE_CONTESTS = 6;
const PAST_CONTESTS = 20;
const TOP_EXTRAS = 3;
const NOTIFY_COLUMNS: Record<string, string> = {
  notifyHour: 'notify_hour',
  notifyRsvp: 'notify_rsvp',
  notifyResult: 'notify_result',
  notifyStreak: 'notify_streak',
  notifyMeals: 'notify_meals',
  notifyPractice: 'notify_practice',
  notifyRival: 'notify_rival',
  notifyBadges: 'notify_badges',
  notifyRecap: 'notify_recap',
};

type DuelFeedRow = { id: number; status: string; winnerId: number | null; time: number | null; finishedAt: number; rating: number | null; aId: number; aName: string; bId: number; bName: string };

export function duelFeedText({ status, winnerId, time, rating, aId, aName, bName }: Pick<DuelFeedRow, 'status' | 'winnerId' | 'time' | 'rating' | 'aId' | 'aName' | 'bName'>): string {
  const problem = rating ? `a ${rating}` : 'a problem';
  if (status === 'draw') return `@${aName} and @${bName} drew on ${problem}: nobody solved it`;
  const [winner, loser] = winnerId === aId ? [aName, bName] : [bName, aName];
  return time === null ? `@${winner} beat @${loser} on ${problem}` : `@${winner} beat @${loser} on ${problem} in ${Math.max(1, Math.round(time / 60))} min`;
}

type ReasonBody = { reasonType?: string; reasonText?: string };

function reasonError({ reasonType, reasonText }: ReasonBody): string | null {
  if (!reasonType || !REASON_TYPES.includes(reasonType)) return 'A valid reason type is required';
  if (reasonType === 'other' && !reasonText?.trim()) return 'Please say a little about the reason';
  return null;
}

export function withRanks<T extends { points: number }>(rows: T[]): (T & { rank: number })[] {
  const rounded = rows.map((row) => ({ ...row, points: Math.round(row.points * 10) / 10 }));
  return rounded.map((row) => ({ ...row, rank: rounded.findIndex((r) => r.points === row.points) + 1 }));
}

export function biggestClimbers<T extends { userId: number; rank: number }>(
  current: T[],
  previous: { userId: number; rank: number }[],
): (T & { gained: number })[] {
  const before = new Map(previous.map((row) => [row.userId, row.rank]));
  return current
    .flatMap((row) => {
      const earlier = before.get(row.userId);
      return earlier && earlier > row.rank ? [{ ...row, gained: earlier - row.rank }] : [];
    })
    .sort((a, b) => b.gained - a.gained)
    .slice(0, TOP_EXTRAS);
}

type RatingPoint = { contestId: number; delta: number };

async function pastContests(db: D1Database, userId: number, before: number, limit: number) {
  const history = await db.prepare('SELECT cf_rating_history AS history FROM users WHERE id = ?').bind(userId).first<{ history: string | null }>();
  const deltas = new Map((JSON.parse(history?.history ?? '[]') as RatingPoint[]).map((p) => [String(p.contestId), p.delta]));
  const { results } = await db
    .prepare(
      `SELECT c.id, c.platform, c.external_id AS externalId, c.alt_external_id AS altExternalId, c.name, c.url,
              c.start_at AS startAt, a.status, a.rsvp, a.reason_type AS reasonType, a.reason_text AS reasonText,
              (SELECT COUNT(*) FROM solves s WHERE s.user_id = ?1 AND s.live = 1 AND s.solved_at BETWEEN c.start_at AND c.end_at) AS liveSolves
       FROM contests c LEFT JOIN attendance a ON a.contest_id = c.id AND a.user_id = ?1
       WHERE c.counts = 1 AND c.end_at < unixepoch() AND c.start_at < ?2
       ORDER BY c.start_at DESC LIMIT ?3`,
    )
    .bind(userId, before, limit)
    .all<{ externalId: string; altExternalId: string | null; platform: string }>();
  return results.map(({ externalId, altExternalId, ...row }) => ({
    ...row,
    ratingDelta: row.platform === 'cf' ? (deltas.get(externalId) ?? deltas.get(altExternalId ?? '') ?? null) : null,
  }));
}

export const studentRoutes = new Hono<AppEnv>();

studentRoutes.use(requireUser);

studentRoutes.get('/me', async (c) => {
  const user = c.get('user');
  const now = Math.floor(Date.now() / 1000);
  const [handles, pendingReasons, days, unread, newBadges] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT platform, handle, approved_at IS NOT NULL AS approved FROM handles WHERE user_id = ?`,
    ).bind(user.id),
    c.env.DB.prepare(
      `SELECT c.id, c.name FROM attendance a JOIN contests c ON c.id = a.contest_id
       WHERE a.user_id = ? AND a.status = 'absent' AND a.reason_type IS NULL AND c.counts = 1
       ORDER BY c.start_at DESC`,
    ).bind(user.id),
    c.env.DB.prepare(
      `SELECT (solved_at + ${IST_OFFSET}) / 86400 AS day FROM solves WHERE user_id = ? AND solved_at >= ? GROUP BY day`,
    ).bind(user.id, now - HEATMAP_DAYS * 86400),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM announcements a JOIN users u ON u.id = ?
       WHERE a.sent_at > u.inbox_seen_at AND (a.audience = 'all' OR (a.audience = 'admins' AND u.role = 'admin') OR (a.audience = 'batch' AND u.batch_year = a.batch_year))`,
    ).bind(user.id),
    c.env.DB.prepare('SELECT badge FROM badges WHERE user_id = ? AND seen_at IS NULL ORDER BY earned_at').bind(user.id),
  ]);
  const streak = solveStreak((days.results as { day: number }[]).map((d) => d.day), istDay(now));
  return c.json({ user, handles: handles.results, pendingReasons: pendingReasons.results, streak, unreadAnnouncements: (unread.results[0] as { n: number }).n, newBadges: (newBadges.results as { badge: string }[]).map((row) => row.badge) });
});

studentRoutes.put('/me', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ name?: string; batchYear?: number; username?: string }>();
  if (!body.name?.trim() || !Number.isInteger(body.batchYear)) {
    return c.json({ error: 'Name and year are required' }, 400);
  }
  const username = body.username === undefined || user.onboardingStep === 'done' ? user.username : normalizeUsername(body.username);
  const invalid = username && username !== user.username ? usernameError(username) : null;
  if (invalid) return c.json({ error: invalid }, 400);
  try {
    await c.env.DB.prepare('UPDATE users SET name = ?, batch_year = ?, username = ? WHERE id = ?')
      .bind(body.name.trim(), body.batchYear, username, user.id)
      .run();
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) return c.json({ error: 'That name is taken' }, 409);
    throw err;
  }
  return c.json({ ok: true });
});

studentRoutes.post('/me/onboarding', async (c) => {
  const user = c.get('user');
  const required = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM handles WHERE user_id = ? AND platform IN ('cf', 'cc')`)
    .bind(user.id)
    .first<{ n: number }>();
  const allowed = canFinishOnboarding({
    hasUsername: !!user.username,
    hasBatch: !!user.batchYear,
    hasRequiredHandles: required?.n === 2,
    isAdmin: user.role === 'admin',
  });
  if (!allowed) return c.json({ error: 'Add your username, year and handles first' }, 400);
  await c.env.DB.prepare(`UPDATE users SET onboarding_step = 'done' WHERE id = ?`).bind(user.id).run();
  return c.json({ ok: true });
});

studentRoutes.patch('/me/username', async (c) => {
  const user = c.get('user');
  if (user.usernameChangesLeft < 1) return c.json({ error: "You've used your one change" }, 403);
  const username = normalizeUsername((await c.req.json<{ username?: string }>()).username);
  const invalid = usernameError(username);
  if (invalid) return c.json({ error: invalid }, 400);
  if (username === user.username) return c.json({ ok: true });
  try {
    await c.env.DB.prepare('UPDATE users SET username = ?, username_changes = username_changes + 1 WHERE id = ?').bind(username, user.id).run();
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) return c.json({ error: 'That name is taken' }, 409);
    throw err;
  }
  return c.json({ ok: true });
});

studentRoutes.patch('/me/notifications', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const updates = Object.entries(NOTIFY_COLUMNS).filter(([key]) => typeof body[key] === 'boolean');
  if (!updates.length) return c.json({ error: 'Nothing to update' }, 400);
  await c.env.DB.prepare(`UPDATE users SET ${updates.map(([, column]) => `${column} = ?`).join(', ')} WHERE id = ?`)
    .bind(...updates.map(([key]) => (body[key] ? 1 : 0)), c.get('user').id)
    .run();
  return c.json({ ok: true });
});

studentRoutes.put('/me/handles/:platform', async (c) => {
  const platform = c.req.param('platform');
  const { handle } = await c.req.json<{ handle?: string }>();
  if (!PLATFORMS.includes(platform)) return c.json({ error: 'Unknown platform' }, 400);
  if (!handle?.trim()) return c.json({ error: 'Handle is required' }, 400);
  try {
    await c.env.DB.prepare(
      `INSERT INTO handles (user_id, platform, handle) VALUES (?, ?, ?)
       ON CONFLICT (user_id, platform) DO UPDATE SET
         handle = excluded.handle,
         approved_at = CASE WHEN handle = excluded.handle THEN approved_at END,
         broken = CASE WHEN handle = excluded.handle THEN broken ELSE 0 END,
         synced_at = CASE WHEN handle = excluded.handle THEN synced_at END,
         history_imported_at = CASE WHEN handle = excluded.handle THEN history_imported_at END`,
    )
      .bind(c.get('user').id, platform, handle.trim())
      .run();
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      return c.json({ error: 'That handle is already linked to another student' }, 409);
    }
    throw err;
  }
  return c.json({ ok: true });
});

studentRoutes.post('/me/push-token', async (c) => {
  const { token, kind } = await c.req.json<{ token?: string; kind?: string }>();
  if (!token || (kind !== 'expo' && kind !== 'web')) {
    return c.json({ error: 'token and a valid kind are required' }, 400);
  }
  await c.env.DB.prepare('INSERT OR REPLACE INTO push_tokens (token, user_id, kind) VALUES (?, ?, ?)')
    .bind(token, c.get('user').id, kind)
    .run();
  return c.json({ ok: true });
});

studentRoutes.get('/contests/upcoming', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.platform, c.name, c.url, c.start_at AS startAt, c.end_at AS endAt, c.kind, a.rsvp,
            (SELECT COUNT(*) FROM attendance x WHERE x.contest_id = c.id AND x.rsvp = 'yes') AS goingCount,
            (SELECT COUNT(*) FROM handles h JOIN users u ON u.id = h.user_id
             WHERE h.platform = c.platform AND h.approved_at IS NOT NULL AND u.active = 1) AS participantCount
     FROM contests c LEFT JOIN attendance a ON a.contest_id = c.id AND a.user_id = ?
     WHERE (c.counts = 1 OR c.kind = 'virtual') AND c.start_at > unixepoch()
     ORDER BY c.start_at LIMIT 10`,
  )
    .bind(c.get('user').id)
    .all();
  return c.json(results);
});

studentRoutes.get('/contests/past', async (c) => {
  const before = Number(c.req.query('before')) || Math.floor(Date.now() / 1000);
  return c.json(await pastContests(c.env.DB, c.get('user').id, before, PAST_CONTESTS));
});

studentRoutes.post('/contests/:id/rsvp', async (c) => {
  const userId = c.get('user').id;
  const contestId = Number(c.req.param('id'));
  const body = await c.req.json<ReasonBody & { going?: boolean }>();
  if (typeof body.going !== 'boolean') return c.json({ error: 'going must be true or false' }, 400);
  const invalid = body.going ? null : reasonError(body);
  if (invalid) return c.json({ error: invalid }, 400);

  const contest = await c.env.DB.prepare(
    `SELECT c.stage FROM contests c
     JOIN handles h ON h.platform = c.platform AND h.user_id = ? AND h.approved_at IS NOT NULL
     WHERE c.id = ? AND (c.counts = 1 OR c.kind = 'virtual')`,
  )
    .bind(userId, contestId)
    .first<{ stage: number }>();
  if (!contest) return c.json({ error: 'Contest not found' }, 404);
  if (contest.stage === 4) return c.json({ error: 'This contest has already been verified' }, 409);

  await c.env.DB.prepare(
    `INSERT INTO attendance (contest_id, user_id, rsvp, reason_type, reason_text) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (contest_id, user_id) DO UPDATE SET
       rsvp = excluded.rsvp,
       reason_type = excluded.reason_type,
       reason_text = excluded.reason_text`,
  )
    .bind(
      contestId,
      userId,
      body.going ? 'yes' : 'no',
      body.going ? null : body.reasonType,
      body.going ? null : body.reasonText?.trim() || null,
    )
    .run();
  return c.json({ ok: true });
});

studentRoutes.post('/contests/:id/reason', async (c) => {
  const body = await c.req.json<ReasonBody>();
  const invalid = reasonError(body);
  if (invalid) return c.json({ error: invalid }, 400);
  const result = await c.env.DB.prepare(
    `UPDATE attendance SET reason_type = ?, reason_text = ?
     WHERE contest_id = ? AND user_id = ? AND status = 'absent'`,
  )
    .bind(body.reasonType, body.reasonText?.trim() || null, Number(c.req.param('id')), c.get('user').id)
    .run();
  if (!result.meta.changes) return c.json({ error: 'You were not marked absent for this contest' }, 409);
  return c.json({ ok: true });
});

type PeriodWindow = { start: number; previousStart: number };

function periodWindow(period: Period, now: number): PeriodWindow {
  const start = periodStart(period, now);
  return { start, previousStart: periodStart(period, start - 1) };
}

function leaderboardQueries(db: D1Database, { start, previousStart }: PeriodWindow, batch: number | null, platform: string | null) {
  const filters = (b: number, p: number) => `AND (?${b} IS NULL OR u.batch_year = ?${b}) AND (?${p} IS NULL OR s.platform = ?${p})`;
  return [
    db
      .prepare(
        `SELECT u.id AS userId, u.name, u.username, u.batch_year AS batchYear, u.cf_rating AS cfRating,
                SUM(s.points) AS points, COUNT(*) AS solves, MAX(s.rp) AS hardest
         FROM solves s JOIN users u ON u.id = s.user_id
         WHERE s.solved_at >= ?1 AND s.points > 0 AND u.active = 1 ${filters(2, 3)}
         GROUP BY u.id ORDER BY points DESC`,
      )
      .bind(start, batch, platform),
    db
      .prepare(
        `SELECT s.user_id AS userId, SUM(s.points) AS points
         FROM solves s JOIN users u ON u.id = s.user_id
         WHERE s.solved_at >= ?1 AND s.solved_at < ?2 AND s.points > 0 AND u.active = 1 ${filters(3, 4)}
         GROUP BY s.user_id ORDER BY points DESC`,
      )
      .bind(previousStart, start, batch, platform),
  ] as const;
}

function periodFrom(value: string | undefined): Period | null {
  return PERIODS.includes(value ?? 'day') ? ((value ?? 'day') as Period) : null;
}

studentRoutes.get('/leaderboard', async (c) => {
  const period = periodFrom(c.req.query('period'));
  if (!period) return c.json({ error: 'period must be day, week or month' }, 400);
  const window = periodWindow(period, Math.floor(Date.now() / 1000));
  const [current, previous] = await c.env.DB.batch<{ userId: number; points: number }>([
    ...leaderboardQueries(c.env.DB, window, Number(c.req.query('batch')) || null, c.req.query('platform') || null),
  ]);
  const earlierRank = new Map(withRanks(previous.results).map((row) => [row.userId, row.rank]));
  return c.json(
    withRanks(current.results).map((row) => {
      const before = earlierRank.get(row.userId);
      return { ...row, moved: before ? before - row.rank : null };
    }),
  );
});

studentRoutes.get('/leaderboard/extras', async (c) => {
  const period = periodFrom(c.req.query('period'));
  if (!period) return c.json({ error: 'period must be day, week or month' }, 400);
  const platform = c.req.query('platform') || null;
  const db = c.env.DB;
  const window = periodWindow(period, Math.floor(Date.now() / 1000));
  const [current, previous, years, toughest] = await db.batch<Record<string, unknown>>([
    ...leaderboardQueries(db, window, null, platform),
    db
      .prepare(
        `SELECT u.batch_year AS batchYear, SUM(s.points) AS points
         FROM solves s JOIN users u ON u.id = s.user_id
         WHERE s.solved_at >= ?1 AND s.points > 0 AND u.active = 1 AND u.batch_year IS NOT NULL AND (?2 IS NULL OR s.platform = ?2)
         GROUP BY u.batch_year`,
      )
      .bind(window.start, platform),
    db
      .prepare(
        `SELECT s.user_id AS userId, u.name, u.username, s.platform, s.problem_id AS problemId, p.name AS problemName, s.rp
         FROM solves s JOIN users u ON u.id = s.user_id
         LEFT JOIN problems p ON p.platform = s.platform AND p.problem_id = s.problem_id
         WHERE s.solved_at >= ?1 AND s.points > 0 AND u.active = 1 AND (?2 IS NULL OR s.platform = ?2)
         ORDER BY s.rp DESC, s.solved_at DESC LIMIT ${TOP_EXTRAS}`,
      )
      .bind(window.start, platform),
  ]);
  const ranked = withRanks(current.results as { userId: number; points: number; name: string; username: string | null }[]);
  const before = withRanks(previous.results as { userId: number; points: number }[]);
  return c.json({ years: years.results, climbers: biggestClimbers(ranked, before), toughest: toughest.results });
});

studentRoutes.get('/challenge', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS solved, COUNT(CASE WHEN s.user_id = ?3 THEN 1 END) AS mine
     FROM solves s JOIN users u ON u.id = s.user_id
     WHERE s.solved_at >= ?1 AND s.rp >= ?2 AND s.points > 0 AND u.active = 1`,
  )
    .bind(periodStart('week', Math.floor(Date.now() / 1000)), CHALLENGE_MIN_RATING, c.get('user').id)
    .first<{ solved: number; mine: number }>();
  return c.json({ solved: row?.solved ?? 0, mine: row?.mine ?? 0, target: CHALLENGE_TARGET, minRating: CHALLENGE_MIN_RATING });
});

studentRoutes.get('/feed', async (c) => {
  const before = Number(c.req.query('before')) || Math.floor(Date.now() / 1000) + 1;
  const db = c.env.DB;
  const [solves, duels] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT s.user_id AS userId, u.name, u.username, s.platform, s.problem_id AS problemId, p.name AS problemName, p.url,
                p.tags, s.rp, s.points, s.live, s.solved_at AS solvedAt
         FROM solves s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN problems p ON p.platform = s.platform AND p.problem_id = s.problem_id
         WHERE s.solved_at < ? AND s.points > 0 AND u.active = 1
         ORDER BY s.solved_at DESC LIMIT ?`,
      )
      .bind(before, FEED_SIZE),
    db
      .prepare(
        `SELECT d.id, d.status, d.winner_id AS winnerId, d.winning_time AS time, d.finished_at AS finishedAt, p.rating,
                d.challenger_id AS aId, a.username AS aName, d.opponent_id AS bId, b.username AS bName
         FROM duels d JOIN users a ON a.id = d.challenger_id JOIN users b ON b.id = d.opponent_id
         LEFT JOIN problems p ON p.platform = 'cf' AND p.problem_id = d.problem_id
         WHERE d.status IN ('won','draw') AND d.finished_at < ? ORDER BY d.finished_at DESC LIMIT ?`,
      )
      .bind(before, FEED_SIZE),
  ]);
  const solveItems = (solves.results as { tags: string | null; solvedAt: number }[]).map((row) => ({ ...row, kind: 'solve', tags: row.tags ? JSON.parse(row.tags) : [] }));
  const duelItems = (duels.results as DuelFeedRow[]).map((row) => ({ kind: 'duel', id: row.id, userId: row.winnerId ?? row.aId, solvedAt: row.finishedAt, text: duelFeedText(row) }));
  return c.json([...solveItems, ...duelItems].sort((x, y) => y.solvedAt - x.solvedAt).slice(0, FEED_SIZE));
});

studentRoutes.get('/users/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const viewer = c.get('user');
  const seesPrivate = viewer.id === id || viewer.role === 'admin';
  const db = c.env.DB;
  const now = Math.floor(Date.now() / 1000);
  const today = istDay(now);
  const profile = await db
    .prepare(
      'SELECT id, name, username, batch_year AS batchYear, cf_rating AS cfRating, cf_rating_history AS ratingHistory FROM users WHERE id = ? AND active = 1',
    )
    .bind(id)
    .first<{ ratingHistory: string | null }>();
  if (!profile) return c.json({ error: 'Student not found' }, 404);

  const tagQuery = (order: string, limit: number) =>
    db
      .prepare(
        `SELECT t.value AS tag, COUNT(*) AS count
         FROM solves s JOIN problems p ON p.platform = s.platform AND p.problem_id = s.problem_id, json_each(p.tags) t
         WHERE s.user_id = ? AND p.tags IS NOT NULL
         GROUP BY t.value ORDER BY count ${order}, t.value LIMIT ${limit}`,
      )
      .bind(id);
  const [handles, stats, days, topTags, weakTags, recent, attendance] = await db.batch([
    db
      .prepare(
        `SELECT platform, handle, approved_at IS NOT NULL AS approved FROM handles WHERE user_id = ?1 AND (?2 OR approved_at IS NOT NULL)`,
      )
      .bind(id, seesPrivate ? 1 : 0),
    db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN solved_at >= ?1 THEN points END), 0) AS dayPoints,
           COUNT(CASE WHEN solved_at >= ?1 AND points > 0 THEN 1 END) AS daySolves,
           COALESCE(SUM(CASE WHEN solved_at >= ?2 THEN points END), 0) AS weekPoints,
           COUNT(CASE WHEN solved_at >= ?2 AND points > 0 THEN 1 END) AS weekSolves,
           COALESCE(SUM(CASE WHEN solved_at >= ?3 THEN points END), 0) AS monthPoints,
           COUNT(CASE WHEN solved_at >= ?3 AND points > 0 THEN 1 END) AS monthSolves,
           COUNT(*) AS totalSolves
         FROM solves WHERE user_id = ?4`,
      )
      .bind(periodStart('day', now), periodStart('week', now), periodStart('month', now), id),
    db
      .prepare(
        `SELECT (solved_at + ${IST_OFFSET}) / 86400 AS day, COUNT(*) AS count
         FROM solves WHERE user_id = ? AND solved_at >= ? GROUP BY day`,
      )
      .bind(id, now - HEATMAP_DAYS * 86400),
    tagQuery('DESC', TOP_TAGS),
    tagQuery('ASC', WEAK_TAGS),
    db
      .prepare(
        `SELECT s.platform, s.problem_id AS problemId, p.name AS problemName, p.url, p.tags, s.rp, s.points, s.solved_at AS solvedAt
         FROM solves s LEFT JOIN problems p ON p.platform = s.platform AND p.problem_id = s.problem_id
         WHERE s.user_id = ? AND s.points > 0 ORDER BY s.solved_at DESC LIMIT ${RECENT_SOLVES}`,
      )
      .bind(id),
    db
      .prepare(
        `SELECT COUNT(*) AS total, COUNT(CASE WHEN a.status = 'present' THEN 1 END) AS present
         FROM attendance a JOIN contests c ON c.id = a.contest_id
         WHERE a.user_id = ? AND c.counts = 1 AND a.status IS NOT NULL`,
      )
      .bind(id),
  ]);
  const heatmap = days.results as { day: number; count: number }[];
  const { ratingHistory, ...rest } = profile;
  return c.json({
    ...rest,
    ratingHistory: JSON.parse(ratingHistory ?? '[]'),
    handles: handles.results,
    stats: stats.results[0],
    streak: solveStreak(heatmap.map((d) => d.day), today),
    topTags: topTags.results,
    weakTags: weakTags.results,
    recentSolves: (recent.results as { tags: string | null }[]).map((row) => ({ ...row, tags: row.tags ? JSON.parse(row.tags) : [] })),
    heatmap,
    today,
    ...(seesPrivate ? { attendance: attendance.results[0], contests: await pastContests(db, id, now, PROFILE_CONTESTS) } : {}),
  });
});
