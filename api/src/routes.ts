import { Hono } from 'hono';
import { requireUser, type AppEnv } from './auth';

const PLATFORMS = ['cf', 'cc', 'atcoder', 'leetcode'];

export const studentRoutes = new Hono<AppEnv>();

studentRoutes.use(requireUser);

studentRoutes.get('/me', async (c) => {
  const user = c.get('user');
  const [handles, pendingReasons] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT platform, handle, approved_at IS NOT NULL AS approved FROM handles WHERE user_id = ?`,
    ).bind(user.id),
    c.env.DB.prepare(
      `SELECT c.id, c.name FROM attendance a JOIN contests c ON c.id = a.contest_id
       WHERE a.user_id = ? AND a.status = 'absent' AND a.reason_type IS NULL AND c.counts = 1
       ORDER BY c.start_at DESC`,
    ).bind(user.id),
  ]);
  return c.json({ user, handles: handles.results, pendingReasons: pendingReasons.results });
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
