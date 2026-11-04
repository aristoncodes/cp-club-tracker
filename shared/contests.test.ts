import { describe, expect, it } from 'vitest';
import { countsForAttendance } from './contests';

describe('countsForAttendance', () => {
  it.each([
    'Codeforces Round 1095 (Div. 2)',
    'Codeforces Round 1095 (Div. 3)',
    'Codeforces Round 1095 (Div. 4)',
    'Educational Codeforces Round 170 (Rated for Div. 2)',
    'Codeforces Round 1095 (Div. 1 + Div. 2)',
    'Codeforces Global Round 28',
    'Refact.ai Match 1 (Codeforces Round 985)',
  ])('counts cf: %s', (name) => {
    expect(countsForAttendance('cf', name)).toBe(true);
  });

  it.each([
    'Codeforces Round 1095 (Div. 1)',
    'Kotlin Heroes: Episode 12',
    'April Fools Day Contest 2026',
    'Codeforces Testing Round 19 (Div. 3)',
    'Microsoft Q# Coding Contest',
  ])('skips cf: %s', (name) => {
    expect(countsForAttendance('cf', name)).toBe(false);
  });

  it('counts only Starters on cc', () => {
    expect(countsForAttendance('cc', 'Starters 210')).toBe(true);
    expect(countsForAttendance('cc', 'Cook-Off 2026')).toBe(false);
    expect(countsForAttendance('cc', 'Lunchtime 2026')).toBe(false);
  });
});
