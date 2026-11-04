import { Hono } from 'hono';
import { requireAdmin, requireUser, type AppEnv } from './auth';

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
