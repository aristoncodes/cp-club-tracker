import type { IngestSolve } from 'shared/types';
import * as atcoder from './adapters/atcoder';
import * as cc from './adapters/cc';
import * as leetcode from './adapters/leetcode';
import { getHandles, postIngest } from './lib';

// Codeforces is read by the Worker every minute, so this job covers the other platforms, one per matrix job.
const RECENT_SECONDS = 48 * 3600;
const now = Math.floor(Date.now() / 1000);
const since = now - RECENT_SECONDS;
const { PLATFORM: platform } = process.env;

let atcoderResources: atcoder.Resources | undefined;
const fetchers: Record<string, (handle: string) => Promise<IngestSolve[]>> = {
  cc: (handle) => cc.fetchSolves(handle, now, since),
  leetcode: (handle) => leetcode.fetchSolves(handle, since),
  atcoder: async (handle) => {
    atcoderResources ??= await atcoder.fetchResources();
    return atcoder.fetchSolves(handle, since, atcoderResources);
  },
};
const fetchSolves = platform && fetchers[platform];
if (!fetchSolves) throw new Error('PLATFORM must be cc, leetcode or atcoder');

// A handle that fails stays due, so the next run tries it again.
const synced: string[] = [];
for (const handle of await getHandles(platform, true)) {
  try {
    const solves = await fetchSolves(handle);
    if (solves.length) await postIngest('/solves', solves);
    synced.push(handle);
  } catch (err) {
    console.error(`${platform} failed for ${handle}:`, err);
    process.exitCode = 1;
  }
}
if (synced.length) await postIngest('/synced', { platform, handles: synced });
console.log(`${platform}: ${synced.length} handles synced`);
