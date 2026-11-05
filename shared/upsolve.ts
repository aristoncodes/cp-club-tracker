export type ContestType = 'div4' | 'div3' | 'div2' | 'educational' | 'div1+2' | 'global' | 'starters';

export function contestType(name: string): ContestType | null {
  if (name.startsWith('Starters')) return 'starters';
  if (name.includes('Global Round')) return 'global';
  if (name.includes('Div. 1 + Div. 2')) return 'div1+2';
  if (name.includes('Educational')) return 'educational';
  if (name.includes('Div. 4')) return 'div4';
  if (name.includes('Div. 3')) return 'div3';
  if (name.includes('Div. 2')) return 'div2';
  return null;
}

const MIN_TARGET = 2;
const TOP_DIVISION_PERCENT = 20;

// [lowest rating, problems left out of n]; the first row a rating reaches applies.
const BELOW_N: Partial<Record<ContestType, readonly (readonly [number, number])[]>> = {
  div4: [[1400, 0], [1300, 1], [1200, 2], [0, 3]],
  div3: [[1600, 0], [1400, 1], [1200, 2], [0, 3]],
  div2: [[2100, 0], [1900, 1], [1600, 2], [1400, 3], [0, 4]],
  educational: [[2100, 0], [1900, 1], [1600, 2], [1400, 3], [0, 4]],
};
const FIRST_K: readonly (readonly [number, number])[] = [[2100, 7], [1900, 6], [1600, 5], [1400, 4], [1200, 3], [0, 2]];

export function upsolveTarget(type: ContestType, n: number, rating: number | null, divisionPercentile?: number): number {
  const r = rating ?? 0;
  const reached = (rows: readonly (readonly [number, number])[]) => rows.find(([from]) => r >= from)![1];
  let target: number;
  if (type === 'starters') target = (divisionPercentile ?? 100) <= TOP_DIVISION_PERCENT ? n : n - 2;
  else if (type === 'div1+2' || type === 'global') target = reached(FIRST_K);
  else target = n - reached(BELOW_N[type]!);
  return Math.min(n, Math.max(MIN_TARGET, target));
}

export const problemLetter = (problemId: string) => problemId.replace(/^\d+/, '');

export function sortByIndex<T extends { problemId: string }>(problems: T[]): T[] {
  return [...problems].sort((a, b) => problemLetter(a.problemId).localeCompare(problemLetter(b.problemId), 'en', { numeric: true }));
}

export function upsolveItems<T extends { problemId: string; name: string }>(type: ContestType, problems: T[], rating: number | null, solvedNames: string[]): T[] {
  const ordered = sortByIndex(problems);
  const solved = new Set(solvedNames);
  return ordered.slice(0, upsolveTarget(type, ordered.length, rating)).filter((problem) => !solved.has(problem.name));
}

const DAY = 86400;
const REMINDER_DAYS = [2, 6];

export const upsolveReminderDue = (endAt: number, pushesSent: number, now: number) => pushesSent < REMINDER_DAYS.length && now >= endAt + REMINDER_DAYS[pushesSent] * DAY;
