import { ratingColor } from './rating-color';

export type BadgeStats = {
  solves: number;
  bestStreak: number;
  attendanceRun: number;
  upsolves: number;
  potdRun: number;
  goalRun: number;
  newColour: number;
  duelWins: number;
  giantWins: number;
};

export type BadgeId = 'first_ac' | 'on_a_roll' | 'unbreakable' | 'regular' | 'iron' | 'upsolver' | 'daily_driver' | 'goal_getter' | 'new_colour' | 'duelist' | 'giant_slayer' | 'top_board';
export type Badge = { id: BadgeId; name: string; glyph: string; how: string; goal: number; stat: keyof BadgeStats | null; accent: 'lime' | 'pink' | 'sun' | 'sky' };

// top_board has no stat: it's awarded by the weekly check, not worked out from a member's numbers.
export const BADGES: Badge[] = [
  { id: 'first_ac', name: 'First AC', glyph: 'AC', how: 'First tracked accepted solve', goal: 1, stat: 'solves', accent: 'lime' },
  { id: 'on_a_roll', name: 'On a roll', glyph: '7d', how: '7-day solve streak', goal: 7, stat: 'bestStreak', accent: 'sun' },
  { id: 'unbreakable', name: 'Unbreakable', glyph: '30d', how: '30-day solve streak', goal: 30, stat: 'bestStreak', accent: 'sun' },
  { id: 'regular', name: 'Regular', glyph: '5×', how: 'Present at 5 counted contests in a row', goal: 5, stat: 'attendanceRun', accent: 'sky' },
  { id: 'iron', name: 'Iron attendance', glyph: '10×', how: 'Present at 10 in a row', goal: 10, stat: 'attendanceRun', accent: 'sky' },
  { id: 'upsolver', name: 'Upsolver', glyph: 'UP', how: 'Clear 10 upsolve items', goal: 10, stat: 'upsolves', accent: 'pink' },
  { id: 'daily_driver', name: 'Daily driver', glyph: 'PD', how: 'Solve the problem of the day 7 days in a row', goal: 7, stat: 'potdRun', accent: 'lime' },
  { id: 'goal_getter', name: 'Goal getter', glyph: 'GO', how: 'Hit the weekly goal 4 weeks in a row', goal: 4, stat: 'goalRun', accent: 'lime' },
  { id: 'new_colour', name: 'New colour', glyph: '↑', how: 'Reach a new Codeforces rank colour', goal: 1, stat: 'newColour', accent: 'sky' },
  { id: 'duelist', name: 'Duelist', glyph: 'VS', how: 'Win a first duel', goal: 1, stat: 'duelWins', accent: 'pink' },
  { id: 'giant_slayer', name: 'Giant slayer', glyph: 'GS', how: 'Beat a duel opponent whose duel rating is 200+ higher', goal: 1, stat: 'giantWins', accent: 'pink' },
  { id: 'top_board', name: 'Top of the board', glyph: '#1', how: 'Finish a week at #1', goal: 1, stat: null, accent: 'sun' },
];

export const badgeValue = (badge: Badge, stats: BadgeStats) => (badge.stat ? stats[badge.stat] : 0);
export const earnedBadges = (stats: BadgeStats) => BADGES.filter((badge) => badge.stat && stats[badge.stat] >= badge.goal).map((badge) => badge.id);

export function reachedNewColour(ratings: number[]): boolean {
  if (ratings.length < 2) return false;
  const first = ratings[0];
  return ratings.some((rating) => rating > first && ratingColor(rating) !== ratingColor(first));
}
