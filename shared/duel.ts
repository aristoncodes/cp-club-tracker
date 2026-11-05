export type DuelSubmission = {
  id: number;
  creationTimeSeconds: number;
  verdict?: string;
  passedTestCount?: number;
  problem: { contestId?: number; index: string };
};

export type DuelProblem = { contestId: number; index: string };
export type DuelSide = 'a' | 'b';

export type DuelDecision =
  | { status: 'live' | 'checking' | 'judging' | 'draw' }
  | { status: 'won'; winner: DuelSide; submissionId?: number; time?: number };

type DecideInput = {
  start: number;
  end: number;
  problem: DuelProblem;
  a: DuelSubmission[] | null;
  b: DuelSubmission[] | null;
  now: number;
  gaveUp?: { player: DuelSide; at: number };
};

const JUDGING_WAIT = 900;

const isPending = (s: DuelSubmission) => !s.verdict || s.verdict === 'TESTING';
const other = (side: DuelSide): DuelSide => (side === 'a' ? 'b' : 'a');

export function countingSubmissions(submissions: DuelSubmission[], problem: DuelProblem, start: number, end: number): DuelSubmission[] {
  return submissions.filter((s) => s.problem.contestId === problem.contestId && s.problem.index === problem.index && s.creationTimeSeconds >= start && s.creationTimeSeconds < end);
}

const isEarlier = (x: DuelSubmission, y: DuelSubmission) => x.creationTimeSeconds < y.creationTimeSeconds || (x.creationTimeSeconds === y.creationTimeSeconds && x.id < y.id);

// The winner comes only from Codeforces data: nothing here knows who pressed a button or when a check ran.
export function decideDuel({ start, end, problem, a, b, now, gaveUp }: DecideInput): DuelDecision {
  if (a === null || b === null) return { status: 'checking' };
  const counted = (side: DuelSide) => {
    const own = countingSubmissions(side === 'a' ? a : b, problem, start, end);
    return gaveUp?.player === side ? own.filter((s) => s.creationTimeSeconds < gaveUp.at) : own;
  };
  const sides = { a: counted('a'), b: counted('b') };
  const waitUntil = Math.min(end, gaveUp?.at ?? end) + JUDGING_WAIT;
  const waitOver = now >= waitUntil;

  const accepted = (['a', 'b'] as const).flatMap((side) => sides[side].filter((s) => s.verdict === 'OK').map((submission) => ({ side, submission })));
  const best = accepted.reduce<(typeof accepted)[number] | null>((first, next) => (!first || isEarlier(next.submission, first.submission) ? next : first), null);

  if (best) {
    const blocked = sides[other(best.side)].some((s) => isPending(s) && isEarlier(s, best.submission));
    if (blocked && !waitOver) return { status: 'judging' };
    return { status: 'won', winner: best.side, submissionId: best.submission.id, time: best.submission.creationTimeSeconds - start };
  }

  if (gaveUp) {
    if (sides[gaveUp.player].some(isPending) && !waitOver) return { status: 'judging' };
    return { status: 'won', winner: other(gaveUp.player) };
  }
  if (now < end) return { status: 'live' };
  if ((sides.a.some(isPending) || sides.b.some(isPending)) && !waitOver) return { status: 'judging' };
  return { status: 'draw' };
}

export type PlayerStatus = { state: 'none' } | { state: 'testing'; at: number } | { state: 'wrong'; at: number; verdict: string; test: number } | { state: 'accepted'; time: number };

export function playerStatus(submissions: DuelSubmission[] | null, problem: DuelProblem, start: number, end: number): PlayerStatus {
  const counted = countingSubmissions(submissions ?? [], problem, start, end).sort((x, y) => (isEarlier(x, y) ? -1 : 1));
  const accepted = counted.find((s) => s.verdict === 'OK');
  if (accepted) return { state: 'accepted', time: accepted.creationTimeSeconds - start };
  const latest = counted[counted.length - 1];
  if (!latest) return { state: 'none' };
  if (isPending(latest)) return { state: 'testing', at: latest.creationTimeSeconds };
  return { state: 'wrong', at: latest.creationTimeSeconds, verdict: latest.verdict!, test: (latest.passedTestCount ?? 0) + 1 };
}

export type Difficulty = 'easy' | 'even' | 'hard';
const RANGES: Record<Difficulty, readonly [number, number]> = { easy: [-300, -100], even: [-100, 100], hard: [100, 300] };
const UNRATED_DUELIST = 1200;

export function duelRange(difficulty: Difficulty, ratingA: number | null, ratingB: number | null): { min: number; max: number } {
  const average = Math.round(((ratingA ?? UNRATED_DUELIST) + (ratingB ?? UNRATED_DUELIST)) / 2 / 100) * 100;
  return { min: average + RANGES[difficulty][0], max: average + RANGES[difficulty][1] };
}

const K = 32;

// outcome is A's score: 1 for a win, 0.5 for a draw, 0 for a loss. Returns each player's rating change.
export function elo(ratingA: number, ratingB: number, outcome: 0 | 0.5 | 1): { a: number; b: number } {
  const expected = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
  const change = Math.round(K * (outcome - expected));
  return { a: change, b: -change };
}

const CHECK_COOLDOWN = 20;
const AUTO_CHECK = 60;

export function duelCheckDue(duel: { lastCheckAt: number | null; requestedAt: number | null; endAt: number }, now: number): boolean {
  if (duel.lastCheckAt === null) return true;
  const since = now - duel.lastCheckAt;
  if (duel.requestedAt !== null && duel.requestedAt > duel.lastCheckAt && since >= CHECK_COOLDOWN) return true;
  if (now >= duel.endAt && duel.lastCheckAt < duel.endAt) return true;
  return since >= AUTO_CHECK;
}

export const checkCoolingDown = (lastCheckAt: number | null, now: number) => lastCheckAt !== null && now - lastCheckAt < CHECK_COOLDOWN;

export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

const VERDICTS: Record<string, string> = { WRONG_ANSWER: 'WA', TIME_LIMIT_EXCEEDED: 'TLE', MEMORY_LIMIT_EXCEEDED: 'MLE', RUNTIME_ERROR: 'RE', IDLENESS_LIMIT_EXCEEDED: 'ILE' };

export const wrongVerdictText = (verdict: string, test: number) => (verdict === 'COMPILATION_ERROR' ? 'Compile error' : `${VERDICTS[verdict] ?? verdict} on test ${test}`);
