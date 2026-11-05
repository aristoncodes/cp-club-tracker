import { describe, expect, it } from 'vitest';
import type { CfSubmission } from './cf';
import { applySubmissions, rankVirtual, virtualScore, virtualStart } from './virtual';

const START = 10_000;
const sub = (id: number, index: string, offset: number, verdict: string, type = 'VIRTUAL', contestId = 50, started = START + 60): CfSubmission => ({
  id,
  contestId,
  creationTimeSeconds: started + offset,
  verdict,
  problem: { contestId, index, name: index, tags: [] },
  author: { participantType: type, startTimeSeconds: started },
});
const empty = { seen: [], cells: {} };

describe('virtualStart', () => {
  it('counts only a virtual started within 15 minutes of the club start', () => {
    expect(virtualStart([sub(1, 'A', 5, 'OK')], 50, START)).toBe(START + 60);
    expect(virtualStart([sub(1, 'A', 5, 'OK', 'VIRTUAL', 50, START + 900)], 50, START)).toBe(START + 900);
    expect(virtualStart([sub(1, 'A', 5, 'OK', 'VIRTUAL', 50, START + 901)], 50, START)).toBeNull();
    expect(virtualStart([sub(1, 'A', 5, 'OK', 'VIRTUAL', 50, START - 1)], 50, START)).toBeNull();
  });

  it('ignores practice and other contests', () => {
    expect(virtualStart([sub(1, 'A', 5, 'OK', 'PRACTICE')], 50, START)).toBeNull();
    expect(virtualStart([sub(1, 'A', 5, 'OK', 'VIRTUAL', 51)], 50, START)).toBeNull();
  });
});

describe('applySubmissions', () => {
  const started = START + 60;

  it('records wrong tries and the solve time', () => {
    const out = applySubmissions(empty, [sub(1, 'A', 60, 'WRONG_ANSWER'), sub(2, 'A', 120, 'OK'), sub(3, 'B', 10, 'WRONG_ANSWER')], 50, started);
    expect(out.cells).toEqual({ A: { wrong: 1, solvedAt: 120 }, B: { wrong: 1 } });
  });

  it('never counts a submission twice across reads', () => {
    const first = applySubmissions(empty, [sub(1, 'A', 60, 'WRONG_ANSWER')], 50, started);
    const second = applySubmissions(first, [sub(1, 'A', 60, 'WRONG_ANSWER'), sub(2, 'A', 90, 'WRONG_ANSWER')], 50, started);
    expect(second.cells.A.wrong).toBe(2);
  });

  it('waits for a pending verdict and ignores compile errors', () => {
    const pending = applySubmissions(empty, [sub(1, 'A', 60, 'TESTING'), sub(2, 'B', 60, 'COMPILATION_ERROR')], 50, started);
    expect(pending.cells).toEqual({});
    const judged = applySubmissions(pending, [sub(1, 'A', 60, 'OK')], 50, started);
    expect(judged.cells.A.solvedAt).toBe(60);
  });

  it('ignores anything after the first solve', () => {
    const out = applySubmissions(empty, [sub(1, 'A', 60, 'OK'), sub(2, 'A', 90, 'WRONG_ANSWER')], 50, started);
    expect(out.cells.A).toEqual({ wrong: 0, solvedAt: 60 });
  });
});

describe('standings', () => {
  it('scores like ICPC: minutes plus 20 per wrong try on solved problems', () => {
    expect(virtualScore({ A: { solvedAt: 600, wrong: 1 }, B: { wrong: 5 } })).toEqual({ solved: 1, penalty: 30 });
  });

  it('ranks by solved, then penalty, sharing ties', () => {
    const fast = { id: 1, cells: { A: { solvedAt: 60, wrong: 0 } } };
    const slow = { id: 2, cells: { A: { solvedAt: 600, wrong: 0 } } };
    const tied = { id: 3, cells: { A: { solvedAt: 60, wrong: 0 } } };
    const none = { id: 4, cells: {} };
    const ranks = new Map(rankVirtual([none, slow, fast, tied]).map((row) => [row.id, row.rank]));
    expect([ranks.get(1), ranks.get(3), ranks.get(2), ranks.get(4)]).toEqual([1, 1, 3, 4]);
  });
});
