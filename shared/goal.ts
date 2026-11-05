import { IST_OFFSET } from './time';

const DAY = 86400;
const THURSDAY_OFFSET = 3; // Days after Monday.

export const GOAL_TARGETS = [3, 5, 7, 10];
export const GOAL_RATINGS = [1000, 1200, 1300, 1400];

export function goalLocked(now: number): boolean {
  const dayNumber = Math.floor((now + IST_OFFSET) / DAY);
  return (dayNumber + 3) % 7 >= THURSDAY_OFFSET;
}

export const goalSuggestion = (weeklyAverage: number) => Math.round(weeklyAverage) + 1;
export const closestTarget = (suggestion: number) => GOAL_TARGETS.find((target) => target >= suggestion) ?? GOAL_TARGETS[GOAL_TARGETS.length - 1];
