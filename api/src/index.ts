import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { adminRoutes } from './admin';
import { adminClubRoutes } from './admin-club';
import { adminEngageRoutes } from './admin-engage';
import { accountRoutes } from './accounts';
import { adminAnnouncementRoutes, announcementRoutes } from './announcements';
import { requireAdmin, requireUser, type AppEnv, type Bindings } from './auth';
import { badgeRoutes } from './badges';
import { runCron } from './cron';
import { digestRoutes } from './digest';
import { duelRoutes } from './duels';
import { ingestRoutes } from './ingest';
import { practiceRoutes } from './practice';
import { recapRoutes } from './recap';
import { rivalRoutes } from './rivals';
import { adminVirtualRoutes, virtualRoutes } from './virtuals';
import { studentRoutes } from './routes';

const app = new Hono<AppEnv>().basePath('/api');

app.use('*', (c, next) => cors({ origin: c.env.WEB_ORIGIN })(c, next));

app.onError((err, c) => {
  if (err instanceof SyntaxError) return c.json({ error: 'Invalid JSON' }, 400);
  console.error(err);
  return c.json({ error: 'Internal error' }, 500);
});

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.get('/health', async (c) => {
  await c.env.DB.prepare('SELECT 1 FROM users LIMIT 1').run();
  return c.json({ ok: true });
});

app.get('/app-version', (c) =>
  c.json({ latest: c.env.APP_LATEST, min: c.env.APP_MIN, url: c.env.APP_URL, notes: c.env.APP_NOTES, web: c.env.WEB_ORIGIN }),
);

app.route('/auth', accountRoutes);
app.route('/ingest', ingestRoutes);
app.use('/admin/*', requireUser, requireAdmin);
app.route('/admin', adminClubRoutes);
app.route('/admin', adminEngageRoutes);
app.route('/admin/announcements', adminAnnouncementRoutes);
app.route('/admin/virtuals', adminVirtualRoutes);
app.route('/admin/digest', digestRoutes);
app.route('/admin', adminRoutes);
app.route('/announcements', announcementRoutes);
app.route('/practice', practiceRoutes);
app.route('/me/rival', rivalRoutes);
app.route('/badges', badgeRoutes);
app.route('/duels', duelRoutes);
app.route('/recap', recapRoutes);
app.route('/virtuals', virtualRoutes);
app.route('/', studentRoutes);

export default {
  fetch: app.fetch,
  scheduled: (event, env, ctx) => ctx.waitUntil(runCron(env, Math.floor(event.scheduledTime / 1000))),
} satisfies ExportedHandler<Bindings>;
