import { describe, expect, it } from 'vitest';
import { brokenHandle, cfSolves, type CfSubmission } from './cf';

const submission = (participantType: string, verdict = 'OK'): CfSubmission => ({
  id: 1, creationTimeSeconds: 100,
  verdict,
  problem: { contestId: 1900, index: 'C', name: 'P', rating: 1400, tags: ['dp'] },
  author: { participantType },
});

describe('cfSolves', () => {
  it('keeps only accepted submissions and extracts the problem', () => {
    expect(cfSolves('me', [submission('PRACTICE', 'WRONG_ANSWER'), submission('PRACTICE')])).toEqual([
      {
        platform: 'cf',
        handle: 'me',
        problemId: '1900C',
        name: 'P',
        rating: 1400,
        tags: ['dp'],
        url: 'https://codeforces.com/contest/1900/problem/C',
        solvedAt: 100,
        live: false,
      },
    ]);
  });

  it.each([
    ['CONTESTANT', true],
    ['OUT_OF_COMPETITION', true],
    ['VIRTUAL', false],
    ['PRACTICE', false],
  ])('treats %s as live: %s', (type, live) => {
    expect(cfSolves('me', [submission(type)])[0].live).toBe(live);
  });
});

describe('brokenHandle', () => {
  it('reads the handle from either error form', () => {
    expect(brokenHandle('handle: User with handle gone not found')).toBe('gone');
    expect(brokenHandle('handles: User with handle gone not found')).toBe('gone');
    expect(brokenHandle('Call limit exceeded')).toBeNull();
  });
});
