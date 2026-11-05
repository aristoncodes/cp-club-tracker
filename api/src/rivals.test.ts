import { describe, expect, it } from 'vitest';
import { shouldPushPassed } from './rivals';
import { sweepMinute } from './badges';

describe('shouldPushPassed', () => {
  it('fires only when the rival newly goes ahead', () => {
    expect(shouldPushPassed(false, true, null, 10)).toBe(true);
    expect(shouldPushPassed(true, true, null, 10)).toBe(false);
    expect(shouldPushPassed(false, false, null, 10)).toBe(false);
  });

  it('fires at most once a day', () => {
    expect(shouldPushPassed(false, true, 10, 10)).toBe(false);
    expect(shouldPushPassed(false, true, 9, 10)).toBe(true);
  });
});

describe('sweepMinute', () => {
  const ist = (hour: number, minute: number) => Date.UTC(2026, 10, 5, hour, minute) / 1000 - 19800;
  it('covers 15 minutes from 00:10 IST', () => {
    expect(sweepMinute(ist(0, 9))).toBeNull();
    expect(sweepMinute(ist(0, 10))).toBe(0);
    expect(sweepMinute(ist(0, 24))).toBe(14);
    expect(sweepMinute(ist(0, 25))).toBeNull();
  });
});
