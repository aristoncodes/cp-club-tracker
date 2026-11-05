export type Platform = 'cf' | 'cc' | 'atcoder' | 'leetcode';
export type ContestPlatform = 'cf' | 'cc';
export type Period = 'day' | 'week' | 'month';

export type IngestContest = {
  platform: ContestPlatform;
  externalId: string;
  altExternalId?: string;
  name: string;
  url: string;
  startAt: number;
  endAt: number;
  counts: boolean;
};

export type IngestSolve = {
  platform: Platform;
  handle: string;
  problemId: string;
  name?: string;
  rating?: number | string;
  tags?: string[];
  url?: string;
  solvedAt: number;
  live: boolean;
};

export type HealthReport = {
  cfHandles: number;
  oldestCfSync: number | null;
  platforms: { platform: string; approvedHandles: number; lastSolve: number | null }[];
  latestContests: { platform: string; startAt: number }[];
  stuckContests: string[];
  brokenHandles: string[];
  pushErrors: string[];
};
