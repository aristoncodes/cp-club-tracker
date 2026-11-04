import { describe, expect, it } from 'vitest';
import { formatIST, heatmapWeeks, istDay, periodStart, solveStreak, timeAgo } from './time';

const ist = (month: number, day: number, hour = 0, minute = 0) =>
  Date.UTC(2026, month - 1, day, hour, minute) / 1000 - 19800;

describe('periodStart', () => {
  it('day starts at IST midnight', () => {
    expect(periodStart('day', ist(11, 4, 23, 59))).toBe(ist(11, 4));
  });

  it('day moves to the new day just after IST midnight', () => {
    expect(periodStart('day', ist(11, 5, 0, 1))).toBe(ist(11, 5));
  });

  it('week starts on Monday, even late on Sunday', () => {
    expect(periodStart('week', ist(11, 8, 23, 59))).toBe(ist(11, 2));
    expect(periodStart('week', ist(11, 9, 0, 1))).toBe(ist(11, 9));
  });

  it('month works across month ends', () => {
    expect(periodStart('month', ist(11, 30, 23, 59))).toBe(ist(11, 1));
    expect(periodStart('month', ist(12, 1, 0, 1))).toBe(ist(12, 1));
  });
});

describe('formatIST', () => {
  it('formats evening and midnight times', () => {
    expect(formatIST(ist(11, 4, 20, 0))).toBe('Wed, 4 Nov · 8:00 PM');
    expect(formatIST(ist(11, 4, 0, 5))).toBe('Wed, 4 Nov · 12:05 AM');
  });
});

describe('istDay', () => {
  it('changes at IST midnight, not UTC midnight', () => {
    expect(istDay(ist(11, 5, 0, 1))).toBe(istDay(ist(11, 4, 23, 59)) + 1);
  });
});

describe('solveStreak', () => {
  it('counts back from today', () => {
    expect(solveStreak([98, 99, 100], 100)).toBe(3);
  });

  it('still counts if today has no solve yet', () => {
    expect(solveStreak([98, 99], 100)).toBe(2);
  });

  it('breaks on a missed day', () => {
    expect(solveStreak([97, 100], 100)).toBe(1);
    expect(solveStreak([97], 100)).toBe(0);
  });
});

describe('timeAgo', () => {
  it('uses the largest sensible unit', () => {
    expect(timeAgo(1000, 1030)).toBe('just now');
    expect(timeAgo(1000, 1000 + 720)).toBe('12 min ago');
    expect(timeAgo(1000, 1000 + 7200)).toBe('2 h ago');
    expect(timeAgo(1000, 1000 + 259200)).toBe('3 d ago');
  });
});

describe('heatmapWeeks', () => {
  const wednesday = istDay(ist(11, 4, 12));

  it('gives 26 weeks of 7 days, ending in the current week', () => {
    const weeks = heatmapWeeks([], wednesday);
    expect(weeks).toHaveLength(26);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });

  it('puts today under its weekday and blanks the future', () => {
    const last = heatmapWeeks([{ day: wednesday, count: 2 }], wednesday)[25];
    expect(last).toEqual([0, 0, 2, null, null, null, null]);
  });

  it('caps the step at 4', () => {
    expect(heatmapWeeks([{ day: wednesday, count: 40 }], wednesday)[25][2]).toBe(4);
  });
});
