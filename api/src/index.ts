import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { adminRoutes } from './admin';
import { accountRoutes } from './accounts';
import type { AppEnv, Bindings } from './auth';
import { runCron } from './cron';
import { ingestRoutes } from './ingest';
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
app.route('/admin', adminRoutes);
app.route('/', studentRoutes);

export default {
  fetch: app.fetch,
  scheduled: (event, env, ctx) => ctx.waitUntil(runCron(env, Math.floor(event.scheduledTime / 1000))),
} satisfies ExportedHandler<Bindings>;
