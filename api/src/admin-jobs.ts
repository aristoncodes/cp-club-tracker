import type { Settings } from 'shared/settings';
import { IST_OFFSET, istDay, periodStart } from 'shared/time';
import type { Bindings } from './auth';
import { pushUsers } from './push';
import { trackedMember } from './records';
import { getSettings } from './settings';

const DAY = 86400;
const RATE_WINDOW = 30 * DAY;
const WEEKS_SHOWN = 10;
const TOPIC_SOLVES = 3;
const MOM_CANDIDATES = 5;
const SEASON_BOARD = 100;
const SESSION_REMINDER = 3600;

const AT_RISK_MINUTE = 60;
const FAIRNESS_MINUTE = 61;
const STATS_MINUTE = 62;
const MOM_MINUTE = 120;

export const istMinute = (now: number) => Math.floor(((now + IST_OFFSET) % DAY) / 60);
export const isNightlyJobMinute = (now: number) => [AT_RISK_MINUTE, FAIRNESS_MINUTE, STATS_MINUTE].includes(istMinute(now));
const istDateOfMonth = (now: number) => new Date((now + IST_OFFSET) * 1000).getUTCDate();

// Members in a matching exam week. `now` is always a number from our own clock.
export const inExamWeek = (flag: 'excuse' | 'mute_practice', now: number) =>
  `SELECT b.batch_year FROM exam_week_batches b JOIN exam_weeks e ON e.id = b.exam_week_id WHERE e.${flag} = 1 AND e.from_at <= ${now} AND e.to_at >= ${now}`;

export const AT_RISK_VISIBLE = `json_extract(r.signals, '$.flagged') = 1 AND (r.snoozed_until IS NULL OR r.snoozed_until <= ?1) AND u.active = 1
  AND COALESCE(u.batch_year, 0) NOT IN (SELECT b.batch_year FROM exam_week_batches b JOIN exam_weeks e ON e.id = b.exam_week_id WHERE e.hide_at_risk = 1 AND e.from_at <= ?1 AND e.to_at + ?2 * ${DAY} >= ?1)`;

export function atRiskCount(db: D1Database, now: number, graceDays: number): D1PreparedStatement {
  return db.prepare(`SELECT COUNT(*) AS n FROM at_risk r JOIN users u ON u.id = r.user_id WHERE ${AT_RISK_VISIBLE}`).bind(now, graceDays);
}

// All of it runs inside D1, so the Worker parses nothing. Missed mandatory contests count twice.
export function buildAtRisk(db: D1Database, s: Settings, now: number): D1PreparedStatement {
  const rate = (from: string, to: string) => `(SELECT 100.0 * SUM(CASE WHEN a.status = 'present' THEN 1 + c.mandatory ELSE 0 END) / NULLIF(SUM(1 + c.mandatory), 0)
    FROM attendance a JOIN contests c ON c.id = a.contest_id
    WHERE a.user_id = u.id AND c.counts = 1 AND a.status IN ('present','absent') AND c.start_at >= ${from} AND c.start_at < ${to})`;
  return db
    .prepare(
      `INSERT INTO at_risk (user_id, signals, built_at)
       SELECT id, json_object('noSolveDays', idle, 'absences', absences, 'drop', drop_by, 'lastSolve', last_solve, 'recentRate', recent,
         'flagged', idle >= ?2 OR absences >= ?3 OR COALESCE(drop_by, 0) >= ?4), ?1
       FROM (
         SELECT id, last_solve, (?1 - COALESCE(last_solve, created_at)) / ${DAY} AS idle, absences, recent, prior - recent AS drop_by
         FROM (
           SELECT u.id, u.created_at,
             (SELECT MAX(s.solved_at) FROM solves s WHERE s.user_id = u.id) AS last_solve,
             (SELECT COALESCE(SUM(1 + c.mandatory), 0) FROM attendance a JOIN contests c ON c.id = a.contest_id
              WHERE a.user_id = u.id AND c.counts = 1 AND a.status = 'absent' AND a.reason_type IS NULL AND c.start_at > COALESCE(
                (SELECT MAX(c2.start_at) FROM attendance a2 JOIN contests c2 ON c2.id = a2.contest_id
                 WHERE a2.user_id = u.id AND c2.counts = 1 AND a2.status IS NOT NULL AND NOT (a2.status = 'absent' AND a2.reason_type IS NULL)), 0)) AS absences,
             ${rate(`?1 - ${RATE_WINDOW}`, '?1')} AS recent,
             ${rate(`?1 - ${2 * RATE_WINDOW}`, `?1 - ${RATE_WINDOW}`)} AS prior
           FROM users u
           WHERE u.active = 1 AND ${trackedMember('u', now)} AND EXISTS (SELECT 1 FROM handles h WHERE h.user_id = u.id AND h.approved_at IS NOT NULL)
         )
       ) WHERE true
       ON CONFLICT (user_id) DO UPDATE SET signals = excluded.signals, built_at = excluded.built_at`,
    )
    .bind(now, s.risk_no_solve_days, s.risk_absences, s.risk_attendance_drop);
}

// Each check covers yesterday (IST); UNIQUE (user, rule, day) means a re-run adds nothing.
export function fairnessChecks(db: D1Database, s: Settings, now: number): D1PreparedStatement[] {
  const day = istDay(now) - 1;
  const from = day * DAY - IST_OFFSET;
  const to = from + DAY;
  const flag = (rule: string, severity: string) => `INSERT OR IGNORE INTO fairness_flags (user_id, rule, day, severity, evidence) SELECT user_id, '${rule}', ${day}, '${severity}', evidence FROM`;
  const item = (s_: string) => `json_object('at', ${s_}.solved_at, 'platform', ${s_}.platform, 'problemId', ${s_}.problem_id, 'rp', ${s_}.rp, 'points', ${s_}.points)`;
  return [
    db
      .prepare(`${flag('max_solves', 'high')} (SELECT s.user_id, json_group_array(${item('s')}) AS evidence FROM solves s WHERE s.solved_at >= ?1 AND s.solved_at < ?2 AND s.points > 0 GROUP BY s.user_id HAVING COUNT(*) > ?3)`)
      .bind(from, to, s.fairness_max_solves),
    db
      .prepare(
        `${flag('fast_solves', 'high')} (SELECT s.user_id, json_group_array(${item('s')}) AS evidence FROM solves s JOIN users u ON u.id = s.user_id
           WHERE s.solved_at >= ?1 AND s.solved_at < ?2 AND s.points > 0 AND s.rp >= COALESCE(u.cf_rating, 1200) + ?3
             AND (SELECT COUNT(*) FROM solves x WHERE x.user_id = s.user_id AND x.points > 0 AND x.rp >= COALESCE(u.cf_rating, 1200) + ?3 AND ABS(x.solved_at - s.solved_at) <= ?4 * 60) >= ?5
           GROUP BY s.user_id)`,
      )
      .bind(from, to, s.fairness_fast_gap, s.fairness_fast_minutes, s.fairness_fast_count),
    db
      .prepare(
        `${flag('matching_solves', 'medium')} (SELECT s.user_id, json_group_array(${item('s')}) AS evidence FROM solves s
           WHERE s.solved_at >= ?1 AND s.solved_at < ?2 AND s.points > 0 AND s.fingerprint IS NOT NULL AND EXISTS (
             SELECT 1 FROM solves x WHERE x.platform = s.platform AND x.problem_id = s.problem_id AND x.user_id != s.user_id AND x.fingerprint = s.fingerprint AND ABS(x.solved_at - s.solved_at) <= ?3 * 60)
           GROUP BY s.user_id)`,
      )
      .bind(from, to, s.fairness_match_minutes),
    db
      .prepare(
        `${flag('duel_problem', 'medium')} (SELECT s.user_id, json_group_array(${item('s')}) AS evidence FROM solves s JOIN duels d ON d.problem_id = s.problem_id AND s.platform = 'cf'
           WHERE s.solved_at >= ?1 AND s.solved_at < ?2 AND s.points > 0 AND s.solved_at >= d.start_at AND s.solved_at < d.end_at AND s.user_id NOT IN (d.challenger_id, d.opponent_id)
           GROUP BY s.user_id)`,
      )
      .bind(from, to),
  ];
}

const USER_METRICS = ['members', 'active', 'solves', 'potd', 'duels', 'use_potd', 'use_upsolve', 'use_duels', 'use_virtuals', 'use_rivals'];

export function buildStats(db: D1Database, now: number): D1PreparedStatement[] {
  const day = istDay(now);
  const week = now - 7 * DAY;
  const month = now - 30 * DAY;
  // D1 allows very few UNION terms per statement, so metrics become rows here rather than one term each.
  const metrics = USER_METRICS.map((key) => `'${key}', ${key}`).join(', ');
  const weekStart = periodStart('week', now);
  return [
    db.prepare('DELETE FROM stats_daily WHERE day < ?').bind(day),
    db.prepare(
      `WITH m AS (
         SELECT u.batch_year AS b, 1 AS members,
           EXISTS (SELECT 1 FROM solves s WHERE s.user_id = u.id AND s.solved_at >= ${week}) AS active,
           (SELECT COUNT(*) FROM solves s WHERE s.user_id = u.id AND s.solved_at >= ${week} AND s.points > 0) AS solves,
           EXISTS (SELECT 1 FROM solves s WHERE s.user_id = u.id AND s.solved_at >= ${week} AND s.potd_bonus > 0) AS potd,
           (SELECT COUNT(*) FROM duels d WHERE d.finished_at >= ${week} AND (d.challenger_id = u.id OR d.opponent_id = u.id)) AS duels,
           EXISTS (SELECT 1 FROM solves s WHERE s.user_id = u.id AND s.solved_at >= ${month} AND s.potd_bonus > 0) AS use_potd,
           EXISTS (SELECT 1 FROM upsolves x JOIN solves s ON s.user_id = x.user_id AND s.platform = 'cf' AND s.problem_id = x.problem_id WHERE x.user_id = u.id AND s.solved_at >= ${month}) AS use_upsolve,
           EXISTS (SELECT 1 FROM duels d WHERE d.created_at >= ${month} AND (d.challenger_id = u.id OR d.opponent_id = u.id)) AS use_duels,
           EXISTS (SELECT 1 FROM virtual_results r JOIN contests c ON c.id = r.contest_id WHERE r.user_id = u.id AND c.start_at >= ${month}) AS use_virtuals,
           u.rival_id IS NOT NULL AS use_rivals
         FROM users u WHERE u.active = 1
       ), rows AS (SELECT m.b, t.key AS k, t.value AS v FROM m, json_each(json_object(${metrics})) t)
       INSERT OR REPLACE INTO stats_daily (day, batch_year, key, value)
       SELECT ${day}, COALESCE(b, 0), k, SUM(v) FROM rows GROUP BY b, k
       UNION ALL
       SELECT ${day}, -1, k, SUM(v) FROM rows GROUP BY k`,
    ),
    db.prepare(
      `INSERT OR REPLACE INTO stats_daily (day, batch_year, key, value)
       SELECT ${day}, COALESCE(u.batch_year, 0), 'week_' || ((${weekStart} + ${7 * DAY} - 1 - s.solved_at) / ${7 * DAY}), COUNT(DISTINCT s.user_id)
       FROM solves s JOIN users u ON u.id = s.user_id WHERE u.active = 1 AND s.solved_at >= ${weekStart - (WEEKS_SHOWN - 1) * 7 * DAY} GROUP BY u.batch_year, 3
       UNION ALL
       SELECT ${day}, -1, 'week_' || ((${weekStart} + ${7 * DAY} - 1 - s.solved_at) / ${7 * DAY}), COUNT(DISTINCT s.user_id)
       FROM solves s JOIN users u ON u.id = s.user_id WHERE u.active = 1 AND s.solved_at >= ${weekStart - (WEEKS_SHOWN - 1) * 7 * DAY} GROUP BY 3`,
    ),
    db.prepare(
      `WITH solved AS (
         SELECT u.id, u.batch_year AS b, t.value AS tag
         FROM solves s JOIN users u ON u.id = s.user_id JOIN problems p ON p.platform = s.platform AND p.problem_id = s.problem_id, json_each(p.tags) t
         WHERE u.active = 1 AND p.tags IS NOT NULL GROUP BY u.id, t.value HAVING COUNT(*) >= ${TOPIC_SOLVES}
       )
       INSERT OR REPLACE INTO stats_daily (day, batch_year, key, value)
       SELECT ${day}, COALESCE(b, 0), 'tag:' || tag, 100.0 * COUNT(*) / (SELECT COUNT(*) FROM users WHERE active = 1 AND COALESCE(batch_year, 0) = COALESCE(solved.b, 0)) FROM solved GROUP BY b, tag
       UNION ALL
       SELECT ${day}, -1, 'tag:' || tag, 100.0 * COUNT(*) / (SELECT COUNT(*) FROM users WHERE active = 1) FROM solved GROUP BY tag`,
    ),
  ];
}

export async function draftMemberOfMonth(db: D1Database, s: Settings, now: number): Promise<void> {
  const thisMonth = periodStart('month', now);
  const last = periodStart('month', thisMonth - 1);
  const before = periodStart('month', last - 1);
  const month = new Date((last + IST_OFFSET) * 1000).toISOString().slice(0, 7);
  const { results } = await db
    .prepare(
      `SELECT u.id AS userId, u.name, u.username, cur.points, cur.solves, COALESCE(prev.points, 0) AS previous,
              100.0 * (cur.points - COALESCE(prev.points, 0)) / MAX(COALESCE(prev.points, 0), 1) AS gain
       FROM (SELECT user_id, SUM(points) AS points, COUNT(*) AS solves FROM solves WHERE solved_at >= ?1 AND solved_at < ?2 AND points > 0 GROUP BY user_id) cur
       JOIN users u ON u.id = cur.user_id AND u.active = 1
       LEFT JOIN (SELECT user_id, SUM(points) AS points FROM solves WHERE solved_at >= ?3 AND solved_at < ?1 AND points > 0 GROUP BY user_id) prev ON prev.user_id = cur.user_id
       WHERE cur.solves >= ?4 ORDER BY gain DESC LIMIT ${MOM_CANDIDATES}`,
    )
    .bind(last, thisMonth, before, s.mom_min_solves)
    .all<{ userId: number }>();
  await db
    .prepare('INSERT OR IGNORE INTO member_of_month (month, auto_user_id, user_id, candidates) VALUES (?, ?, ?, ?)')
    .bind(month, results[0]?.userId ?? null, results[0]?.userId ?? null, JSON.stringify(results))
    .run();
}

export function seasonBoardQuery(db: D1Database, from: number, to: number): D1PreparedStatement {
  return db
    .prepare(
      `SELECT u.id AS userId, u.name, u.username, SUM(s.points) + COALESCE((SELECT SUM(a.points) FROM point_adjustments a WHERE a.user_id = u.id AND a.kind = 'adjust' AND a.undone_at IS NULL AND a.at >= ?1 AND a.at < ?2), 0) AS points, COUNT(*) AS solves
       FROM solves s JOIN users u ON u.id = s.user_id
       WHERE s.solved_at >= ?1 AND s.solved_at < ?2 AND s.points > 0 AND u.active = 1 GROUP BY u.id ORDER BY points DESC LIMIT ${SEASON_BOARD}`,
    )
    .bind(from, to);
}

export async function freezeSeasons(env: Bindings, now: number): Promise<void> {
  const db = env.DB;
  const { results } = await db.prepare('SELECT id, name, start_at AS startAt, end_at AS endAt FROM seasons WHERE frozen_at IS NULL AND end_at <= ?').bind(now).all<{ id: number; name: string; startAt: number; endAt: number }>();
  for (const season of results) {
    const board = (await seasonBoardQuery(db, season.startAt, season.endAt).all<{ userId: number; points: number }>()).results;
    const badge = db.prepare('INSERT OR IGNORE INTO badges (user_id, badge, earned_at, seen_at) VALUES (?, ?, ?, ?)');
    await db.batch([
      db.prepare('UPDATE seasons SET frozen_at = ?, board = ? WHERE id = ? AND frozen_at IS NULL').bind(now, JSON.stringify(board), season.id),
      ...board.slice(0, 3).map((row) => badge.bind(row.userId, `season_${season.id}`, now, now)),
    ]);
    await pushUsers(
      env,
      'season',
      board.map((row, index) => ({
        userId: row.userId,
        title: `${season.name} is over`,
        body: `You finished #${index + 1} with ${Math.round(row.points * 10) / 10} points.`,
        data: { path: '/leaderboard' },
      })),
    );
  }
}

export async function sendSessionReminders(env: Bindings, now: number): Promise<void> {
  const db = env.DB;
  const claimed = await db
    .prepare('UPDATE sessions SET reminded = 1 WHERE remind = 1 AND reminded = 0 AND start_at > ?1 AND start_at <= ?1 + ? RETURNING id, title, room')
    .bind(now, SESSION_REMINDER)
    .all<{ id: number; title: string; room: string | null }>();
  for (const session of claimed.results) {
    const { results } = await db
      .prepare('SELECT u.id FROM users u WHERE u.active = 1 AND (NOT EXISTS (SELECT 1 FROM session_batches b WHERE b.session_id = ?1) OR u.batch_year IN (SELECT batch_year FROM session_batches WHERE session_id = ?1))')
      .bind(session.id)
      .all<{ id: number }>();
    await pushUsers(env, 'session', results.map((u) => ({ userId: u.id, title: session.title, body: `Starts in 1 hour${session.room ? ` in ${session.room}` : ''}.` })));
  }
}

// The nightly jobs each take their own minute, and runCron skips the Codeforces queue in those minutes, so their CPU doesn't add to it.
export async function runAdminJobs(env: Bindings, now: number): Promise<void> {
  const db = env.DB;
  const minute = istMinute(now);
  await sendSessionReminders(env, now);
  if (minute === 0) await freezeSeasons(env, now);
  if (![AT_RISK_MINUTE, FAIRNESS_MINUTE, STATS_MINUTE, MOM_MINUTE].includes(minute)) return;
  const settings = await getSettings(db, now);
  if (minute === AT_RISK_MINUTE) await buildAtRisk(db, settings, now).run();
  if (minute === FAIRNESS_MINUTE) await db.batch(fairnessChecks(db, settings, now));
  if (minute === STATS_MINUTE) await db.batch(buildStats(db, now));
  if (minute === MOM_MINUTE && istDateOfMonth(now) === 1) await draftMemberOfMonth(db, settings, now);
}
