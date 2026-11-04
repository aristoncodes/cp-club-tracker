import { describe, expect, it } from 'vitest';
import { contestAction } from './cron';

const START = 2_000_000_000;
const contest = (overrides = {}) => ({
  id: 1,
  platform: 'cf',
  name: 'Round',
  url: 'https://codeforces.com/contest/1',
  start_at: START,
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

  it('does nothing once the rsvp is sent', () => {
    expect(contestAction(contest({ stage: 2 }), START - 60)).toBeNull();
  });

  it('does nothing for contests that do not count', () => {
    expect(contestAction(contest({ counts: 0 }), START - 60)).toBeNull();
  });
});
