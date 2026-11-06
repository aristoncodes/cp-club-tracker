import { afterEach, describe, expect, it, vi } from 'vitest';
import ccFixture from '../fixtures/cc-contests.json';
import cfFixture from '../fixtures/cf-contests.json';
import { parseContests as parseCc, readCodeChef } from './cc';
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

describe('readCodeChef', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const replies = (...bodies: string[]) => {
    const fetchMock = vi.fn(async () => new Response(bodies.shift()));
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    return fetchMock;
  };

  it('reads JSON straight away', async () => {
    const fetchMock = replies('{"a":1}');
    const result = readCodeChef('https://www.codechef.com/one');
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ a: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('waits and retries once after a challenge page', async () => {
    const fetchMock = replies('<!DOCTYPE html>', '{"a":2}');
    const result = readCodeChef('https://www.codechef.com/two');
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ a: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails if it stays blocked, so attendance posts nothing', async () => {
    const fetchMock = replies('<!DOCTYPE html>', '<!DOCTYPE html>');
    const result = readCodeChef('https://www.codechef.com/three');
    const failed = expect(result).rejects.toThrow('CodeChef blocked');
    await vi.runAllTimersAsync();
    await failed;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
