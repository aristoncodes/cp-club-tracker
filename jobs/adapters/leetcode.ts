import type { IngestSolve } from 'shared/types';
import { politeFetch } from '../lib';

type RecentAc = { data: { recentAcSubmissionList: { title: string; titleSlug: string; timestamp: string }[] | null } };
type Question = { data: { question: { difficulty: string; topicTags: { name: string }[] } | null } };

const questionCache = new Map<string, Question>();

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await politeFetch('https://leetcode.com/graphql', undefined, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`LeetCode returned ${response.status}`);
  return response.json() as Promise<T>;
}

function fetchRecentAc(username: string): Promise<RecentAc> {
  return graphql(
    'query($username: String!, $limit: Int!) { recentAcSubmissionList(username: $username, limit: $limit) { title titleSlug timestamp } }',
    { username, limit: 20 },
  );
}

function fetchQuestion(titleSlug: string): Promise<Question> {
  return graphql('query($titleSlug: String!) { question(titleSlug: $titleSlug) { difficulty topicTags { name } } }', { titleSlug });
}

// Null when the user has never taken a LeetCode contest. LeetCode sends the rating with decimals.
export async function fetchRating(username: string): Promise<number | null> {
  const raw = await graphql<{ data: { userContestRanking: { rating: number } | null } }>('query($username: String!) { userContestRanking(username: $username) { rating } }', { username });
  const rating = raw.data.userContestRanking?.rating;
  return rating ? Math.round(rating) : null;
}

export function parseRecentAc(raw: RecentAc, cutoff: number) {
  return (raw.data.recentAcSubmissionList ?? [])
    .map((s) => ({ title: s.title, slug: s.titleSlug, solvedAt: Number(s.timestamp) }))
    .filter((s) => s.solvedAt >= cutoff);
}

export function solveFrom(handle: string, submission: ReturnType<typeof parseRecentAc>[number], raw: Question): IngestSolve {
  return {
    platform: 'leetcode',
    handle,
    problemId: submission.slug,
    name: submission.title,
    rating: raw.data.question?.difficulty,
    tags: raw.data.question?.topicTags.map((t) => t.name),
    url: `https://leetcode.com/problems/${submission.slug}/`,
    solvedAt: submission.solvedAt,
    live: false,
  };
}

export async function fetchSolves(handle: string, since: number): Promise<IngestSolve[]> {
  const solves: IngestSolve[] = [];
  for (const submission of parseRecentAc(await fetchRecentAc(handle), since)) {
    const question = questionCache.get(submission.slug) ?? (await fetchQuestion(submission.slug));
    questionCache.set(submission.slug, question);
    solves.push(solveFrom(handle, submission, question));
  }
  return solves;
}
