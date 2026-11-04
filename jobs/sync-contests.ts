import type { IngestContest } from 'shared/types';
import * as cc from './adapters/cc';
import * as cf from './adapters/cf';
import { postIngest } from './lib';

async function collect(name: string, load: () => Promise<IngestContest[]>): Promise<IngestContest[]> {
  try {
    return await load();
  } catch (err) {
    console.error(`${name} adapter failed:`, err);
    process.exitCode = 1;
    return [];
  }
}

const contests = [
  ...(await collect('cf', async () => cf.parseContests(await cf.fetchContests()))),
  ...(await collect('cc', async () => cc.parseContests(await cc.fetchContests()))),
];
await postIngest('/contests', contests);
console.log(`Synced ${contests.length} contests`);
