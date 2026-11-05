import { Hono } from 'hono';
import { periodStart } from 'shared/time';
import { adminWrite } from './admin-write';
import { AT_RISK_VISIBLE } from './admin-jobs';
import type { AppEnv } from './auth';
import { pushUsers } from './push';
import { getSettings } from './settings';

const DAY = 86400;
const NAME_MAX = 120;
const NOTE_MAX = 500;
const NUDGE_MAX = 280;
const TREND = 10;
const RISK_PREVIEW = 3;
const STRIP = 8;
const SOURCES = ['gym', 'other', 'offline'];
const ATTENDANCE_STATES = ['present', 'excused', 'absent'];
const clock = () => Math.floor(Date.now() / 1000);
const RSVP_COUNTS = `(SELECT COUNT(*) FROM attendance x WHERE x.contest_id = c.id AND x.rsvp = 'yes') AS going, (SELECT COUNT(*) FROM attendance x WHERE x.contest_id = c.id AND x.rsvp = 'no') AS notGoing`;
const PARTICIPANTS = `(SELECT COUNT(*) FROM users u WHERE u.active = 1 AND (c.platform = 'other' OR EXISTS (SELECT 1 FROM handles h WHERE h.user_id = u.id AND h.platform = c.platform AND h.approved_at IS NOT NULL))) AS members`;

export const adminClubRoutes = new Hono<AppEnv>();

adminClubRoutes.get('/overview', async (c) => {
  const db = c.env.DB;
  const now = clock();
  const settings = await getSettings(db, now);
  const week = periodStart('week', now);
  const [attendance, active, potd, duels, handles, reasons, flags, trend, risk, upcoming] = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT COUNT(CASE WHEN a.status = 'present' THEN 1 END) AS present, COUNT(CASE WHEN a.status IN ('present','absent') THEN 1 END) AS total FROM attendance a JOIN contests c ON c.id = a.contest_id WHERE c.counts = 1 AND c.start_at >= ?`).bind(now - 28 * DAY),
    db.prepare('SELECT COUNT(DISTINCT s.user_id) AS active, (SELECT COUNT(*) FROM users WHERE active = 1) AS total FROM solves s JOIN users u ON u.id = s.user_id WHERE s.solved_at >= ? AND u.active = 1').bind(week),
    db.prepare('SELECT COUNT(DISTINCT user_id) AS solved FROM solves WHERE potd_bonus > 0 AND solved_at >= ?').bind(week),
    db.prepare('SELECT COUNT(*) AS n FROM duels WHERE finished_at >= ?').bind(week),
    db.prepare(`SELECT h.user_id AS userId, u.name, h.platform, h.handle FROM handles h JOIN users u ON u.id = h.user_id WHERE h.status = 'waiting' AND u.active = 1 ORDER BY u.name`),
    db
      .prepare(`SELECT a.contest_id AS contestId, a.user_id AS userId, u.name, c.name AS contest, c.end_at AS endAt FROM attendance a JOIN contests c ON c.id = a.contest_id JOIN users u ON u.id = a.user_id WHERE a.status = 'absent' AND a.reason_type IS NULL AND c.counts = 1 AND u.active = 1 AND c.end_at <= ? ORDER BY c.end_at DESC`)
      .bind(now - settings.reason_inbox_days * DAY),
    db.prepare(`SELECT f.id, f.user_id AS userId, u.name, f.rule, f.severity, f.day FROM fairness_flags f JOIN users u ON u.id = f.user_id WHERE f.status = 'open' ORDER BY f.day DESC`),
    db.prepare(`SELECT c.id, c.name, COUNT(CASE WHEN a.status = 'present' THEN 1 END) AS present, COUNT(CASE WHEN a.status IN ('present','absent') THEN 1 END) AS total FROM contests c JOIN attendance a ON a.contest_id = c.id WHERE c.counts = 1 AND c.stage = 4 GROUP BY c.id ORDER BY c.start_at DESC LIMIT ${TREND}`),
    db.prepare(`SELECT r.user_id AS userId, u.name, r.signals FROM at_risk r JOIN users u ON u.id = r.user_id WHERE ${AT_RISK_VISIBLE} ORDER BY json_extract(r.signals, '$.noSolveDays') DESC LIMIT ${RISK_PREVIEW}`).bind(now, settings.exam_grace_days),
    db.prepare(`SELECT c.id, c.name, c.platform, c.start_at AS startAt, c.mandatory, ${RSVP_COUNTS}, ${PARTICIPANTS} FROM contests c WHERE (c.counts = 1 OR c.kind = 'virtual') AND c.start_at > ? ORDER BY c.start_at LIMIT 5`).bind(now),
  ]);
  return c.json({
    attendanceGoal: settings.attendance_goal,
    attendance: attendance.results[0],
    active: active.results[0],
    potdSolvers: (potd.results[0] as { solved: number }).solved,
    duels: (duels.results[0] as { n: number }).n,
    inbox: { handles: handles.results, reasons: reasons.results, flags: flags.results },
    trend: trend.results.reverse(),
    atRisk: (risk.results as { signals: string }[]).map((row) => ({ ...row, signals: JSON.parse(row.signals) })),
    upcoming: upcoming.results,
  });
});

adminClubRoutes.get('/members', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.username, u.email, u.batch_year AS batchYear, u.cf_rating AS cfRating, u.role, u.active,
       (SELECT MAX(solved_at) FROM solves s WHERE s.user_id = u.id) AS lastSolve,
       (SELECT COUNT(*) FROM attendance a JOIN contests k ON k.id = a.contest_id WHERE a.user_id = u.id AND k.counts = 1 AND a.status = 'present') AS present,
       (SELECT COUNT(*) FROM attendance a JOIN contests k ON k.id = a.contest_id WHERE a.user_id = u.id AND k.counts = 1 AND a.status IN ('present','absent')) AS total
     FROM users u WHERE u.name != '' ORDER BY u.name`,
  ).all();
  return c.json(results);
});

adminClubRoutes.get('/members/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const db = c.env.DB;
  const [stats, contests, handles, note] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM solves WHERE user_id = ?1) AS solves, (SELECT COALESCE(SUM(points), 0) FROM solves WHERE user_id = ?1 AND solved_at >= ?2) AS monthPoints,
           (SELECT duel_rating FROM users WHERE id = ?1) AS duelRating, (SELECT COUNT(*) FROM nudges WHERE user_id = ?1) AS nudges`,
      )
      .bind(id, periodStart('month', clock())),
    db
      .prepare(`SELECT c.id, c.name, a.status, a.reason_type AS reasonType FROM attendance a JOIN contests c ON c.id = a.contest_id WHERE a.user_id = ? AND c.counts = 1 AND a.status IS NOT NULL ORDER BY c.start_at DESC LIMIT ${STRIP}`)
      .bind(id),
    db.prepare('SELECT platform, handle, status FROM handles WHERE user_id = ?').bind(id),
    db.prepare('SELECT n.text, n.at, u.name AS admin FROM admin_notes n JOIN users u ON u.id = n.admin_id WHERE n.user_id = ?').bind(id),
  ]);
  return c.json({ stats: stats.results[0], contests: contests.results, handles: handles.results, note: note.results[0] ?? null });
});

adminClubRoutes.put('/members/:id/notes', async (c) => {
  const id = Number(c.req.param('id'));
  const { text } = await c.req.json<{ text?: string }>();
  if (typeof text !== 'string' || text.length > 2000) return c.json({ error: 'Notes can be up to 2000 characters' }, 400);
  const db = c.env.DB;
  const before = await db.prepare('SELECT text FROM admin_notes WHERE user_id = ?').bind(id).first<{ text: string }>();
  await adminWrite(c, { area: 'members', action: 'edited admin notes', target: String(id), before: before?.text, after: text }, [
    db.prepare(`INSERT INTO admin_notes (user_id, admin_id, text, at) VALUES (?, ?, ?, unixepoch()) ON CONFLICT (user_id) DO UPDATE SET admin_id = excluded.admin_id, text = excluded.text, at = excluded.at`).bind(id, c.get('user').id, text),
  ]);
  return c.json({ ok: true });
});

// At-risk

adminClubRoutes.get('/at-risk', async (c) => {
  const db = c.env.DB;
  const now = clock();
  const settings = await getSettings(db, now);
  const { results } = await db
    .prepare(
      `SELECT r.user_id AS userId, u.name, u.username, u.batch_year AS batchYear, r.signals, r.built_at AS builtAt,
         (SELECT MAX(n.at) FROM nudges n WHERE n.user_id = r.user_id) AS lastNudge
       FROM at_risk r JOIN users u ON u.id = r.user_id WHERE ${AT_RISK_VISIBLE} ORDER BY u.name`,
    )
    .bind(now, settings.exam_grace_days)
    .all<{ signals: string }>();
  return c.json({
    thresholds: { noSolveDays: settings.risk_no_solve_days, absences: settings.risk_absences, drop: settings.risk_attendance_drop, nudgeGapDays: settings.nudge_gap_days, snoozeDays: settings.snooze_days },
    members: results.map((row) => ({ ...row, signals: JSON.parse(row.signals) })),
  });
});

adminClubRoutes.post('/at-risk/:userId/snooze', async (c) => {
  const userId = Number(c.req.param('userId'));
  const db = c.env.DB;
  const now = clock();
  const settings = await getSettings(db, now);
  const until = now + settings.snooze_days * DAY;
  const [result] = await adminWrite(c, { area: 'members', action: 'marked OK for now', target: String(userId), after: { until } }, [db.prepare('UPDATE at_risk SET snoozed_until = ? WHERE user_id = ?').bind(until, userId)]);
  if (!result.meta.changes) return c.json({ error: 'Member not found' }, 404);
  return c.json({ until });
});

const fill = (body: string, name: string) => body.replaceAll('{name}', name.split(' ')[0]);

async function sendNudge(c: Parameters<typeof adminWrite>[0], user: { id: number; name: string }, body: string): Promise<void> {
  const text = fill(body, user.name);
  await adminWrite(c, { area: 'members', action: 'sent a nudge', target: String(user.id), after: text }, [
    c.env.DB.prepare('INSERT INTO nudges (user_id, admin_id, body, at) VALUES (?, ?, ?, unixepoch())').bind(user.id, c.get('user').id, text),
  ]);
  await pushUsers(c.env, 'nudge', [{ userId: user.id, title: 'From your coordinators', body: text, data: { path: '/practice' } }]);
}

const CAN_NUDGE = `NOT EXISTS (SELECT 1 FROM nudges n WHERE n.user_id = u.id AND n.at > ?)`;

adminClubRoutes.post('/at-risk/:userId/nudge', async (c) => {
  const { body } = await c.req.json<{ body?: string }>();
  if (!body?.trim() || body.length > NUDGE_MAX) return c.json({ error: `A nudge must be 1–${NUDGE_MAX} characters` }, 400);
  const db = c.env.DB;
  const now = clock();
  const settings = await getSettings(db, now);
  const user = await db.prepare(`SELECT u.id, u.name FROM users u WHERE u.id = ? AND u.active = 1 AND ${CAN_NUDGE}`).bind(Number(c.req.param('userId')), now - settings.nudge_gap_days * DAY).first<{ id: number; name: string }>();
  if (!user) return c.json({ error: `One nudge per person every ${settings.nudge_gap_days} days` }, 409);
  await sendNudge(c, user, body.trim());
  return c.json({ ok: true });
});

adminClubRoutes.post('/at-risk/nudge-all', async (c) => {
  const { body } = await c.req.json<{ body?: string }>();
  if (!body?.trim() || body.length > NUDGE_MAX) return c.json({ error: `A nudge must be 1–${NUDGE_MAX} characters` }, 400);
  const db = c.env.DB;
  const now = clock();
  const settings = await getSettings(db, now);
  const { results } = await db
    .prepare(`SELECT u.id, u.name FROM at_risk r JOIN users u ON u.id = r.user_id WHERE ${AT_RISK_VISIBLE} AND ${CAN_NUDGE.replace('?', '?3')}`)
    .bind(now, settings.exam_grace_days, now - settings.nudge_gap_days * DAY)
    .all<{ id: number; name: string }>();
  for (const user of results) await sendNudge(c, user, body.trim());
  return c.json({ sent: results.length });
});

// Attendance

adminClubRoutes.get('/attendance', async (c) => {
  const from = Number(c.req.query('from')) || 0;
  const to = Number(c.req.query('to')) || Number.MAX_SAFE_INTEGER;
  const platform = c.req.query('platform') || null;
  const batch = Number(c.req.query('batch')) || null;
  const db = c.env.DB;
  const now = clock();
  const [contests, students, cells, exam] = await db.batch([
    db
      .prepare(`SELECT id, platform, source, name, start_at AS startAt, counts, mandatory FROM contests WHERE start_at >= ?1 AND start_at <= ?2 AND (?3 IS NULL OR platform = ?3) ORDER BY start_at`)
      .bind(from, to, platform),
    db.prepare(`SELECT id, name, batch_year AS batchYear FROM users WHERE active = 1 AND name != '' AND (?1 IS NULL OR batch_year = ?1) ORDER BY name`).bind(batch),
    db
      .prepare(
        `SELECT a.contest_id AS contestId, a.user_id AS userId, a.rsvp, a.status, a.reason_type AS reasonType, a.reason_text AS reasonText, a.manual, a.note, a.claimed_at AS claimedAt
         FROM attendance a JOIN contests c ON c.id = a.contest_id WHERE c.start_at >= ?1 AND c.start_at <= ?2 AND (?3 IS NULL OR c.platform = ?3)`,
      )
      .bind(from, to, platform),
    db.prepare('SELECT name, to_at AS toAt FROM exam_weeks WHERE from_at <= ?1 AND to_at >= ?1 LIMIT 1').bind(now),
  ]);
  return c.json({ contests: contests.results, students: students.results, cells: cells.results, examWeek: exam.results[0] ?? null });
});

// A manual entry always wins: finishContest only touches rows with manual = 0.
adminClubRoutes.patch('/attendance/:contestId/:userId', async (c) => {
  const contestId = Number(c.req.param('contestId'));
  const userId = Number(c.req.param('userId'));
  const { status, note } = await c.req.json<{ status?: string; note?: string }>();
  if (!status || !ATTENDANCE_STATES.includes(status)) return c.json({ error: 'status must be present, excused or absent' }, 400);
  if (note && note.length > NOTE_MAX) return c.json({ error: `A note can be up to ${NOTE_MAX} characters` }, 400);
  const db = c.env.DB;
  const before = await db.prepare('SELECT status FROM attendance WHERE contest_id = ? AND user_id = ?').bind(contestId, userId).first<{ status: string | null }>();
  const contest = await db.prepare('SELECT name FROM contests WHERE id = ?').bind(contestId).first<{ name: string }>();
  if (!contest) return c.json({ error: 'Contest not found' }, 404);
  await adminWrite(c, { area: 'attendance', action: `changed ${userId}`, target: contest.name, before: before?.status ?? null, after: { status, note: note ?? null } }, [
    db
      .prepare(
        `INSERT INTO attendance (contest_id, user_id, status, manual, note) VALUES (?1, ?2, ?3, 1, ?4)
         ON CONFLICT (contest_id, user_id) DO UPDATE SET status = excluded.status, manual = 1, note = excluded.note, claimed_at = NULL`,
      )
      .bind(contestId, userId, status, note?.trim() || null),
  ]);
  return c.json({ ok: true });
});

adminClubRoutes.post('/attendance/:contestId/:userId/remind', async (c) => {
  const contestId = Number(c.req.param('contestId'));
  const userId = Number(c.req.param('userId'));
  const contest = await c.env.DB.prepare('SELECT name FROM contests WHERE id = ?').bind(contestId).first<{ name: string }>();
  if (!contest) return c.json({ error: 'Contest not found' }, 404);
  await adminWrite(c, { area: 'attendance', action: 'reminded for a reason', target: `${userId} · ${contest.name}` }, []);
  await pushUsers(c.env, 'reason', [{ userId, body: `You missed ${contest.name}. Why?`, data: { contestId, screen: 'reason' } }]);
  return c.json({ ok: true });
});

// Exam weeks

type ExamBody = { name?: string; from?: number; to?: number; batches?: number[]; excuse?: boolean; mutePractice?: boolean; hideAtRisk?: boolean };

function examError(b: ExamBody): string | null {
  if (!b.name?.trim() || b.name.length > NAME_MAX) return 'A name is required';
  if (!Number.isInteger(b.from) || !Number.isInteger(b.to) || b.to! <= b.from!) return 'Choose valid dates';
  if (!b.batches?.length || !b.batches.every(Number.isInteger)) return 'Choose at least one batch';
  return null;
}

const excuseEntries = (db: D1Database, id: number, from: number, to: number, batches: number[]) =>
  db
    .prepare(
      `UPDATE attendance SET status = 'excused', exam_week_id = ?1
       WHERE manual = 0 AND status = 'absent'
         AND contest_id IN (SELECT id FROM contests WHERE counts = 1 AND start_at >= ?2 AND start_at <= ?3)
         AND user_id IN (SELECT id FROM users WHERE batch_year IN (SELECT value FROM json_each(?4)))`,
    )
    .bind(id, from, to, JSON.stringify(batches));

const revertEntries = (db: D1Database, id: number) =>
  db.prepare(`UPDATE attendance SET status = 'absent', exam_week_id = NULL WHERE exam_week_id = ? AND manual = 0`).bind(id);

adminClubRoutes.get('/exam-weeks', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT e.id, e.name, e.from_at AS fromAt, e.to_at AS toAt, e.excuse, e.mute_practice AS mutePractice, e.hide_at_risk AS hideAtRisk,
       (SELECT json_group_array(batch_year) FROM exam_week_batches b WHERE b.exam_week_id = e.id) AS batches,
       (SELECT COUNT(*) FROM attendance a WHERE a.exam_week_id = e.id) AS excused
     FROM exam_weeks e ORDER BY e.from_at DESC`,
  ).all<{ batches: string }>();
  return c.json(results.map((row) => ({ ...row, batches: JSON.parse(row.batches) })));
});

adminClubRoutes.post('/exam-weeks/preview', async (c) => {
  const { from, to, batches } = await c.req.json<ExamBody>();
  const db = c.env.DB;
  const [contests, members] = await db.batch<{ n: number }>([
    db.prepare('SELECT COUNT(*) AS n FROM contests WHERE counts = 1 AND start_at >= ? AND start_at <= ?').bind(from ?? 0, to ?? 0),
    db.prepare('SELECT COUNT(*) AS n FROM users WHERE active = 1 AND batch_year IN (SELECT value FROM json_each(?))').bind(JSON.stringify(batches ?? [])),
  ]);
  const n = contests.results[0].n;
  const m = members.results[0].n;
  return c.json({ contests: n, members: m, entries: n * m });
});

adminClubRoutes.post('/exam-weeks', async (c) => {
  const body = await c.req.json<ExamBody>();
  const invalid = examError(body);
  if (invalid) return c.json({ error: invalid }, 400);
  const db = c.env.DB;
  const excuse = body.excuse !== false;
  const created = await db
    .prepare('SELECT COALESCE(MAX(id), 0) + 1 AS id FROM exam_weeks')
    .first<{ id: number }>();
  const id = created!.id;
  const addBatch = db.prepare('INSERT INTO exam_week_batches (exam_week_id, batch_year) VALUES (?, ?)');
  await adminWrite(c, { area: 'attendance', action: 'created exam week', target: body.name!.trim(), after: { from: body.from, to: body.to, batches: body.batches } }, [
    db
      .prepare('INSERT INTO exam_weeks (id, name, from_at, to_at, excuse, mute_practice, hide_at_risk) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, body.name!.trim(), body.from, body.to, excuse ? 1 : 0, body.mutePractice === false ? 0 : 1, body.hideAtRisk ? 1 : 0),
    ...body.batches!.map((batch) => addBatch.bind(id, batch)),
    ...(excuse ? [excuseEntries(db, id, body.from!, body.to!, body.batches!)] : []),
  ]);
  return c.json({ id });
});

adminClubRoutes.patch('/exam-weeks/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<ExamBody>();
  const invalid = examError(body);
  if (invalid) return c.json({ error: invalid }, 400);
  const db = c.env.DB;
  const excuse = body.excuse !== false;
  const addBatch = db.prepare('INSERT INTO exam_week_batches (exam_week_id, batch_year) VALUES (?, ?)');
  const [updated] = await adminWrite(c, { area: 'attendance', action: 'edited exam week', target: body.name!.trim(), after: { from: body.from, to: body.to, batches: body.batches } }, [
    db
      .prepare('UPDATE exam_weeks SET name = ?, from_at = ?, to_at = ?, excuse = ?, mute_practice = ?, hide_at_risk = ? WHERE id = ?')
      .bind(body.name!.trim(), body.from, body.to, excuse ? 1 : 0, body.mutePractice === false ? 0 : 1, body.hideAtRisk ? 1 : 0, id),
    revertEntries(db, id),
    db.prepare('DELETE FROM exam_week_batches WHERE exam_week_id = ?').bind(id),
    ...body.batches!.map((batch) => addBatch.bind(id, batch)),
    ...(excuse ? [excuseEntries(db, id, body.from!, body.to!, body.batches!)] : []),
  ]);
  if (!updated.meta.changes) return c.json({ error: 'Exam week not found' }, 404);
  return c.json({ ok: true });
});

adminClubRoutes.delete('/exam-weeks/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const db = c.env.DB;
  const week = await db.prepare('SELECT name FROM exam_weeks WHERE id = ?').bind(id).first<{ name: string }>();
  if (!week) return c.json({ error: 'Exam week not found' }, 404);
  await adminWrite(c, { area: 'attendance', action: 'deleted exam week', target: week.name }, [
    revertEntries(db, id),
    db.prepare('UPDATE attendance SET exam_week_id = NULL WHERE exam_week_id = ?').bind(id),
    db.prepare('DELETE FROM exam_week_batches WHERE exam_week_id = ?').bind(id),
    db.prepare('DELETE FROM exam_weeks WHERE id = ?').bind(id),
  ]);
  return c.json({ ok: true });
});

// Contests

adminClubRoutes.get('/contests', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.name, c.platform, c.source, c.kind, c.url, c.start_at AS startAt, c.end_at AS endAt, c.counts, c.mandatory, c.stage, ${RSVP_COUNTS}, ${PARTICIPANTS},
       (SELECT COUNT(*) FROM attendance x WHERE x.contest_id = c.id AND x.status = 'present') AS attended
     FROM contests c ORDER BY c.start_at DESC LIMIT 60`,
  ).all();
  return c.json(results);
});

adminClubRoutes.patch('/contests/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const { counts, mandatory } = await c.req.json<{ counts?: boolean; mandatory?: boolean }>();
  if (typeof counts !== 'boolean' && typeof mandatory !== 'boolean') return c.json({ error: 'counts or mandatory is required' }, 400);
  const db = c.env.DB;
  const contest = await db.prepare('SELECT name, counts, mandatory FROM contests WHERE id = ?').bind(id).first<{ name: string; counts: number; mandatory: number }>();
  if (!contest) return c.json({ error: 'Contest not found' }, 404);
  const after = { counts: counts === undefined ? contest.counts : counts ? 1 : 0, mandatory: mandatory === undefined ? contest.mandatory : mandatory ? 1 : 0 };
  await adminWrite(c, { area: 'contests', action: 'changed contest', target: contest.name, before: { counts: contest.counts, mandatory: contest.mandatory }, after }, [
    db.prepare('UPDATE contests SET counts = ?, mandatory = ? WHERE id = ?').bind(after.counts, after.mandatory, id),
  ]);
  return c.json({ ok: true });
});

adminClubRoutes.post('/contests', async (c) => {
  const body = await c.req.json<{ source?: string; name?: string; url?: string; startAt?: number; endAt?: number; gymId?: number; mandatory?: boolean }>();
  if (!SOURCES.includes(body.source ?? '')) return c.json({ error: 'Choose where the contest is held' }, 400);
  if (!body.name?.trim() || body.name.length > NAME_MAX) return c.json({ error: 'A name is required' }, 400);
  if (!Number.isInteger(body.startAt) || !Number.isInteger(body.endAt) || body.endAt! <= body.startAt!) return c.json({ error: 'Choose a valid start and end' }, 400);
  if (body.source === 'gym' && !Number.isInteger(body.gymId)) return c.json({ error: 'A Codeforces gym or group contest id is required' }, 400);
  if (body.source === 'other' && !/^https:\/\//.test(body.url ?? '')) return c.json({ error: 'A link starting with https:// is required' }, 400);
  const db = c.env.DB;
  const gym = body.source === 'gym';
  const nameTrimmed = body.name.trim();
  const statements = [
    db
      .prepare(`INSERT INTO contests (platform, external_id, name, url, start_at, end_at, source, mandatory) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(gym ? 'cf' : 'other', gym ? String(body.gymId) : `${body.source}-${body.startAt}-${nameTrimmed.slice(0, 40)}`, nameTrimmed, gym ? `https://codeforces.com/gym/${body.gymId}` : (body.url ?? ''), body.startAt, body.endAt, body.source, body.mandatory ? 1 : 0),
  ];
  if (body.source === 'offline') {
    statements.push(db.prepare('INSERT INTO sessions (title, start_at, contest_id) VALUES (?, ?, last_insert_rowid())').bind(nameTrimmed, body.startAt));
  }
  try {
    await adminWrite(c, { area: 'contests', action: 'added custom contest', target: nameTrimmed, after: { source: body.source, startAt: body.startAt, endAt: body.endAt } }, statements);
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) return c.json({ error: 'That contest already exists' }, 409);
    throw err;
  }
  return c.json({ ok: true });
});

// Sessions

adminClubRoutes.get('/sessions', async (c) => {
  const db = c.env.DB;
  const [sessions, topics] = await db.batch<Record<string, unknown>>([
    db.prepare(
      `SELECT s.id, s.title, s.start_at AS startAt, s.room, s.practice_url AS practiceUrl, s.contest_id AS contestId,
         (SELECT json_group_array(batch_year) FROM session_batches b WHERE b.session_id = s.id) AS batches,
         (SELECT COUNT(*) FROM session_checkins k WHERE k.session_id = s.id) AS here
       FROM sessions s ORDER BY s.start_at DESC LIMIT 40`,
    ),
    db.prepare(`SELECT substr(key, 5) AS tag, value FROM stats_daily WHERE batch_year = -1 AND key LIKE 'tag:%' AND day = (SELECT MAX(day) FROM stats_daily) ORDER BY value LIMIT 3`),
  ]);
  return c.json({ sessions: (sessions.results as { batches: string }[]).map((row) => ({ ...row, batches: JSON.parse(row.batches) })), topics: topics.results });
});

adminClubRoutes.post('/sessions', async (c) => {
  const body = await c.req.json<{ title?: string; startAt?: number; room?: string; practiceUrl?: string; batches?: number[]; announce?: boolean }>();
  if (!body.title?.trim() || body.title.length > NAME_MAX) return c.json({ error: 'A title is required' }, 400);
  if (!Number.isInteger(body.startAt)) return c.json({ error: 'Choose a date and time' }, 400);
  if (body.practiceUrl && !/^https:\/\//.test(body.practiceUrl)) return c.json({ error: 'A practice link must start with https://' }, 400);
  const db = c.env.DB;
  const adminId = c.get('user').id;
  const title = body.title.trim();
  const batches = body.batches ?? [];
  const id = (await db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS id FROM sessions').first<{ id: number }>())!.id;
  const addBatch = db.prepare('INSERT INTO session_batches (session_id, batch_year) VALUES (?, ?)');
  const announce = db.prepare(`INSERT INTO announcements (author_id, title, body, audience, batch_year, send_at) VALUES (?, ?, ?, ?, ?, unixepoch())`);
  const text = `${new Date((body.startAt! + 19800) * 1000).toISOString().slice(0, 16).replace('T', ' ')} IST${body.room ? ` · ${body.room}` : ''}`.slice(0, 280);
  await adminWrite(c, { area: 'sessions', action: 'created session', target: title, after: { startAt: body.startAt, room: body.room, batches } }, [
    db.prepare('INSERT INTO sessions (id, title, start_at, room, practice_url, remind) VALUES (?, ?, ?, ?, ?, ?)').bind(id, title, body.startAt, body.room?.trim() || null, body.practiceUrl || null, body.announce ? 1 : 0),
    ...batches.map((batch) => addBatch.bind(id, batch)),
    ...(body.announce ? (batches.length ? batches.map((batch) => announce.bind(adminId, title.slice(0, 80), text, 'batch', batch)) : [announce.bind(adminId, title.slice(0, 80), text, 'all', null)]) : []),
  ]);
  return c.json({ id });
});

adminClubRoutes.get('/sessions/:id/checkins', async (c) => {
  const id = Number(c.req.param('id'));
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.username, u.batch_year AS batchYear, k.at AS checkedInAt
     FROM users u LEFT JOIN session_checkins k ON k.user_id = u.id AND k.session_id = ?1
     WHERE u.active = 1 AND u.name != '' AND (NOT EXISTS (SELECT 1 FROM session_batches b WHERE b.session_id = ?1) OR u.batch_year IN (SELECT batch_year FROM session_batches WHERE session_id = ?1))
     ORDER BY u.name`,
  )
    .bind(id)
    .all();
  return c.json(results);
});

adminClubRoutes.put('/sessions/:id/checkins/:userId', async (c) => {
  const id = Number(c.req.param('id'));
  const userId = Number(c.req.param('userId'));
  const { here } = await c.req.json<{ here?: boolean }>();
  const db = c.env.DB;
  await adminWrite(c, { area: 'sessions', action: here ? 'checked in' : 'removed check-in', target: `${id}:${userId}` }, [
    here ? db.prepare('INSERT OR IGNORE INTO session_checkins (session_id, user_id, at) VALUES (?, ?, unixepoch())').bind(id, userId) : db.prepare('DELETE FROM session_checkins WHERE session_id = ? AND user_id = ?').bind(id, userId),
  ]);
  return c.json({ ok: true });
});
