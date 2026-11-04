import { cfSolves } from 'shared/cf';
import type { IngestSolve } from 'shared/types';
import * as atcoder from './adapters/atcoder';
import * as cc from './adapters/cc';
import * as cf from './adapters/cf';
import * as leetcode from './adapters/leetcode';
import { postIngest } from './lib';

const HISTORY_SECONDS = 183 * 86400;
const CHUNK = 50;

const { PLATFORM: platform, HANDLE: handle } = process.env;
if (!handle || !platform) throw new Error('PLATFORM and HANDLE are required');

const now = Math.floor(Date.now() / 1000);
const since = now - HISTORY_SECONDS;

async function fetchHistory(handle: string): Promise<IngestSolve[]> {
  if (platform === 'cf') return cfSolves(handle, cf.parseSubmissions(await cf.fetchAllSubmissions(handle))).filter((s) => s.solvedAt >= since);
  if (platform === 'cc') return cc.fetchSolves(handle, now, since);
  if (platform === 'leetcode') return leetcode.fetchSolves(handle, since);
  if (platform === 'atcoder') return atcoder.fetchSolves(handle, since, await atcoder.fetchResources());
  throw new Error(`Unknown platform ${platform}`);
}

const solves = await fetchHistory(handle);
for (let i = 0; i < solves.length; i += CHUNK) await postIngest('/solves', solves.slice(i, i + CHUNK));
console.log(`${platform} ${handle}: ${solves.length} accepted submissions sent`);
