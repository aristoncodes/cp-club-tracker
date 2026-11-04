import { countsForAttendance } from 'shared/contests';
import type { IngestContest } from 'shared/types';
import { politeFetch } from '../lib';

type CcContestList = {
  status: string;
  future_contests: {
    contest_code: string;
    contest_name: string;
    contest_start_date_iso: string;
    contest_end_date_iso: string;
  }[];
};

export async function fetchContests(): Promise<CcContestList> {
  const response = await politeFetch('https://www.codechef.com/api/list/contests/all?sort_by=START&sorting_order=asc&offset=0&mode=all');
  return response.json() as Promise<CcContestList>;
}

export function parseContests(raw: CcContestList): IngestContest[] {
  if (raw.status !== 'success') throw new Error(`CodeChef returned status ${raw.status}`);
  return raw.future_contests.map((c) => ({
    platform: 'cc',
    externalId: c.contest_code,
    name: c.contest_name,
    url: `https://www.codechef.com/${c.contest_code}`,
    startAt: Date.parse(c.contest_start_date_iso) / 1000,
    endAt: Date.parse(c.contest_end_date_iso) / 1000,
    counts: countsForAttendance('cc', c.contest_name),
  }));
}
