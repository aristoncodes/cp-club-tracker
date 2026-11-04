import { Hono } from 'hono';
import { problemRp, solvePoints } from 'shared/scoring';
import type { IngestContest, Platform } from 'shared/types';
import type { AppEnv } from './auth';

type IngestSolve = {
  platform: Platform;
  handle: string;
  problemId: string;
  name?: string;
  rating?: number | string;
  tags?: string[];
  url?: string;
  solvedAt: number;
  live: boolean;
};

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
  const solves = await c.req.json<IngestSolve[]>();
  const { results: handles } = await c.env.DB.prepare(
    `SELECT h.platform, lower(h.handle) AS handle, h.user_id AS userId, h.approved_at AS approvedAt, u.cf_rating AS cfRating
     FROM handles h JOIN users u ON u.id = h.user_id
     WHERE h.approved_at IS NOT NULL AND u.active = 1`,
  ).all<{ platform: string; handle: string; userId: number; approvedAt: number; cfRating: number | null }>();
  const byHandle = new Map(handles.map((h) => [`${h.platform}:${h.handle}`, h]));

  const upsertProblem = c.env.DB.prepare(
    `INSERT INTO problems (platform, problem_id, name, rating, tags, url) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (platform, problem_id) DO UPDATE SET
       name = COALESCE(excluded.name, name),
       rating = COALESCE(excluded.rating, rating),
       tags = COALESCE(excluded.tags, tags),
       url = COALESCE(excluded.url, url)`,
  );
  const insertSolve = c.env.DB.prepare(
    `INSERT OR IGNORE INTO solves (user_id, platform, problem_id, solved_at, live, rp, points) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const statements = solves.flatMap((s) => {
    const owner = byHandle.get(`${s.platform}:${s.handle.toLowerCase()}`);
    if (!owner || s.solvedAt < owner.approvedAt) return [];
    const rp = problemRp(s.platform, s.rating ?? null);
    return [
      upsertProblem.bind(s.platform, s.problemId, s.name ?? null, s.rating ?? null, s.tags ? JSON.stringify(s.tags) : null, s.url ?? null),
      insertSolve.bind(owner.userId, s.platform, s.problemId, s.solvedAt, s.live ? 1 : 0, rp, solvePoints(rp, owner.cfRating, s.live)),
    ];
  });
  if (statements.length) await c.env.DB.batch(statements);
  return c.json({ ok: true });
});

ingestRoutes.post('/participation', async (c) => {
  const { platform, externalId, presentHandles } = await c.req.json<{
    platform: string;
    externalId: string;
    presentHandles: string[];
  }>();
  const contest = await c.env.DB.prepare(
    'SELECT id, stage FROM contests WHERE platform = ? AND external_id = ? AND counts = 1',
  )
    .bind(platform, externalId)
    .first<{ id: number; stage: number }>();
  if (!contest) return c.json({ error: 'Contest not found' }, 404);
  if (contest.stage === 4) return c.json({ ok: true });

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT OR IGNORE INTO attendance (contest_id, user_id)
       SELECT ?, u.id FROM users u JOIN handles h ON h.user_id = u.id
       WHERE u.active = 1 AND h.platform = ? AND h.approved_at IS NOT NULL`,
    ).bind(contest.id, platform),
    c.env.DB.prepare(
      `UPDATE attendance SET status = CASE WHEN user_id IN (
         SELECT user_id FROM handles
         WHERE platform = ?1 AND lower(handle) IN (SELECT lower(value) FROM json_each(?2))
       ) THEN 'present' ELSE 'absent' END
       WHERE contest_id = ?3`,
    ).bind(platform, JSON.stringify(presentHandles), contest.id),
    c.env.DB.prepare('UPDATE contests SET stage = 4 WHERE id = ?').bind(contest.id),
  ]);
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
