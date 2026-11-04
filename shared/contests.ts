import type { ContestPlatform } from './types';

const SPECIAL_CF_ROUNDS = ['Kotlin Heroes', 'April Fools', 'Testing Round', 'Q#'];

export function countsForAttendance(platform: ContestPlatform, name: string): boolean {
  if (platform === 'cc') return name.startsWith('Starters');
  if (name.includes('Div. 1') && !name.includes('Div. 2')) return false;
  return !SPECIAL_CF_ROUNDS.some((round) => name.includes(round));
}
