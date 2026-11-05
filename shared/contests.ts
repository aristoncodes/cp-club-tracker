import type { ContestPlatform } from './types';

const COUNTED_CF_ROUNDS = ['Div. 2', 'Div. 3', 'Div. 4', 'Educational'];
export const SPECIAL_CF_ROUNDS = ['Kotlin Heroes', 'April Fools', 'Testing Round', 'Q#'];

export function countsForAttendance(platform: ContestPlatform, name: string): boolean {
  if (platform === 'cc') return name.startsWith('Starters');
  if (SPECIAL_CF_ROUNDS.some((round) => name.includes(round))) return false;
  return COUNTED_CF_ROUNDS.some((round) => name.includes(round));
}
