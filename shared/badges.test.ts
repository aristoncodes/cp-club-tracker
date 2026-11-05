import { describe, expect, it } from 'vitest';
import { BADGES, earnedBadges, reachedNewColour, type BadgeStats } from './badges';

const none: BadgeStats = { solves: 0, bestStreak: 0, attendanceRun: 0, upsolves: 0, potdRun: 0, goalRun: 0, newColour: 0, duelWins: 0, giantWins: 0 };

describe('badge rules', () => {
  it('has the 12 badges', () => {
    expect(BADGES).toHaveLength(12);
  });

  it('earns nothing from nothing', () => {
    expect(earnedBadges(none)).toEqual([]);
  });

  it.each(BADGES.filter((badge) => badge.stat))('$name needs exactly its threshold', (badge) => {
    expect(earnedBadges({ ...none, [badge.stat!]: badge.goal })).toContain(badge.id);
    expect(earnedBadges({ ...none, [badge.stat!]: badge.goal - 1 })).not.toContain(badge.id);
  });

  it('never works out the weekly badge from numbers', () => {
    expect(earnedBadges({ solves: 99, bestStreak: 99, attendanceRun: 99, upsolves: 99, potdRun: 99, goalRun: 99, newColour: 1, duelWins: 9, giantWins: 9 })).not.toContain('top_board');
  });
});

describe('reachedNewColour', () => {
  it('needs a higher rank colour than the start', () => {
    expect(reachedNewColour([1100, 1250])).toBe(true);
    expect(reachedNewColour([1250, 1399])).toBe(false);
    expect(reachedNewColour([1450, 1300])).toBe(false);
    expect(reachedNewColour([1100])).toBe(false);
  });
});
