import { isLiveSubmission, type CfSubmission } from 'shared/cf';
import { countsForAttendance, SPECIAL_CF_ROUNDS } from 'shared/contests';
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

export async function fetchFinishedContests(): Promise<CfContestList> {
  const raw = await fetchContests();
  if (raw.status !== 'OK') throw new Error(`Codeforces returned status ${raw.status}`);
  return raw;
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

type CfProblem = { contestId?: number; index: string; name: string; type?: string; rating?: number; tags: string[] };
type CfProblemset = { status: string; comment?: string; result?: { problems: CfProblem[] } };
type CfStandings = { status: string; comment?: string; result?: { problems: CfProblem[] } };

export type ContestProblem = { problemId: string; name: string; rating?: number; tags: string[]; url: string };

const toContestProblem = (contestId: number, p: CfProblem): ContestProblem => ({
  problemId: `${contestId}${p.index}`,
  name: p.name,
  rating: p.rating,
  tags: p.tags,
  url: `https://codeforces.com/contest/${contestId}/problem/${p.index}`,
});

export async function fetchProblemset(): Promise<CfProblem[]> {
  const response = await politeFetch('https://codeforces.com/api/problemset.problems', CF_GAP_MS);
  const raw = (await response.json()) as CfProblemset;
  if (raw.status !== 'OK' || !raw.result) throw new Error(raw.comment ?? `Codeforces returned status ${raw.status}`);
  return raw.result.problems;
}

// A round may not be in the problemset straight after it ends, so this falls back to its standings. Codeforces accepts those only with no extra parameters.
export async function fetchContestProblems(contestId: string, problemset: CfProblem[]): Promise<ContestProblem[]> {
  const id = Number(contestId);
  const listed = problemset.filter((p) => p.contestId === id);
  if (listed.length) return listed.map((p) => toContestProblem(id, p));
  const response = await politeFetch(`https://codeforces.com/api/contest.standings?contestId=${contestId}`, CF_GAP_MS);
  const raw = (await response.json()) as CfStandings;
  if (raw.status !== 'OK' || !raw.result) throw new Error(raw.comment ?? `Codeforces returned status ${raw.status}`);
  return raw.result.problems.map((p) => toContestProblem(id, p));
}

export type PicksData = {
  rounds: { id: number; name: string; duration: number }[];
  problems: (ContestProblem & { contestAt: number })[];
};

export function parsePicksData(problemset: CfProblem[], contests: CfContestList): PicksData {
  const finished = contests.result.filter((c) => c.phase === 'FINISHED' && !SPECIAL_CF_ROUNDS.some((round) => c.name.includes(round)));
  const startOf = new Map(finished.map((c) => [c.id, c.startTimeSeconds]));
  return {
    rounds: finished.map((c) => ({ id: c.id, name: c.name, duration: c.durationSeconds })),
    problems: problemset.flatMap((p) => {
      const contestAt = p.contestId ? startOf.get(p.contestId) : undefined;
      if (!p.contestId || !contestAt || p.type !== 'PROGRAMMING') return [];
      return [{ ...toContestProblem(p.contestId, p), contestAt }];
    }),
  };
}

export function solvedProblemIds(submissions: CfSubmission[]): string[] {
  const solved = submissions.filter((s) => s.verdict === 'OK' && s.problem.contestId).map((s) => `${s.problem.contestId}${s.problem.index}`);
  return [...new Set(solved)];
}

export function liveSolvedNames(submissions: CfSubmission[]): string[] {
  return [...new Set(submissions.filter((s) => s.verdict === 'OK' && isLiveSubmission(s)).map((s) => s.problem.name))];
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
