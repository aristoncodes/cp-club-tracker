import type { HealthReport } from 'shared/types';

const USER_AGENT = 'cp-club-tracker/1.0 (college competitive programming club attendance tracker)';
const lastCall = new Map<string, number>();

export async function politeFetch(url: string, gapMs = 1000, init: RequestInit = {}): Promise<Response> {
  const host = new URL(url).host;
  const wait = (lastCall.get(host) ?? 0) + gapMs - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCall.set(host, Date.now());
  return fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...init.headers } });
}

function ingestUrl(path: string): string {
  return `${process.env.API_URL}/api/ingest${path}`;
}

const secretHeader = () => ({ 'X-Ingest-Secret': process.env.INGEST_SECRET ?? '' });

export async function postIngest(path: string, body: unknown): Promise<void> {
  const response = await fetch(ingestUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...secretHeader() },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Ingest ${path} returned ${response.status}: ${await response.text()}`);
}

export async function getHandles(platform: string): Promise<string[]> {
  const response = await fetch(ingestUrl(`/handles?platform=${platform}`), { headers: secretHeader() });
  if (!response.ok) throw new Error(`Handles for ${platform} returned ${response.status}`);
  return response.json() as Promise<string[]>;
}

export async function getHistoryMissing(): Promise<string[]> {
  const response = await fetch(ingestUrl('/history-missing'), { headers: secretHeader() });
  if (!response.ok) throw new Error(`History list returned ${response.status}`);
  return response.json() as Promise<string[]>;
}

export async function getHealth(): Promise<HealthReport> {
  const response = await fetch(ingestUrl('/health'), { headers: secretHeader() });
  if (!response.ok) throw new Error(`Health returned ${response.status}`);
  return response.json() as Promise<HealthReport>;
}

export type WorkflowRun = { createdAt: number; conclusion: string | null };

const HOUR = 3600;
const DAY = 24 * HOUR;
const CF_FETCH_LIMIT = 30 * 60;
const SOLVE_SILENCE_LIMIT = 14 * DAY;
const SOLVE_SILENCE_MIN_HANDLES = 5;
const JOB_LIMITS: Record<string, number> = { 'sync-solves': 30 * 60, 'sync-contests': 13 * HOUR, 'sync-problemset': 26 * HOUR };

function workflowProblems(name: string, runs: WorkflowRun[], now: number): string[] {
  const limit = JOB_LIMITS[name];
  const problems: string[] = [];
  if (limit && (!runs[0] || now - runs[0].createdAt > limit)) problems.push(`${name} has not run in over ${Math.round(limit / 60)} min`);
  const finished = runs.filter((run) => run.conclusion && run.conclusion !== 'cancelled' && now - run.createdAt < DAY);
  const failures = finished.filter((run) => run.conclusion !== 'success').length;
  if (failures && failures * 2 >= finished.length) problems.push(`${name} is failing: ${failures} of its last ${finished.length} runs`);
  return problems;
}

export function healthProblems(report: HealthReport, runs: Record<string, WorkflowRun[]>, now: number): string[] {
  const problems: string[] = [];
  if (report.cfHandles && now - (report.oldestCfSync ?? 0) > CF_FETCH_LIMIT) problems.push('Codeforces fetch has not reached every handle in over 30 min');
  for (const { platform, approvedHandles, lastSolve } of report.platforms) {
    if (approvedHandles >= SOLVE_SILENCE_MIN_HANDLES && now - (lastSolve ?? 0) > SOLVE_SILENCE_LIMIT) problems.push(`No ${platform} solves in over 14 days`);
  }
  for (const platform of ['cf', 'cc']) {
    const latest = report.latestContests.find((contest) => contest.platform === platform);
    if (!latest || latest.startAt < now) problems.push(`${platform} has no upcoming contests imported`);
  }
  if (report.stuckContests.length) problems.push(`Attendance not finished for: ${report.stuckContests.join(', ')}`);
  if (report.pushErrors.length) problems.push(`Push notifications are failing: ${report.pushErrors.join(', ')}`);
  if (report.potdPicks === 0) problems.push('No problem of the day was picked today');
  if (report.brokenHandles.length) problems.push(`Broken handles: ${report.brokenHandles.join(', ')}`);
  for (const [name, list] of Object.entries(runs)) problems.push(...workflowProblems(name, list, now));
  return problems;
}
