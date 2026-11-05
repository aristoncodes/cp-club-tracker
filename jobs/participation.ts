import { brokenHandle } from 'shared/cf';
import * as cc from './adapters/cc';
import * as cf from './adapters/cf';
import { getHandles, postIngest } from './lib';

const { PLATFORM: platform, CONTEST: contest, ALT: alt, START: start, END: end } = process.env;
if (!contest || (platform !== 'cf' && platform !== 'cc')) throw new Error('PLATFORM and CONTEST are required');

const presentHandles: string[] = [];
const brokenHandles: string[] = [];
const solved: Record<string, string[]> = {};
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
    const submissions = cf.parseSubmissions(raw);
    if (cf.tookPartLive(submissions) && !presentHandles.includes(handle)) presentHandles.push(handle);
    solved[handle] = [...(solved[handle] ?? []), ...cf.liveSolvedNames(submissions)];
  }
}

// Attendance must still finish if the problem list can't be read, so a failure here only skips upsolves.
async function upsolveData() {
  if (platform !== 'cf') return {};
  try {
    const problemset = await cf.fetchProblemset();
    return {
      problems: await cf.fetchContestProblems(contest!, problemset),
      altProblems: alt ? await cf.fetchContestProblems(alt, problemset) : [],
      solved,
    };
  } catch (err) {
    console.error('Could not read the problem list, skipping upsolves:', err);
    return {};
  }
}

await postIngest('/participation', { platform, externalId: contest, presentHandles, brokenHandles, ...(await upsolveData()) });
console.log(`${contest}: ${presentHandles.length} present, ${brokenHandles.length} broken handles`);
