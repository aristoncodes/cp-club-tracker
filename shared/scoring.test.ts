import { describe, expect, it } from 'vitest';
import { problemRp, solvePoints } from './scoring';

describe('solvePoints', () => {
  it('matches the worked examples for a 1200 user', () => {
    expect(solvePoints(800, 1200, false)).toBe(3.2);
    expect(solvePoints(1200, 1200, false)).toBe(14.4);
    expect(solvePoints(1400, 1200, false)).toBe(29.4);
  });

  it('clamps the multiplier at 0.5 and 2', () => {
    expect(solvePoints(800, 2400, false)).toBe(3.2);
    expect(solvePoints(2400, 1200, false)).toBe(115.2);
  });

  it('gives 1.5x for a live solve', () => {
    expect(solvePoints(1200, 1200, true)).toBe(21.6);
  });

  it('counts an unrated user as 1200', () => {
    expect(solvePoints(1400, null, false)).toBe(29.4);
  });
});

describe('problemRp', () => {
  it('uses the cf rating, or 1200 if unrated', () => {
    expect(problemRp('cf', 1700)).toBe(1700);
    expect(problemRp('cf', null)).toBe(1200);
  });

  it('subtracts 200 on cc, or 1200 if missing', () => {
    expect(problemRp('cc', 1700)).toBe(1500);
    expect(problemRp('cc', null)).toBe(1200);
  });

  it('adds 400 on atcoder, floored at 800, or 1200 if missing', () => {
    expect(problemRp('atcoder', 1000)).toBe(1400);
    expect(problemRp('atcoder', -500)).toBe(800);
    expect(problemRp('atcoder', null)).toBe(1200);
  });

  it('maps leetcode difficulty names, or 1200 if missing', () => {
    expect(problemRp('leetcode', 'Easy')).toBe(900);
    expect(problemRp('leetcode', 'Medium')).toBe(1300);
    expect(problemRp('leetcode', 'Hard')).toBe(1700);
    expect(problemRp('leetcode', null)).toBe(1200);
  });
});
