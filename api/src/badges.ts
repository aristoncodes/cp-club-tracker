import { Hono } from 'hono';
import { BADGES, badgeValue, earnedBadges, reachedNewColour, type BadgeId, type BadgeStats } from 'shared/badges';
import { IST_OFFSET, periodStart } from 'shared/time';
import { requireUser, type AppEnv, type Bindings } from './auth';
import { pushUsers } from './push';

const DAY = 86400;
const WEEK = 7 * DAY;
const SWEEP_MINUTES = 15;
const GIANT_GAP = 200;

// The longest run of consecutive integers in the subquery's column v.
const longestRun = (values: string) =>
  `SELECT COALESCE(MAX(n), 0) AS n FROM (SELECT COUNT(*) AS n FROM (SELECT v - ROW_NUMBER() OVER (ORDER BY v) AS grp FROM (${values})) GROUP BY grp)`;

export async function badgeStats(db: D1Database, userId: number): Promise<BadgeStats> {
  const statements = [
    db.prepare('SELECT COUNT(*) AS n FROM solves WHERE user_id = ?').bind(userId),
    db.prepare(longestRun(`SELECT DISTINCT (solved_at + ${IST_OFFSET}) / ${DAY} AS v FROM solves WHERE user_id = ?`)).bind(userId),
    db
      .prepare(
        `SELECT COALESCE(MAX(n), 0) AS n FROM (
           SELECT COUNT(*) AS n FROM (
             SELECT a.status, ROW_NUMBER() OVER (ORDER BY c.start_at) - ROW_NUMBER() OVER (PARTITION BY a.status ORDER BY c.start_at) AS grp
             FROM attendance a JOIN contests c ON c.id = a.contest_id
             WHERE a.user_id = ? AND c.counts = 1 AND a.status IN ('present','absent')
           ) WHERE status = 'present' GROUP BY grp)`,
      )
      .bind(userId),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM upsolves x
         WHERE x.user_id = ? AND EXISTS (SELECT 1 FROM solves s WHERE s.user_id = x.user_id AND s.platform = 'cf' AND s.problem_id IN (x.problem_id, x.alt_problem_id))`,
      )
      .bind(userId),
    db.prepare(longestRun(`SELECT DISTINCT (solved_at + ${IST_OFFSET}) / ${DAY} AS v FROM solves WHERE user_id = ? AND potd_bonus > 0`)).bind(userId),
    db
      .prepare(
        longestRun(
          `SELECT g.week_start / ${WEEK} AS v FROM goals g WHERE g.user_id = ?
           AND (SELECT COUNT(*) FROM solves s WHERE s.user_id = g.user_id AND s.solved_at >= g.week_start AND s.solved_at < g.week_start + ${WEEK} AND s.points > 0 AND s.rp >= g.min_rating) >= g.target`,
        ),
      )
      .bind(userId),
    db.prepare('SELECT cf_rating_history AS history FROM users WHERE id = ?').bind(userId),
    db.prepare('SELECT COUNT(*) AS n FROM duels WHERE winner_id = ?').bind(userId),
    db.prepare(`SELECT COUNT(*) AS n FROM duels WHERE winner_id = ? AND rating_gap >= ${GIANT_GAP}`).bind(userId),
  ];
  const results = await db.batch<{ n: number; history: string | null }>(statements);
  const count = (index: number) => results[index].results[0]?.n ?? 0;
  const ratings = (JSON.parse(results[6].results[0]?.history ?? '[]') as { rating: number }[]).map((point) => point.rating);
  return {
    solves: count(0),
    bestStreak: count(1),
    attendanceRun: count(2),
    upsolves: count(3),
    potdRun: count(4),
    goalRun: count(5),
    newColour: reachedNewColour(ratings) ? 1 : 0,
    duelWins: count(7),
    giantWins: count(8),
  };
}

async function award(env: Bindings, userId: number, ids: BadgeId[], silent: boolean, now: number): Promise<void> {
  if (!ids.length) return;
  const insert = env.DB.prepare('INSERT OR IGNORE INTO badges (user_id, badge, earned_at, seen_at) VALUES (?, ?, ?, ?) RETURNING badge');
  const inserted = await env.DB.batch<{ badge: BadgeId }>(ids.map((id) => insert.bind(userId, id, now, silent ? now : null)));
  const fresh = inserted.flatMap((result) => result.results.map((row) => row.badge));
  if (silent || !fresh.length) return;
  const first = BADGES.find((badge) => badge.id === fresh[0])!;
  await pushUsers(env, 'badge', [{ userId, title: 'New badge', body: fresh.length > 1 ? `${first.name} and ${fresh.length - 1} more.` : `${first.name}. ${first.how}.`, data: { path: '/badges' } }], 'notify_badges');
}

export async function checkBadges(env: Bindings, userIds: number[]): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  for (const userId of userIds) {
    const user = await env.DB.prepare('SELECT badges_checked AS checked FROM users WHERE id = ?').bind(userId).first<{ checked: number }>();
    if (!user) continue;
    await award(env, userId, earnedBadges(await badgeStats(env.DB, userId)), !user.checked, now);
    if (!user.checked) await env.DB.prepare('UPDATE users SET badges_checked = 1 WHERE id = ?').bind(userId).run();
  }
}

async function awardLastWeeksTop(env: Bindings, now: number): Promise<void> {
  const week = periodStart('week', now);
  const { results } = await env.DB.prepare(
    `WITH totals AS (
       SELECT s.user_id AS id, SUM(s.points) AS points FROM solves s JOIN users u ON u.id = s.user_id
       WHERE s.solved_at >= ? AND s.solved_at < ? AND s.points > 0 AND u.active = 1 GROUP BY s.user_id
     ) SELECT id FROM totals WHERE points = (SELECT MAX(points) FROM totals)`,
  )
    .bind(week - WEEK, week)
    .all<{ id: number }>();
  for (const { id } of results) await award(env, id, ['top_board'], false, now);
}

// A slice of members each minute for 15 minutes from 00:10 IST, so one run stays inside the Worker's limits.
export const sweepMinute = (now: number) => {
  const minute = Math.floor((now + IST_OFFSET) % DAY / 60) - 10;
  return minute >= 0 && minute < SWEEP_MINUTES ? minute : null;
};

export async function sweepBadges(env: Bindings, now: number): Promise<void> {
  const minute = sweepMinute(now);
  if (minute === null) return;
  if (minute === 0) {
    await env.DB.prepare('DELETE FROM push_log WHERE minute < ?').bind(Math.floor(now / 60) - 1440).run();
    if (periodStart('day', now) === periodStart('week', now)) await awardLastWeeksTop(env, now);
  }
  const { results } = await env.DB.prepare('SELECT id FROM users WHERE active = 1 AND id % ? = ?').bind(SWEEP_MINUTES, minute).all<{ id: number }>();
  await checkBadges(env, results.map((row) => row.id));
}

export const badgeRoutes = new Hono<AppEnv>();
badgeRoutes.use(requireUser);

badgeRoutes.get('/', async (c) => {
  const userId = Number(c.req.query('user')) || c.get('user').id;
  const [stats, earned] = await Promise.all([
    badgeStats(c.env.DB, userId),
    c.env.DB.prepare('SELECT badge, earned_at AS earnedAt FROM badges WHERE user_id = ?').bind(userId).all<{ badge: BadgeId; earnedAt: number }>(),
  ]);
  const dates = new Map(earned.results.map((row) => [row.badge, row.earnedAt]));
  return c.json(BADGES.map(({ id, goal, stat }) => ({ id, goal, stat, value: Math.min(goal, stat ? badgeValue(BADGES.find((b) => b.id === id)!, stats) : 0), earnedAt: dates.get(id) ?? null })));
});

badgeRoutes.post('/seen', async (c) => {
  await c.env.DB.prepare('UPDATE badges SET seen_at = unixepoch() WHERE user_id = ? AND seen_at IS NULL').bind(c.get('user').id).run();
  return c.json({ ok: true });
});

// Season and member-of-the-month badges sit outside the 12, and are named from what earned them.
badgeRoutes.get('/extra', async (c) => {
  const userId = Number(c.req.query('user')) || c.get('user').id;
  const { results } = await c.env.DB.prepare(
    `SELECT b.badge AS id, b.earned_at AS earnedAt, s.name AS season
     FROM badges b LEFT JOIN seasons s ON b.badge = 'season_' || s.id
     WHERE b.user_id = ? AND (b.badge LIKE 'season\\_%' ESCAPE '\\' OR b.badge LIKE 'month\\_%' ESCAPE '\\') ORDER BY b.earned_at DESC`,
  )
    .bind(userId)
    .all<{ id: string; earnedAt: number; season: string | null }>();
  return c.json(results.map((row) => ({ id: row.id, earnedAt: row.earnedAt, label: row.season ? `Top 3: ${row.season}` : `Member of the month: ${row.id.slice(6)}` })));
});
