import type { Platform } from './types';

export const CHALLENGE_TARGET = 50;
export const CHALLENGE_MIN_RATING = 1400;

const DEFAULT_RATING = 1200;
const LEETCODE_RP: Record<string, number> = { Easy: 1000, Medium: 1300, Hard: 1600 };

export function problemRp(platform: Platform, difficulty: number | string | null): number {
  if (platform === 'leetcode') return LEETCODE_RP[String(difficulty)] ?? DEFAULT_RATING;
  if (typeof difficulty !== 'number') return DEFAULT_RATING;
  if (platform === 'cc') return difficulty - 200;
  if (platform === 'atcoder') return Math.max(difficulty + 400, 800);
  return difficulty;
}

export function solvePoints(rp: number, userRating: number | null, live: boolean): number {
  const m = Math.min(Math.max(1 + (rp - (userRating ?? DEFAULT_RATING)) / 400, 0.5), 2);
  const points = 10 * (rp / 1000) ** 2 * m * (live ? 1.5 : 1);
  return Math.round(points * 10) / 10;
}
