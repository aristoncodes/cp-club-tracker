import { Hono } from 'hono';
import { SETTING_DEFAULTS, effectiveValue, type SettingKey, type SettingRow } from 'shared/settings';
import { periodStart } from 'shared/time';
import { adminWrite } from './admin-write';
import { seasonBoardQuery } from './admin-jobs';
import type { AppEnv } from './auth';
import { pushUsers } from './push';
import { SETTING_ROWS } from './settings';
import { adjustmentSum } from './records';

const DAY = 86400;
const REASON_MAX = 280;
const HISTORY = 50;
const TOP_TOPICS = 8;
const TOP_PERFORMERS = 5;
const clock = () => Math.floor(Date.now() / 1000);

export const adminEngageRoutes = new Hono<AppEnv>();

adminEngageRoutes.get('/engagement', async (c) => {
  const batch = c.req.query('batch') ? Number(c.req.query('batch')) : -1;
  const { results } = await c.env.DB.prepare(`SELECT batch_year AS batchYear, key, value FROM stats_daily WHERE day = (SELECT MAX(day) FROM stats_daily)`).all<{ batchYear: number; key: string; value: number }>();
  const mine = results.filter((row) => row.batchYear === batch);
  const value = (key: string) => mine.find((row) => row.key === key)?.value ?? 0;
  const tagRows = results.filter((row) => row.key.startsWith('tag:'));
  const overall = tagRows.filter((row) => row.batchYear === -1).sort((a, b) => b.value - a.value);
  return c.json({
    kpis: { members: value('members'), active: value('active'), solves: value('solves'), potd: value('potd'), duels: value('duels') },
    weeks: Array.from({ length: 10 }, (_, index) => ({ weeksAgo: 9 - index, active: value(`week_${9 - index}`) })),
    features: ['use_potd', 'use_upsolve', 'use_duels', 'use_virtuals', 'use_rivals'].map((key) => ({ key: key.slice(4), members: value(key) })),
    batches: [...new Set(results.map((row) => row.batchYear))].filter((year) => year > 0).sort(),
    topics: overall.slice(0, TOP_TOPICS).map((row) => row.key.slice(4)),
    topicCells: tagRows.filter((row) => row.batchYear > 0 || row.batchYear === 0).map((row) => ({ batchYear: row.batchYear, tag: row.key.slice(4), percent: Math.round(row.value) })),
  });
});

// Fairness

adminEngageRoutes.get('/fairness', async (c) => {
  const db = c.env.DB;
  const [open, history] = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT f.id, f.user_id AS userId, u.name, u.username, f.rule, f.day, f.severity, f.evidence FROM fairness_flags f JOIN users u ON u.id = f.user_id WHERE f.status = 'open' ORDER BY f.severity, f.day DESC`),
    db.prepare(
      `SELECT p.id, p.user_id AS userId, u.name, p.kind, p.points, p.reason, p.at, p.undone_at AS undoneAt, a.name AS admin, p.flag_id AS flagId
       FROM point_adjustments p JOIN users u ON u.id = p.user_id JOIN users a ON a.id = p.admin_id ORDER BY p.at DESC, p.id DESC LIMIT ${HISTORY}`,
    ),
  ]);
  const cleared = await db
    .prepare(`SELECT f.id, f.user_id AS userId, u.name, f.rule, f.reason, f.decided_at AS at, a.name AS admin FROM fairness_flags f JOIN users u ON u.id = f.user_id LEFT JOIN users a ON a.id = f.decided_by WHERE f.status = 'cleared' ORDER BY f.decided_at DESC LIMIT ${HISTORY}`)
    .all();
  return c.json({ open: (open.results as { evidence: string }[]).map((row) => ({ ...row, evidence: JSON.parse(row.evidence) })), history: history.results, cleared: cleared.results });
});

type Flag = { id: number; userId: number; rule: string; status: string; evidence: string };
const loadFlag = (db: D1Database, id: number) => db.prepare('SELECT id, user_id AS userId, rule, status, evidence FROM fairness_flags WHERE id = ?').bind(id).first<Flag>();

adminEngageRoutes.post('/fairness/:id/clear', async (c) => {
  const flag = await loadFlag(c.env.DB, Number(c.req.param('id')));
  if (!flag) return c.json({ error: 'Flag not found' }, 404);
  await adminWrite(c, { area: 'fairness', action: 'cleared flag', target: `${flag.rule} · ${flag.userId}`, before: flag.status, after: 'cleared' }, [
    c.env.DB.prepare(`UPDATE fairness_flags SET status = 'cleared', decided_by = ?, decided_at = unixepoch() WHERE id = ?`).bind(c.get('user').id, flag.id),
  ]);
  return c.json({ ok: true });
});

adminEngageRoutes.post('/fairness/:id/undo-clear', async (c) => {
  const flag = await loadFlag(c.env.DB, Number(c.req.param('id')));
  if (!flag) return c.json({ error: 'Flag not found' }, 404);
  await adminWrite(c, { area: 'fairness', action: 'reopened flag', target: `${flag.rule} · ${flag.userId}`, before: flag.status, after: 'open' }, [
    c.env.DB.prepare(`UPDATE fairness_flags SET status = 'open', decided_by = NULL, decided_at = NULL WHERE id = ?`).bind(flag.id),
  ]);
  return c.json({ ok: true });
});

const notice = (c: Parameters<typeof adminWrite>[0], userId: number, body: string) =>
  c.executionCtx.waitUntil(pushUsers(c.env, 'points', [{ userId, title: 'Your points changed', body, data: { path: '/profile' } }]).catch((err) => console.error('Points push failed:', err)));

function reasonError(reason: string | undefined): string | null {
  return !reason?.trim() || reason.length > REASON_MAX ? `A reason of 1–${REASON_MAX} characters is required` : null;
}

adminEngageRoutes.post('/fairness/:id/adjust', async (c) => {
  const { points, reason } = await c.req.json<{ points?: number; reason?: string }>();
  const invalid = reasonError(reason);
  if (invalid) return c.json({ error: invalid }, 400);
  if (typeof points !== 'number' || !Number.isFinite(points) || points === 0) return c.json({ error: 'Enter the points to add or remove' }, 400);
  const db = c.env.DB;
  const flag = await loadFlag(db, Number(c.req.param('id')));
  if (!flag) return c.json({ error: 'Flag not found' }, 404);
  await adminWrite(c, { area: 'fairness', action: 'adjusted points', target: String(flag.userId), after: { points, reason } }, [
    db.prepare(`INSERT INTO point_adjustments (user_id, flag_id, kind, points, reason, admin_id, at) VALUES (?, ?, 'adjust', ?, ?, ?, unixepoch())`).bind(flag.userId, flag.id, points, reason!.trim(), c.get('user').id),
    db.prepare(`UPDATE fairness_flags SET status = 'adjusted', decided_by = ?, decided_at = unixepoch(), reason = ? WHERE id = ?`).bind(c.get('user').id, reason!.trim(), flag.id),
  ]);
  notice(c, flag.userId, `${points > 0 ? '+' : ''}${points} points. ${reason!.trim()}`);
  return c.json({ ok: true });
});

// Voiding moves points into voided_points, so every board drops them (all filter points > 0) and undo restores the exact value.
adminEngageRoutes.post('/fairness/:id/void', async (c) => {
  const { reason } = await c.req.json<{ reason?: string }>();
  const invalid = reasonError(reason);
  if (invalid) return c.json({ error: invalid }, 400);
  const db = c.env.DB;
  const flag = await loadFlag(db, Number(c.req.param('id')));
  if (!flag) return c.json({ error: 'Flag not found' }, 404);
  const solves = JSON.parse(flag.evidence) as { platform: string; problemId: string; points: number }[];
  const total = solves.reduce((sum, solve) => sum + solve.points, 0);
  const voidSolve = db.prepare('UPDATE solves SET voided_points = points, points = 0 WHERE user_id = ? AND platform = ? AND problem_id = ? AND voided_points IS NULL');
  await adminWrite(c, { area: 'fairness', action: 'voided solves', target: String(flag.userId), after: { solves: solves.length, points: total, reason } }, [
    ...solves.map((solve) => voidSolve.bind(flag.userId, solve.platform, solve.problemId)),
    db.prepare(`INSERT INTO point_adjustments (user_id, flag_id, kind, points, solves, reason, admin_id, at) VALUES (?, ?, 'void', ?, ?, ?, ?, unixepoch())`).bind(flag.userId, flag.id, -total, flag.evidence, reason!.trim(), c.get('user').id),
    db.prepare(`UPDATE fairness_flags SET status = 'voided', decided_by = ?, decided_at = unixepoch(), reason = ? WHERE id = ?`).bind(c.get('user').id, reason!.trim(), flag.id),
  ]);
  notice(c, flag.userId, `${solves.length} solves were removed from the leaderboards. ${reason!.trim()}`);
  return c.json({ ok: true });
});

adminEngageRoutes.post('/fairness/adjustments/:id/undo', async (c) => {
  const db = c.env.DB;
  const row = await db
    .prepare('SELECT id, user_id AS userId, flag_id AS flagId, kind, points, solves, undone_at AS undoneAt FROM point_adjustments WHERE id = ?')
    .bind(Number(c.req.param('id')))
    .first<{ id: number; userId: number; flagId: number | null; kind: string; points: number; solves: string | null; undoneAt: number | null }>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (row.undoneAt) return c.json({ error: 'Already undone' }, 409);
  const solves = row.solves ? (JSON.parse(row.solves) as { platform: string; problemId: string }[]) : [];
  const restore = db.prepare('UPDATE solves SET points = voided_points, voided_points = NULL WHERE user_id = ? AND platform = ? AND problem_id = ? AND voided_points IS NOT NULL');
  await adminWrite(c, { area: 'fairness', action: `undid ${row.kind}`, target: String(row.userId), after: { points: row.points } }, [
    ...solves.map((solve) => restore.bind(row.userId, solve.platform, solve.problemId)),
    db.prepare('UPDATE point_adjustments SET undone_at = unixepoch() WHERE id = ?').bind(row.id),
    db.prepare(`UPDATE fairness_flags SET status = 'open', decided_by = NULL, decided_at = NULL, reason = NULL WHERE id = ?`).bind(row.flagId),
  ]);
  notice(c, row.userId, 'A change to your points was undone.');
  return c.json({ ok: true });
});

// Seasons

adminEngageRoutes.get('/seasons', async (c) => {
  const db = c.env.DB;
  const now = clock();
  const [seasons, months] = await db.batch<Record<string, unknown>>([
    db.prepare('SELECT id, name, start_at AS startAt, end_at AS endAt, frozen_at AS frozenAt, board FROM seasons ORDER BY start_at DESC'),
    db.prepare('SELECT month, auto_user_id AS autoUserId, user_id AS userId, candidates, announced_at AS announcedAt FROM member_of_month ORDER BY month DESC LIMIT 1'),
  ]);
  const rows = seasons.results as { id: number; startAt: number; endAt: number; frozenAt: number | null; board: string | null }[];
  const live = rows.find((row) => !row.frozenAt && row.startAt <= now && row.endAt > now);
  const board = live ? (await seasonBoardQuery(db, live.startAt, live.endAt).all()).results : [];
  const month = months.results[0] as { candidates: string } | undefined;
  return c.json({
    now,
    live: live ? { ...live, board } : null,
    past: rows.filter((row) => row.frozenAt).map((row) => ({ ...row, board: JSON.parse(row.board ?? '[]') })),
    upcoming: rows.filter((row) => !row.frozenAt && row.startAt > now),
    month: month ? { ...month, candidates: JSON.parse(month.candidates) } : null,
  });
});

adminEngageRoutes.post('/seasons', async (c) => {
  const { name, startAt, endAt } = await c.req.json<{ name?: string; startAt?: number; endAt?: number }>();
  if (!name?.trim() || name.length > 80) return c.json({ error: 'A name is required' }, 400);
  if (!Number.isInteger(startAt) || !Number.isInteger(endAt) || endAt! <= startAt!) return c.json({ error: 'Choose valid dates' }, 400);
  const db = c.env.DB;
  const clash = await db.prepare('SELECT name FROM seasons WHERE frozen_at IS NULL AND start_at < ? AND end_at > ?').bind(endAt, startAt).first<{ name: string }>();
  if (clash) return c.json({ error: `That overlaps ${clash.name}` }, 409);
  await adminWrite(c, { area: 'seasons', action: 'started season', target: name.trim(), after: { startAt, endAt } }, [
    db.prepare('INSERT INTO seasons (name, start_at, end_at, created_by) VALUES (?, ?, ?, ?)').bind(name.trim(), startAt, endAt, c.get('user').id),
  ]);
  return c.json({ ok: true });
});

adminEngageRoutes.patch('/member-of-month/:month', async (c) => {
  const month = c.req.param('month');
  const { userId } = await c.req.json<{ userId?: number }>();
  if (!Number.isInteger(userId)) return c.json({ error: 'Choose a member' }, 400);
  const db = c.env.DB;
  const before = await db.prepare('SELECT user_id AS userId FROM member_of_month WHERE month = ?').bind(month).first<{ userId: number | null }>();
  if (!before) return c.json({ error: 'No draft for that month' }, 404);
  await adminWrite(c, { area: 'seasons', action: 'chose member of the month', target: month, before: before.userId, after: userId }, [
    db.prepare('UPDATE member_of_month SET user_id = ? WHERE month = ? AND announced_at IS NULL').bind(userId, month),
  ]);
  return c.json({ ok: true });
});

adminEngageRoutes.post('/member-of-month/:month/announce', async (c) => {
  const month = c.req.param('month');
  const db = c.env.DB;
  const row = await db
    .prepare('SELECT m.user_id AS userId, u.name, u.username, m.announced_at AS announcedAt FROM member_of_month m JOIN users u ON u.id = m.user_id WHERE m.month = ?')
    .bind(month)
    .first<{ userId: number; name: string; username: string | null; announcedAt: number | null }>();
  if (!row) return c.json({ error: 'No draft for that month' }, 404);
  if (row.announcedAt) return c.json({ error: 'Already announced' }, 409);
  const who = row.username ? `@${row.username}` : row.name;
  await adminWrite(c, { area: 'seasons', action: 'announced member of the month', target: month, after: row.userId }, [
    db.prepare('UPDATE member_of_month SET announced_at = unixepoch() WHERE month = ?').bind(month),
    db.prepare(`INSERT OR IGNORE INTO badges (user_id, badge, earned_at, seen_at) VALUES (?, ?, unixepoch(), unixepoch())`).bind(row.userId, `month_${month}`),
    db.prepare(`INSERT INTO announcements (author_id, title, body, audience, send_at) VALUES (?, ?, ?, 'all', unixepoch())`).bind(c.get('user').id, 'Member of the month', `${who} is our member of the month for ${month}. Well done!`),
  ]);
  return c.json({ ok: true });
});

// Reports

type ReportMember = { name: string; username: string | null; batchYear: number | null; present: number; total: number; solves: number; points: number; ratingStart: number | null; ratingEnd: number | null };

function reportQueries(db: D1Database, from: number, to: number) {
  const rating = (order: string) => `(SELECT json_extract(j.value, '$.rating') FROM json_each(u.cf_rating_history) j WHERE json_extract(j.value, '$.at') >= ?1 AND json_extract(j.value, '$.at') < ?2 ORDER BY json_extract(j.value, '$.at') ${order} LIMIT 1)`;
  const weighted = `SUM(CASE WHEN a.status = 'present' THEN 1 + c.mandatory ELSE 0 END)`;
  return [
    db
      .prepare(
        `SELECT u.id AS userId, u.name, u.username, u.batch_year AS batchYear,
           (SELECT COALESCE(${weighted}, 0) FROM attendance a JOIN contests c ON c.id = a.contest_id WHERE a.user_id = u.id AND c.counts = 1 AND c.start_at >= ?1 AND c.start_at < ?2) AS present,
           (SELECT COALESCE(SUM(1 + c.mandatory), 0) FROM attendance a JOIN contests c ON c.id = a.contest_id WHERE a.user_id = u.id AND c.counts = 1 AND a.status IN ('present','absent') AND c.start_at >= ?1 AND c.start_at < ?2) AS total,
           (SELECT COUNT(*) FROM solves s WHERE s.user_id = u.id AND s.points > 0 AND s.solved_at >= ?1 AND s.solved_at < ?2) AS solves,
           (SELECT COALESCE(SUM(s.points), 0) FROM solves s WHERE s.user_id = u.id AND s.points > 0 AND s.solved_at >= ?1 AND s.solved_at < ?2) + ${adjustmentSum('u.id', '?1', '?2')} AS points,
           ${rating('ASC')} AS ratingStart, ${rating('DESC')} AS ratingEnd
         FROM users u WHERE u.active = 1 AND u.name != '' ORDER BY points DESC`,
      )
      .bind(from, to),
    db
      .prepare(`SELECT s.id, s.title, s.start_at AS startAt, s.room, (SELECT COUNT(*) FROM session_checkins k WHERE k.session_id = s.id) AS here FROM sessions s WHERE s.start_at >= ?1 AND s.start_at < ?2 ORDER BY s.start_at`)
      .bind(from, to),
    db.prepare('SELECT COUNT(*) AS n FROM contests WHERE counts = 1 AND start_at >= ?1 AND start_at < ?2').bind(from, to),
  ];
}

const reportRange = (c: { req: { query: (key: string) => string | undefined } }) => {
  const now = clock();
  return { from: Number(c.req.query('from')) || periodStart('month', now), to: Number(c.req.query('to')) || now + DAY };
};

adminEngageRoutes.get('/reports', async (c) => {
  const { from, to } = reportRange(c);
  const [members, sessions, contests] = await c.env.DB.batch<Record<string, unknown>>(reportQueries(c.env.DB, from, to));
  const rows = members.results as ReportMember[];
  const batches = [...new Set(rows.map((row) => row.batchYear))].map((batchYear) => {
    const mine = rows.filter((row) => row.batchYear === batchYear);
    return { batchYear, present: mine.reduce((sum, row) => sum + row.present, 0), total: mine.reduce((sum, row) => sum + row.total, 0), members: mine.length };
  });
  return c.json({
    from,
    to,
    contests: (contests.results[0] as { n: number }).n,
    members: rows,
    top: rows.slice(0, TOP_PERFORMERS),
    batches,
    growth: rows.filter((row) => row.ratingStart !== null && row.ratingEnd !== null).sort((a, b) => b.ratingEnd! - b.ratingStart! - (a.ratingEnd! - a.ratingStart!)).slice(0, TOP_PERFORMERS),
    sessions: sessions.results,
  });
});

// A leading = + - or @ would run as a formula when the CSV opens in a spreadsheet.
const csvField = (value: unknown) => {
  const text = String(value ?? '');
  return `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
};

adminEngageRoutes.get('/reports.csv', async (c) => {
  const { from, to } = reportRange(c);
  const [members] = await c.env.DB.batch<ReportMember>(reportQueries(c.env.DB, from, to));
  const header = ['Name', 'Username', 'Joined', 'Attended (weighted)', 'Of (weighted)', 'Solves', 'Points', 'Rating start', 'Rating end'];
  const lines = members.results.map((m) => [m.name, m.username, m.batchYear, m.present, m.total, m.solves, Math.round(m.points * 10) / 10, m.ratingStart, m.ratingEnd]);
  return c.body([header, ...lines].map((row) => row.map(csvField).join(',')).join('\n'), 200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="report.csv"' });
});

// Rules

adminEngageRoutes.get('/rules', async (c) => {
  const now = clock();
  const { results } = await c.env.DB.prepare(SETTING_ROWS).all<SettingRow>();
  return c.json({ now, rules: results.map((row) => ({ ...row, current: effectiveValue(row, now) })) });
});

adminEngageRoutes.put('/rules', async (c) => {
  const { values } = await c.req.json<{ values?: Record<string, number> }>();
  const entries = Object.entries(values ?? {});
  if (!entries.length) return c.json({ error: 'Nothing to save' }, 400);
  for (const [key, value] of entries) {
    if (!(key in SETTING_DEFAULTS)) return c.json({ error: `Unknown rule ${key}` }, 400);
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return c.json({ error: `${key} must be 0 or more` }, 400);
  }
  const db = c.env.DB;
  const now = clock();
  const { results } = await db.prepare(SETTING_ROWS).all<SettingRow>();
  const from = periodStart('day', now) + DAY;
  const save = db.prepare(
    `UPDATE settings SET value = ?, pending_value = ?, pending_from = ?, updated_by = ?, updated_at = unixepoch() WHERE key = ?`,
  );
  const changed = entries.filter(([key, value]) => {
    const row = results.find((r) => r.key === key);
    return row && (row.pendingValue ?? row.value) !== value;
  });
  if (!changed.length) return c.json({ ok: true, from });
  await adminWrite(
    c,
    changed.map(([key, value]) => {
      const row = results.find((r) => r.key === key)!;
      return { area: 'rules' as const, action: 'changed rule', target: key as SettingKey, before: effectiveValue(row, now), after: value };
    }),
    changed.map(([key, value]) => save.bind(effectiveValue(results.find((r) => r.key === key)!, now), value, from, c.get('user').id, key)),
  );
  return c.json({ ok: true, from });
});
