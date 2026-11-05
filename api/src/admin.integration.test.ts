import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Runs the real Worker on a real local D1 in a throwaway folder. Handles are marked broken so nothing reaches Codeforces, and no push tokens exist.
const SECRET = 'integration-test-secret';
const INGEST = 'integration-test-ingest';
const PORT = 8700 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const DAY = 86400;
const IST = 19800;
const NOW = Math.floor(Date.now() / 1000);
const TODAY_START = Math.floor((NOW + IST) / DAY) * DAY - IST;
const ADMIN = 1;
const OWNER = 2;
const ANA = 3;
const BEN = 4;
const CAL = 5;
const BATCH = 2024;
const OTHER_BATCH = 2025;

let dir: string;
let worker: ChildProcess;

function wrangler(args: string[]): void {
  execFileSync('pnpm', ['exec', 'wrangler', ...args, '--persist-to', dir], { cwd: process.cwd(), stdio: 'ignore', env: { ...process.env, CI: '1' } });
}

const sql = (command: string) => wrangler(['d1', 'execute', 'cp-tracker', '--local', '--command', command]);

function query<T>(command: string): T[] {
  const out = execFileSync('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'cp-tracker', '--local', '--json', '--persist-to', dir, '--command', command], { cwd: process.cwd(), env: { ...process.env, CI: '1' } }).toString();
  return (JSON.parse(out.slice(out.indexOf('['))) as { results: T[] }[])[0].results;
}

async function call(user: number, path: string, method = 'GET', body?: unknown) {
  const token = await new SignJWT({ role: 'x' }).setProtectedHeader({ alg: 'HS256' }).setSubject(String(user)).setExpirationTime('1h').sign(new TextEncoder().encode(SECRET));
  const response = await fetch(`${BASE}/api${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: response.status, json };
}

async function ingest(path: string, body: unknown) {
  const response = await fetch(`${BASE}/api/ingest${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Ingest-Secret': INGEST }, body: JSON.stringify(body) });
  return response.status;
}

const tick = (at: number) => fetch(`${BASE}/cdn-cgi/handler/scheduled?time=${at * 1000}`);

async function until(check: () => Promise<boolean> | boolean, what: string): Promise<void> {
  for (let i = 0; i < 60; i += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

const solve = (handle: string, problemId: string, solvedAt: number, rating = 1000) => ({ platform: 'cf', handle, problemId, name: problemId, rating, tags: ['dp'], url: 'https://codeforces.com', solvedAt, live: false });
const auditCount = () => query<{ n: number }>('SELECT COUNT(*) AS n FROM audit_log')[0].n;
const dayPoints = async (user: number) => ((await call(user, `/users/${user}`)).json.stats.dayPoints as number);
const istMinuteAt = (minute: number, days = 0) => TODAY_START + days * DAY + minute * 60;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'admin-test-'));
  wrangler(['d1', 'migrations', 'apply', 'cp-tracker', '--local']);
  const seed = join(dir, 'seed.sql');
  writeFileSync(
    seed,
    `INSERT INTO users (id, email, name, username, batch_year, role, cf_rating, onboarding_step, created_at) VALUES
      (${ADMIN}, 'admin@test.dev', 'Ada Admin', 'ada', ${BATCH}, 'admin', 1500, 'done', 1),
      (${OWNER}, 'owner@test.dev', 'Omar Owner', 'omar', ${BATCH}, 'admin', 1500, 'done', 1),
      (${ANA}, 'ana@test.dev', 'Ana', 'ana', ${BATCH}, 'student', 1200, 'done', 1),
      (${BEN}, 'ben@test.dev', 'Ben', 'ben', ${OTHER_BATCH}, 'student', 1200, 'done', 1),
      (${CAL}, 'cal@test.dev', 'Cal', 'cal', ${BATCH}, 'student', 1200, 'done', 1);
     INSERT INTO handles (user_id, platform, handle, approved_at, status, broken) VALUES
      (${ADMIN}, 'cf', 'h_ada', 1, 'approved', 1), (${ANA}, 'cf', 'h_ana', 1, 'approved', 1), (${BEN}, 'cf', 'h_ben', 1, 'approved', 1), (${CAL}, 'cf', 'h_cal', NULL, 'waiting', 1);
     INSERT INTO contests (id, platform, external_id, name, url, start_at, end_at, counts, stage, source, mandatory) VALUES
      (1, 'cf', '901', 'Round A (Div. 2)', 'u', ${NOW - 20 * DAY}, ${NOW - 20 * DAY + 7200}, 1, 3, 'cf', 0),
      (2, 'cf', '902', 'Round B (Div. 2)', 'u', ${NOW - 10 * DAY}, ${NOW - 10 * DAY + 7200}, 1, 3, 'cf', 0),
      (3, 'cf', '903', 'Round C (Div. 2)', 'u', ${NOW - 5 * DAY}, ${NOW - 5 * DAY + 7200}, 0, 3, 'cf', 0),
      (4, 'cf', '904', 'Must Round (Div. 2)', 'u', ${NOW + 2 * 3600}, ${NOW + 4 * 3600}, 1, 0, 'cf', 1);`,
  );
  wrangler(['d1', 'execute', 'cp-tracker', '--local', '--file', seed]);
  worker = spawn(
    'pnpm',
    ['exec', 'wrangler', 'dev', '--local', '--test-scheduled', '--port', String(PORT), '--persist-to', dir, '--var', `SESSION_SECRET:${SECRET}`, '--var', `INGEST_SECRET:${INGEST}`, '--var', 'ADMIN_EMAILS:owner@test.dev', '--var', 'GITHUB_TOKEN:none', '--var', 'GITHUB_REPO:none/none'],
    { cwd: process.cwd(), stdio: 'ignore', detached: true, env: { ...process.env, CI: '1' } },
  );
  await until(async () => {
    try {
      return (await fetch(`${BASE}/api/health`)).ok;
    } catch {
      return false;
    }
  }, 'the worker');
}, 180_000);

afterAll(() => {
  if (worker?.pid) process.kill(-worker.pid);
  rmSync(dir, { recursive: true, force: true });
});

describe('admin', { timeout: 120_000 }, () => {
  it('1. a handle that is not approved never counts, and removing approval stops new solves', async () => {
    await ingest('/solves', [solve('h_cal', '1A', NOW - 60)]);
    expect(await dayPoints(CAL)).toBe(0);
    expect((await call(ADMIN, `/admin/handles/${CAL}/cf`, 'PATCH', { status: 'rejected' })).status).toBe(200);
    await ingest('/solves', [solve('h_cal', '1B', NOW - 50)]);
    expect(await dayPoints(CAL)).toBe(0);
    expect(query<{ n: number }>(`SELECT COUNT(*) AS n FROM solves WHERE user_id = ${CAL}`)[0].n).toBe(0);
    await call(ADMIN, `/admin/handles/${CAL}/cf`, 'PATCH', { status: 'approved' });
    await ingest('/solves', [solve('h_cal', '1C', Math.floor(Date.now() / 1000) + 2)]);
    const earned = await dayPoints(CAL);
    expect(earned).toBeGreaterThan(0);
    await call(ADMIN, `/admin/handles/${CAL}/cf`, 'PATCH', { status: 'waiting' });
    await ingest('/solves', [solve('h_cal', '1D', Math.floor(Date.now() / 1000) + 3)]);
    expect(await dayPoints(CAL)).toBe(earned);
  });

  it('2. admin endpoints refuse students, and each write adds its audit row', async () => {
    const routes: [string, string][] = [
      ['GET', '/admin/badges'], ['GET', '/admin/overview'], ['GET', '/admin/members'], ['GET', '/admin/students'], ['GET', '/admin/audit'], ['GET', '/admin/at-risk'],
      ['GET', '/admin/attendance'], ['GET', '/admin/exam-weeks'], ['GET', '/admin/contests'], ['GET', '/admin/sessions'], ['GET', '/admin/engagement'], ['GET', '/admin/fairness'],
      ['GET', '/admin/seasons'], ['GET', '/admin/reports'], ['GET', '/admin/reports.csv'], ['GET', '/admin/rules'], ['GET', '/admin/digest'], ['GET', '/admin/announcements'],
      ['POST', '/admin/handles/approve-all'], ['PUT', '/admin/rules'], ['POST', '/admin/seasons'], ['POST', '/admin/sessions'], ['POST', '/admin/exam-weeks'], ['POST', '/admin/contests'], ['POST', '/admin/virtuals'],
    ];
    for (const [method, path] of routes) expect([path, (await call(ANA, path, method, method === 'GET' ? undefined : {})).status]).toEqual([path, 403]);

    const writes: [string, string, unknown][] = [
      ['PUT', `/admin/members/${ANA}/notes`, { text: 'Doing fine' }],
      ['PATCH', `/admin/users/${BEN}`, { username: 'benny' }],
      ['PATCH', '/admin/contests/4', { mandatory: true, counts: true }],
      ['POST', '/admin/sessions', { title: 'Graphs', startAt: NOW + DAY, batches: [BATCH] }],
      ['POST', '/admin/seasons', { name: 'Audit season', startAt: NOW - DAY, endAt: NOW + 30 * DAY }],
      ['POST', '/admin/announcements', { title: 'Hi', body: 'There', audience: 'all' }],
    ];
    for (const [method, path, body] of writes) {
      const before = auditCount();
      expect([path, (await call(ADMIN, path, method, body)).status]).toEqual([path, 200]);
      expect([path, auditCount() - before]).toEqual([path, 1]);
    }
    expect((await call(ANA, `/users/${ANA}`)).json).not.toHaveProperty('notes');
  });

  it('3. a manual attendance edit survives the automatic run', async () => {
    expect((await call(ADMIN, `/admin/attendance/1/${ANA}`, 'PATCH', { status: 'present', note: 'Laptop died, checked with them' })).status).toBe(200);
    expect(await ingest('/participation', { platform: 'cf', externalId: '901', presentHandles: ['h_ben'] })).toBe(200);
    const rows = query<{ user_id: number; status: string; note: string | null }>('SELECT user_id, status, note FROM attendance WHERE contest_id = 1');
    expect(rows.find((r) => r.user_id === ANA)).toMatchObject({ status: 'present', note: 'Laptop died, checked with them' });
    expect(rows.find((r) => r.user_id === BEN)?.status).toBe('present');
    expect(rows.find((r) => r.user_id === ADMIN)?.status).toBe('absent');
  });

  it('4. an exam week excuses entries, mutes its members, and deleting it reverts only automatic ones', async () => {
    expect(await ingest('/participation', { platform: 'cf', externalId: '902', presentHandles: [] })).toBe(200);
    await call(ADMIN, `/admin/attendance/2/${CAL}`, 'PATCH', { status: 'absent', note: 'By hand' });
    const week = { name: 'Mid-sems', from: NOW - 11 * DAY, to: NOW + DAY, batches: [BATCH] };
    const preview = (await call(ADMIN, '/admin/exam-weeks/preview', 'POST', week)).json;
    expect(preview.contests).toBeGreaterThan(0);
    const { json } = await call(ADMIN, '/admin/exam-weeks', 'POST', week);
    const statuses = () => Object.fromEntries(query<{ user_id: number; status: string }>('SELECT user_id, status FROM attendance WHERE contest_id = 2').map((r) => [r.user_id, r.status]));
    expect(statuses()[ANA]).toBe('excused');
    expect(statuses()[CAL]).toBe('absent');
    expect(statuses()[BEN]).toBe('absent');
    const { inExamWeek } = await import('./admin-jobs');
    expect(query<{ batch_year: number }>(inExamWeek('excuse', NOW)).map((r) => r.batch_year)).toEqual([BATCH]);
    expect(query<{ batch_year: number }>(inExamWeek('excuse', NOW + 5 * DAY))).toEqual([]);
    expect((await call(ADMIN, `/admin/exam-weeks/${json.id}`, 'DELETE')).status).toBe(200);
    expect(statuses()[ANA]).toBe('absent');
    expect(query<{ note: string }>(`SELECT note FROM attendance WHERE contest_id = 2 AND user_id = ${CAL}`)[0].note).toBe('By hand');
  });

  it('5. a mandatory contest gets its T-3h reminder once, and Counts off is ignored for attendance', async () => {
    await tick(istMinuteAt(600, 40));
    await tick(NOW + 60);
    await until(() => query<{ r: number }>('SELECT mandatory_reminded AS r FROM contests WHERE id = 4')[0].r === 1, 'the reminder');
    sql(`INSERT INTO attendance (contest_id, user_id, status) VALUES (3, ${BEN}, 'absent')`);
    const before = (await call(ADMIN, '/admin/members')).json.find((m: { id: number }) => m.id === BEN);
    sql(`UPDATE contests SET counts = 1 WHERE id = 3`);
    const after = (await call(ADMIN, '/admin/members')).json.find((m: { id: number }) => m.id === BEN);
    expect(after.total).toBe(before.total + 1);
    sql(`UPDATE contests SET counts = 0 WHERE id = 3`);
  });

  it('6. at-risk flags follow the rules, the nudge limit holds, and a snoozed member stays hidden', async () => {
    await ingest('/solves', [solve('h_ben', '6A', NOW - 40)]);
    sql(`INSERT INTO solves (user_id, platform, problem_id, solved_at, rp, points) VALUES (${ANA}, 'cf', '6B', ${NOW - 8 * DAY}, 1000, 5)`);
    await tick(istMinuteAt(60));
    await until(() => query('SELECT 1 FROM at_risk').length > 0, 'the at-risk job');
    const risk = (await call(ADMIN, '/admin/at-risk')).json;
    const ana = risk.members.find((m: { userId: number }) => m.userId === ANA);
    expect(ana.signals.noSolveDays).toBeGreaterThanOrEqual(7);
    expect(risk.members.some((m: { userId: number; signals: { noSolveDays: number } }) => m.userId === BEN && m.signals.noSolveDays >= 7)).toBe(false);
    expect((await call(ADMIN, `/admin/at-risk/${ANA}/nudge`, 'POST', { body: 'Hey {name}' })).status).toBe(200);
    expect(query<{ body: string }>(`SELECT body FROM nudges WHERE user_id = ${ANA}`)[0].body).toBe('Hey Ana');
    expect((await call(ADMIN, `/admin/at-risk/${ANA}/nudge`, 'POST', { body: 'Again' })).status).toBe(409);
    expect((await call(ADMIN, `/admin/at-risk/${ANA}/snooze`, 'POST')).status).toBe(200);
    expect((await call(ADMIN, '/admin/at-risk')).json.members.some((m: { userId: number }) => m.userId === ANA)).toBe(false);
    sql(`UPDATE at_risk SET snoozed_until = ${NOW - 1} WHERE user_id = ${ANA}`);
    expect((await call(ADMIN, '/admin/at-risk')).json.members.some((m: { userId: number }) => m.userId === ANA)).toBe(true);
  });

  it('7. voiding removes points from every board, and undo restores them exactly', async () => {
    const values = Array.from({ length: 31 }, (_, i) => `(${BEN}, 'cf', 'V${i}', ${NOW - 100 - i}, 1000, 7.3)`).join(',');
    sql(`INSERT INTO solves (user_id, platform, problem_id, solved_at, rp, points) VALUES ${values}`);
    const board = async () => (await call(ANA, '/leaderboard?period=day')).json.find((r: { userId: number }) => r.userId === BEN)?.points as number;
    const before = await board();
    await tick(istMinuteAt(61, 1));
    await until(() => query(`SELECT 1 FROM fairness_flags WHERE user_id = ${BEN} AND rule = 'max_solves'`).length > 0, 'the fairness job');
    const flag = (await call(ADMIN, '/admin/fairness')).json.open.find((f: { userId: number; rule: string }) => f.userId === BEN && f.rule === 'max_solves');
    expect((await call(ADMIN, `/admin/fairness/${flag.id}/void`, 'POST', {})).status).toBe(400);
    expect((await call(ADMIN, `/admin/fairness/${flag.id}/void`, 'POST', { reason: 'Same code as a friend' })).status).toBe(200);
    const voided = await board();
    expect(voided ?? 0).toBeLessThan(before);
    const season = (await call(ADMIN, '/admin/seasons')).json.live.board.find((r: { userId: number }) => r.userId === BEN);
    expect(season?.points ?? 0).toBeCloseTo(voided ?? 0, 1);
    expect((await call(BEN, '/me/point-notices')).json[0].reason).toBe('Same code as a friend');
    const history = (await call(ADMIN, '/admin/fairness')).json.history[0];
    expect((await call(ADMIN, `/admin/fairness/adjustments/${history.id}/undo`, 'POST')).status).toBe(200);
    expect(await board()).toBe(before);
    const adjust = (await call(ADMIN, `/admin/fairness/${flag.id}/adjust`, 'POST', { points: -10, reason: 'Partly' }));
    expect(adjust.status).toBe(200);
    expect(await board()).toBeCloseTo(before - 10, 1);
    const adjusted = (await call(ADMIN, '/admin/fairness')).json.history[0];
    await call(ADMIN, `/admin/fairness/adjustments/${adjusted.id}/undo`, 'POST');
    expect(await board()).toBe(before);
  });

  it('8. a Rules change applies the next day, and today keeps the old value', async () => {
    const before = auditCount();
    expect((await call(ADMIN, '/admin/rules', 'PUT', { values: { live_multiplier: 2, risk_absences: 5 } })).status).toBe(200);
    expect(auditCount() - before).toBe(2);
    const rule = (await call(ADMIN, '/admin/rules')).json.rules.find((r: { key: string }) => r.key === 'live_multiplier');
    expect(rule.current).toBe(1.5);
    expect(rule.pendingValue).toBe(2);
    expect(rule.pendingFrom).toBe(TODAY_START + DAY);
    await ingest('/solves', [{ ...solve('h_ana', '8A', NOW - 5, 1200), live: true }]);
    expect(query<{ points: number }>(`SELECT points FROM solves WHERE problem_id = '8A'`)[0].points).toBe(21.6);
    const { effectiveValue } = await import('shared/settings');
    expect(effectiveValue({ key: 'live_multiplier', value: rule.value, pendingValue: rule.pendingValue, pendingFrom: rule.pendingFrom }, TODAY_START + DAY)).toBe(2);
    expect((await call(ADMIN, '/admin/rules', 'PUT', { values: { live_multiplier: -1 } })).status).toBe(400);
    expect((await call(ADMIN, '/admin/rules', 'PUT', { values: { nope: 1 } })).status).toBe(400);
  });

  it('9. you cannot remove yourself, the last admin or an owner', async () => {
    expect((await call(ADMIN, `/admin/users/${ADMIN}`, 'PATCH', { role: 'student' })).status).toBe(400);
    expect((await call(ADMIN, `/admin/users/${OWNER}`, 'PATCH', { role: 'student' })).status).toBe(400);
    sql(`UPDATE users SET role = 'student' WHERE id = ${OWNER}`);
    expect((await call(OWNER, `/admin/users/${ADMIN}`, 'PATCH', { role: 'student' })).status).toBe(403);
    sql(`UPDATE users SET role = 'admin', email = 'other@test.dev' WHERE id = ${OWNER}`);
    sql(`UPDATE users SET active = 0 WHERE id = ${OWNER}`);
    expect((await call(ADMIN, `/admin/users/${OWNER}`, 'PATCH', { role: 'student' })).status).toBe(400);
    sql(`UPDATE users SET active = 1, email = 'owner@test.dev' WHERE id = ${OWNER}`);
    expect((await call(ADMIN, '/admin/admins', 'POST', { email: 'nobody@test.dev' })).status).toBe(404);
  });

  it('10. the nightly jobs run on 50 members and 90 days of solves', async () => {
    const lines: string[] = [];
    const users = Array.from({ length: 50 }, (_, i) => 100 + i);
    lines.push(`INSERT INTO users (id, email, name, username, batch_year, cf_rating, onboarding_step, created_at) VALUES ${users.map((id) => `(${id}, 'm${id}@test.dev', 'Member ${id}', 'm${id}', ${BATCH + (id % 3)}, 1200, 'done', 1)`).join(',')};`);
    lines.push(`INSERT INTO handles (user_id, platform, handle, approved_at, status, broken) VALUES ${users.map((id) => `(${id}, 'cf', 'h${id}', 1, 'approved', 1)`).join(',')};`);
    const rows: string[] = [];
    for (const id of users) for (let day = 0; day < 90; day += 2) rows.push(`(${id}, 'cf', 'S${day}', ${NOW - day * DAY}, 1200, 5)`);
    for (let i = 0; i < rows.length; i += 400) lines.push(`INSERT INTO solves (user_id, platform, problem_id, solved_at, rp, points) VALUES ${rows.slice(i, i + 400).join(',')};`);
    const file = join(dir, 'scale.sql');
    writeFileSync(file, lines.join('\n'));
    wrangler(['d1', 'execute', 'cp-tracker', '--local', '--file', file]);
    sql('DELETE FROM at_risk; DELETE FROM stats_daily');
    await tick(istMinuteAt(60, 2));
    await until(() => query<{ n: number }>('SELECT COUNT(*) AS n FROM at_risk')[0].n >= 50, 'at-risk at scale');
    await tick(istMinuteAt(61, 2));
    await tick(istMinuteAt(62, 2));
    await until(() => query<{ n: number }>(`SELECT COUNT(*) AS n FROM stats_daily WHERE key = 'members' AND batch_year = -1`)[0].n === 1, 'stats at scale');
    const engagement = (await call(ADMIN, '/admin/engagement')).json;
    expect(engagement.kpis.members).toBeGreaterThanOrEqual(50);
    expect(engagement.weeks).toHaveLength(10);
  });
});
