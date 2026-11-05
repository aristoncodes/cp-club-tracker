import { Hono } from 'hono';
import type { CfSubmission } from 'shared/cf';
import { sortByIndex, problemLetter } from 'shared/upsolve';
import { applySubmissions, rankVirtual, virtualStart, type VirtualResults } from 'shared/virtual';
import { requireAdmin, requireUser, type AppEnv, type Bindings } from './auth';
import { finishContest } from './records';

const START_WINDOW = 900;
const READ_EVERY = 120;
const END_MARGIN = 120;

type Row = { contestId: number; cfContestId: number; startAt: number; userId: number; handle: string; syncedAt: number | null };

// Everyone during the first 15 minutes, to spot who started. After that, only those who did.
export async function nextVirtualRead(db: D1Database, now: number): Promise<Row | null> {
  return db
    .prepare(
      `SELECT c.id AS contestId, v.cf_contest_id AS cfContestId, c.start_at AS startAt, h.user_id AS userId, h.handle, h.synced_at AS syncedAt
       FROM contests c JOIN virtual_contests v ON v.contest_id = c.id
       JOIN handles h ON h.platform = 'cf' AND h.approved_at IS NOT NULL AND h.broken = 0
       JOIN users u ON u.id = h.user_id AND u.active = 1
       WHERE c.start_at <= ?1 AND c.end_at + ${END_MARGIN} >= ?1 AND COALESCE(h.synced_at, 0) <= ?1 - ${READ_EVERY}
         AND (?1 <= c.start_at + ${START_WINDOW} OR EXISTS (SELECT 1 FROM virtual_results r WHERE r.contest_id = c.id AND r.user_id = h.user_id))
       ORDER BY h.synced_at IS NOT NULL, h.synced_at LIMIT 1`,
    )
    .bind(now)
    .first<Row>();
}

export async function recordVirtual(db: D1Database, row: Row, submissions: CfSubmission[]): Promise<void> {
  const existing = await db
    .prepare('SELECT started_at AS startedAt, results FROM virtual_results WHERE contest_id = ? AND user_id = ?')
    .bind(row.contestId, row.userId)
    .first<{ startedAt: number; results: string }>();
  const startedAt = existing?.startedAt ?? virtualStart(submissions, row.cfContestId, row.startAt);
  if (startedAt === null) return;
  const previous: VirtualResults = existing ? JSON.parse(existing.results) : { seen: [], cells: {} };
  const next = applySubmissions(previous, submissions, row.cfContestId, startedAt);
  if (existing && next.seen.length === previous.seen.length) return;
  await db
    .prepare(
      `INSERT INTO virtual_results (contest_id, user_id, started_at, results) VALUES (?, ?, ?, ?)
       ON CONFLICT (contest_id, user_id) DO UPDATE SET results = excluded.results`,
    )
    .bind(row.contestId, row.userId, startedAt, JSON.stringify(next))
    .run();
}

export async function finishVirtual(env: Bindings, contest: { id: number; platform: string; name: string; counts: number }): Promise<void> {
  if (!contest.counts) {
    await env.DB.prepare('UPDATE contests SET stage = 4 WHERE id = ?').bind(contest.id).run();
    return;
  }
  const { results } = await env.DB.prepare(
    `SELECT h.handle FROM virtual_results r JOIN handles h ON h.user_id = r.user_id AND h.platform = 'cf' WHERE r.contest_id = ?`,
  )
    .bind(contest.id)
    .all<{ handle: string }>();
  await finishContest(env, contest, results.map((row) => row.handle));
}

type Round = { name: string; duration: number; problems: { index: string; name: string }[] };

async function findRound(db: D1Database, cfContestId: number): Promise<Round | null> {
  const [round, problems] = await db.batch<Record<string, unknown>>([
    db.prepare('SELECT name, duration FROM cf_rounds WHERE id = ?').bind(cfContestId),
    db.prepare(`SELECT problem_id AS problemId, name FROM problems WHERE platform = 'cf' AND problem_id GLOB ?`).bind(`${cfContestId}[A-Z]*`),
  ]);
  const found = round.results[0] as { name: string; duration: number } | undefined;
  if (!found || !problems.results.length) return null;
  return { ...found, problems: sortByIndex(problems.results as { problemId: string; name: string }[]).map((p) => ({ index: problemLetter(p.problemId), name: p.name })) };
}

export const adminVirtualRoutes = new Hono<AppEnv>();
adminVirtualRoutes.use(requireUser, requireAdmin);

adminVirtualRoutes.get('/lookup', async (c) => {
  const round = await findRound(c.env.DB, Number(c.req.query('contestId')));
  if (!round) return c.json({ error: "That round isn't in our list yet. Finished rounds appear within a day." }, 404);
  return c.json({ name: round.name, duration: round.duration, problemCount: round.problems.length });
});

adminVirtualRoutes.post('/', async (c) => {
  const { cfContestId, startAt, counts } = await c.req.json<{ cfContestId?: number; startAt?: number; counts?: boolean }>();
  if (!Number.isInteger(cfContestId) || !Number.isInteger(startAt)) return c.json({ error: 'A contest id and a start time are required' }, 400);
  if (startAt! <= Math.floor(Date.now() / 1000)) return c.json({ error: 'The start time must be in the future' }, 400);
  const db = c.env.DB;
  const round = await findRound(db, cfContestId!);
  if (!round) return c.json({ error: "That round isn't in our list yet. Finished rounds appear within a day." }, 404);
  const created = await db
    .prepare(
      `INSERT INTO contests (platform, external_id, name, url, start_at, end_at, counts, kind) VALUES ('cf', ?, ?, ?, ?, ?, ?, 'virtual')
       ON CONFLICT (platform, external_id) DO NOTHING RETURNING id`,
    )
    .bind(`v${cfContestId}-${startAt}`, round.name, `https://codeforces.com/contest/${cfContestId}`, startAt, startAt! + round.duration, counts ? 1 : 0)
    .first<{ id: number }>();
  if (!created) return c.json({ error: 'That virtual is already scheduled' }, 409);
  await db.prepare('INSERT INTO virtual_contests (contest_id, cf_contest_id, problems) VALUES (?, ?, ?)').bind(created.id, cfContestId, JSON.stringify(round.problems)).run();
  return c.json({ id: created.id });
});

export const virtualRoutes = new Hono<AppEnv>();
virtualRoutes.use(requireUser);

virtualRoutes.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.platform, c.name, c.url, c.start_at AS startAt, c.end_at AS endAt, c.counts, c.kind, a.rsvp,
            (SELECT COUNT(*) FROM attendance x WHERE x.contest_id = c.id AND x.rsvp = 'yes') AS goingCount,
            (SELECT COUNT(*) FROM handles h JOIN users u ON u.id = h.user_id WHERE h.platform = 'cf' AND h.approved_at IS NOT NULL AND u.active = 1) AS participantCount,
            (SELECT COUNT(*) FROM virtual_results r WHERE r.contest_id = c.id) AS startedCount
     FROM contests c LEFT JOIN attendance a ON a.contest_id = c.id AND a.user_id = ?
     WHERE c.kind = 'virtual' ORDER BY c.start_at DESC LIMIT 30`,
  )
    .bind(c.get('user').id)
    .all();
  return c.json(results);
});

virtualRoutes.get('/:contestId/standings', async (c) => {
  const db = c.env.DB;
  const contestId = Number(c.req.param('contestId'));
  const contest = await db
    .prepare(
      `SELECT c.id, c.name, c.url, c.start_at AS startAt, c.end_at AS endAt, v.problems FROM contests c JOIN virtual_contests v ON v.contest_id = c.id WHERE c.id = ?`,
    )
    .bind(contestId)
    .first<{ problems: string }>();
  if (!contest) return c.json({ error: 'Virtual not found' }, 404);
  const { results } = await db
    .prepare(`SELECT r.user_id AS userId, u.name, u.username, r.results FROM virtual_results r JOIN users u ON u.id = r.user_id WHERE r.contest_id = ?`)
    .bind(contestId)
    .all<{ userId: number; name: string; username: string | null; results: string }>();
  const rows = rankVirtual(results.map(({ results: raw, ...row }) => ({ ...row, cells: (JSON.parse(raw) as VirtualResults).cells })));
  return c.json({ ...contest, problems: JSON.parse(contest.problems), rows, now: Math.floor(Date.now() / 1000) });
});
