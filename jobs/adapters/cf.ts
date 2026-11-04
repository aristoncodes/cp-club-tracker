import { isLiveSubmission, type CfSubmission } from 'shared/cf';
import { countsForAttendance } from 'shared/contests';
import type { IngestContest } from 'shared/types';
import { politeFetch } from '../lib';

const CF_GAP_MS = 2000;

type CfSubmissionList = { status: string; comment?: string; result?: CfSubmission[] };

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

export async function fetchUserStatus(handle: string): Promise<CfSubmissionList> {
  const response = await politeFetch(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=1&count=50`, CF_GAP_MS);
  return response.json() as Promise<CfSubmissionList>;
}

export async function fetchAllSubmissions(handle: string): Promise<CfSubmissionList> {
  const response = await politeFetch(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}`, CF_GAP_MS);
  return response.json() as Promise<CfSubmissionList>;
}

export async function fetchContestStatus(contestId: string, handle: string): Promise<CfSubmissionList> {
  const response = await politeFetch(
    `https://codeforces.com/api/contest.status?contestId=${contestId}&handle=${encodeURIComponent(handle)}&from=1&count=100`,
    CF_GAP_MS,
  );
  return response.json() as Promise<CfSubmissionList>;
}

export function parseSubmissions(raw: CfSubmissionList): CfSubmission[] {
  if (raw.status !== 'OK' || !raw.result) throw new Error(raw.comment ?? `Codeforces returned status ${raw.status}`);
  return raw.result;
}

export function tookPartLive(submissions: CfSubmission[]): boolean {
  return submissions.some(isLiveSubmission);
}
