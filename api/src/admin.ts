import { Hono } from 'hono';
import { IST_OFFSET, istDay } from 'shared/time';
import { requireAdmin, requireUser, type AppEnv } from './auth';

const FLAG_SOLVES_PER_DAY = 30;
const FLAG_WINDOW_SECONDS = 30 * 86400;

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use(requireUser, requireAdmin);

adminRoutes.patch('/handles/:userId/:platform', async (c) => {
  const { approved } = await c.req.json<{ approved?: boolean }>();
  if (typeof approved !== 'boolean') return c.json({ error: 'approved must be true or false' }, 400);
  const result = await c.env.DB.prepare(
    `UPDATE handles
     SET approved_at = CASE WHEN ?1 THEN COALESCE(approved_at, unixepoch()) ELSE NULL END
     WHERE user_id = ?2 AND platform = ?3`,
  )
    .bind(approved ? 1 : 0, Number(c.req.param('userId')), c.req.param('platform'))
    .run();
  if (!result.meta.changes) return c.json({ error: 'Handle not found' }, 404);
  return c.json({ ok: true });
});

adminRoutes.get('/attendance', async (c) => {
  const from = Number(c.req.query('from')) || 0;
  const to = Number(c.req.query('to')) || Number.MAX_SAFE_INTEGER;
  const platform = c.req.query('platform') || null;
  const batch = Number(c.req.query('batch')) || null;
  const db = c.env.DB;
  const [contests, students, cells] = await db.batch([
    db
      .prepare(
        `SELECT id, platform, name, start_at AS startAt, counts FROM contests
         WHERE start_at >= ?1 AND start_at <= ?2 AND (?3 IS NULL OR platform = ?3)
         ORDER BY start_at`,
      )
      .bind(from, to, platform),
    db
      .prepare(
        `SELECT id, name, batch_year AS batchYear FROM users
         WHERE active = 1 AND name != '' AND (?1 IS NULL OR batch_year = ?1) ORDER BY name`,
      )
      .bind(batch),
    db
      .prepare(
        `SELECT a.contest_id AS contestId, a.user_id AS userId, a.rsvp, a.status,
                a.reason_type AS reasonType, a.reason_text AS reasonText
         FROM attendance a JOIN contests c ON c.id = a.contest_id
         WHERE c.start_at >= ?1 AND c.start_at <= ?2 AND (?3 IS NULL OR c.platform = ?3)`,
      )
      .bind(from, to, platform),
  ]);
  return c.json({ contests: contests.results, students: students.results, cells: cells.results });
});

adminRoutes.patch('/contests/:id', async (c) => {
  const { counts } = await c.req.json<{ counts?: boolean }>();
  if (typeof counts !== 'boolean') return c.json({ error: 'counts must be true or false' }, 400);
  const result = await c.env.DB.prepare('UPDATE contests SET counts = ? WHERE id = ?')
    .bind(counts ? 1 : 0, Number(c.req.param('id')))
    .run();
  if (!result.meta.changes) return c.json({ error: 'Contest not found' }, 404);
  return c.json({ ok: true });
});

adminRoutes.get('/students', async (c) => {
  const db = c.env.DB;
  const [users, handles] = await db.batch([
    db.prepare('SELECT id, email, name, batch_year AS batchYear, role, active FROM users ORDER BY name'),
    db.prepare(
      `SELECT user_id AS userId, platform, handle, approved_at IS NOT NULL AS approved, broken FROM handles ORDER BY platform`,
    ),
  ]);
  return c.json({ users: users.results, handles: handles.results });
});

adminRoutes.patch('/users/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (id === c.get('user').id) return c.json({ error: "You can't change your own account" }, 400);
  const { role, active } = await c.req.json<{ role?: string; active?: boolean }>();
  if (role !== undefined && role !== 'student' && role !== 'admin') return c.json({ error: 'Invalid role' }, 400);
  const result = await c.env.DB.prepare(
    'UPDATE users SET role = COALESCE(?, role), active = COALESCE(?, active) WHERE id = ?',
  )
    .bind(role ?? null, active === undefined ? null : active ? 1 : 0, id)
    .run();
  if (!result.meta.changes) return c.json({ error: 'User not found' }, 404);
  return c.json({ ok: true });
});

adminRoutes.post('/admins', async (c) => {
  const { email } = await c.req.json<{ email?: string }>();
  if (!email?.includes('@')) return c.json({ error: 'A valid email is required' }, 400);
  await c.env.DB.prepare(
    `INSERT INTO users (email, name, role, created_at) VALUES (?, '', 'admin', unixepoch())
     ON CONFLICT (email) DO UPDATE SET role = 'admin'`,
  )
    .bind(email.trim().toLowerCase())
    .run();
  return c.json({ ok: true });
});

adminRoutes.get('/flags', async (c) => {
  const db = c.env.DB;
  const now = Math.floor(Date.now() / 1000);
  const [busyDays, brokenHandles] = await db.batch([
    db
      .prepare(
        `SELECT u.id AS userId, u.name, (s.solved_at + ${IST_OFFSET}) / 86400 AS day, COUNT(*) AS solves
         FROM solves s JOIN users u ON u.id = s.user_id
         WHERE s.solved_at >= ?
         GROUP BY u.id, day HAVING solves > ${FLAG_SOLVES_PER_DAY}
         ORDER BY day DESC`,
      )
      .bind(now - FLAG_WINDOW_SECONDS),
    db.prepare(
      `SELECT u.id AS userId, u.name, h.platform, h.handle
       FROM handles h JOIN users u ON u.id = h.user_id WHERE h.broken = 1`,
    ),
  ]);
  return c.json({ busyDays: busyDays.results, brokenHandles: brokenHandles.results, today: istDay(now) });
});
