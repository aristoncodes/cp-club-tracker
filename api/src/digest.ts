import { Hono } from 'hono';
import { requireAdmin, requireUser, type AppEnv } from './auth';
import { biggestClimbers, withRanks } from './routes';

const WEEK = 7 * 86400;

export const digestRoutes = new Hono<AppEnv>();
digestRoutes.use(requireUser, requireAdmin);

digestRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const now = Math.floor(Date.now() / 1000);
  const from = now - WEEK;
  const attendance = (start: number, end: number) =>
    db
      .prepare(
        `SELECT COUNT(CASE WHEN a.status = 'present' THEN 1 END) AS present, COUNT(a.status) AS total
         FROM attendance a JOIN contests c ON c.id = a.contest_id WHERE c.counts = 1 AND c.start_at >= ? AND c.start_at < ?`,
      )
      .bind(start, end);
  const totals = (start: number, end: number) =>
    db
      .prepare(
        `SELECT u.id AS userId, u.name, u.username, SUM(s.points) AS points FROM solves s JOIN users u ON u.id = s.user_id
         WHERE s.solved_at >= ? AND s.solved_at < ? AND s.points > 0 AND u.active = 1 GROUP BY u.id ORDER BY points DESC`,
      )
      .bind(start, end);
  const [thisWeek, lastWeek, members, solves, turnout, quiet, pending, waiting, signups, current, previous] = await db.batch<Record<string, unknown>>([
    attendance(from, now),
    attendance(from - WEEK, from),
    db.prepare(`SELECT COUNT(DISTINCT s.user_id) AS active, (SELECT COUNT(*) FROM users WHERE active = 1) AS total FROM solves s JOIN users u ON u.id = s.user_id WHERE s.solved_at >= ? AND u.active = 1`).bind(from),
    db.prepare('SELECT COUNT(*) AS n FROM solves s JOIN users u ON u.id = s.user_id WHERE s.solved_at >= ? AND s.points > 0 AND u.active = 1').bind(from),
    db
      .prepare(
        `SELECT c.id, c.name, c.platform, c.start_at AS startAt, COUNT(CASE WHEN a.status = 'present' THEN 1 END) AS present, COUNT(a.status) AS total
         FROM contests c LEFT JOIN attendance a ON a.contest_id = c.id WHERE c.counts = 1 AND c.start_at >= ? AND c.start_at < ? GROUP BY c.id ORDER BY c.start_at`,
      )
      .bind(from, now),
    db.prepare(`SELECT id AS userId, name FROM users u WHERE u.active = 1 AND u.name != '' AND NOT EXISTS (SELECT 1 FROM solves s WHERE s.user_id = u.id AND s.solved_at >= ?) ORDER BY name`).bind(from),
    db.prepare(`SELECT COUNT(*) AS n FROM attendance a JOIN contests c ON c.id = a.contest_id WHERE a.status = 'absent' AND a.reason_type IS NULL AND c.counts = 1`),
    db.prepare('SELECT COUNT(*) AS n FROM handles h JOIN users u ON u.id = h.user_id WHERE h.approved_at IS NULL AND u.active = 1'),
    db.prepare(`SELECT COUNT(*) AS n FROM users WHERE created_at >= ? AND name != ''`).bind(from),
    totals(from, now),
    totals(from - WEEK, from),
  ]);
  type Total = { userId: number; name: string; username: string | null; points: number };
  const ranked = withRanks(current.results as Total[]);
  return c.json({
    from,
    attendance: thisWeek.results[0],
    lastAttendance: lastWeek.results[0],
    members: members.results[0],
    solves: (solves.results[0] as { n: number }).n,
    turnout: turnout.results,
    quiet: quiet.results,
    pendingReasons: (pending.results[0] as { n: number }).n,
    handlesWaiting: (waiting.results[0] as { n: number }).n,
    newSignups: (signups.results[0] as { n: number }).n,
    climbers: biggestClimbers(ranked, withRanks(previous.results as Total[])),
  });
});
