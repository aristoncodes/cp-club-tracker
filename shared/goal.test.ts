import { describe, expect, it } from 'vitest';
import { closestTarget, goalLocked, goalSuggestion } from './goal';

const ist = (day: number, hour: number, minute = 0) => Date.UTC(2026, 10, day, hour, minute) / 1000 - 19800;

describe('goalLocked', () => {
  it('is open from Monday until Wednesday 23:59 IST', () => {
    expect(goalLocked(ist(2, 0))).toBe(false); // Monday 2 Nov 2026
    expect(goalLocked(ist(4, 23, 59))).toBe(false);
  });

  it('locks from Thursday 00:00 IST through Sunday', () => {
    expect(goalLocked(ist(5, 0))).toBe(true);
    expect(goalLocked(ist(8, 23, 59))).toBe(true);
    expect(goalLocked(ist(9, 0))).toBe(false);
  });
});

describe('goal suggestion', () => {
  it('is the 4-week average plus 1', () => {
    expect(goalSuggestion(0)).toBe(1);
    expect(goalSuggestion(3.6)).toBe(5);
  });

  it('maps to the next choice up, capped at 10', () => {
    expect(closestTarget(1)).toBe(3);
    expect(closestTarget(5)).toBe(5);
    expect(closestTarget(6)).toBe(7);
    expect(closestTarget(40)).toBe(10);
  });
});
