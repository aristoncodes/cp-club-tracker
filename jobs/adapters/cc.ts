import { load } from 'cheerio';
import { countsForAttendance } from 'shared/contests';
import type { IngestContest, IngestSolve } from 'shared/types';
import { politeFetch, RECENT_SECONDS } from '../lib';

const BASE = 'https://www.codechef.com';
const IST_OFFSET_MS = 19800_000;
const UNIT_SECONDS: Record<string, number> = { sec: 1, min: 60, hour: 3600 };

type CcContestList = {
  status: string;
  future_contests: {
    contest_code: string;
    contest_name: string;
    contest_start_date_iso: string;
    contest_end_date_iso: string;
  }[];
};

type CcProblem = { status: string; problem_name?: string; difficulty_rating?: string; user_tags?: string[] };
type CcContest = { status: string; time?: { start: number; end: number } };

export type CcSubmission = { solvedAt: number; contestCode: string | null; problemCode: string; accepted: boolean };

export async function fetchContests(): Promise<CcContestList> {
  const response = await politeFetch(`${BASE}/api/list/contests/all?sort_by=START&sorting_order=asc&offset=0&mode=all`);
  return response.json() as Promise<CcContestList>;
}

export function parseContests(raw: CcContestList): IngestContest[] {
  if (raw.status !== 'success') throw new Error(`CodeChef returned status ${raw.status}`);
  return raw.future_contests.map((c) => ({
    platform: 'cc',
    externalId: c.contest_code,
    name: c.contest_name,
    url: `${BASE}/${c.contest_code}`,
    startAt: Date.parse(c.contest_start_date_iso) / 1000,
    endAt: Date.parse(c.contest_end_date_iso) / 1000,
    counts: countsForAttendance('cc', c.contest_name),
  }));
}

export async function fetchRecent(handle: string): Promise<{ content: string }> {
  const response = await politeFetch(`${BASE}/recent/user?page=0&user_handle=${encodeURIComponent(handle)}`);
  return response.json() as Promise<{ content: string }>;
}

export function parseTime(text: string, now: number): number {
  const relative = text.match(/^(\d+) (sec|min|hour)s? ago$/);
  if (relative) return now - Number(relative[1]) * UNIT_SECONDS[relative[2]];
  const absolute = text.match(/^(\d{2}):(\d{2}) (AM|PM) (\d{2})\/(\d{2})\/(\d{2})$/);
  if (!absolute) throw new Error(`Unknown CodeChef time format: ${text}`);
  const [, hour, minute, suffix, day, month, year] = absolute;
  const hour24 = (Number(hour) % 12) + (suffix === 'PM' ? 12 : 0);
  const utcMs = Date.UTC(2000 + Number(year), Number(month) - 1, Number(day), hour24, Number(minute));
  return (utcMs - IST_OFFSET_MS) / 1000;
}

export function parseRecent(raw: { content: string }, now: number): CcSubmission[] {
  const $ = load(raw.content);
  return $('tbody tr')
    .toArray()
    .flatMap((row) => {
      const link = $(row).find('a').first().attr('href');
      const parts = link?.match(/^\/(?:([^/]+)\/)?problems\/([^/]+)/);
      if (!parts) return [];
      const time = $(row).find('td').first();
      return [
        {
          solvedAt: parseTime(time.attr('title') || time.text().trim(), now),
          contestCode: parts[1] ?? null,
          problemCode: parts[2],
          accepted: $(row).find('span[title]').toArray().some((span) => $(span).attr('title') === 'accepted'),
        },
      ];
    });
}

export function tookPartLive(submissions: CcSubmission[], contest: string, start: number, end: number): boolean {
  const division = new RegExp(`^${contest}[A-Z]?$`);
  return submissions.some((s) => s.contestCode !== null && division.test(s.contestCode) && s.solvedAt >= start && s.solvedAt <= end);
}

async function fetchProblem(contestCode: string | null, problemCode: string): Promise<CcProblem> {
  const response = await politeFetch(`${BASE}/api/contests/${contestCode ?? 'PRACTICE'}/problems/${problemCode}`);
  return response.json() as Promise<CcProblem>;
}

async function fetchContest(contestCode: string): Promise<CcContest> {
  const response = await politeFetch(`${BASE}/api/contests/${contestCode}`);
  return response.json() as Promise<CcContest>;
}

export function solveFrom(handle: string, submission: CcSubmission, problem: CcProblem, contest: CcContest | null): IngestSolve {
  const rating = Number(problem.difficulty_rating);
  const time = contest?.time;
  return {
    platform: 'cc',
    handle,
    problemId: submission.problemCode,
    name: problem.problem_name,
    rating: rating > 0 ? rating : undefined,
    tags: problem.user_tags,
    url: `${BASE}/problems/${submission.problemCode}`,
    solvedAt: submission.solvedAt,
    live: !!time && submission.solvedAt >= time.start && submission.solvedAt <= time.end,
  };
}

const problemCache = new Map<string, CcProblem>();
const contestCache = new Map<string, CcContest>();

export async function fetchSolves(handle: string, now: number): Promise<IngestSolve[]> {
  const submissions = parseRecent(await fetchRecent(handle), now);
  const recent = submissions.filter((s) => s.accepted && s.solvedAt >= now - RECENT_SECONDS);
  const solves: IngestSolve[] = [];
  for (const submission of recent) {
    const problem = problemCache.get(submission.problemCode) ?? (await fetchProblem(submission.contestCode, submission.problemCode));
    problemCache.set(submission.problemCode, problem);
    const code = submission.contestCode;
    let contest: CcContest | null = null;
    if (code) {
      contest = contestCache.get(code) ?? (await fetchContest(code));
      contestCache.set(code, contest);
    }
    solves.push(solveFrom(handle, submission, problem, contest));
  }
  return solves;
}
