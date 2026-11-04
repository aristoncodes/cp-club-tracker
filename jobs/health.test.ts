import { describe, expect, it } from 'vitest';
import type { HealthReport } from 'shared/types';
import { healthProblems } from './lib';

const NOW = 1_800_000_000;
const HOUR = 3600;
const DAY = 86400;

const healthy: HealthReport = {
  cfHandles: 3,
  oldestCfSync: NOW - 60,
  platforms: [{ platform: 'cf', approvedHandles: 10, lastSolve: NOW - DAY }],
  latestContests: [
    { platform: 'cf', startAt: NOW + DAY },
    { platform: 'cc', startAt: NOW + DAY },
  ],
  stuckContests: [],
  brokenHandles: [],
};
const runs = {
  'sync-solves': [{ createdAt: NOW - 300, conclusion: 'success' }],
  'sync-contests': [{ createdAt: NOW - HOUR, conclusion: 'success' }],
  participation: [],
  backfill: [],
};

describe('healthProblems', () => {
  it('is quiet when everything is fine', () => {
    expect(healthProblems(healthy, runs, NOW)).toEqual([]);
  });

  it('reports a Codeforces fetch that stopped', () => {
    expect(healthProblems({ ...healthy, oldestCfSync: NOW - 2 * HOUR }, runs, NOW)[0]).toContain('Codeforces fetch');
    expect(healthProblems({ ...healthy, cfHandles: 0, oldestCfSync: null }, runs, NOW)).toEqual([]);
  });

  it('reports a platform with no solves only once enough students use it', () => {
    const quiet = [{ platform: 'cc', approvedHandles: 5, lastSolve: NOW - 15 * DAY }];
    expect(healthProblems({ ...healthy, platforms: quiet }, runs, NOW)[0]).toContain('cc');
    expect(healthProblems({ ...healthy, platforms: [{ ...quiet[0], approvedHandles: 4 }] }, runs, NOW)).toEqual([]);
  });

  it('reports missing upcoming contests, stuck attendance and broken handles', () => {
    const report = { ...healthy, latestContests: [{ platform: 'cf', startAt: NOW - DAY }], stuckContests: ['Round 1'], brokenHandles: ['cf:gone'] };
    const problems = healthProblems(report, runs, NOW).join('\n');
    expect(problems).toContain('cf has no upcoming');
    expect(problems).toContain('cc has no upcoming');
    expect(problems).toContain('Round 1');
    expect(problems).toContain('cf:gone');
  });

  it('reports stale and failing jobs, ignoring cancelled runs', () => {
    const late = { ...runs, 'sync-solves': [{ createdAt: NOW - HOUR, conclusion: 'success' }] };
    expect(healthProblems(healthy, late, NOW)[0]).toContain('sync-solves has not run');
    const failing = { ...runs, 'sync-solves': [{ createdAt: NOW - 300, conclusion: 'failure' }, { createdAt: NOW - 600, conclusion: 'cancelled' }, { createdAt: NOW - 900, conclusion: 'failure' }] };
    expect(healthProblems(healthy, failing, NOW)[0]).toContain('sync-solves is failing');
    const recovered = { ...runs, participation: [{ createdAt: NOW - 2 * DAY, conclusion: 'failure' }] };
    expect(healthProblems(healthy, recovered, NOW)).toEqual([]);
  });
});
