import { describe, expect, it } from 'vitest';
import ccFixture from '../fixtures/cc-contests.json';
import cfFixture from '../fixtures/cf-contests.json';
import { parseContests as parseCc } from './cc';
import { parseContests as parseCf } from './cf';

describe('parseContests (cf)', () => {
  const contests = parseCf(cfFixture);
  const byId = (id: string) => contests.find((c) => c.externalId === id);

  it('keeps only future contests', () => {
    expect(byId('2283')).toBeUndefined();
  });

  it('merges a parallel Div. 1 round into its Div. 2 round', () => {
    expect(byId('2279')).toBeUndefined();
    expect(byId('2280')).toMatchObject({ altExternalId: '2279', counts: true });
  });

  it('extracts times and urls', () => {
    expect(byId('2280')).toMatchObject({
      name: 'Codeforces Round 1133 (Div. 2)',
      url: 'https://codeforces.com/contest/2280',
      startAt: 1794062100,
      endAt: 1794062100 + 9000,
    });
  });

  it('stores special rounds as not counted', () => {
    expect(byId('2282')).toMatchObject({ counts: false });
  });

  it('rejects a failed response', () => {
    expect(() => parseCf({ status: 'FAILED', result: [] })).toThrow();
  });
});

describe('parseContests (cc)', () => {
  const contests = parseCc(ccFixture);

  it('counts Starters only and converts IST to unix seconds', () => {
    expect(contests.find((c) => c.externalId === 'START264')).toMatchObject({
      counts: true,
      url: 'https://www.codechef.com/START264',
      startAt: Date.UTC(2026, 10, 11, 14, 30) / 1000,
      endAt: Date.UTC(2026, 10, 11, 16, 30) / 1000,
    });
    expect(contests.find((c) => c.externalId === 'DSAMONDAY028')).toMatchObject({ counts: false });
  });

  it('skips contests that already started', () => {
    expect(contests.find((c) => c.externalId === 'START263')).toBeUndefined();
  });
});
