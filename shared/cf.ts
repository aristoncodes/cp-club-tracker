import type { IngestSolve } from './types';

export type CfSubmission = {
  id: number;
  contestId?: number;
  creationTimeSeconds: number;
  verdict?: string;
  passedTestCount?: number;
  programmingLanguage?: string;
  timeConsumedMillis?: number;
  memoryConsumedBytes?: number;
  problem: { contestId?: number; index: string; name: string; rating?: number; tags: string[] };
  author: { participantType: string; startTimeSeconds?: number };
};

export function isLiveSubmission(submission: CfSubmission): boolean {
  return ['CONTESTANT', 'OUT_OF_COMPETITION'].includes(submission.author.participantType);
}

export function brokenHandle(comment: string): string | null {
  return comment.match(/^handles?: User with handle (\S+) not found/)?.[1] ?? null;
}

export function cfSolves(handle: string, submissions: CfSubmission[]): IngestSolve[] {
  return submissions.flatMap(({ problem, verdict, creationTimeSeconds, ...rest }) => {
    if (verdict !== 'OK' || !problem.contestId) return [];
    return [
      {
        platform: 'cf' as const,
        handle,
        problemId: `${problem.contestId}${problem.index}`,
        name: problem.name,
        rating: problem.rating,
        tags: problem.tags,
        url: `https://codeforces.com/contest/${problem.contestId}/problem/${problem.index}`,
        solvedAt: creationTimeSeconds,
        live: isLiveSubmission({ problem, verdict, creationTimeSeconds, ...rest }),
        fingerprint: rest.programmingLanguage ? `${rest.programmingLanguage}|${rest.timeConsumedMillis}|${rest.memoryConsumedBytes}` : undefined,
      },
    ];
  });
}
