import { describe, expect, it } from 'vitest';
import { contestType, sortByIndex, upsolveItems, upsolveReminderDue, upsolveTarget, type ContestType } from './upsolve';

const cases: [ContestType, number, number | null, number][] = [
  ['div4', 8, 1400, 8], ['div4', 8, 1399, 7], ['div4', 8, 1300, 7], ['div4', 8, 1299, 6], ['div4', 8, 1200, 6], ['div4', 8, 1199, 5],
  ['div3', 8, 1600, 8], ['div3', 8, 1599, 7], ['div3', 8, 1400, 7], ['div3', 8, 1399, 6], ['div3', 8, 1200, 6], ['div3', 8, 1199, 5],
  ['div2', 7, 2100, 7], ['div2', 7, 2099, 6], ['div2', 7, 1900, 6], ['div2', 7, 1899, 5], ['div2', 7, 1600, 5], ['div2', 7, 1599, 4], ['div2', 7, 1400, 4], ['div2', 7, 1399, 3],
  ['educational', 7, 2100, 7], ['educational', 7, 2099, 6], ['educational', 7, 1899, 5], ['educational', 7, 1599, 4], ['educational', 7, 1399, 3],
  ['div1+2', 9, 2100, 7], ['div1+2', 9, 2099, 6], ['div1+2', 9, 1899, 5], ['div1+2', 9, 1599, 4], ['div1+2', 9, 1399, 3], ['div1+2', 9, 1199, 2],
  ['global', 9, 2100, 7], ['global', 9, 1900, 6], ['global', 9, 1600, 5], ['global', 9, 1400, 4], ['global', 9, 1200, 3], ['global', 9, 1199, 2],
];

describe('upsolveTarget', () => {
  it.each(cases)('%s with %i problems at %s gives %i', (type, n, rating, expected) => {
    expect(upsolveTarget(type, n, rating)).toBe(expected);
  });

  it('counts an unrated member as under 1200', () => {
    expect(upsolveTarget('div4', 8, null)).toBe(5);
    expect(upsolveTarget('div2', 7, null)).toBe(3);
    expect(upsolveTarget('global', 9, null)).toBe(2);
  });

  it('uses division rank on Starters', () => {
    expect(upsolveTarget('starters', 7, 1500, 20)).toBe(7);
    expect(upsolveTarget('starters', 7, 1500, 21)).toBe(5);
    expect(upsolveTarget('starters', 7, null)).toBe(5);
  });

  it('never goes below 2 or above n', () => {
    expect(upsolveTarget('div2', 5, 1000)).toBe(2);
    expect(upsolveTarget('div4', 3, 1000)).toBe(2);
    expect(upsolveTarget('global', 5, 2500)).toBe(5);
    expect(upsolveTarget('starters', 1, 1500, 10)).toBe(1);
  });
});

describe('contestType', () => {
  it.each([
    ['Codeforces Round 1000 (Div. 4)', 'div4'],
    ['Codeforces Round 1000 (Div. 3)', 'div3'],
    ['Codeforces Round 1000 (Div. 2)', 'div2'],
    ['Educational Codeforces Round 196 (Rated for Div. 2)', 'educational'],
    ['Codeforces Round 1000 (Div. 1 + Div. 2)', 'div1+2'],
    ['Codeforces Global Round 30', 'global'],
    ['Starters 263', 'starters'],
    ['Kotlin Heroes 12', null],
  ])('reads %s', (name, expected) => {
    expect(contestType(name)).toBe(expected);
  });
});

const problem = (index: string) => ({ problemId: `2000${index}`, name: `Problem ${index}` });

describe('upsolveItems', () => {
  const round = ['F', 'A', 'D2', 'B', 'D1', 'C', 'E'].map(problem);

  it('orders from A and counts sub-problems separately', () => {
    expect(sortByIndex(round).map((p) => p.problemId)).toEqual(['2000A', '2000B', '2000C', '2000D1', '2000D2', '2000E', '2000F']);
    expect(upsolveItems('div2', round, 1900, []).map((p) => p.problemId)).toEqual(['2000A', '2000B', '2000C', '2000D1', '2000D2', '2000E']);
  });

  it('leaves out what was solved in the contest', () => {
    expect(upsolveItems('div2', round, 1400, ['Problem A', 'Problem C']).map((p) => p.problemId)).toEqual(['2000B', '2000D1']);
  });

  it('gives the same list to someone who skipped the contest', () => {
    expect(upsolveItems('div2', round, 1400, [])).toHaveLength(4);
  });
});

describe('upsolveReminderDue', () => {
  const END = 1_000_000;
  const DAY = 86400;
  it('fires at 2 and 6 days only', () => {
    expect(upsolveReminderDue(END, 0, END + 2 * DAY - 1)).toBe(false);
    expect(upsolveReminderDue(END, 0, END + 2 * DAY)).toBe(true);
    expect(upsolveReminderDue(END, 1, END + 6 * DAY - 1)).toBe(false);
    expect(upsolveReminderDue(END, 1, END + 6 * DAY)).toBe(true);
    expect(upsolveReminderDue(END, 2, END + 60 * DAY)).toBe(false);
  });
});
