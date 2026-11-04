import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
  WEB_ORIGIN: string;
};

const app = new Hono<{ Bindings: Bindings }>().basePath('/api');

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

export default app;
