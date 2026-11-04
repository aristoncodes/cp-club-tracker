import { cfSolves } from 'shared/cf';
import { describe, expect, it } from 'vitest';
import acContests from '../fixtures/atcoder-contests.json';
import acModels from '../fixtures/atcoder-models.json';
import acProblems from '../fixtures/atcoder-problems.json';
import acSubmissions from '../fixtures/atcoder-submissions.json';
import ccContest from '../fixtures/cc-contest.json';
import ccProblem from '../fixtures/cc-problem.json';
import ccRecent from '../fixtures/cc-recent.json';
import cfSubmissions from '../fixtures/cf-submissions.json';
import lcQuestion from '../fixtures/leetcode-question.json';
import lcRecent from '../fixtures/leetcode-recent.json';
import { parseSubmissions as parseAtcoder } from './atcoder';
import { parseRecent, parseTime, solveFrom as ccSolve, tookPartLive as ccTookPart } from './cc';
import { parseSubmissions as parseCf, tookPartLive as cfTookPart } from './cf';
import { parseRecentAc, solveFrom as lcSolve } from './leetcode';

const NOW = 1_800_000_000;

describe('cf', () => {
  const all = parseCf(cfSubmissions);

  it('keeps only accepted submissions and marks contest solves live', () => {
    const solves = cfSolves('jiangly', all);
    expect(solves).toHaveLength(all.filter((s) => s.verdict === 'OK').length);
    expect(solves.filter((s) => s.live)).toHaveLength(1);
    expect(solves[0]).toMatchObject({ platform: 'cf', rating: 2600, problemId: '2122E', solvedAt: 1793729968, live: false });
  });

  it('counts a live submission as attendance, whatever its verdict', () => {
    const wrongAnswerLive = all.filter((s) => s.author.participantType === 'CONTESTANT' && s.verdict !== 'OK');
    expect(cfTookPart(wrongAnswerLive)).toBe(true);
  });

  it.each([
    ['OUT_OF_COMPETITION', true],
    ['VIRTUAL', false],
    ['PRACTICE', false],
  ])('treats %s attendance as %s', (participantType, expected) => {
    expect(cfTookPart([{ ...all[0], author: { participantType } }])).toBe(expected);
  });

  it('treats no submissions as absent', () => {
    expect(cfTookPart([])).toBe(false);
  });

  it('rejects a failed response', () => {
    expect(() => parseCf({ status: 'FAILED', comment: 'Call limit exceeded' })).toThrow('Call limit exceeded');
  });
});

describe('cc', () => {
  const submissions = parseRecent(ccRecent, NOW);
  const START = ccContest.time.start;
  const END = ccContest.time.end;

  it('reads accepted submissions with contest, problem and IST time', () => {
    expect(submissions.find((s) => s.problemCode === 'LEASTSIZE')).toEqual({
      solvedAt: Date.UTC(2023, 3, 19, 15, 19) / 1000,
      contestCode: 'START86A',
      problemCode: 'LEASTSIZE',
      accepted: true,
    });
  });

  it('counts submissions to a division of the contest, inside its window', () => {
    expect(ccTookPart(submissions, 'START86', START, END)).toBe(true);
  });

  it('ignores other contests with a similar code', () => {
    expect(ccTookPart(submissions, 'START8', START, END)).toBe(false);
  });

  it('ignores submissions outside the contest window', () => {
    expect(ccTookPart(submissions, 'START86', END + 1, END + 100)).toBe(false);
  });

  it('reads the relative times CodeChef shows for recent submissions', () => {
    expect(parseTime('12 min ago', NOW)).toBe(NOW - 720);
    expect(parseTime('1 hour ago', NOW)).toBe(NOW - 3600);
    expect(parseTime('30 secs ago', NOW)).toBe(NOW - 30);
  });

  it('reads 12 AM and 12 PM correctly', () => {
    expect(parseTime('12:05 AM 19/04/23', NOW)).toBe(Date.UTC(2023, 3, 18, 18, 35) / 1000);
    expect(parseTime('12:05 PM 19/04/23', NOW)).toBe(Date.UTC(2023, 3, 19, 6, 35) / 1000);
  });

  it('fails loudly on a time format it does not know', () => {
    expect(() => parseTime('yesterday', NOW)).toThrow('Unknown CodeChef time format');
  });

  it('builds a live solve from a contest submission', () => {
    const submission = submissions.find((s) => s.problemCode === 'LEASTSIZE')!;
    expect(ccSolve('um_nik', submission, ccProblem, ccContest)).toMatchObject({
      platform: 'cc',
      problemId: 'LEASTSIZE',
      rating: 3060,
      tags: ['Trees', 'Segment Trees', 'DFS Order'],
      live: true,
    });
  });

  it('treats a missing rating and practice submissions as not rated, not live', () => {
    const submission = { solvedAt: NOW, contestCode: null, problemCode: 'X', accepted: true };
    expect(ccSolve('me', submission, { status: 'success', difficulty_rating: '-1' }, null)).toMatchObject({ rating: undefined, live: false });
  });
});

describe('leetcode', () => {
  it('reads recent solves and difficulty, never live', () => {
    const [first] = parseRecentAc(lcRecent, 0);
    expect(lcSolve('lee215', first, lcQuestion)).toMatchObject({
      platform: 'leetcode',
      problemId: first.slug,
      rating: 'Easy',
      tags: ['Array', 'Hash Table'],
      live: false,
    });
  });

  it('drops solves before the cutoff and handles unknown users', () => {
    expect(parseRecentAc(lcRecent, 2_000_000_000)).toEqual([]);
    expect(parseRecentAc({ data: { recentAcSubmissionList: null } }, 0)).toEqual([]);
  });
});

describe('atcoder', () => {
  const resources = { models: acModels, contests: acContests, problems: acProblems };
  const solves = parseAtcoder('tourist', acSubmissions, resources);

  it('keeps only AC submissions', () => {
    expect(solves).toHaveLength(acSubmissions.filter((s) => s.result === 'AC').length);
  });

  it('marks a solve live only during a short contest', () => {
    const contest = acContests.find((c) => c.id === 'agc074')!;
    const during = { ...acSubmissions[0], epoch_second: contest.start_epoch_second + 1 };
    const after = { ...acSubmissions[0], epoch_second: contest.start_epoch_second + contest.duration_second };
    const longContest = { ...acSubmissions[0], contest_id: 'APG4b', epoch_second: 1000 };
    expect(parseAtcoder('t', [during], resources)[0].live).toBe(true);
    expect(parseAtcoder('t', [after], resources)[0].live).toBe(false);
    expect(parseAtcoder('t', [longContest], resources)[0].live).toBe(false);
  });

  it('extracts the difficulty and name', () => {
    expect(solves[0]).toMatchObject({ platform: 'atcoder', problemId: 'agc074_a', rating: (acModels as Record<string, { difficulty?: number }>).agc074_a?.difficulty });
  });
});
