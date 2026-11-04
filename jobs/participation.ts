import { brokenHandle } from 'shared/cf';
import * as cc from './adapters/cc';
import * as cf from './adapters/cf';
import { getHandles, postIngest } from './lib';

const { PLATFORM: platform, CONTEST: contest, ALT: alt, START: start, END: end } = process.env;
if (!contest || (platform !== 'cf' && platform !== 'cc')) throw new Error('PLATFORM and CONTEST are required');

const presentHandles: string[] = [];
const brokenHandles: string[] = [];
const now = Math.floor(Date.now() / 1000);

for (const handle of await getHandles(platform)) {
  if (platform === 'cc') {
    const submissions = cc.parseRecent(await cc.fetchRecent(handle), now);
    if (cc.tookPartLive(submissions, contest, Number(start), Number(end))) presentHandles.push(handle);
    continue;
  }
  for (const contestId of [contest, alt].filter((id): id is string => !!id)) {
    const raw = await cf.fetchContestStatus(contestId, handle);
    if (raw.status !== 'OK' && brokenHandle(raw.comment ?? '')) {
      brokenHandles.push(handle);
      break;
    }
    if (cf.tookPartLive(cf.parseSubmissions(raw))) {
      presentHandles.push(handle);
      break;
    }
  }
}

await postIngest('/participation', { platform, externalId: contest, presentHandles, brokenHandles });
console.log(`${contest}: ${presentHandles.length} present, ${brokenHandles.length} broken handles`);
