import { Hono } from 'hono';
import { istDay, periodStart } from 'shared/time';
import { requireUser, type AppEnv, type Bindings } from './auth';
import { pushUsers } from './push';

const CHANGE_AFTER = 7 * 86400;

export const shouldPushPassed = (wasAhead: boolean, isAhead: boolean, lastPushDay: number | null, today: number) => !wasAhead && isAhead && lastPushDay !== today;

function weekStats(db: D1Database, userId: number, week: number): D1PreparedStatement {
  return db
    .prepare(
      `SELECT
         (SELECT COALESCE(SUM(points), 0) FROM solves WHERE user_id = ?1 AND solved_at >= ?2) AS points,
         (SELECT COUNT(*) FROM solves WHERE user_id = ?1 AND solved_at >= ?2 AND points > 0) AS solves,
         (SELECT COUNT(*) FROM attendance a JOIN contests c ON c.id = a.contest_id WHERE a.user_id = ?1 AND a.status = 'present' AND c.start_at >= ?2) AS contests,
         (SELECT COUNT(*) FROM duels WHERE winner_id = ?1 AND finished_at >= ?2) AS duels`,
    )
    .bind(userId, week);
}

export const rivalRoutes = new Hono<AppEnv>();
rivalRoutes.use(requireUser);

rivalRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const userId = c.get('user').id;
  const rival = await db
    .prepare(
      `SELECT r.id, r.name, r.username, u.rival_set_at AS setAt FROM users u JOIN users r ON r.id = u.rival_id
       WHERE u.id = ? AND r.active = 1`,
    )
    .bind(userId)
    .first<{ id: number; name: string; username: string | null; setAt: number }>();
  if (!rival) return c.json({ rival: null });
  const week = periodStart('week', Math.floor(Date.now() / 1000));
  const [mine, theirs] = await db.batch([weekStats(db, userId, week), weekStats(db, rival.id, week)]);
  return c.json({ rival, me: mine.results[0], them: theirs.results[0], changeAt: rival.setAt + CHANGE_AFTER });
});

rivalRoutes.put('/', async (c) => {
  const db = c.env.DB;
  const user = c.get('user');
  const { userId } = await c.req.json<{ userId?: number }>();
  if (!Number.isInteger(userId) || userId === user.id) return c.json({ error: 'Choose someone else as your rival' }, 400);
  const now = Math.floor(Date.now() / 1000);
  const current = await db.prepare('SELECT rival_id AS rivalId, rival_set_at AS setAt FROM users WHERE id = ?').bind(user.id).first<{ rivalId: number | null; setAt: number | null }>();
  if (current?.rivalId === userId) return c.json({ ok: true });
  if (current?.setAt && now < current.setAt + CHANGE_AFTER) return c.json({ error: 'You can change your rival once every 7 days' }, 409);
  const target = await db.prepare('SELECT id FROM users WHERE id = ? AND active = 1').bind(userId!).first();
  if (!target) return c.json({ error: 'Student not found' }, 404);
  await db.prepare('UPDATE users SET rival_id = ?, rival_set_at = ?, rival_ahead = 0 WHERE id = ?').bind(userId!, now, user.id).run();
  return c.json({ ok: true });
});

export async function checkRivals(env: Bindings, now: number): Promise<void> {
  const week = periodStart('week', now);
  const today = istDay(now);
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.rival_ahead AS wasAhead, u.rival_pushed_day AS pushedDay, r.username, r.name,
       (SELECT COALESCE(SUM(points), 0) FROM solves WHERE user_id = u.id AND solved_at >= ?1) AS mine,
       (SELECT COALESCE(SUM(points), 0) FROM solves WHERE user_id = r.id AND solved_at >= ?1) AS theirs
     FROM users u JOIN users r ON r.id = u.rival_id WHERE u.active = 1 AND r.active = 1`,
  )
    .bind(week)
    .all<{ id: number; wasAhead: number; pushedDay: number | null; username: string | null; name: string; mine: number; theirs: number }>();
  const changed = results.filter((row) => !!row.wasAhead !== row.theirs > row.mine);
  if (!changed.length) return;
  const save = env.DB.prepare('UPDATE users SET rival_ahead = ?, rival_pushed_day = ? WHERE id = ?');
  const passed = changed.filter((row) => shouldPushPassed(!!row.wasAhead, row.theirs > row.mine, row.pushedDay, today));
  await env.DB.batch(changed.map((row) => save.bind(row.theirs > row.mine ? 1 : 0, passed.includes(row) ? today : row.pushedDay, row.id)));
  await pushUsers(
    env,
    'rival',
    passed.map((row) => ({ userId: row.id, title: 'Your rival passed you', body: `@${row.username ?? row.name} is ahead this week. Time to answer.`, data: { path: '/' } })),
    'notify_rival',
  );
}
