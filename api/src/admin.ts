import { Hono, type Context } from 'hono';
import { normalizeUsername, usernameError } from './accounts';
import { adminWrite } from './admin-write';
import type { AppEnv } from './auth';
import { dispatchWorkflow } from './cron';
import { atRiskCount } from './admin-jobs';
import { pushUsers } from './push';
import { getSettings } from './settings';

const DAY = 86400;

export const adminRoutes = new Hono<AppEnv>();

const FULL_NAME = `COALESCE(NULLIF(u.username, ''), u.name)`;
const isOwner = (env: AppEnv['Bindings'], email: string) => env.ADMIN_EMAILS.toLowerCase().split(',').includes(email.toLowerCase());
const AUDIT_PAGE = 50;

adminRoutes.get('/badges', async (c) => {
  const db = c.env.DB;
  const now = Math.floor(Date.now() / 1000);
  const settings = await getSettings(db, now);
  const [handles, reasons, flags, risk] = await db.batch<{ n: number }>([
    db.prepare(`SELECT COUNT(*) AS n FROM handles h JOIN users u ON u.id = h.user_id WHERE h.status = 'waiting' AND u.active = 1`),
    db
      .prepare(`SELECT COUNT(*) AS n FROM attendance a JOIN contests c ON c.id = a.contest_id JOIN users u ON u.id = a.user_id WHERE a.status = 'absent' AND a.reason_type IS NULL AND c.counts = 1 AND u.active = 1 AND c.end_at <= ?`)
      .bind(now - settings.reason_inbox_days * DAY),
    db.prepare(`SELECT COUNT(*) AS n FROM fairness_flags WHERE status = 'open'`),
    atRiskCount(db, now, settings.exam_grace_days),
  ]);
  const waiting = handles.results[0].n;
  const openFlags = flags.results[0].n;
  return c.json({ inbox: waiting + reasons.results[0].n + openFlags, handles: waiting, atRisk: risk.results[0].n, fairness: openFlags });
});

adminRoutes.get('/students', async (c) => {
  const db = c.env.DB;
  const [users, handles] = await db.batch([
    db.prepare('SELECT id, email, name, username, batch_year AS batchYear, role, active, cf_rating AS cfRating FROM users ORDER BY name'),
    db.prepare(
      `SELECT h.user_id AS userId, h.platform, h.handle, h.status, h.broken,
              (SELECT COUNT(*) FROM solves s WHERE s.user_id = h.user_id AND s.platform = h.platform) AS solved
       FROM handles h ORDER BY h.platform`,
    ),
  ]);
  return c.json({ users: users.results, handles: handles.results });
});

const HANDLE_STATUSES = ['waiting', 'approved', 'rejected'];

function setHandleStatus(c: Context<AppEnv>, userId: number, platform: string, status: string): D1PreparedStatement {
  return c.env.DB.prepare(
    `UPDATE handles SET
       status = ?1,
       approved_at = CASE WHEN ?1 = 'approved' THEN COALESCE(approved_at, unixepoch()) ELSE NULL END,
       synced_at = CASE WHEN ?1 = 'approved' AND approved_at IS NULL THEN NULL ELSE synced_at END,
       reviewed_by = ?2, reviewed_at = unixepoch()
     WHERE user_id = ?3 AND platform = ?4`,
  ).bind(status, c.get('user').id, userId, platform);
}

function backfill(c: Context<AppEnv>, platform: string, handle: string): void {
  c.executionCtx.waitUntil(dispatchWorkflow(c.env, 'backfill.yml', { platform, handle }).catch((err) => console.error('Backfill dispatch failed:', err)));
}

adminRoutes.patch('/handles/:userId/:platform', async (c) => {
  const { status } = await c.req.json<{ status?: string }>();
  if (!status || !HANDLE_STATUSES.includes(status)) return c.json({ error: 'status must be waiting, approved or rejected' }, 400);
  const userId = Number(c.req.param('userId'));
  const platform = c.req.param('platform');
  const handle = await c.env.DB.prepare('SELECT handle, status FROM handles WHERE user_id = ? AND platform = ?').bind(userId, platform).first<{ handle: string; status: string }>();
  if (!handle) return c.json({ error: 'Handle not found' }, 404);
  if (handle.status === status) return c.json({ ok: true });
  await adminWrite(c, { area: 'handles', action: `set handle to ${status}`, target: `${platform}:${handle.handle}`, before: handle.status, after: status }, [setHandleStatus(c, userId, platform, status)]);
  if (status === 'approved') backfill(c, platform, handle.handle);
  return c.json({ ok: true });
});

adminRoutes.post('/handles/approve-all', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT h.user_id AS userId, h.platform, h.handle FROM handles h JOIN users u ON u.id = h.user_id WHERE h.status = 'waiting' AND u.active = 1`,
  ).all<{ userId: number; platform: string; handle: string }>();
  if (!results.length) return c.json({ approved: 0 });
  await adminWrite(
    c,
    results.map((h) => ({ area: 'handles' as const, action: 'set handle to approved', target: `${h.platform}:${h.handle}`, before: 'waiting', after: 'approved' })),
    results.map((h) => setHandleStatus(c, h.userId, h.platform, 'approved')),
  );
  for (const h of results) backfill(c, h.platform, h.handle);
  return c.json({ approved: results.length });
});

adminRoutes.patch('/users/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const db = c.env.DB;
  const me = c.get('user');
  const body = await c.req.json<{ role?: string; active?: boolean; username?: string }>();
  const { role, active } = body;
  if (role !== undefined && role !== 'student' && role !== 'admin') return c.json({ error: 'Invalid role' }, 400);
  const target = await db.prepare('SELECT id, email, username, role, active FROM users WHERE id = ?').bind(id).first<{ id: number; email: string; username: string | null; role: string; active: number }>();
  if (!target) return c.json({ error: 'User not found' }, 404);
  if (id === me.id && (role !== undefined || active === false)) return c.json({ error: "You can't change your own access" }, 400);
  if (role === 'student' && target.role === 'admin') {
    if (isOwner(c.env, target.email)) return c.json({ error: 'This admin is set in ADMIN_EMAILS, so signing in would make them an admin again' }, 400);
    const admins = await db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1`).first<{ n: number }>();
    if ((admins?.n ?? 0) <= 1) return c.json({ error: "You can't remove the last admin" }, 400);
  }
  const username = body.username === undefined ? null : normalizeUsername(body.username);
  const invalid = username === null ? null : usernameError(username);
  if (invalid) return c.json({ error: invalid }, 400);
  const before = { role: target.role, active: target.active, username: target.username };
  const after = { role: role ?? target.role, active: active === undefined ? target.active : active ? 1 : 0, username: username ?? target.username };
  const area = role !== undefined ? 'admins' : 'members';
  const action = role !== undefined ? (role === 'admin' ? 'made admin' : 'removed admin') : active === false ? 'deactivated' : active === true ? 'reactivated' : 'changed username';
  try {
    await adminWrite(c, { area, action, target: target.email, before, after }, [
      db
        .prepare(`UPDATE users SET role = ?, active = ?, username = ?, deactivated_at = CASE WHEN ? = 0 THEN COALESCE(deactivated_at, unixepoch()) END WHERE id = ?`)
        .bind(after.role, after.active, after.username, after.active, id),
    ]);
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) return c.json({ error: 'That name is taken' }, 409);
    throw err;
  }
  if (role === 'admin') await pushUsers(c.env, 'admin', [{ userId: id, title: "You're an admin", body: 'You can now run the club from the website.', data: { url: `${c.env.WEB_ORIGIN}/admin` } }]);
  return c.json({ ok: true });
});

adminRoutes.get('/admins', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT id, name, username, email FROM users WHERE role = 'admin' ORDER BY name`).all<{ id: number; name: string; username: string | null; email: string }>();
  return c.json(results.map((row) => ({ ...row, owner: isOwner(c.env, row.email) })));
});

adminRoutes.post('/admins', async (c) => {
  const { email } = await c.req.json<{ email?: string }>();
  if (!email?.includes('@')) return c.json({ error: 'A valid email is required' }, 400);
  const db = c.env.DB;
  const target = await db.prepare('SELECT id, email, role FROM users WHERE email = ?').bind(email.trim().toLowerCase()).first<{ id: number; email: string; role: string }>();
  if (!target) return c.json({ error: 'No account with this email' }, 404);
  if (target.role === 'admin') return c.json({ ok: true });
  await adminWrite(c, { area: 'admins', action: 'made admin', target: target.email, before: 'student', after: 'admin' }, [db.prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).bind(target.id)]);
  await pushUsers(c.env, 'admin', [{ userId: target.id, title: "You're an admin", body: 'You can now run the club from the website.', data: { url: `${c.env.WEB_ORIGIN}/admin` } }]);
  return c.json({ ok: true });
});

adminRoutes.get('/audit', async (c) => {
  const area = c.req.query('area') || null;
  const before = Number(c.req.query('before')) || Number.MAX_SAFE_INTEGER;
  const { results } = await c.env.DB.prepare(
    `SELECT l.id, l.area, l.action, l.target, l.before, l.after, l.at, ${FULL_NAME} AS admin
     FROM audit_log l JOIN users u ON u.id = l.admin_id
     WHERE l.id < ?1 AND (?2 IS NULL OR l.area = ?2) ORDER BY l.id DESC LIMIT ${AUDIT_PAGE}`,
  )
    .bind(before, area)
    .all();
  return c.json({ items: results, pageSize: AUDIT_PAGE });
});
