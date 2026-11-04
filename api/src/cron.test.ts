import { describe, expect, it } from 'vitest';
import { contestAction, isContestJobTick, isRatingRefreshTick, isSolveJobTick, ratingHistoryIsDue, isStreakReminderTick } from './cron';
import { biggestClimbers, withRanks } from './routes';

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
  it('refreshes rating history on first fetch and then once an hour', () => {
    expect(ratingHistoryIsDue(null, 7200)).toBe(true);
    expect(ratingHistoryIsDue(7200, 7259)).toBe(false);
    expect(ratingHistoryIsDue(7199, 7200)).toBe(true);
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

describe('job ticks', () => {
  it('reminds about streaks at 21:00 IST', () => {
    const ninePm = Date.UTC(2026, 10, 4, 15, 30) / 1000;
    expect(isStreakReminderTick(ninePm)).toBe(true);
    expect(isStreakReminderTick(ninePm + 60)).toBe(false);
  });

  it('starts GitHub jobs every 5 minutes and 6 hours', () => {
    expect(isSolveJobTick(300)).toBe(true);
    expect(isSolveJobTick(360)).toBe(false);
    expect(isContestJobTick(21600)).toBe(true);
    expect(isContestJobTick(1800)).toBe(false);
  });
});

describe('biggestClimbers', () => {
  const rows = (ranks: number[]) => ranks.map((rank, index) => ({ userId: index + 1, rank }));

  it('takes the top 3 positive changes', () => {
    const climbers = biggestClimbers(rows([1, 2, 3, 4, 5]), rows([6, 2, 8, 9, 1]));
    expect(climbers.map((row) => [row.userId, row.gained])).toEqual([[1, 5], [3, 5], [4, 5]]);
  });

  it('skips people who were not ranked before, or fell', () => {
    expect(biggestClimbers(rows([1, 2]), [{ userId: 2, rank: 1 }])).toEqual([]);
  });
});
