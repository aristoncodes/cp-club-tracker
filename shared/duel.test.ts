import { describe, expect, it } from 'vitest';
import { checkCoolingDown, countingSubmissions, decideDuel, duelCheckDue, duelRange, elo, playerStatus, type DuelSubmission } from './duel';

const S = 1000;
const E = S + 2700;
const problem = { contestId: 1500, index: 'C' };
let nextId = 1;
const sub = (at: number, verdict?: string, overrides: Partial<DuelSubmission> = {}): DuelSubmission => ({ id: nextId++, creationTimeSeconds: at, verdict, problem, ...overrides });
const decide = (a: DuelSubmission[] | null, b: DuelSubmission[] | null, now = S + 600, gaveUp?: { player: 'a' | 'b'; at: number }) => decideDuel({ start: S, end: E, problem, a, b, now, gaveUp });

describe('decideDuel', () => {
  it('1. the earlier Accepted wins, whoever asked for the check', () => {
    const a = sub(S + 305, 'OK');
    const b = sub(S + 400, 'OK');
    expect(decide([a], [b], S + 410)).toEqual({ status: 'won', winner: 'a', submissionId: a.id, time: 305 });
    expect(decide([a], [b], S + 2000)).toEqual({ status: 'won', winner: 'a', submissionId: a.id, time: 305 });
  });

  it('2. a pending earlier submission blocks the decision, then resolves either way', () => {
    const b = sub(S + 340, 'OK');
    expect(decide([sub(S + 305)], [b])).toEqual({ status: 'judging' });
    expect(decide([sub(S + 305, 'TESTING')], [b])).toEqual({ status: 'judging' });
    const accepted = sub(S + 305, 'OK');
    expect(decide([accepted], [b])).toMatchObject({ status: 'won', winner: 'a', submissionId: accepted.id });
    expect(decide([sub(S + 305, 'WRONG_ANSWER')], [b])).toMatchObject({ status: 'won', winner: 'b', submissionId: b.id });
  });

  it('2. a later pending submission does not block', () => {
    const b = sub(S + 340, 'OK');
    expect(decide([sub(S + 350)], [b])).toMatchObject({ status: 'won', winner: 'b' });
  });

  it('3. an exact-second tie goes to the lower submission id', () => {
    expect(decide([sub(S + 100, 'OK', { id: 900 })], [sub(S + 100, 'OK', { id: 800 })])).toEqual({ status: 'won', winner: 'b', submissionId: 800, time: 100 });
    expect(decide([sub(S + 100, 'OK', { id: 700 })], [sub(S + 100, 'OK', { id: 800 })])).toEqual({ status: 'won', winner: 'a', submissionId: 700, time: 100 });
  });

  it('3. a same-second pending with a lower id blocks', () => {
    expect(decide([sub(S + 100, undefined, { id: 700 })], [sub(S + 100, 'OK', { id: 800 })])).toEqual({ status: 'judging' });
  });

  it('4. submissions before the start or at or after the end are ignored', () => {
    expect(decide([sub(S - 1, 'OK')], [])).toEqual({ status: 'live' });
    expect(decide([sub(E, 'OK')], [], E + 5)).toEqual({ status: 'draw' });
    const exactStart = sub(S, 'OK');
    expect(decide([exactStart], [])).toMatchObject({ status: 'won', winner: 'a', time: 0 });
    const lastSecond = sub(E - 1, 'OK');
    expect(decide([lastSecond], [], E + 5)).toMatchObject({ status: 'won', winner: 'a', time: 2699 });
  });

  it('5. a submission made before the end but judged after it still counts, within 15 minutes', () => {
    const pending = sub(E - 10);
    expect(decide([pending], [], E + 60)).toEqual({ status: 'judging' });
    expect(decide([{ ...pending, verdict: 'OK' }], [], E + 600)).toMatchObject({ status: 'won', winner: 'a' });
    expect(decide([pending], [], E + 900)).toEqual({ status: 'draw' });
    const b = sub(E - 5, 'OK');
    expect(decide([sub(E - 10)], [b], E + 899)).toEqual({ status: 'judging' });
    expect(decide([sub(E - 10)], [b], E + 900)).toMatchObject({ status: 'won', winner: 'b' });
  });

  it('6. no Accepted means a draw, but only after the end', () => {
    expect(decide([sub(S + 10, 'WRONG_ANSWER')], [sub(S + 20, 'TIME_LIMIT_EXCEEDED')], E - 1)).toEqual({ status: 'live' });
    expect(decide([sub(S + 10, 'WRONG_ANSWER')], [sub(S + 20, 'TIME_LIMIT_EXCEEDED')], E)).toEqual({ status: 'draw' });
    expect(decide([], [], E)).toEqual({ status: 'draw' });
  });

  it('7. giving up is a loss', () => {
    expect(decide([], [], S + 100, { player: 'a', at: S + 90 })).toEqual({ status: 'won', winner: 'b' });
    expect(decide([sub(S + 95, 'OK')], [], S + 100, { player: 'a', at: S + 90 })).toEqual({ status: 'won', winner: 'b' });
  });

  it('7. an Accepted from before giving up still counts, and a pending one waits', () => {
    const accepted = sub(S + 50, 'OK');
    expect(decide([accepted], [], S + 100, { player: 'a', at: S + 90 })).toMatchObject({ status: 'won', winner: 'a', submissionId: accepted.id });
    expect(decide([sub(S + 50)], [], S + 100, { player: 'a', at: S + 90 })).toEqual({ status: 'judging' });
    expect(decide([sub(S + 50)], [], S + 90 + 900, { player: 'a', at: S + 90 })).toEqual({ status: 'won', winner: 'b' });
  });

  it('8. only the duel problem counts', () => {
    expect(decide([sub(S + 10, 'OK', { problem: { contestId: 1500, index: 'D' } })], [])).toEqual({ status: 'live' });
    expect(decide([sub(S + 10, 'OK', { problem: { contestId: 1501, index: 'C' } })], [])).toEqual({ status: 'live' });
  });

  it('9. the API being down gives no decision, then the right one later', () => {
    const a = sub(S + 305, 'OK');
    const b = sub(S + 400, 'OK');
    expect(decide(null, null)).toEqual({ status: 'checking' });
    expect(decide([a], null)).toEqual({ status: 'checking' });
    expect(decide(null, [b], E + 5000)).toEqual({ status: 'checking' });
    expect(decide([a], [b], E + 5000)).toMatchObject({ status: 'won', winner: 'a', time: 305 });
  });

  it('matches the PRD examples', () => {
    const start = 30_000;
    const a = sub(start + 305, 'OK');
    const b = sub(start + 400, 'OK');
    const result = decideDuel({ start, end: start + 2700, problem, a: [a], b: [b], now: start + 410 });
    expect(result).toMatchObject({ status: 'won', winner: 'a' });
    expect(b.creationTimeSeconds - a.creationTimeSeconds).toBe(95);
  });
});

describe('countingSubmissions', () => {
  it('keeps the window and the problem', () => {
    const inside = sub(S + 1, 'OK');
    expect(countingSubmissions([sub(S - 1, 'OK'), inside, sub(E, 'OK')], problem, S, E)).toEqual([inside]);
  });
});

describe('playerStatus', () => {
  it('reports each state', () => {
    expect(playerStatus([], problem, S, E)).toEqual({ state: 'none' });
    expect(playerStatus(null, problem, S, E)).toEqual({ state: 'none' });
    expect(playerStatus([sub(S + 5)], problem, S, E)).toEqual({ state: 'testing', at: S + 5 });
    expect(playerStatus([sub(S + 5, 'WRONG_ANSWER', { passedTestCount: 3 })], problem, S, E)).toEqual({ state: 'wrong', at: S + 5, verdict: 'WRONG_ANSWER', test: 4 });
    expect(playerStatus([sub(S + 5, 'WRONG_ANSWER'), sub(S + 9, 'OK')], problem, S, E)).toEqual({ state: 'accepted', time: 9 });
  });
});

describe('duelRange', () => {
  it('rounds the average to 100 and applies the difficulty', () => {
    expect(duelRange('easy', 1450, 1560)).toEqual({ min: 1200, max: 1400 });
    expect(duelRange('even', 1450, 1560)).toEqual({ min: 1400, max: 1600 });
    expect(duelRange('hard', 1450, 1560)).toEqual({ min: 1600, max: 1800 });
  });

  it('counts an unrated player as 1200', () => {
    expect(duelRange('even', null, 1400)).toEqual({ min: 1200, max: 1400 });
  });
});

describe('elo', () => {
  it('splits K evenly between equals', () => {
    expect(elo(1200, 1200, 1)).toEqual({ a: 16, b: -16 });
    expect(elo(1200, 1200, 0)).toEqual({ a: -16, b: 16 });
    expect(elo(1200, 1200, 0.5).a).toBe(0);
  });

  it('rewards an upset more', () => {
    expect(elo(1200, 1400, 1).a).toBe(24);
    expect(elo(1400, 1200, 1).a).toBe(8);
    expect(elo(1200, 1400, 0.5)).toEqual({ a: 8, b: -8 });
  });
});

describe('check timing', () => {
  const END = 5000;
  it('checks straight away, then every minute', () => {
    expect(duelCheckDue({ lastCheckAt: null, requestedAt: null, endAt: END }, 100)).toBe(true);
    expect(duelCheckDue({ lastCheckAt: 100, requestedAt: null, endAt: END }, 159)).toBe(false);
    expect(duelCheckDue({ lastCheckAt: 100, requestedAt: null, endAt: END }, 160)).toBe(true);
  });

  it('honours check now with a 20 s cooldown', () => {
    expect(duelCheckDue({ lastCheckAt: 100, requestedAt: 110, endAt: END }, 119)).toBe(false);
    expect(duelCheckDue({ lastCheckAt: 100, requestedAt: 110, endAt: END }, 120)).toBe(true);
    expect(duelCheckDue({ lastCheckAt: 100, requestedAt: 90, endAt: END }, 120)).toBe(false);
    expect(checkCoolingDown(100, 119)).toBe(true);
    expect(checkCoolingDown(100, 120)).toBe(false);
    expect(checkCoolingDown(null, 120)).toBe(false);
  });

  it('checks once more just after the end', () => {
    expect(duelCheckDue({ lastCheckAt: END - 5, requestedAt: null, endAt: END }, END)).toBe(true);
    expect(duelCheckDue({ lastCheckAt: END + 1, requestedAt: null, endAt: END }, END + 2)).toBe(false);
  });
});
