import { countsForAttendance } from 'shared/contests';
import type { IngestContest } from 'shared/types';
import { politeFetch } from '../lib';

const CF_GAP_MS = 2000;

type CfContestList = {
  status: string;
  result: { id: number; name: string; phase: string; durationSeconds: number; startTimeSeconds: number }[];
};

export async function fetchContests(): Promise<CfContestList> {
  const response = await politeFetch('https://codeforces.com/api/contest.list?gym=false', CF_GAP_MS);
  return response.json() as Promise<CfContestList>;
}

export function parseContests(raw: CfContestList): IngestContest[] {
  if (raw.status !== 'OK') throw new Error(`Codeforces returned status ${raw.status}`);
  const contests: IngestContest[] = raw.result
    .filter((c) => c.phase === 'BEFORE')
    .map((c) => ({
      platform: 'cf',
      externalId: String(c.id),
      name: c.name,
      url: `https://codeforces.com/contest/${c.id}`,
      startAt: c.startTimeSeconds,
      endAt: c.startTimeSeconds + c.durationSeconds,
      counts: countsForAttendance('cf', c.name),
    }));

  return contests.filter((c) => {
    const isPureDiv1 = c.name.includes('Div. 1') && !c.name.includes('Div. 2');
    const div2 = isPureDiv1 && contests.find((o) => o.counts && o.startAt === c.startAt && o.name.includes('Div. 2'));
    if (!div2) return true;
    div2.altExternalId = c.externalId;
    return false;
  });
}
