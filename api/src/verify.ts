import type { Bindings } from './auth';
import { dispatchWorkflow } from './cron';
import { fetchUserStatus } from './cf';
import { getSettings } from './settings';

export class VerifyError extends Error {}

// Handles on these platforms count as soon as they are linked; the rest must be verified.
export const AUTO_VERIFIED = ['atcoder', 'leetcode'];
const VERIFIED_BY_SUBMISSION = ['cf', 'cc'];
const RECENT_CF_SUBMISSIONS = 20;
// CodeChef shows submission times to the minute.
const CC_TIME_SLACK = 60;

// A verified handle counts from now on; its history is imported by the backfill job.
export async function approveHandle(env: Bindings, userId: number, platform: string): Promise<void> {
  const row = await env.DB.prepare(
    `UPDATE handles SET status = 'approved', approved_at = unixepoch(), synced_at = NULL, verify_problem = NULL, verify_started_at = NULL
     WHERE user_id = ? AND platform = ? AND status = 'waiting' RETURNING handle`,
  )
    .bind(userId, platform)
    .first<{ handle: string }>();
  if (row) await dispatchWorkflow(env, 'backfill.yml', { platform, handle: row.handle }).catch((err) => console.error('Backfill dispatch failed:', err));
}

type Challenge = { handle: string; status: string; problem: string | null; startedAt: number | null };

async function challengeOf(env: Bindings, userId: number, platform: string): Promise<Challenge> {
  if (!VERIFIED_BY_SUBMISSION.includes(platform)) throw new VerifyError('This platform needs no verification');
  const row = await env.DB.prepare('SELECT handle, status, verify_problem AS problem, verify_started_at AS startedAt FROM handles WHERE user_id = ? AND platform = ?')
    .bind(userId, platform)
    .first<Challenge>();
  if (!row) throw new VerifyError('Link a handle first');
  if (row.status === 'rejected') throw new VerifyError('A coordinator rejected this handle. Contact an admin.');
  return row;
}

// Gives the member a random problem to fail on purpose within the window: a compilation error on Codeforces, a wrong answer on CodeChef.
export async function startVerify(env: Bindings, userId: number, platform: string): Promise<void> {
  const row = await challengeOf(env, userId, platform);
  if (row.status === 'approved') return;
  const problem = await env.DB.prepare(`SELECT problem_id AS id FROM problems WHERE platform = ? AND url IS NOT NULL ${platform === 'cf' ? 'AND rating = 800' : ''} ORDER BY random() LIMIT 1`)
    .bind(platform)
    .first<{ id: string }>();
  if (!problem) throw new VerifyError('No problems to pick from yet. Try again later.');
  await env.DB.prepare('UPDATE handles SET verify_problem = ?, verify_started_at = unixepoch() WHERE user_id = ? AND platform = ?').bind(problem.id, userId, platform).run();
}

const inWindow = (at: number, startedAt: number, minutes: number, slack = 0) => at >= startedAt - slack && at <= startedAt + minutes * 60 + slack;

// Codeforces answers straight away. CodeChef blocks Cloudflare, so a GitHub job reads its recent submissions and posts them to /ingest/verify.
export async function verifyHandle(env: Bindings, userId: number, platform: string): Promise<'verified' | 'checking'> {
  const row = await challengeOf(env, userId, platform);
  if (row.status === 'approved') return 'verified';
  if (!row.problem || !row.startedAt) throw new VerifyError('Start verification first');
  if (platform === 'cc') {
    await dispatchWorkflow(env, 'verify-handle.yml', { handle: row.handle });
    return 'checking';
  }
  const { verify_minutes: minutes } = await getSettings(env.DB);
  const submissions = await fetchUserStatus(row.handle, RECENT_CF_SUBMISSIONS).catch(() => {
    throw new VerifyError("Codeforces can't find that handle. Check the spelling.");
  });
  const found = submissions.some(
    (s) => s.verdict === 'COMPILATION_ERROR' && `${s.problem.contestId}${s.problem.index}` === row.problem && inWindow(s.creationTimeSeconds, row.startedAt!, minutes),
  );
  if (!found) throw new VerifyError(`No compilation error on ${row.problem} within ${minutes} minutes of starting. Submit one, or start again for a new problem.`);
  await approveHandle(env, userId, platform);
  return 'verified';
}

export async function finishCcVerify(env: Bindings, handle: string, wrongAnswers: { problemCode: string; at: number }[]): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT user_id AS userId, verify_problem AS problem, verify_started_at AS startedAt FROM handles
     WHERE platform = 'cc' AND lower(handle) = lower(?) AND status = 'waiting' AND verify_started_at IS NOT NULL`,
  )
    .bind(handle)
    .first<{ userId: number; problem: string; startedAt: number }>();
  if (!row) return false;
  const { verify_minutes: minutes } = await getSettings(env.DB);
  if (!wrongAnswers.some((s) => s.problemCode === row.problem && inWindow(s.at, row.startedAt, minutes, CC_TIME_SLACK))) return false;
  await approveHandle(env, row.userId, 'cc');
  return true;
}
