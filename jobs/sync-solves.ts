import { cfSolves } from 'shared/cf';
import type { IngestSolve } from 'shared/types';
import * as atcoder from './adapters/atcoder';
import * as cc from './adapters/cc';
import * as cf from './adapters/cf';
import * as leetcode from './adapters/leetcode';
import { getHandles, postIngest } from './lib';

const RECENT_SECONDS = 48 * 3600;
const now = Math.floor(Date.now() / 1000);
const since = now - RECENT_SECONDS;

async function syncPlatform(platform: string, fetchSolves: (handle: string) => Promise<IngestSolve[]>): Promise<void> {
  try {
    for (const handle of await getHandles(platform)) {
      try {
        const solves = await fetchSolves(handle);
        if (solves.length) await postIngest('/solves', solves);
      } catch (err) {
        console.error(`${platform} failed for ${handle}:`, err);
        process.exitCode = 1;
      }
    }
  } catch (err) {
    console.error(`${platform} adapter failed:`, err);
    process.exitCode = 1;
  }
}

await syncPlatform('cf', async (handle) => cfSolves(handle, cf.parseSubmissions(await cf.fetchUserStatus(handle))));
await syncPlatform('cc', (handle) => cc.fetchSolves(handle, now, since));
await syncPlatform('leetcode', (handle) => leetcode.fetchSolves(handle, since));

let atcoderResources: atcoder.Resources | undefined;
await syncPlatform('atcoder', async (handle) => {
  atcoderResources ??= await atcoder.fetchResources();
  return atcoder.fetchSolves(handle, since, atcoderResources);
});
