import { problemRp, solvePoints } from 'shared/scoring';
import type { IngestSolve } from 'shared/types';
import type { Bindings } from './auth';
import { sendPushes, type PushMessage } from './push';

export async function insertSolves(db: D1Database, solves: IngestSolve[]): Promise<void> {
  const { results: handles } = await db
    .prepare(
      `SELECT h.platform, lower(h.handle) AS handle, h.user_id AS userId, h.approved_at AS approvedAt, u.cf_rating AS cfRating
       FROM handles h JOIN users u ON u.id = h.user_id
       WHERE h.approved_at IS NOT NULL AND u.active = 1`,
    )
    .all<{ platform: string; handle: string; userId: number; approvedAt: number; cfRating: number | null }>();
  const byHandle = new Map(handles.map((h) => [`${h.platform}:${h.handle}`, h]));

  const upsertProblem = db.prepare(
    `INSERT INTO problems (platform, problem_id, name, rating, tags, url) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (platform, problem_id) DO UPDATE SET
       name = COALESCE(excluded.name, name),
       rating = COALESCE(excluded.rating, rating),
       tags = COALESCE(excluded.tags, tags),
       url = COALESCE(excluded.url, url)`,
  );
  const insertSolve = db.prepare(
    `INSERT OR IGNORE INTO solves (user_id, platform, problem_id, solved_at, live, rp, points) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const oldestFirst = [...solves].sort((a, b) => a.solvedAt - b.solvedAt);
  const statements = oldestFirst.flatMap((s) => {
    const owner = byHandle.get(`${s.platform}:${s.handle.toLowerCase()}`);
    if (!owner) return [];
    const rp = problemRp(s.platform, s.rating ?? null);
    const scores = s.solvedAt >= owner.approvedAt;
    return [
      upsertProblem.bind(s.platform, s.problemId, s.name ?? null, s.rating ?? null, s.tags ? JSON.stringify(s.tags) : null, s.url ?? null),
      insertSolve.bind(owner.userId, s.platform, s.problemId, s.solvedAt, s.live ? 1 : 0, rp, scores ? solvePoints(rp, owner.cfRating, s.live) : 0),
    ];
  });
  if (statements.length) await db.batch(statements);
}

export function markHandleBroken(db: D1Database, platform: string, handle: string): D1PreparedStatement {
  return db.prepare('UPDATE handles SET broken = 1 WHERE platform = ? AND lower(handle) = lower(?)').bind(platform, handle);
}

export function createAttendanceRows(db: D1Database, contest: { id: number; platform: string }): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR IGNORE INTO attendance (contest_id, user_id)
       SELECT ?, u.id FROM users u JOIN handles h ON h.user_id = u.id
       WHERE u.active = 1 AND h.platform = ? AND h.approved_at IS NOT NULL`,
    )
    .bind(contest.id, contest.platform);
}

export async function finishContest(
  env: Bindings,
  contest: { id: number; platform: string; name: string },
  presentHandles: string[],
): Promise<void> {
  const db = env.DB;
  await db.batch([
    createAttendanceRows(db, contest),
    db
      .prepare(
        `UPDATE attendance SET status = CASE WHEN user_id IN (
           SELECT user_id FROM handles
           WHERE platform = ?1 AND lower(handle) IN (SELECT lower(value) FROM json_each(?2))
         ) THEN 'present' ELSE 'absent' END
         WHERE contest_id = ?3`,
      )
      .bind(contest.platform, JSON.stringify(presentHandles), contest.id),
  ]);

  const { results } = await db
    .prepare(
      `SELECT p.token, a.status, a.reason_type AS reasonType
       FROM attendance a JOIN push_tokens p ON p.user_id = a.user_id
       WHERE a.contest_id = ?`,
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
}
