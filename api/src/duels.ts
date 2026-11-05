import { Hono } from 'hono';
import { checkCoolingDown, decideDuel, duelCheckDue, duelRange, elo, playerStatus, type Difficulty, type DuelSubmission } from 'shared/duel';
import { periodStart } from 'shared/time';
import { requireUser, type AppEnv, type Bindings, type User } from './auth';
import { checkBadges } from './badges';
import { pushUsers } from './push';

const MINUTES = [30, 45, 60];
const DIFFICULTIES = ['easy', 'even', 'hard'];
const INVITE_LIFE = 600;
const MAX_OPEN_INVITES = 3;
const MAX_LIVE = 10;
const RANDOM_WINDOW = 200;
const UNRATED_DUELIST = 1200;
const RECENT_ROUND_SECONDS = 90 * 86400;
const GIVE_UP_AFTER_OUTAGE = 86400;
const RECENT_DUELS = 10;
const BOARD_SIZE = 20;

type DuelRow = {
  id: number;
  challengerId: number;
  opponentId: number;
  ratingMin: number;
  ratingMax: number;
  minutes: number;
  status: string;
  createdAt: number;
  problemId: string | null;
  startAt: number | null;
  endAt: number | null;
  winnerId: number | null;
  winningTime: number | null;
  gaveUpId: number | null;
  gaveUpAt: number | null;
  requestedAt: number | null;
  lastCheckAt: number | null;
  lastCheckOk: number;
  playerStatus: string | null;
  challengerDelta: number | null;
  opponentDelta: number | null;
};

const COLUMNS = `d.id, d.challenger_id AS challengerId, d.opponent_id AS opponentId, d.rating_min AS ratingMin, d.rating_max AS ratingMax, d.minutes, d.status,
  d.created_at AS createdAt, d.problem_id AS problemId, d.start_at AS startAt, d.end_at AS endAt, d.winner_id AS winnerId, d.winning_time AS winningTime,
  d.gave_up_id AS gaveUpId, d.gave_up_at AS gaveUpAt, d.check_requested_at AS requestedAt, d.last_check_at AS lastCheckAt, d.last_check_ok AS lastCheckOk,
  d.player_status AS playerStatus, d.challenger_delta AS challengerDelta, d.opponent_delta AS opponentDelta`;
const PLAYERS = `c.name AS challengerName, c.username AS challengerUsername, o.name AS opponentName, o.username AS opponentUsername`;
const WITH_PLAYERS = `duels d JOIN users c ON c.id = d.challenger_id JOIN users o ON o.id = d.opponent_id`;
const LIVE = `('live','judging')`;

const clock = () => Math.floor(Date.now() / 1000);

function liveCount(db: D1Database): Promise<number> {
  return db.prepare(`SELECT COUNT(*) AS n FROM duels WHERE status IN ${LIVE}`).first<{ n: number }>().then((row) => row?.n ?? 0);
}

function inDuel(db: D1Database, ...userIds: number[]): Promise<boolean> {
  return db
    .prepare(`SELECT 1 FROM duels WHERE status IN ('live','judging','queued') AND (challenger_id IN (SELECT value FROM json_each(?1)) OR opponent_id IN (SELECT value FROM json_each(?1))) LIMIT 1`)
    .bind(JSON.stringify(userIds))
    .first()
    .then((row) => !!row);
}

// The problem comes from D1, so accepting needs no Codeforces call: neither player has solved it, and it isn't from a recent round.
async function startDuel(env: Bindings, duel: Pick<DuelRow, 'id' | 'challengerId' | 'opponentId' | 'ratingMin' | 'ratingMax' | 'minutes'>, now: number): Promise<boolean> {
  const db = env.DB;
  const problem = await db
    .prepare(
      `SELECT p.problem_id AS id FROM problems p
       WHERE p.platform = 'cf' AND p.rating BETWEEN ?1 AND ?2 AND p.contest_at < ?3
         AND NOT EXISTS (SELECT 1 FROM cf_history h WHERE h.problem_id = p.problem_id AND h.user_id IN (?4, ?5))
       ORDER BY RANDOM() LIMIT 1`,
    )
    .bind(duel.ratingMin, duel.ratingMax, now - RECENT_ROUND_SECONDS, duel.challengerId, duel.opponentId)
    .first<{ id: string }>();
  if (!problem) {
    await db.prepare(`UPDATE duels SET status = 'expired' WHERE id = ?`).bind(duel.id).run();
    return false;
  }
  const started = await db
    .prepare(`UPDATE duels SET status = 'live', problem_id = ?, start_at = ?, end_at = ? WHERE id = ? AND status IN ('invited','queued') RETURNING id`)
    .bind(problem.id, now, now + duel.minutes * 60, duel.id)
    .first();
  if (started) {
    await pushUsers(env, 'duel', [duel.challengerId, duel.opponentId].map((userId) => ({ userId, title: 'Your duel has started', body: 'The problem is live. Go!', data: { path: `/duel/${duel.id}` } })));
  }
  return !!started;
}

export async function duelHousekeeping(env: Bindings, now: number): Promise<void> {
  const db = env.DB;
  await db.prepare(`UPDATE duels SET status = 'expired' WHERE status = 'invited' AND created_at <= ?`).bind(now - INVITE_LIFE).run();
  const { results: queued } = await db
    .prepare(`SELECT ${COLUMNS} FROM duels d WHERE d.status = 'queued' ORDER BY d.created_at`)
    .all<DuelRow>();
  let slots = MAX_LIVE - (queued.length ? await liveCount(db) : 0);
  for (const duel of queued) {
    if (slots <= 0) return;
    if (await startDuel(env, duel, now)) slots -= 1;
  }
}

async function finishDuel(env: Bindings, duel: DuelRow & { challengerRating: number; opponentRating: number }, winner: 'a' | 'b' | null, submissionId: number | undefined, time: number | undefined, playerJson: string, now: number): Promise<void> {
  const db = env.DB;
  const { a, b } = elo(duel.challengerRating, duel.opponentRating, winner === 'a' ? 1 : winner === 'b' ? 0 : 0.5);
  const winnerId = winner === 'a' ? duel.challengerId : winner === 'b' ? duel.opponentId : null;
  const gap = winner === 'a' ? duel.opponentRating - duel.challengerRating : winner === 'b' ? duel.challengerRating - duel.opponentRating : null;
  const rate = db.prepare(`UPDATE users SET duel_rating = duel_rating + ? WHERE id = ? AND EXISTS (SELECT 1 FROM duels WHERE id = ? AND status IN ${LIVE})`);
  await db.batch([
    rate.bind(a, duel.challengerId, duel.id),
    rate.bind(b, duel.opponentId, duel.id),
    db
      .prepare(
        `UPDATE duels SET status = ?, winner_id = ?, winning_submission_id = ?, winning_time = ?, challenger_delta = ?, opponent_delta = ?, rating_gap = ?, finished_at = ?,
           last_check_at = ?, last_check_ok = 1, player_status = ? WHERE id = ? AND status IN ${LIVE}`,
      )
      .bind(winner ? 'won' : 'draw', winnerId, submissionId ?? null, time ?? null, a, b, gap, now, now, playerJson, duel.id),
  ]);
  const body = (mine: boolean | null) => (mine === null ? 'Nobody solved it. It’s a draw.' : mine ? 'You won!' : 'Your opponent got there first.');
  await pushUsers(env, 'duel', [
    { userId: duel.challengerId, title: 'Duel finished', body: body(winner ? winner === 'a' : null), data: { path: `/duel/${duel.id}` } },
    { userId: duel.opponentId, title: 'Duel finished', body: body(winner ? winner === 'b' : null), data: { path: `/duel/${duel.id}` } },
  ]);
  await checkBadges(env, [duel.challengerId, duel.opponentId]);
}

type ReadSubmissions = (contestId: string, handle: string) => Promise<DuelSubmission[]>;

// Returns 'checked' after using Codeforces, 'waiting' if duels are live but none is due, 'none' if nothing is live.
export async function checkNextDuel(env: Bindings, read: ReadSubmissions): Promise<'checked' | 'waiting' | 'none'> {
  const db = env.DB;
  const { results } = await db
    .prepare(
      `SELECT ${COLUMNS}, ch.handle AS challengerHandle, oh.handle AS opponentHandle, c.duel_rating AS challengerRating, o.duel_rating AS opponentRating
       FROM ${WITH_PLAYERS}
       JOIN handles ch ON ch.user_id = d.challenger_id AND ch.platform = 'cf'
       JOIN handles oh ON oh.user_id = d.opponent_id AND oh.platform = 'cf'
       WHERE d.status IN ${LIVE} ORDER BY d.last_check_at IS NOT NULL, d.last_check_at`,
    )
    .all<DuelRow & { challengerHandle: string; opponentHandle: string; challengerRating: number; opponentRating: number }>();
  if (!results.length) return 'none';
  const duel = results.find((row) => duelCheckDue({ lastCheckAt: row.lastCheckAt, requestedAt: row.requestedAt, endAt: row.endAt! }, clock()));
  if (!duel) return 'waiting';

  const [, contestId, index] = duel.problemId!.match(/^(\d+)(.+)$/)!;
  const problem = { contestId: Number(contestId), index };
  const reader = async (handle: string) => {
    try {
      return await read(contestId, handle);
    } catch (err) {
      console.error(`Duel ${duel.id} read failed for ${handle}:`, err);
      return null;
    }
  };
  const a = await reader(duel.challengerHandle);
  const b = await reader(duel.opponentHandle);
  const now = clock();
  const previous = JSON.parse(duel.playerStatus ?? '{}');
  const playerJson = JSON.stringify({
    challenger: a ? playerStatus(a, problem, duel.startAt!, duel.endAt!) : (previous.challenger ?? { state: 'none' }),
    opponent: b ? playerStatus(b, problem, duel.startAt!, duel.endAt!) : (previous.opponent ?? { state: 'none' }),
  });
  const gaveUp = duel.gaveUpId && duel.gaveUpAt ? { player: duel.gaveUpId === duel.challengerId ? ('a' as const) : ('b' as const), at: duel.gaveUpAt } : undefined;
  const decision = decideDuel({ start: duel.startAt!, end: duel.endAt!, problem, a, b, now, gaveUp });

  if (decision.status === 'won') {
    await finishDuel(env, duel, decision.winner, decision.submissionId, decision.time, playerJson, now);
    return 'checked';
  }
  if (decision.status === 'draw') {
    await finishDuel(env, duel, null, undefined, undefined, playerJson, now);
    return 'checked';
  }
  // An outage never changes a result, but a handle that stays unreadable mustn't hold both players and a slot for ever. This changes no ratings.
  const stuck = decision.status === 'checking' && now > duel.endAt! + GIVE_UP_AFTER_OUTAGE;
  await db
    .prepare('UPDATE duels SET status = ?, last_check_at = ?, last_check_ok = ?, player_status = ? WHERE id = ?')
    .bind(stuck ? 'expired' : decision.status === 'judging' ? 'judging' : 'live', now, decision.status === 'checking' ? 0 : 1, playerJson, duel.id)
    .run();
  return 'checked';
}

export const duelRoutes = new Hono<AppEnv>();
duelRoutes.use(requireUser);

async function createDuel(env: Bindings, user: User, opponentId: number, ratingMin: number, ratingMax: number, minutes: number, now: number): Promise<{ id?: number; error?: string; status?: 404 | 409 }> {
  const db = env.DB;
  if (await inDuel(db, user.id)) return { error: "You're already in a duel", status: 409 };
  if (await inDuel(db, opponentId)) return { error: "They're already in a duel", status: 409 };
  const open = await db
    .prepare(`SELECT COUNT(*) AS n FROM duels WHERE status = 'invited' AND created_at > ?1 AND (challenger_id IN (?2, ?3) OR opponent_id IN (?2, ?3)) GROUP BY CASE WHEN challenger_id = ?2 OR opponent_id = ?2 THEN 1 ELSE 2 END ORDER BY n DESC LIMIT 1`)
    .bind(now - INVITE_LIFE, user.id, opponentId)
    .first<{ n: number }>();
  if ((open?.n ?? 0) >= MAX_OPEN_INVITES) return { error: 'Too many open invites. Try again in a few minutes.', status: 409 };
  const created = await db
    .prepare(`INSERT INTO duels (challenger_id, opponent_id, rating_min, rating_max, minutes, status, created_at) VALUES (?, ?, ?, ?, ?, 'invited', ?) RETURNING id`)
    .bind(user.id, opponentId, ratingMin, ratingMax, minutes, now)
    .first<{ id: number }>();
  await pushUsers(env, 'duel', [
    {
      userId: opponentId,
      title: `@${user.username} challenged you`,
      body: `${ratingMin}–${ratingMax} · ${minutes} min. Expires in 10 minutes.`,
      categoryId: 'duel',
      data: { duelId: created!.id, path: `/duel/${created!.id}` },
    },
  ]);
  return { id: created!.id };
}

const hasCfHandle = (db: D1Database, userId: number) =>
  db.prepare(`SELECT 1 FROM handles h JOIN users u ON u.id = h.user_id WHERE h.user_id = ? AND h.platform = 'cf' AND h.approved_at IS NOT NULL AND h.broken = 0 AND u.active = 1`).bind(userId).first();

duelRoutes.post('/', async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const now = clock();
  const body = await c.req.json<{ opponentId?: number; random?: boolean; difficulty?: string; minutes?: number; rematchOf?: number }>();
  if (!(await hasCfHandle(db, user.id))) return c.json({ error: 'You need an approved Codeforces handle to duel' }, 409);

  let result;
  if (body.rematchOf) {
    const old = await db.prepare('SELECT challenger_id AS a, opponent_id AS b, rating_min AS min, rating_max AS max, minutes FROM duels WHERE id = ?').bind(body.rematchOf).first<{ a: number; b: number; min: number; max: number; minutes: number }>();
    if (!old || (old.a !== user.id && old.b !== user.id)) return c.json({ error: 'Duel not found' }, 404);
    result = await createDuel(c.env, user, old.a === user.id ? old.b : old.a, old.min, old.max, old.minutes, now);
  } else {
    if (!DIFFICULTIES.includes(body.difficulty ?? '') || !MINUTES.includes(body.minutes ?? 0)) return c.json({ error: 'Choose a difficulty and a time limit' }, 400);
    const myRating = user.cfRating ?? UNRATED_DUELIST;
    const opponent = body.random
      ? await db
          .prepare(
            `SELECT u.id, u.cf_rating AS rating FROM users u JOIN handles h ON h.user_id = u.id AND h.platform = 'cf' AND h.approved_at IS NOT NULL AND h.broken = 0
             WHERE u.active = 1 AND u.id != ? AND ABS(COALESCE(u.cf_rating, ${UNRATED_DUELIST}) - ?) <= ${RANDOM_WINDOW}
               AND u.id NOT IN (SELECT challenger_id FROM duels WHERE status IN ('live','judging','queued') UNION SELECT opponent_id FROM duels WHERE status IN ('live','judging','queued'))
             ORDER BY RANDOM() LIMIT 1`,
          )
          .bind(user.id, myRating)
          .first<{ id: number; rating: number | null }>()
      : await db.prepare('SELECT id, cf_rating AS rating FROM users WHERE id = ?').bind(body.opponentId ?? 0).first<{ id: number; rating: number | null }>();
    if (!opponent) return c.json({ error: body.random ? 'Nobody is free within 200 rating right now' : 'Student not found' }, 404);
    if (opponent.id === user.id) return c.json({ error: "You can't duel yourself" }, 400);
    if (!(await hasCfHandle(db, opponent.id))) return c.json({ error: 'They need an approved Codeforces handle first' }, 409);
    const range = duelRange(body.difficulty as Difficulty, user.cfRating, opponent.rating);
    result = await createDuel(c.env, user, opponent.id, range.min, range.max, body.minutes!, now);
  }
  if (result.error) return c.json({ error: result.error }, result.status ?? 400);
  return c.json({ id: result.id });
});

duelRoutes.get('/', async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const now = clock();
  const week = periodStart('week', now);
  const [mine, invites, live, recent, board] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT u.duel_rating AS rating,
           COALESCE((SELECT SUM(CASE WHEN challenger_id = u.id THEN challenger_delta ELSE opponent_delta END) FROM duels WHERE (challenger_id = u.id OR opponent_id = u.id) AND finished_at >= ?2), 0) AS weekChange,
           (SELECT COUNT(*) FROM duels WHERE winner_id = u.id) AS wins,
           (SELECT COUNT(*) FROM duels WHERE status = 'won' AND winner_id != u.id AND (challenger_id = u.id OR opponent_id = u.id)) AS losses,
           (SELECT COUNT(*) FROM duels WHERE status = 'draw' AND (challenger_id = u.id OR opponent_id = u.id)) AS draws
         FROM users u WHERE u.id = ?1`,
      )
      .bind(user.id, week),
    db
      .prepare(`SELECT ${COLUMNS}, ${PLAYERS} FROM ${WITH_PLAYERS} WHERE d.status = 'invited' AND d.created_at > ?1 AND (d.opponent_id = ?2 OR d.challenger_id = ?2) ORDER BY d.created_at DESC`)
      .bind(now - INVITE_LIFE, user.id),
    db.prepare(`SELECT ${COLUMNS}, ${PLAYERS} FROM ${WITH_PLAYERS} WHERE d.status IN ('live','judging','queued') ORDER BY d.start_at`),
    db
      .prepare(`SELECT ${COLUMNS}, ${PLAYERS} FROM ${WITH_PLAYERS} WHERE d.status IN ('won','draw') AND (d.challenger_id = ?1 OR d.opponent_id = ?1) ORDER BY d.finished_at DESC LIMIT ${RECENT_DUELS}`)
      .bind(user.id),
    db
      .prepare(
        `SELECT u.id AS userId, u.name, u.username, u.duel_rating AS rating,
           (SELECT COUNT(*) FROM duels WHERE winner_id = u.id) AS wins,
           (SELECT COUNT(*) FROM duels WHERE status = 'won' AND winner_id != u.id AND (challenger_id = u.id OR opponent_id = u.id)) AS losses
         FROM users u WHERE u.active = 1 AND EXISTS (SELECT 1 FROM duels WHERE status IN ('won','draw') AND (challenger_id = u.id OR opponent_id = u.id))
         ORDER BY u.duel_rating DESC, u.name LIMIT ${BOARD_SIZE}`,
      ),
  ]);
  // Spectators mustn't get the problem of a live duel.
  const hideProblem = ({ problemId: _, ...duel }: Record<string, unknown>) => duel;
  return c.json({ me: mine.results[0], invites: invites.results, live: live.results.map(hideProblem), recent: recent.results.map(hideProblem), board: board.results, now });
});

duelRoutes.get('/opponents', async (c) => {
  const q = `%${(c.req.query('q') ?? '').trim()}%`;
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.username, u.cf_rating AS cfRating, u.duel_rating AS duelRating
     FROM users u JOIN handles h ON h.user_id = u.id AND h.platform = 'cf' AND h.approved_at IS NOT NULL AND h.broken = 0
     WHERE u.active = 1 AND u.id != ? AND (u.name LIKE ? OR u.username LIKE ?) ORDER BY u.name LIMIT 30`,
  )
    .bind(c.get('user').id, q, q)
    .all();
  return c.json(results);
});

function loadDuel(db: D1Database, id: number) {
  return db.prepare(`SELECT ${COLUMNS}, ${PLAYERS} FROM ${WITH_PLAYERS} WHERE d.id = ?`).bind(id).first<DuelRow & Record<string, unknown>>();
}

duelRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const duel = await loadDuel(c.env.DB, Number(c.req.param('id')));
  if (!duel) return c.json({ error: 'Duel not found' }, 404);
  const isPlayer = duel.challengerId === user.id || duel.opponentId === user.id;
  const finished = duel.status === 'won' || duel.status === 'draw';
  const problem =
    duel.problemId && (isPlayer || finished)
      ? await c.env.DB.prepare(`SELECT problem_id AS problemId, name, rating, url FROM problems WHERE platform = 'cf' AND problem_id = ?`).bind(duel.problemId).first()
      : null;
  const { problemId: _, requestedAt: __, playerStatus: statuses, ...rest } = duel;
  return c.json({ ...rest, players: JSON.parse(statuses ?? '{}'), problem, isPlayer, now: clock() });
});

async function playerDuel(c: { env: Bindings; get: (key: 'user') => User; req: { param: (key: string) => string } }) {
  const duel = await loadDuel(c.env.DB, Number(c.req.param('id')));
  const userId = c.get('user').id;
  return duel && (duel.challengerId === userId || duel.opponentId === userId) ? duel : null;
}

duelRoutes.post('/:id/accept', async (c) => {
  const db = c.env.DB;
  const now = clock();
  const duel = await playerDuel(c);
  if (!duel || duel.opponentId !== c.get('user').id) return c.json({ error: 'Duel not found' }, 404);
  if (duel.status !== 'invited' || duel.createdAt <= now - INVITE_LIFE) return c.json({ error: 'This invite has ended' }, 409);
  if (await inDuel(db, duel.challengerId, duel.opponentId)) return c.json({ error: 'One of you is already in a duel' }, 409);
  if ((await liveCount(db)) >= MAX_LIVE) {
    await db.prepare(`UPDATE duels SET status = 'queued' WHERE id = ? AND status = 'invited'`).bind(duel.id).run();
    return c.json({ status: 'queued' });
  }
  const started = await startDuel(c.env, duel, now);
  if (!started) return c.json({ error: 'No suitable problem found. Try another range.' }, 409);
  return c.json({ status: 'live' });
});

duelRoutes.post('/:id/decline', async (c) => {
  const duel = await playerDuel(c);
  if (!duel) return c.json({ error: 'Duel not found' }, 404);
  const result = await c.env.DB.prepare(`UPDATE duels SET status = 'declined' WHERE id = ? AND status = 'invited'`).bind(duel.id).run();
  if (!result.meta.changes) return c.json({ error: 'This invite has ended' }, 409);
  return c.json({ ok: true });
});

// "Check now" only asks the queue to look sooner. It never reads Codeforces and never decides anything.
duelRoutes.post('/:id/check', async (c) => {
  const duel = await playerDuel(c);
  if (!duel) return c.json({ error: 'Duel not found' }, 404);
  if (duel.status !== 'live' && duel.status !== 'judging') return c.json({ error: 'This duel is not live' }, 409);
  const now = clock();
  if (checkCoolingDown(duel.lastCheckAt, now)) return c.json({ cooling: true });
  await c.env.DB.prepare('UPDATE duels SET check_requested_at = ? WHERE id = ?').bind(now, duel.id).run();
  return c.json({ cooling: false });
});

duelRoutes.post('/:id/give-up', async (c) => {
  const duel = await playerDuel(c);
  if (!duel) return c.json({ error: 'Duel not found' }, 404);
  const now = clock();
  const result = await c.env.DB.prepare(`UPDATE duels SET gave_up_id = ?, gave_up_at = ?, check_requested_at = ? WHERE id = ? AND status IN ${LIVE} AND gave_up_id IS NULL`)
    .bind(c.get('user').id, now, now, duel.id)
    .run();
  if (!result.meta.changes) return c.json({ error: 'This duel is not live' }, 409);
  return c.json({ ok: true });
});
