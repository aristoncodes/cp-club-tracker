import { problemRp, solvePoints } from 'shared/scoring';
import type { IngestSolve } from 'shared/types';
import type { Bindings } from './auth';
import { potdBonuses } from './practice';
import { pushUsers, sendPushes, type PushMessage } from './push';
import { getSettings } from './settings';

// Returns who got a new solve, so the caller can check their badges.
export async function insertSolves(db: D1Database, solves: IngestSolve[]): Promise<number[]> {
  const { results: handles } = await db
    .prepare(
      `SELECT h.platform, lower(h.handle) AS handle, h.user_id AS userId, h.approved_at AS approvedAt, u.cf_rating AS cfRating
       FROM handles h JOIN users u ON u.id = h.user_id
       WHERE h.approved_at IS NOT NULL AND u.active = 1`,
    )
    .all<{ platform: string; handle: string; userId: number; approvedAt: number; cfRating: number | null }>();
  const byHandle = new Map(handles.map((h) => [`${h.platform}:${h.handle}`, h]));

  const upsertProblem = db.prepare(
    `INSERT INTO problems (platform, problem_id, name, rating, tags, url)
     SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM solves WHERE user_id = ? AND platform = ? AND problem_id = ?)
     ON CONFLICT (platform, problem_id) DO UPDATE SET
       name = COALESCE(excluded.name, name),
       rating = COALESCE(excluded.rating, rating),
       tags = COALESCE(excluded.tags, tags),
       url = COALESCE(excluded.url, url)`,
  );
  const insertSolve = db.prepare(
    `INSERT OR IGNORE INTO solves (user_id, platform, problem_id, solved_at, live, rp, points, potd_bonus, fingerprint) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const remember = db.prepare('INSERT OR IGNORE INTO cf_history (user_id, problem_id) VALUES (?, ?)');

  const oldestFirst = [...solves].sort((a, b) => a.solvedAt - b.solvedAt);
  const scoringCf = oldestFirst.flatMap((s) => {
    const owner = byHandle.get(`cf:${s.handle.toLowerCase()}`);
    return s.platform === 'cf' && owner && s.solvedAt >= owner.approvedAt ? [{ userId: owner.userId, rating: owner.cfRating, problemId: s.problemId, solvedAt: s.solvedAt }] : [];
  });
  const settings = await getSettings(db);
  const bonuses = await potdBonuses(db, scoringCf, settings);
  const solvers: (number | null)[] = [];
  const statements = oldestFirst.flatMap((s) => {
    const owner = byHandle.get(`${s.platform}:${s.handle.toLowerCase()}`);
    if (!owner) return [];
    solvers.push(null, owner.userId, ...(s.platform === 'cf' ? [null] : []));
    const rp = problemRp(s.platform, s.rating ?? null);
    const scores = s.solvedAt >= owner.approvedAt;
    const bonus = scores && s.platform === 'cf' ? (bonuses.get(`${owner.userId}:${s.problemId}`) ?? 0) : 0;
    return [
      upsertProblem.bind(s.platform, s.problemId, s.name ?? null, s.rating ?? null, s.tags ? JSON.stringify(s.tags) : null, s.url ?? null, owner.userId, s.platform, s.problemId),
      insertSolve.bind(owner.userId, s.platform, s.problemId, s.solvedAt, s.live ? 1 : 0, rp, scores ? solvePoints(rp, owner.cfRating, s.live, settings.live_multiplier) + bonus : 0, bonus, s.fingerprint ?? null),
      ...(s.platform === 'cf' ? [remember.bind(owner.userId, s.problemId)] : []),
    ];
  });
  if (!statements.length) return [];
  const results = await db.batch(statements);
  return [...new Set(solvers.filter((userId, index): userId is number => userId !== null && results[index].meta.changes > 0))];
}

export function markHandleBroken(db: D1Database, platform: string, handle: string): D1PreparedStatement {
  return db.prepare('UPDATE handles SET broken = 1 WHERE platform = ? AND lower(handle) = lower(?)').bind(platform, handle);
}

export function adjustmentSum(user: string, from: string, to?: string): string {
  return `COALESCE((SELECT SUM(adj.points) FROM point_adjustments adj WHERE adj.user_id = ${user} AND adj.kind = 'adjust' AND adj.undone_at IS NULL AND adj.at >= ${from}${to ? ` AND adj.at < ${to}` : ''}), 0)`;
}

export function createAttendanceRows(db: D1Database, contest: { id: number; platform: string }): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR IGNORE INTO attendance (contest_id, user_id)
       SELECT ?1, u.id FROM users u
       WHERE u.active = 1 AND (?2 = 'other' OR EXISTS (SELECT 1 FROM handles h WHERE h.user_id = u.id AND h.platform = ?2 AND h.approved_at IS NOT NULL))`,
    )
    .bind(contest.id, contest.platform);
}

// Rows an admin edited by hand (manual = 1) or a member is waiting on (claimed_at) are left alone.
export async function finishContest(
  env: Bindings,
  contest: { id: number; platform: string; name: string },
  presentHandles: string[],
  presentUsers: number[] = [],
): Promise<void> {
  const db = env.DB;
  const examWeek = `(SELECT e.id FROM exam_weeks e JOIN exam_week_batches b ON b.exam_week_id = e.id JOIN contests k ON k.id = ?3 JOIN users u ON u.id = attendance.user_id
     WHERE e.excuse = 1 AND b.batch_year = u.batch_year AND k.start_at >= e.from_at AND k.start_at <= e.to_at LIMIT 1)`;
  const isPresent = `(user_id IN (SELECT user_id FROM handles WHERE platform = ?1 AND lower(handle) IN (SELECT lower(value) FROM json_each(?2))) OR user_id IN (SELECT value FROM json_each(?4)))`;
  await db.batch([
    createAttendanceRows(db, contest),
    db
      .prepare(
        `UPDATE attendance SET
           status = CASE WHEN ${isPresent} THEN 'present' WHEN ${examWeek} IS NOT NULL THEN 'excused' ELSE 'absent' END,
           exam_week_id = CASE WHEN ${isPresent} THEN NULL ELSE ${examWeek} END
         WHERE contest_id = ?3 AND manual = 0 AND claimed_at IS NULL`,
      )
      .bind(contest.platform, JSON.stringify(presentHandles), contest.id, JSON.stringify(presentUsers)),
  ]);

  const { results } = await db
    .prepare(
      `SELECT p.token, a.status, a.reason_type AS reasonType
       FROM attendance a JOIN push_tokens p ON p.user_id = a.user_id JOIN users u ON u.id = a.user_id
       WHERE a.contest_id = ? AND u.notify_result = 1 AND a.status IN ('present','absent') AND a.manual = 0`,
    )
    .bind(contest.id)
    .all<{ token: string; status: string; reasonType: string | null }>();
  const messages = results.flatMap((r): PushMessage[] => {
    if (r.status === 'present') return [{ to: r.token, body: `Marked present for ${contest.name}.` }];
    if (r.reasonType) return [];
    return [{ to: r.token, body: `You missed ${contest.name}. Why?`, data: { contestId: contest.id, screen: 'reason' } }];
  });
  await sendPushes(env, messages);

  await db.prepare('UPDATE contests SET stage = 4 WHERE id = ?').bind(contest.id).run();
  await alertAdminsOfMandatoryAbsences(env, contest);
}

async function alertAdminsOfMandatoryAbsences(env: Bindings, contest: { id: number; name: string }): Promise<void> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM attendance a JOIN contests c ON c.id = a.contest_id WHERE a.contest_id = ? AND c.mandatory = 1 AND a.status = 'absent' AND a.reason_type IS NULL`,
  )
    .bind(contest.id)
    .first<{ n: number }>();
  if (!row?.n) return;
  const { results } = await env.DB.prepare(`SELECT id FROM users WHERE role = 'admin' AND active = 1`).all<{ id: number }>();
  await pushUsers(env, 'mandatory', results.map((admin) => ({ userId: admin.id, title: 'Mandatory contest', body: `${row.n} absent with no reason from ${contest.name}.`, data: { url: `${env.WEB_ORIGIN}/admin/attendance` } })));
}
