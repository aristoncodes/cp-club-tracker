import { useState } from 'react';
import { formatIST } from 'shared/time';
import { contestResult } from 'shared/reasons';
import { api, type Contest, type PastContest } from '../api';
import { Button, Card, CellMark, ContestRow, ErrorText, PlatformCode, useLoad } from '../ui';

const PAGE_SIZE = 20;

export function Contests() {
  const upcoming = useLoad(() => api<Contest[]>('/contests/upcoming'), []);
  const [before, setBefore] = useState<number | null>(null);
  const [older, setOlder] = useState<PastContest[]>([]);
  const past = useLoad(() => api<PastContest[]>(`/contests/past${before ? `?before=${before}` : ''}`), [before]);
  const rows = before ? [...older, ...(past.data ?? [])] : (past.data ?? []);

  return (
    <div className="flex max-w-[800px] flex-col gap-5">
      <h1 className="display text-[52px] leading-none tracking-[-0.035em]">Contests</h1>
      {(upcoming.error || past.error) && <ErrorText>{upcoming.error || past.error}</ErrorText>}
      <Card>
        <h2 className="display mb-2 text-lg">Upcoming</h2>
        {upcoming.data?.length === 0 && <p className="text-muted">No upcoming contests. Check back soon.</p>}
        <div className="flex flex-col divide-y divide-line">
          {upcoming.data?.map((contest) => <ContestRow key={contest.id} contest={contest} />)}
        </div>
      </Card>
      <Card>
        <h2 className="display mb-2 text-lg">Past contests</h2>
        {rows.length === 0 && past.data && <p className="text-muted">Your results will appear here after your first contest.</p>}
        <div className="flex flex-col divide-y divide-line">
          {rows.map((contest) => (
            <div key={contest.id} className="flex items-center gap-3 py-2">
              <CellMark status={contest.status} reasonType={contest.reasonType} />
              <div className="min-w-0 flex-1">
                <a href={contest.url} target="_blank" rel="noreferrer" className="block truncate font-bold hover:underline">{contest.name}</a>
                <p className="text-xs text-muted"><PlatformCode platform={contest.platform} /> · {formatIST(contest.startAt).split(' · ')[0]} · {contestResult(contest)}</p>
              </div>
            </div>
          ))}
        </div>
        {past.data?.length === PAGE_SIZE && (
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => {
              setOlder(rows);
              setBefore(rows[rows.length - 1].startAt);
            }}
          >
            Show more
          </Button>
        )}
      </Card>
    </div>
  );
}
