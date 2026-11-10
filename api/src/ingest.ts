import { Hono } from 'hono';
import { istDay } from 'shared/time';
import type { HealthReport, IngestContest, IngestRating, IngestSolve } from 'shared/types';
import type { AppEnv } from './auth';
import { checkBadges } from './badges';
import { createUpsolves, type ContestProblem } from './practice';
import { finishContest, insertSolves, markHandleBroken } from './records';

const STUCK_CONTEST_SECONDS = 6 * 3600;

export const ingestRoutes = new Hono<AppEnv>();

ingestRoutes.use(async (c, next) => {
  if (c.req.header('X-Ingest-Secret') !== c.env.INGEST_SECRET) {
    return c.json({ error: 'Invalid ingest secret' }, 401);
  }
  await next();
});

ingestRoutes.get('/health', async (c) => {
  const db = c.env.DB;
  const stuckAfter = Math.floor(Date.now() / 1000) - STUCK_CONTEST_SECONDS;
  const [cf, platforms, latestContests, stuckContests, brokenHandles, pushErrors, potdPicks] = await db.batch<Record<string, unknown>>([
    db.prepare(
      `SELECT COUNT(*) AS cfHandles, MIN(COALESCE(h.synced_at, 0)) AS oldestCfSync FROM handles h JOIN users u ON u.id = h.user_id
       WHERE h.platform = 'cf' AND h.approved_at IS NOT NULL AND h.broken = 0 AND u.active = 1`,
    ),
    db.prepare(
      `SELECT h.platform, COUNT(*) AS approvedHandles, (SELECT MAX(s.solved_at) FROM solves s WHERE s.platform = h.platform) AS lastSolve
       FROM handles h JOIN users u ON u.id = h.user_id
       WHERE h.approved_at IS NOT NULL AND h.broken = 0 AND u.active = 1 GROUP BY h.platform`,
    ),
    db.prepare(`SELECT platform, MAX(start_at) AS startAt FROM contests WHERE kind = 'round' GROUP BY platform`),
    db.prepare('SELECT name FROM contests WHERE counts = 1 AND stage < 4 AND end_at < ?').bind(stuckAfter),
    db.prepare(`SELECT platform || ':' || handle AS handle FROM handles WHERE broken = 1`),
    db.prepare('SELECT DISTINCT error FROM push_errors WHERE at > unixepoch() - 86400'),
    db.prepare('SELECT COUNT(*) AS n FROM potd WHERE day = ?').bind(istDay(Math.floor(Date.now() / 1000))),
  ]);
  return c.json({
    ...(cf.results[0] as Pick<HealthReport, 'cfHandles' | 'oldestCfSync'>),
    platforms: platforms.results,
    latestContests: latestContests.results,
    stuckContests: stuckContests.results.map((row) => row.name),
    brokenHandles: brokenHandles.results.map((row) => row.handle),
    pushErrors: pushErrors.results.map((row) => row.error),
    potdPicks: (potdPicks.results[0] as { n: number }).n,
  });
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
  const solvers = await insertSolves(c.env.DB, await c.req.json<IngestSolve[]>());
  c.executionCtx.waitUntil(checkBadges(c.env, solvers).catch((err) => console.error('Badge check failed:', err)));
  return c.json({ ok: true });
});

ingestRoutes.post('/ratings', async (c) => {
  const ratings = await c.req.json<IngestRating[]>();
  const update = c.env.DB.prepare('UPDATE handles SET rating = ? WHERE platform = ? AND lower(handle) = lower(?)');
  if (ratings.length) await c.env.DB.batch(ratings.map((r) => update.bind(r.rating, r.platform, r.handle)));
  return c.json({ ok: true });
});

ingestRoutes.post('/participation', async (c) => {
  const { platform, externalId, presentHandles, brokenHandles = [], problems = [], altProblems = [], solved = {} } = await c.req.json<{
    platform: string;
    externalId: string;
    presentHandles: string[];
    brokenHandles?: string[];
    problems?: ContestProblem[];
    altProblems?: ContestProblem[];
    solved?: Record<string, string[]>;
  }>();
  const contest = await c.env.DB.prepare(
    'SELECT id, platform, name, stage, start_at AS startAt FROM contests WHERE platform = ? AND external_id = ? AND counts = 1',
  )
    .bind(platform, externalId)
    .first<{ id: number; platform: string; name: string; stage: number; startAt: number }>();
  if (!contest) return c.json({ error: 'Contest not found' }, 404);
  if (contest.stage === 4) return c.json({ ok: true });

  if (brokenHandles.length) await c.env.DB.batch(brokenHandles.map((h) => markHandleBroken(c.env.DB, platform, h)));
  if (platform === 'cf') await createUpsolves(c.env.DB, contest, problems, altProblems, solved);
  await finishContest(c.env, contest, presentHandles);
  const { results: present } = await c.env.DB.prepare(`SELECT user_id AS id FROM attendance WHERE contest_id = ? AND status = 'present'`).bind(contest.id).all<{ id: number }>();
  c.executionCtx.waitUntil(checkBadges(c.env, present.map((row) => row.id)).catch((err) => console.error('Badge check failed:', err)));
  return c.json({ ok: true });
});

// The body is passed to SQLite unparsed, so a big chunk costs the Worker almost no CPU.
ingestRoutes.post('/problemset', async (c) => {
  const body = await c.req.text();
  const db = c.env.DB;
  await db.batch([
    db
      .prepare(
        `INSERT INTO cf_rounds (id, name, duration)
         SELECT json_extract(value, '$.id'), json_extract(value, '$.name'), json_extract(value, '$.duration') FROM json_each(?, '$.rounds') WHERE true
         ON CONFLICT (id) DO UPDATE SET name = excluded.name, duration = excluded.duration
         WHERE name IS NOT excluded.name OR duration IS NOT excluded.duration`,
      )
      .bind(body),
    db
      .prepare(
        `INSERT INTO problems (platform, problem_id, name, rating, tags, url, contest_at)
         SELECT 'cf', json_extract(value, '$.problemId'), json_extract(value, '$.name'), json_extract(value, '$.rating'), json_extract(value, '$.tags'), json_extract(value, '$.url'), json_extract(value, '$.contestAt')
         FROM json_each(?, '$.problems') WHERE true
         ON CONFLICT (platform, problem_id) DO UPDATE SET name = excluded.name, rating = excluded.rating, tags = excluded.tags, url = excluded.url, contest_at = excluded.contest_at
         WHERE rating IS NOT excluded.rating OR contest_at IS NOT excluded.contest_at OR tags IS NOT excluded.tags OR name IS NOT excluded.name`,
      )
      .bind(body),
  ]);
  return c.json({ ok: true });
});

ingestRoutes.get('/history-missing', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT h.handle FROM handles h JOIN users u ON u.id = h.user_id
     WHERE h.platform = 'cf' AND h.approved_at IS NOT NULL AND h.broken = 0 AND u.active = 1 AND h.history_imported_at IS NULL`,
  ).all<{ handle: string }>();
  return c.json(results.map((r) => r.handle));
});

ingestRoutes.post('/cf-history', async (c) => {
  const { handle, problemIds, done } = await c.req.json<{ handle: string; problemIds: string[]; done?: boolean }>();
  const db = c.env.DB;
  const owner = await db.prepare(`SELECT user_id AS userId FROM handles WHERE platform = 'cf' AND lower(handle) = lower(?)`).bind(handle).first<{ userId: number }>();
  if (!owner) return c.json({ error: 'Handle not found' }, 404);
  const statements = [db.prepare('INSERT OR IGNORE INTO cf_history (user_id, problem_id) SELECT ?, value FROM json_each(?)').bind(owner.userId, JSON.stringify(problemIds))];
  if (done) statements.push(db.prepare(`UPDATE handles SET history_imported_at = unixepoch() WHERE user_id = ? AND platform = 'cf'`).bind(owner.userId));
  await db.batch(statements);
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
