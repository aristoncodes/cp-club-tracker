import { describe, expect, it } from 'vitest';
import { contestAction, isRatingRefreshTick, isSolveSyncTick } from './cron';
import { withRanks } from './routes';

const START = 2_000_000_000;
const END = START + 7200;
const VERIFY = END + 900;
const contest = (overrides = {}) => ({
  id: 1,
  platform: 'cf',
  external_id: '1',
  alt_external_id: null,
  name: 'Round',
  url: 'https://codeforces.com/contest/1',
  start_at: START,
  end_at: END,
  counts: 1,
  stage: 0,
  ...overrides,
});

describe('contestAction', () => {
  it('does nothing before T-60', () => {
    expect(contestAction(contest(), START - 3601)).toBeNull();
  });

  it('reminds from T-60 until T-5', () => {
    expect(contestAction(contest(), START - 3600)).toBe('reminder');
    expect(contestAction(contest(), START - 301)).toBe('reminder');
  });

  it('does not remind twice', () => {
    expect(contestAction(contest({ stage: 1 }), START - 3600)).toBeNull();
  });

  it('sends the rsvp from T-5 until the start', () => {
    expect(contestAction(contest({ stage: 1 }), START - 300)).toBe('rsvp');
    expect(contestAction(contest({ stage: 1 }), START - 1)).toBe('rsvp');
  });

  it('skips the reminder for a contest first seen inside T-5', () => {
    expect(contestAction(contest({ stage: 0 }), START - 60)).toBe('rsvp');
  });

  it('catches up without a push if the rsvp window was missed', () => {
    expect(contestAction(contest({ stage: 0 }), START)).toBe('catchup');
    expect(contestAction(contest({ stage: 1 }), START + 60)).toBe('catchup');
  });

  it('waits after the rsvp until 15 minutes past the end', () => {
    expect(contestAction(contest({ stage: 2 }), START - 60)).toBeNull();
    expect(contestAction(contest({ stage: 2 }), VERIFY - 1)).toBeNull();
    expect(contestAction(contest({ stage: 2 }), VERIFY)).toBe('verify');
  });

  it('verifies a contest whose earlier stages were all missed', () => {
    expect(contestAction(contest({ stage: 0 }), VERIFY)).toBe('verify');
  });

  it('retries verification hourly for 24 hours, then stops', () => {
    expect(contestAction(contest({ stage: 3 }), VERIFY + 60)).toBeNull();
    expect(contestAction(contest({ stage: 3 }), VERIFY + 3600)).toBe('verify');
    expect(contestAction(contest({ stage: 3 }), VERIFY + 3660)).toBeNull();
    expect(contestAction(contest({ stage: 3 }), VERIFY + 86400)).toBe('verify');
    expect(contestAction(contest({ stage: 3 }), VERIFY + 90000)).toBeNull();
  });

  it('does nothing once verified', () => {
    expect(contestAction(contest({ stage: 4 }), VERIFY)).toBeNull();
  });

  it('does nothing for contests that do not count', () => {
    expect(contestAction(contest({ counts: 0 }), START - 60)).toBeNull();
    expect(contestAction(contest({ counts: 0, stage: 2 }), VERIFY)).toBeNull();
  });
});

describe('scheduled ticks', () => {
  it('syncs solves every 10th minute', () => {
    expect(isSolveSyncTick(600)).toBe(true);
    expect(isSolveSyncTick(659)).toBe(true);
    expect(isSolveSyncTick(660)).toBe(false);
  });

  it('refreshes ratings at 00:00 IST', () => {
    const midnightIst = Date.UTC(2026, 10, 4, 18, 30) / 1000;
    expect(isRatingRefreshTick(midnightIst)).toBe(true);
    expect(isRatingRefreshTick(midnightIst + 59)).toBe(true);
    expect(isRatingRefreshTick(midnightIst + 60)).toBe(false);
    expect(isRatingRefreshTick(midnightIst - 1)).toBe(false);
  });
});

describe('withRanks', () => {
  it('shares a rank on equal points and rounds to one decimal', () => {
    const ranked = withRanks([{ points: 30.04 }, { points: 30.01 }, { points: 12 }]);
    expect(ranked).toEqual([
      { points: 30, rank: 1 },
      { points: 30, rank: 1 },
      { points: 12, rank: 3 },
    ]);
  });
});
