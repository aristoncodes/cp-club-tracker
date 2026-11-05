import { Hono } from 'hono';
import { closestTarget, GOAL_RATINGS, GOAL_TARGETS, goalLocked, goalSuggestion } from 'shared/goal';
import { potdBand, potdBonus, potdRating, POTD_BANDS } from 'shared/potd';
import { IST_OFFSET, istDay, periodStart, solveStreak, weekStrip } from 'shared/time';
import { contestType, upsolveItems, upsolveReminderDue } from 'shared/upsolve';
import { requireUser, type AppEnv, type Bindings } from './auth';
import { pushUsers } from './push';

const DAY = 86400;
const RECENT_ROUND_SECONDS = 90 * DAY;
const UPSOLVE_ROWS = 120;
const REMINDER_WINDOW = 8 * DAY;
const POTD_STREAK_DAYS = 400;
const WEEK = 7 * DAY;
const SUGGESTION_WEEKS = 4;

export type ContestProblem = { problemId: string; name: string; rating?: number; tags?: string[]; url?: string };

const ratingAt = `COALESCE(
  (SELECT json_extract(j.value, '$.rating') FROM json_each(u.cf_rating_history) j WHERE json_extract(j.value, '$.at') < ?1 ORDER BY json_extract(j.value, '$.at') DESC LIMIT 1),
  CASE WHEN u.cf_rating_history IS NULL OR u.cf_rating_history = '[]' THEN u.cf_rating END)`;

export async function createUpsolves(
  db: D1Database,
  contest: { id: number; name: string; startAt: number },
  problems: ContestProblem[],
  altProblems: ContestProblem[],
  solved: Record<string, string[]>,
): Promise<void> {
  const type = contestType(contest.name);
  if (!type || !problems.length) return;
  const { results: members } = await db
    .prepare(
      `SELECT u.id, lower(h.handle) AS handle, ${ratingAt} AS rating
       FROM users u JOIN handles h ON h.user_id = u.id
       WHERE u.active = 1 AND h.platform = 'cf' AND h.approved_at IS NOT NULL`,
    )
    .bind(contest.startAt)
    .all<{ id: number; handle: string; rating: number | null }>();
  const solvedByHandle = new Map(Object.entries(solved).map(([handle, names]) => [handle.toLowerCase(), names]));
  const altByName = new Map(altProblems.map((problem) => [problem.name, problem.problemId]));
  const saveProblem = db.prepare(
    `INSERT INTO problems (platform, problem_id, name, rating, tags, url) VALUES ('cf', ?, ?, ?, ?, ?)
     ON CONFLICT (platform, problem_id) DO UPDATE SET name = excluded.name, rating = COALESCE(excluded.rating, rating), tags = COALESCE(excluded.tags, tags), url = COALESCE(excluded.url, url)`,
  );
  const saveItem = db.prepare('INSERT OR IGNORE INTO upsolves (user_id, contest_id, problem_id, alt_problem_id) VALUES (?, ?, ?, ?)');
  await db.batch([
    ...[...problems, ...altProblems].map((p) => saveProblem.bind(p.problemId, p.name, p.rating ?? null, p.tags ? JSON.stringify(p.tags) : null, p.url ?? null)),
    ...members.flatMap((member) =>
      upsolveItems(type, problems, member.rating, solvedByHandle.get(member.handle) ?? []).map((p) => saveItem.bind(member.id, contest.id, p.problemId, altByName.get(p.name) ?? null)),
    ),
  ]);
}

export async function sendUpsolveReminders(env: Bindings, now: number): Promise<void> {
  const { results: contests } = await env.DB.prepare(
    `SELECT id, name, end_at AS endAt, upsolve_pushes AS pushes FROM contests
     WHERE stage = 4 AND upsolve_pushes < 2 AND end_at BETWEEN ? AND ?`,
  )
    .bind(now - REMINDER_WINDOW, now)
    .all<{ id: number; name: string; endAt: number; pushes: number }>();
  for (const contest of contests.filter((c) => upsolveReminderDue(c.endAt, c.pushes, now))) {
    await env.DB.prepare('UPDATE contests SET upsolve_pushes = upsolve_pushes + 1 WHERE id = ?').bind(contest.id).run();
    const { results } = await env.DB.prepare(
      `SELECT x.user_id AS userId, COUNT(*) AS left_count FROM upsolves x
       WHERE x.contest_id = ? AND NOT EXISTS (SELECT 1 FROM solves s WHERE s.user_id = x.user_id AND s.platform = 'cf' AND s.problem_id IN (x.problem_id, x.alt_problem_id))
       GROUP BY x.user_id`,
    )
      .bind(contest.id)
      .all<{ userId: number; left_count: number }>();
    await pushUsers(
      env,
      'upsolve',
      results.map((r) => ({
        userId: r.userId,
        title: `${r.left_count} ${r.left_count === 1 ? 'upsolve' : 'upsolves'} left`,
        body: `From ${contest.name}. One today?`,
        data: { path: '/practice' },
      })),
      'notify_practice',
    );
  }
}

// One statement per band; the only reads are D1's, so this stays well under the Worker's CPU limit.
export async function pickPotd(db: D1Database, day: number, now: number): Promise<void> {
  const { results: members } = await db
    .prepare(
      `SELECT u.id, u.cf_rating AS rating FROM users u JOIN handles h ON h.user_id = u.id
       WHERE u.active = 1 AND h.platform = 'cf' AND h.approved_at IS NOT NULL`,
    )
    .all<{ id: number; rating: number | null }>();
  const pick = db.prepare(
    `INSERT OR IGNORE INTO potd (day, band, problem_id)
     SELECT ?1, ?2, p.problem_id FROM problems p
     WHERE p.platform = 'cf' AND p.rating = ?3 AND p.contest_at < ?4
       AND NOT EXISTS (SELECT 1 FROM cf_history h WHERE h.problem_id = p.problem_id AND h.user_id IN (SELECT value FROM json_each(?5)))
       AND p.problem_id NOT IN (SELECT problem_id FROM potd)
     ORDER BY RANDOM() LIMIT 1`,
  );
  await db.batch(
    POTD_BANDS.map((band) => {
      const inBand = members.filter((member) => potdBand(member.rating) === band).map((member) => member.id);
      return pick.bind(day, band, potdRating(band), now - RECENT_ROUND_SECONDS, JSON.stringify(inBand));
    }),
  );
}

export async function pickMissingPotd(db: D1Database, now: number): Promise<void> {
  const day = istDay(now);
  const row = await db.prepare('SELECT COUNT(*) AS n FROM potd WHERE day = ?').bind(day).first<{ n: number }>();
  if ((row?.n ?? 0) < POTD_BANDS.length) await pickPotd(db, day, now);
}

export async function sendPotdPush(env: Bindings, now: number): Promise<void> {
  const db = env.DB;
  const day = istDay(now);
  const [members, picks] = await db.batch([
    db.prepare(
      `SELECT u.id, u.cf_rating AS rating FROM users u JOIN handles h ON h.user_id = u.id
       WHERE u.active = 1 AND h.platform = 'cf' AND h.approved_at IS NOT NULL`,
    ),
    db.prepare('SELECT band FROM potd WHERE day = ?').bind(day),
  ]);
  const bands = new Set((picks.results as { band: number }[]).map((p) => p.band));
  await pushUsers(
    env,
    'potd',
    (members.results as { id: number; rating: number | null }[]).flatMap((member) => {
      const band = potdBand(member.rating);
      if (!bands.has(band)) return [];
      return [{ userId: member.id, title: 'Problem of the day', body: `Problem of the day is up. A ${potdRating(band)} for your band.`, data: { path: '/practice' } }];
    }),
    'notify_practice',
  );
}

// The bonus goes into the solve's points at insert, so every leaderboard includes it without changing.
export async function potdBonuses(
  db: D1Database,
  solves: { userId: number; rating: number | null; problemId: string; solvedAt: number }[],
): Promise<Map<string, number>> {
  const bonuses = new Map<string, number>();
  if (!solves.length) return bonuses;
  const days = [...new Set(solves.map((solve) => istDay(solve.solvedAt)))];
  const { results: picks } = await db
    .prepare('SELECT day, band, problem_id AS problemId FROM potd WHERE day IN (SELECT value FROM json_each(?))')
    .bind(JSON.stringify(days))
    .all<{ day: number; band: number; problemId: string }>();
  for (const solve of solves) {
    const day = istDay(solve.solvedAt);
    if (!picks.some((p) => p.day === day && p.band === potdBand(solve.rating) && p.problemId === solve.problemId)) continue;
    const reveal = await db.prepare('SELECT revealed_at AS at FROM potd_reveals WHERE user_id = ? AND day = ?').bind(solve.userId, day).first<{ at: number }>();
    bonuses.set(`${solve.userId}:${solve.problemId}`, potdBonus(!!reveal && reveal.at < solve.solvedAt));
  }
  return bonuses;
}

export const practiceRoutes = new Hono<AppEnv>();
practiceRoutes.use(requireUser);

practiceRoutes.get('/goal', async (c) => {
  const userId = c.get('user').id;
  const db = c.env.DB;
  const now = Math.floor(Date.now() / 1000);
  const week = periodStart('week', now);
  const goal = await db.prepare('SELECT target, min_rating AS minRating FROM goals WHERE user_id = ? AND week_start = ?').bind(userId, week).first<{ target: number; minRating: number }>();
  const [progress, averages] = await db.batch<Record<string, number>>([
    db.prepare('SELECT COUNT(*) AS n FROM solves WHERE user_id = ? AND solved_at >= ? AND points > 0 AND rp >= ?').bind(userId, week, goal?.minRating ?? 0),
    db
      .prepare(`SELECT ${GOAL_RATINGS.map((rating) => `COUNT(CASE WHEN rp >= ${rating} THEN 1 END) AS r${rating}`).join(', ')} FROM solves WHERE user_id = ? AND solved_at >= ? AND solved_at < ? AND points > 0`)
      .bind(userId, week - SUGGESTION_WEEKS * WEEK, week),
  ]);
  const suggestions = Object.fromEntries(GOAL_RATINGS.map((rating) => [rating, closestTarget(goalSuggestion(averages.results[0][`r${rating}`] / SUGGESTION_WEEKS))]));
  return c.json({ goal, done: goal ? progress.results[0].n : 0, locked: goalLocked(now), suggestions });
});

practiceRoutes.put('/goal', async (c) => {
  const { target, minRating } = await c.req.json<{ target?: number; minRating?: number }>();
  if (!GOAL_TARGETS.includes(target ?? 0) || !GOAL_RATINGS.includes(minRating ?? 0)) return c.json({ error: 'Choose a count and a rating' }, 400);
  const now = Math.floor(Date.now() / 1000);
  if (goalLocked(now)) return c.json({ error: 'Goals lock on Thursday. Set a new one on Monday.' }, 409);
  await c.env.DB.prepare(
    `INSERT INTO goals (user_id, week_start, target, min_rating) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, week_start) DO UPDATE SET target = excluded.target, min_rating = excluded.min_rating`,
  )
    .bind(c.get('user').id, periodStart('week', now), target, minRating)
    .run();
  return c.json({ ok: true });
});

practiceRoutes.get('/upsolves', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT x.contest_id AS contestId, c.name AS contestName, c.end_at AS endAt, x.problem_id AS problemId, p.name, p.rating, p.url,
            EXISTS (SELECT 1 FROM solves s WHERE s.user_id = x.user_id AND s.platform = 'cf' AND s.problem_id IN (x.problem_id, x.alt_problem_id)) AS done
     FROM upsolves x JOIN contests c ON c.id = x.contest_id
     LEFT JOIN problems p ON p.platform = 'cf' AND p.problem_id = x.problem_id
     WHERE x.user_id = ? ORDER BY c.start_at DESC, x.problem_id LIMIT ${UPSOLVE_ROWS}`,
  )
    .bind(c.get('user').id)
    .all();
  return c.json(results);
});

practiceRoutes.get('/potd', async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const now = Math.floor(Date.now() / 1000);
  const day = istDay(now);
  const handle = await db.prepare(`SELECT 1 FROM handles WHERE user_id = ? AND platform = 'cf' AND approved_at IS NOT NULL`).bind(user.id).first();
  if (!handle) return c.json({ problem: null, reason: 'needsHandle' });
  const band = potdBand(user.cfRating);
  const problem = await db
    .prepare(
      `SELECT p.problem_id AS problemId, p.name, p.rating, p.url, p.tags FROM potd d
       JOIN problems p ON p.platform = 'cf' AND p.problem_id = d.problem_id WHERE d.day = ? AND d.band = ?`,
    )
    .bind(day, band)
    .first<{ problemId: string; name: string; rating: number; url: string; tags: string | null }>();
  if (!problem) return c.json({ problem: null, reason: 'notPicked' });

  const dayStart = day * DAY - IST_OFFSET;
  const [reveal, members, bonusDays] = await db.batch<Record<string, unknown>>([
    db.prepare('SELECT revealed_at AS at FROM potd_reveals WHERE user_id = ? AND day = ?').bind(user.id, day),
    db
      .prepare(
        `SELECT u.id AS userId, u.name, u.username, u.cf_rating AS rating, s.solved_at AS solvedAt
         FROM users u JOIN handles h ON h.user_id = u.id AND h.platform = 'cf' AND h.approved_at IS NOT NULL
         LEFT JOIN solves s ON s.user_id = u.id AND s.platform = 'cf' AND s.problem_id = ?1 AND s.solved_at >= ?2
         WHERE u.active = 1 ORDER BY s.solved_at IS NULL, s.solved_at, u.name`,
      )
      .bind(problem.problemId, dayStart),
    db
      .prepare(`SELECT (solved_at + ${IST_OFFSET}) / ${DAY} AS day, 1 AS count FROM solves WHERE user_id = ? AND potd_bonus > 0 AND solved_at >= ? GROUP BY day`)
      .bind(user.id, now - POTD_STREAK_DAYS * DAY),
  ]);
  const bandMembers = (members.results as { userId: number; name: string; username: string | null; rating: number | null; solvedAt: number | null }[]).filter((m) => potdBand(m.rating) === band);
  const mine = bandMembers.find((m) => m.userId === user.id);
  const revealedAt = (reveal.results[0] as { at: number } | undefined)?.at ?? null;
  const counts = bonusDays.results as { day: number; count: number }[];
  const solved = mine?.solvedAt ?? null;
  const revealedFirst = revealedAt !== null && (solved === null || revealedAt < solved);
  const showTags = revealedAt !== null || solved !== null;
  return c.json({
    day,
    band,
    problem: { problemId: problem.problemId, name: problem.name, rating: problem.rating, url: problem.url, tags: showTags ? JSON.parse(problem.tags ?? '[]') : null },
    revealed: revealedFirst,
    bonus: potdBonus(revealedFirst),
    solvedAt: solved,
    solvedCount: bandMembers.filter((m) => m.solvedAt !== null).length,
    bandCount: bandMembers.length,
    nextAt: dayStart + DAY,
    streak: solveStreak(counts.map((d) => d.day), day),
    strip: weekStrip(counts, day),
    members: bandMembers.map(({ userId, name, username, solvedAt }) => ({ userId, name, username, solvedAt })),
  });
});

practiceRoutes.post('/potd/reveal', async (c) => {
  await c.env.DB.prepare('INSERT OR IGNORE INTO potd_reveals (user_id, day, revealed_at) VALUES (?, ?, unixepoch())')
    .bind(c.get('user').id, istDay(Math.floor(Date.now() / 1000)))
    .run();
  return c.json({ ok: true });
});
