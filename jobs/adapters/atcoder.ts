import type { IngestSolve } from 'shared/types';
import { politeFetch } from '../lib';

const BASE = 'https://kenkoooo.com/atcoder';
const MAX_LIVE_CONTEST_SECONDS = 86400;

type Submission = { epoch_second: number; problem_id: string; contest_id: string; result: string };
export type Resources = {
  models: Record<string, { difficulty?: number }>;
  contests: { id: string; start_epoch_second: number; duration_second: number }[];
  problems: { id: string; name: string }[];
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await politeFetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json() as Promise<T>;
}

export async function fetchResources(): Promise<Resources> {
  return {
    models: await fetchJson(`${BASE}/resources/problem-models.json`),
    contests: await fetchJson(`${BASE}/resources/contests.json`),
    problems: await fetchJson(`${BASE}/resources/problems.json`),
  };
}

export function parseSubmissions(handle: string, raw: Submission[], { models, contests, problems }: Resources): IngestSolve[] {
  return raw
    .filter((s) => s.result === 'AC')
    .map((s) => {
      const contest = contests.find((c) => c.id === s.contest_id);
      const live =
        !!contest &&
        contest.duration_second <= MAX_LIVE_CONTEST_SECONDS &&
        s.epoch_second >= contest.start_epoch_second &&
        s.epoch_second < contest.start_epoch_second + contest.duration_second;
      return {
        platform: 'atcoder' as const,
        handle,
        problemId: s.problem_id,
        name: problems.find((p) => p.id === s.problem_id)?.name,
        rating: models[s.problem_id]?.difficulty,
        url: `https://atcoder.jp/contests/${s.contest_id}/tasks/${s.problem_id}`,
        solvedAt: s.epoch_second,
        live,
      };
    });
}

export async function fetchSolves(handle: string, since: number, resources: Resources): Promise<IngestSolve[]> {
  const raw = await fetchJson<Submission[]>(
    `${BASE}/atcoder-api/v3/user/submissions?user=${encodeURIComponent(handle)}&from_second=${since}`,
  );
  return parseSubmissions(handle, raw, resources);
}
