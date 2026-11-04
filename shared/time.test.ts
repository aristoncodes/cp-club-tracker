import { describe, expect, it } from 'vitest';
import { formatIST, periodStart } from './time';

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
