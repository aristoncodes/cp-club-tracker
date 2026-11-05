import { Hono } from 'hono';
import { IST_OFFSET, istDay, periodStart, solveStreak } from 'shared/time';
import { requireUser, type AppEnv, type Bindings } from './auth';
import { pushUsers } from './push';
import { biggestClimbers, withRanks } from './routes';

const DAY = 86400;
const WEEK = 7 * DAY;
const STREAK_DAYS = 183;
const NEXT_CONTESTS = 4;

export async function sendRecapPush(env: Bindings): Promise<void> {
  const { results } = await env.DB.prepare('SELECT id, name FROM users WHERE active = 1').all<{ id: number; name: string }>();
  await pushUsers(
    env,
    'recap',
    results.map((user) => ({ userId: user.id, title: 'Your week is in', body: `Your Sunday recap is ready, ${user.name.split(' ')[0]}.`, data: { path: '/recap' } })),
    'notify_recap',
  );
}

export const recapRoutes = new Hono<AppEnv>();
recapRoutes.use(requireUser);

recapRoutes.get('/', async (c) => {
  const userId = c.get('user').id;
  const db = c.env.DB;
  const now = Math.floor(Date.now() / 1000);
  const week = Number(c.req.query('week')) || periodStart('week', now);
  const end = week + WEEK;
  const totals = (from: number, to: number) =>
    db
      .prepare(
        `SELECT u.id AS userId, u.name, u.username, SUM(s.points) AS points FROM solves s JOIN users u ON u.id = s.user_id
         WHERE s.solved_at >= ? AND s.solved_at < ? AND s.points > 0 AND u.active = 1 GROUP BY u.id ORDER BY points DESC`,
      )
      .bind(from, to);
  const [current, previous, mine, hardest, contests, days, topic, duels, goal, upcoming] = await db.batch<Record<string, unknown>>([
    totals(week, end),
    totals(week - WEEK, week),
    db.prepare('SELECT COUNT(*) AS solves FROM solves WHERE user_id = ? AND solved_at >= ? AND solved_at < ? AND points > 0').bind(userId, week, end),
    db
      .prepare(
        `SELECT s.rp, p.name FROM solves s LEFT JOIN problems p ON p.platform = s.platform AND p.problem_id = s.problem_id
         WHERE s.user_id = ? AND s.solved_at >= ? AND s.solved_at < ? AND s.points > 0 ORDER BY s.rp DESC LIMIT 1`,
      )
      .bind(userId, week, end),
    db.prepare(`SELECT COUNT(*) AS n FROM attendance a JOIN contests c ON c.id = a.contest_id WHERE a.user_id = ? AND a.status = 'present' AND c.start_at >= ? AND c.start_at < ?`).bind(userId, week, end),
    db.prepare(`SELECT (solved_at + ${IST_OFFSET}) / ${DAY} AS day FROM solves WHERE user_id = ? AND solved_at >= ? GROUP BY day`).bind(userId, now - STREAK_DAYS * DAY),
    db
      .prepare(
        `SELECT t.value AS tag, COUNT(*) AS n FROM solves s JOIN problems p ON p.platform = s.platform AND p.problem_id = s.problem_id, json_each(p.tags) t
         WHERE s.user_id = ? AND s.solved_at >= ? AND s.solved_at < ? AND p.tags IS NOT NULL GROUP BY t.value ORDER BY n DESC, t.value LIMIT 1`,
      )
      .bind(userId, week, end),
    db
      .prepare(
        `SELECT COUNT(CASE WHEN winner_id = ?1 THEN 1 END) AS wins, COUNT(CASE WHEN status = 'won' AND winner_id != ?1 THEN 1 END) AS losses, COUNT(CASE WHEN status = 'draw' THEN 1 END) AS draws
         FROM duels WHERE (challenger_id = ?1 OR opponent_id = ?1) AND finished_at >= ?2 AND finished_at < ?3`,
      )
      .bind(userId, week, end),
    db
      .prepare(
        `SELECT g.target, g.min_rating AS minRating,
           (SELECT COUNT(*) FROM solves s WHERE s.user_id = g.user_id AND s.solved_at >= g.week_start AND s.solved_at < g.week_start + ${WEEK} AND s.points > 0 AND s.rp >= g.min_rating) AS done
         FROM goals g WHERE g.user_id = ? AND g.week_start = ?`,
      )
      .bind(userId, week),
    db
      .prepare(`SELECT id, name, platform, start_at AS startAt FROM contests WHERE (counts = 1 OR kind = 'virtual') AND start_at >= ? AND start_at < ? ORDER BY start_at LIMIT ${NEXT_CONTESTS}`)
      .bind(end, end + WEEK),
  ]);
  type Total = { userId: number; name: string; username: string | null; points: number };
  const ranked = withRanks(current.results as Total[]);
  const before = withRanks(previous.results as Total[]);
  const me = ranked.find((row) => row.userId === userId);
  const earlier = before.find((row) => row.userId === userId);
  const climber = biggestClimbers(ranked, before)[0] ?? null;
  const top = ranked[0] ?? null;
  return c.json({
    week,
    points: me?.points ?? 0,
    rank: me?.rank ?? null,
    rankChange: me && earlier ? earlier.rank - me.rank : null,
    solves: (mine.results[0] as { solves: number }).solves,
    hardest: hardest.results[0] ?? null,
    contests: (contests.results[0] as { n: number }).n,
    streak: solveStreak((days.results as { day: number }[]).map((row) => row.day), istDay(now)),
    topTopic: (topic.results[0] as { tag: string } | undefined)?.tag ?? null,
    duels: duels.results[0],
    goal: goal.results[0] ?? null,
    shoutout: climber ? { kind: 'climber', userId: climber.userId, name: climber.name, username: climber.username, gained: climber.gained } : top ? { kind: 'top', userId: top.userId, name: top.name, username: top.username, gained: 0 } : null,
    upcoming: upcoming.results,
  });
});
