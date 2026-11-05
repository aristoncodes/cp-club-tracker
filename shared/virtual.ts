import type { CfSubmission } from './cf';

const START_WINDOW = 900;
const WRONG_PENALTY = 20;
const IGNORED = ['COMPILATION_ERROR', 'TESTING', 'SKIPPED'];

export type VirtualCell = { solvedAt?: number; wrong: number };
export type VirtualResults = { seen: number[]; cells: Record<string, VirtualCell> };

export function virtualStart(submissions: CfSubmission[], cfContestId: number, clubStart: number): number | null {
  const start = submissions.find((s) => s.contestId === cfContestId && s.author.participantType === 'VIRTUAL' && s.author.startTimeSeconds !== undefined && s.author.startTimeSeconds >= clubStart && s.author.startTimeSeconds <= clubStart + START_WINDOW);
  return start?.author.startTimeSeconds ?? null;
}

// Reads are only the latest 10 submissions, so results build up across reads, and `seen` stops one being counted twice.
export function applySubmissions(previous: VirtualResults, submissions: CfSubmission[], cfContestId: number, startedAt: number): VirtualResults {
  const next: VirtualResults = { seen: [...previous.seen], cells: { ...previous.cells } };
  const fresh = submissions
    .filter((s) => s.contestId === cfContestId && s.author.participantType === 'VIRTUAL' && s.author.startTimeSeconds === startedAt && s.verdict && !IGNORED.includes(s.verdict) && !previous.seen.includes(s.id))
    .sort((a, b) => a.creationTimeSeconds - b.creationTimeSeconds);
  for (const submission of fresh) {
    next.seen.push(submission.id);
    const cell = next.cells[submission.problem.index] ?? { wrong: 0 };
    if (cell.solvedAt !== undefined) continue;
    next.cells[submission.problem.index] = submission.verdict === 'OK' ? { ...cell, solvedAt: submission.creationTimeSeconds - startedAt } : { ...cell, wrong: cell.wrong + 1 };
  }
  return next;
}

export function virtualScore(cells: Record<string, VirtualCell>): { solved: number; penalty: number } {
  const solved = Object.values(cells).filter((cell) => cell.solvedAt !== undefined);
  return {
    solved: solved.length,
    penalty: solved.reduce((sum, cell) => sum + Math.floor(cell.solvedAt! / 60) + WRONG_PENALTY * cell.wrong, 0),
  };
}

export function rankVirtual<T extends { cells: Record<string, VirtualCell> }>(rows: T[]): (T & { solved: number; penalty: number; rank: number })[] {
  const scored = rows.map((row) => ({ ...row, ...virtualScore(row.cells) })).sort((a, b) => b.solved - a.solved || a.penalty - b.penalty);
  return scored.map((row) => ({ ...row, rank: scored.findIndex((other) => other.solved === row.solved && other.penalty === row.penalty) + 1 }));
}
