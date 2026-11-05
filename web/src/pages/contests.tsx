import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatIST } from 'shared/time';
import { contestResult } from 'shared/reasons';
import { api, type Contest, type PastContest } from '../api';
import { Button, Card, CellMark, ContestRow, ErrorText, PlatformCode, Tabs, useLoad, VirtualTag } from '../ui';

type Virtual = Contest & { counts: number; startedCount: number };
type View = 'upcoming' | 'virtuals' | 'past';

const VIEWS: { id: View; label: string }[] = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'virtuals', label: 'Club virtuals' },
  { id: 'past', label: 'Past' },
];

function VirtualFeature({ virtual, onChange }: { virtual: Virtual; onChange: () => void }) {
  const [error, setError] = useState('');
  const started = virtual.startAt <= Date.now() / 1000;
  return (
    <section className="flex flex-col gap-3 rounded-[22px] bg-violet p-5 text-white">
      <div><VirtualTag /></div>
      <p className="text-sm text-violet-pale">{formatIST(virtual.startAt)}</p>
      <h2 className="display text-2xl leading-tight">{virtual.name}</h2>
      <p className="text-sm text-violet-pale">Start it on Codeforces within 15 minutes of the club start · <span className="num">{virtual.goingCount}</span> going</p>
      {!started && virtual.rsvp !== 'yes' && (
        <Button onClick={() => api(`/contests/${virtual.id}/rsvp`, 'POST', { going: true }).then(onChange).catch((err: Error) => setError(err.message))}>I'm in</Button>
      )}
      {!started && virtual.rsvp === 'yes' && <p className="rounded-full bg-lime px-5 py-2 text-center font-extrabold text-ink">You're in. Good luck!</p>}
      <Link to={`/virtual/${virtual.id}`} className="lift flex h-11 items-center justify-center rounded-full border-2 border-violet-soft font-bold">{started ? 'Standings' : 'Preview standings'}</Link>
      {error && <p className="rounded-2xl bg-ink p-3"><ErrorText>{error}</ErrorText></p>}
    </section>
  );
}

const PAGE_SIZE = 20;

export function Contests() {
  const [view, setView] = useState<View>('upcoming');
  const upcoming = useLoad(() => api<Contest[]>('/contests/upcoming'), []);
  const virtuals = useLoad(() => api<Virtual[]>('/virtuals'), []);
  const [before, setBefore] = useState<number | null>(null);
  const [older, setOlder] = useState<PastContest[]>([]);
  const past = useLoad(() => api<PastContest[]>(`/contests/past${before ? `?before=${before}` : ''}`), [before]);
  const rows = before ? [...older, ...(past.data ?? [])] : (past.data ?? []);

  const now = Date.now() / 1000;
  const nextVirtual = [...(virtuals.data ?? [])].filter((item) => item.endAt > now).sort((x, y) => x.startAt - y.startAt)[0];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-[52px] leading-none tracking-[-0.035em]">Contests</h1>
        <Tabs tabs={VIEWS} value={view} onChange={setView} />
      </div>
      {(upcoming.error || past.error || virtuals.error) && <ErrorText>{upcoming.error || past.error || virtuals.error}</ErrorText>}
      <div className="grid items-start gap-4 min-[900px]:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          {view === 'upcoming' && (
            <Card>
              <h2 className="display mb-2 text-lg">Coming up</h2>
              {upcoming.data?.length === 0 && <p className="text-muted">No contests coming up yet. Check back soon.</p>}
              <div className="flex flex-col divide-y divide-line">
                {upcoming.data?.map((contest) => <ContestRow key={contest.id} contest={contest} />)}
              </div>
            </Card>
          )}
          {view === 'virtuals' && (
            <Card>
              <h2 className="display mb-2 text-lg">Club virtuals</h2>
              {virtuals.data?.length === 0 && <p className="text-muted">No club virtuals yet. Coordinators schedule them here.</p>}
              <div className="flex flex-col gap-1">
                {virtuals.data?.map((item) => (
                  <Link key={item.id} to={`/virtual/${item.id}`} className="flex min-h-11 items-center justify-between gap-3 hover:underline">
                    <span className="min-w-0"><span className="block truncate font-bold">{item.name}</span><span className="text-xs text-muted">{formatIST(item.startAt)}</span></span>
                    <span className="shrink-0 text-xs text-muted"><span className="num text-text">{item.startedCount}</span> took part</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}
          {view === 'past' && (
            <Card>
              <h2 className="display mb-2 text-lg">Past contests</h2>
              {rows.length === 0 && past.data && <p className="text-muted">Your results show up here after your first contest.</p>}
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
          )}
        </div>
        {nextVirtual && <aside><VirtualFeature virtual={nextVirtual} onChange={virtuals.reload} /></aside>}
      </div>
    </div>
  );
}
