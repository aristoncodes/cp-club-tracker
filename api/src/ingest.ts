import { Hono } from 'hono';
import type { IngestContest, IngestSolve } from 'shared/types';
import type { AppEnv } from './auth';
import { finishContest, insertSolves, markHandleBroken } from './records';

export const ingestRoutes = new Hono<AppEnv>();

ingestRoutes.use(async (c, next) => {
  if (c.req.header('X-Ingest-Secret') !== c.env.INGEST_SECRET) {
    return c.json({ error: 'Invalid ingest secret' }, 401);
  }
  await next();
});

ingestRoutes.post('/contests', async (c) => {
  const contests = await c.req.json<IngestContest[]>();
  const upsert = c.env.DB.prepare(
    `INSERT INTO contests (platform, external_id, alt_external_id, name, url, start_at, end_at, counts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (platform, external_id) DO UPDATE SET
       alt_external_id = excluded.alt_external_id,
       name = excluded.name,
       url = excluded.url,
       start_at = excluded.start_at,
       end_at = excluded.end_at`,
  );
  if (contests.length) {
    await c.env.DB.batch(
      contests.map((x) =>
        upsert.bind(x.platform, x.externalId, x.altExternalId ?? null, x.name, x.url, x.startAt, x.endAt, x.counts ? 1 : 0),
      ),
    );
  }
  return c.json({ ok: true });
});

ingestRoutes.post('/solves', async (c) => {
  await insertSolves(c.env.DB, await c.req.json<IngestSolve[]>());
  return c.json({ ok: true });
});

ingestRoutes.post('/participation', async (c) => {
  const { platform, externalId, presentHandles, brokenHandles = [] } = await c.req.json<{
    platform: string;
    externalId: string;
    presentHandles: string[];
    brokenHandles?: string[];
  }>();
  const contest = await c.env.DB.prepare(
    'SELECT id, platform, name, stage FROM contests WHERE platform = ? AND external_id = ? AND counts = 1',
  )
    .bind(platform, externalId)
    .first<{ id: number; platform: string; name: string; stage: number }>();
  if (!contest) return c.json({ error: 'Contest not found' }, 404);
  if (contest.stage === 4) return c.json({ ok: true });

  if (brokenHandles.length) await c.env.DB.batch(brokenHandles.map((h) => markHandleBroken(c.env.DB, platform, h)));
  await finishContest(c.env, contest, presentHandles);
  return c.json({ ok: true });
});

ingestRoutes.get('/handles', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT h.handle FROM handles h JOIN users u ON u.id = h.user_id
     WHERE h.platform = ? AND h.approved_at IS NOT NULL AND h.broken = 0 AND u.active = 1`,
  )
    .bind(c.req.query('platform') ?? '')
    .all<{ handle: string }>();
  return c.json(results.map((r) => r.handle));
});
