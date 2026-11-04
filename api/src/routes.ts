import { Hono } from 'hono';
import { IST_OFFSET, istDay, periodStart, solveStreak } from 'shared/time';
import type { Period } from 'shared/types';
import { requireUser, type AppEnv } from './auth';

const PLATFORMS = ['cf', 'cc', 'atcoder', 'leetcode'];
const REASON_TYPES = ['exams', 'travel', 'illness', 'clash', 'forgot', 'other'];
const PERIODS = ['day', 'week', 'month'];
const FEED_SIZE = 30;
const HEATMAP_DAYS = 183;
const TOP_TAGS = 5;
const MOVEMENT_WINDOW = 86400;
const CHALLENGE_TARGET = 50;
const CHALLENGE_MIN_RATING = 1400;

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

export const studentRoutes = new Hono<AppEnv>();

studentRoutes.use(requireUser);

studentRoutes.get('/me', async (c) => {
  const user = c.get('user');
  const now = Math.floor(Date.now() / 1000);
  const [handles, pendingReasons, days] = await c.env.DB.batch([
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
  ]);
  const streak = solveStreak((days.results as { day: number }[]).map((d) => d.day), istDay(now));
  return c.json({ user, handles: handles.results, pendingReasons: pendingReasons.results, streak });
});

studentRoutes.put('/me', async (c) => {
  const { name, batchYear } = await c.req.json<{ name?: string; batchYear?: number }>();
  if (!name?.trim() || !Number.isInteger(batchYear)) {
    return c.json({ error: 'Name and batch year are required' }, 400);
  }
  await c.env.DB.prepare('UPDATE users SET name = ?, batch_year = ? WHERE id = ?')
    .bind(name.trim(), batchYear, c.get('user').id)
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
         synced_at = CASE WHEN handle = excluded.handle THEN synced_at END`,
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
    `SELECT c.id, c.platform, c.name, c.url, c.start_at AS startAt, a.rsvp,
            (SELECT COUNT(*) FROM attendance x WHERE x.contest_id = c.id AND x.rsvp = 'yes') AS goingCount,
            (SELECT COUNT(*) FROM handles h JOIN users u ON u.id = h.user_id
             WHERE h.platform = c.platform AND h.approved_at IS NOT NULL AND u.active = 1) AS participantCount
     FROM contests c LEFT JOIN attendance a ON a.contest_id = c.id AND a.user_id = ?
     WHERE c.counts = 1 AND c.start_at > unixepoch()
     ORDER BY c.start_at LIMIT 10`,
  )
    .bind(c.get('user').id)
    .all();
  return c.json(results);
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
     WHERE c.id = ? AND c.counts = 1`,
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

studentRoutes.get('/leaderboard', async (c) => {
  const period = c.req.query('period') ?? 'day';
  if (!PERIODS.includes(period)) return c.json({ error: 'period must be day, week or month' }, 400);
  const now = Math.floor(Date.now() / 1000);
  const start = periodStart(period as Period, now);
  const db = c.env.DB;
  const [current, earlier] = await db.batch<{ userId: number; points: number }>([
    db
      .prepare(
        `SELECT u.id AS userId, u.name, u.batch_year AS batchYear, u.cf_rating AS cfRating, h.handle AS cfHandle,
                SUM(s.points) AS points, COUNT(*) AS solves, MAX(s.rp) AS hardest
         FROM solves s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN handles h ON h.user_id = u.id AND h.platform = 'cf'
         WHERE s.solved_at >= ? AND s.points > 0 AND u.active = 1
         GROUP BY u.id
         ORDER BY points DESC`,
      )
      .bind(start),
    db
      .prepare(
        `SELECT s.user_id AS userId, SUM(s.points) AS points
         FROM solves s JOIN users u ON u.id = s.user_id
         WHERE s.solved_at >= ? AND s.solved_at < ? AND s.points > 0 AND u.active = 1
         GROUP BY s.user_id
         ORDER BY points DESC`,
      )
      .bind(start, now - MOVEMENT_WINDOW),
  ]);
  const earlierRank = new Map(withRanks(earlier.results).map((row) => [row.userId, row.rank]));
  return c.json(
    withRanks(current.results).map((row) => {
      const before = earlierRank.get(row.userId);
      return { ...row, moved: before ? before - row.rank : null };
    }),
  );
});

studentRoutes.get('/challenge', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS solved FROM solves s JOIN users u ON u.id = s.user_id
     WHERE s.solved_at >= ? AND s.rp >= ? AND s.points > 0 AND u.active = 1`,
  )
    .bind(periodStart('week', Math.floor(Date.now() / 1000)), CHALLENGE_MIN_RATING)
    .first<{ solved: number }>();
  return c.json({ solved: row?.solved ?? 0, target: CHALLENGE_TARGET, minRating: CHALLENGE_MIN_RATING });
});

studentRoutes.get('/feed', async (c) => {
  const before = Number(c.req.query('before')) || Math.floor(Date.now() / 1000) + 1;
  const { results } = await c.env.DB.prepare(
    `SELECT s.user_id AS userId, u.name, s.platform, s.problem_id AS problemId, p.name AS problemName, p.url,
            p.tags, s.rp, s.points, s.live, s.solved_at AS solvedAt
     FROM solves s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN problems p ON p.platform = s.platform AND p.problem_id = s.problem_id
     WHERE s.solved_at < ? AND s.points > 0 AND u.active = 1
     ORDER BY s.solved_at DESC LIMIT ?`,
  )
    .bind(before, FEED_SIZE)
    .all<{ tags: string | null }>();
  return c.json(results.map((row) => ({ ...row, tags: row.tags ? JSON.parse(row.tags) : [] })));
});

studentRoutes.get('/users/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const db = c.env.DB;
  const now = Math.floor(Date.now() / 1000);
  const today = istDay(now);
  const profile = await db
    .prepare('SELECT id, name, batch_year AS batchYear, cf_rating AS cfRating FROM users WHERE id = ? AND active = 1')
    .bind(id)
    .first();
  if (!profile) return c.json({ error: 'Student not found' }, 404);

  const [handles, stats, days, tags] = await db.batch([
    db.prepare('SELECT platform, handle FROM handles WHERE user_id = ? AND approved_at IS NOT NULL').bind(id),
    db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN solved_at >= ?1 THEN points END), 0) AS dayPoints,
           COUNT(CASE WHEN solved_at >= ?1 AND points > 0 THEN 1 END) AS daySolves,
           COALESCE(SUM(CASE WHEN solved_at >= ?2 THEN points END), 0) AS weekPoints,
           COUNT(CASE WHEN solved_at >= ?2 AND points > 0 THEN 1 END) AS weekSolves,
           COALESCE(SUM(CASE WHEN solved_at >= ?3 THEN points END), 0) AS monthPoints,
           COUNT(CASE WHEN solved_at >= ?3 AND points > 0 THEN 1 END) AS monthSolves
         FROM solves WHERE user_id = ?4`,
      )
      .bind(periodStart('day', now), periodStart('week', now), periodStart('month', now), id),
    db
      .prepare(
        `SELECT (solved_at + ${IST_OFFSET}) / 86400 AS day, COUNT(*) AS count
         FROM solves WHERE user_id = ? AND solved_at >= ? GROUP BY day`,
      )
      .bind(id, now - HEATMAP_DAYS * 86400),
    db
      .prepare(
        `SELECT t.value AS tag, COUNT(*) AS count
         FROM solves s JOIN problems p ON p.platform = s.platform AND p.problem_id = s.problem_id, json_each(p.tags) t
         WHERE s.user_id = ? AND p.tags IS NOT NULL
         GROUP BY t.value ORDER BY count DESC LIMIT ${TOP_TAGS}`,
      )
      .bind(id),
  ]);
  const heatmap = days.results as { day: number; count: number }[];
  return c.json({
    ...profile,
    handles: handles.results,
    stats: stats.results[0],
    streak: solveStreak(heatmap.map((d) => d.day), today),
    topTags: tags.results,
    heatmap,
    today,
  });
});
