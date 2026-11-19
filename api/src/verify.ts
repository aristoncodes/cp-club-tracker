import type { Bindings } from './auth';
import { dispatchWorkflow } from './cron';
import { fetchUserInfo } from './cf';

export class VerifyError extends Error {}

// Handles on these platforms count as soon as they are linked; the rest must be verified.
export const AUTO_VERIFIED = ['atcoder', 'leetcode'];

export const NEW_CODE_SQL = `'oops-' || lower(hex(randomblob(3)))`;

// A verified handle counts from now on; its history is imported by the backfill job.
export async function approveHandle(env: Bindings, userId: number, platform: string): Promise<void> {
  const row = await env.DB.prepare(
    `UPDATE handles SET status = 'approved', approved_at = unixepoch(), synced_at = NULL
     WHERE user_id = ? AND platform = ? AND status = 'waiting' RETURNING handle`,
  )
    .bind(userId, platform)
    .first<{ handle: string }>();
  if (row) await dispatchWorkflow(env, 'backfill.yml', { platform, handle: row.handle }).catch((err) => console.error('Backfill dispatch failed:', err));
}

const hasCode = (code: string, ...fields: (string | undefined)[]) => fields.some((field) => field?.toLowerCase().includes(code));

// Codeforces answers straight away. CodeChef blocks Cloudflare, so a GitHub job reads the profile and posts it to /ingest/verify.
export async function verifyHandle(env: Bindings, userId: number, platform: string): Promise<'verified' | 'checking'> {
  const row = await env.DB.prepare('SELECT handle, verify_code AS code, status FROM handles WHERE user_id = ? AND platform = ?')
    .bind(userId, platform)
    .first<{ handle: string; code: string; status: string }>();
  if (!row) throw new VerifyError('Link a handle first');
  if (row.status === 'approved') return 'verified';
  if (row.status === 'rejected') throw new VerifyError('A coordinator rejected this handle. Contact an admin.');
  if (platform === 'cc') {
    await dispatchWorkflow(env, 'verify-handle.yml', { handle: row.handle });
    return 'checking';
  }
  const [info] = await fetchUserInfo([row.handle]).catch(() => {
    throw new VerifyError('Codeforces can\'t find that handle. Check the spelling.');
  });
  if (!hasCode(row.code, info?.firstName, info?.lastName, info?.organization)) {
    throw new VerifyError(`Put ${row.code} in your Codeforces first name, save it, then verify again.`);
  }
  await approveHandle(env, userId, platform);
  return 'verified';
}

export async function finishCcVerify(env: Bindings, handle: string, name: string): Promise<boolean> {
  const row = await env.DB.prepare(`SELECT user_id AS userId, verify_code AS code FROM handles WHERE platform = 'cc' AND lower(handle) = lower(?) AND status = 'waiting'`)
    .bind(handle)
    .first<{ userId: number; code: string }>();
  if (!row || !hasCode(row.code, name)) return false;
  await approveHandle(env, row.userId, 'cc');
  return true;
}
