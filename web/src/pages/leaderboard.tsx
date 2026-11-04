import { useState } from 'react';
import { Link } from 'react-router-dom';
import { studyYearLabel } from 'shared/batch';
import { solvePoints } from 'shared/scoring';
import { formatIST, IST_OFFSET, periodStart, solvesText, timeAgo } from 'shared/time';
import type { Period } from 'shared/types';
import { api } from '../api';
import { NextContest, type Contest } from '../next-contest';
import { Avatar, Card, ErrorText, Eyebrow, initials, platformLabel, ProgressBar, Rating, RatingChip, Tabs, useLoad, useMe } from '../ui';

type Row = {
  rank: number;
  moved: number | null;
  userId: number;
  name: string;
  batchYear: number | null;
  cfHandle: string | null;
  cfRating: number | null;
  points: number;
  solves: number;
  hardest: number;
};
type Solve = { userId: number; name: string; platform: string; problemId: string; problemName: string | null; tags: string[]; rp: number; solvedAt: number };

const TABS: { id: Period; label: string; title: string; empty: string }[] = [
  { id: 'day', label: 'Today', title: 'Today', empty: 'No solves today yet. One problem gets you on the board.' },
  { id: 'week', label: 'Week', title: 'This week', empty: 'No solves this week yet. One problem gets you on the board.' },
  { id: 'month', label: 'Month', title: 'This month', empty: 'No solves this month yet. One problem gets you on the board.' },
];
const PODIUM = [
  { fill: 'bg-lime', height: 250, place: '1st' },
  { fill: 'bg-pink', height: 226, place: '2nd' },
  { fill: 'bg-sun', height: 210, place: '3rd' },
];
const HINT_RATING = 1500;
const FEED_ITEMS = 5;
const NOW = () => Math.floor(Date.now() / 1000);
const dateOnly = (ts: number) => formatIST(ts).split(' · ')[0];

function periodLine(period: Period): string {
  const start = periodStart(period, NOW());
  if (period === 'day') return dateOnly(start);
  if (period === 'week') {
    const [monday] = dateOnly(start).split(', ');
    return `${monday} ${dateOnly(start).split(', ')[1]} – Sun ${dateOnly(start + 6 * 86400).split(', ')[1]}`;
  }
  return dateOnly(start).split(' ').slice(-1)[0] + ' ' + new Date((start + IST_OFFSET) * 1000).getUTCFullYear();
}

function Podium({ rows }: { rows: Row[] }) {
  return (
    <div className="grid items-start gap-3 md:grid-cols-3">
      {rows.slice(0, 3).map((row, index) => (
        <Link
          key={row.userId}
          to={`/u/${row.userId}`}
          className={`lift flex flex-col justify-between rounded-[22px] p-5 text-ink ${PODIUM[index].fill}`}
          style={{ minHeight: PODIUM[index].height }}
        >
          <div className="flex items-start justify-between">
            <span className="flex size-11 items-center justify-center rounded-full bg-ink font-bold text-text">{initials(row.name)}</span>
            <span className="display text-[44px] leading-none">{PODIUM[index].place}</span>
          </div>
          <div>
            <p className="display text-xl">{row.name}</p>
            <p className="handle text-xs">{row.cfHandle ? `@${row.cfHandle}` : ''}{row.cfRating ? ` · ${row.cfRating}` : ''}</p>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="num text-[40px] leading-none tracking-[-0.03em]">{row.points}</p>
              <p className="text-xs font-bold">points</p>
            </div>
            <span className="rounded-full bg-ink/15 px-3 py-1 text-xs font-bold">{solvesText(row.solves)} · max {row.hardest}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function ChaseBar({ rows, myId }: { rows: Row[]; myId: number }) {
  const index = rows.findIndex((row) => row.userId === myId);
  const mine = rows[index];
  const above = rows[index - 1];
  const hint = solvePoints(HINT_RATING, mine?.cfRating ?? null, false);
  const headline = !mine
    ? "You're not on the board yet."
    : above
      ? <>You're <span className="num text-lime">#{mine.rank}</span> · <span className="num">{Math.round((above.points - mine.points) * 10) / 10}</span> pts behind {above.name.split(' ')[0]}</>
      : <>You're <span className="num text-lime">#{mine.rank}</span>. Nobody's ahead of you.</>;
  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold">{headline}</p>
        <span className="rounded-full bg-card-2 px-3 py-1 text-xs font-bold text-muted">One {HINT_RATING} problem ≈ +<span className="num">{hint}</span></span>
      </div>
      <ProgressBar percent={mine ? (above ? (mine.points / above.points) * 100 : 100) : 0} color="bg-lime" />
    </div>
  );
}

function Movement({ moved }: { moved: number | null }) {
  if (!moved) return <span className="num w-7 text-xs text-muted" aria-label="No change">—</span>;
  return moved > 0
    ? <span className="num w-7 text-xs text-lime" aria-label={`Up ${moved}`}>▲{moved}</span>
    : <span className="num w-7 text-xs text-pink" aria-label={`Down ${-moved}`}>▼{-moved}</span>;
}

function Sidebar() {
  const contests = useLoad(() => api<Contest[]>('/contests/upcoming'), []);
  const challenge = useLoad(() => api<{ solved: number; target: number; minRating: number }>('/challenge'), []);
  const feed = useLoad(() => api<Solve[]>('/feed'), []);
  const now = NOW();
  const next = contests.data?.[0];
  return (
    <aside className="flex flex-col gap-3">
      {next && <NextContest contest={next} onChange={contests.reload} />}
      {contests.data?.length === 0 && <Card><p className="text-muted">No contests coming up yet. Check back soon.</p></Card>}
      {challenge.data && (
        <Card className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="display text-lg">Weekly challenge</h2>
            <span className="num text-pink">{challenge.data.solved}/{challenge.data.target}</span>
          </div>
          <p className="text-muted">Club solves {challenge.data.target} problems rated {challenge.data.minRating}+ by Sunday.</p>
          <ProgressBar percent={(challenge.data.solved / challenge.data.target) * 100} color="bg-pink" height={12} />
        </Card>
      )}
      <Card className="flex flex-col gap-3">
        <h2 className="display flex items-center gap-2 text-lg"><i aria-hidden className="size-2 rounded-full bg-lime" />Live feed</h2>
        {feed.data?.length === 0 && <p className="text-muted">Nothing yet. The first solve shows up here.</p>}
        {feed.data?.slice(0, FEED_ITEMS).map((solve) => (
          <div key={`${solve.userId}-${solve.platform}-${solve.problemId}`} className="flex items-start gap-2">
            <Avatar userId={solve.userId} name={solve.name} size={32} />
            <div className="min-w-0 flex-1">
              <p>
                <Link to={`/u/${solve.userId}`} className="font-bold hover:underline">{solve.name.split(' ')[0]}</Link> solved {solve.problemName ?? solve.problemId} on {platformLabel(solve.platform)}
              </p>
              <p className="text-xs text-muted">{[...solve.tags.slice(0, 2), timeAgo(solve.solvedAt, now)].join(' · ')}</p>
            </div>
            <RatingChip value={solve.rp} />
          </div>
        ))}
        <Link to="/feed" className="font-bold text-lime hover:underline">All solves →</Link>
      </Card>
    </aside>
  );
}

export function Leaderboard() {
  const { me } = useMe();
  const [period, setPeriod] = useState<Period>('week');
  const { data: rows, error } = useLoad(() => api<Row[]>(`/leaderboard?period=${period}`), [period]);
  const tab = TABS.find((t) => t.id === period) ?? TABS[0];
  const list = rows ?? [];
  const totalSolves = list.reduce((sum, row) => sum + row.solves, 0);
  const now = NOW();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col items-start gap-2">
          <Eyebrow>Who's grinding</Eyebrow>
          <h1 className="display text-[52px] leading-none tracking-[-0.035em]">{tab.title}</h1>
          <p className="text-muted">
            {periodLine(period)} · <span className="num">{list.length}</span> on the board · <span className="num">{totalSolves}</span> solves
          </p>
        </div>
        <Tabs tabs={TABS} value={period} onChange={setPeriod} />
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      {list.length > 0 && <Podium rows={list} />}
      <div className="grid items-start gap-5 min-[900px]:grid-cols-[1fr_320px]">
        <section className="min-w-0 overflow-hidden rounded-[22px] border border-line bg-card">
          <ChaseBar rows={list} myId={me.user.id} />
          {rows?.length === 0 && <p className="px-4 pb-6 text-muted">{tab.empty}</p>}
          {list.length > 3 && (
            <div className="flex flex-col gap-1 px-2 pb-2">
              <div className="label hidden grid-cols-[64px_1fr_64px_72px_80px] gap-2 px-3 py-2 sm:grid">
                <span>Rank</span><span>Student</span><span className="text-right">Solves</span><span className="text-right">Max</span><span className="text-right">Points</span>
              </div>
              {list.slice(3).map((row) => {
                const mine = row.userId === me.user.id;
                return (
                  <div key={row.userId} className={`grid grid-cols-[52px_1fr_auto] items-center gap-2 rounded-[14px] border px-3 py-2 sm:grid-cols-[64px_1fr_64px_72px_80px] ${mine ? 'border-lime-line bg-lime-tint' : 'border-transparent'}`}>
                    <span className="flex items-center gap-1"><span className="num">{row.rank}</span><Movement moved={row.moved} /></span>
                    <span className="flex min-w-0 items-center gap-2">
                      <Avatar userId={row.userId} name={row.name} />
                      <span className="min-w-0">
                        <Link to={`/u/${row.userId}`} className="block truncate font-bold hover:underline">
                          {mine ? 'You' : row.name} <span className="font-normal text-muted">{studyYearLabel(row.batchYear, now)}</span>
                        </Link>
                        {row.cfHandle && <span className="block truncate text-xs"><Rating value={row.cfRating}>@{row.cfHandle}</Rating></span>}
                        <span className="block text-xs text-muted sm:hidden">{solvesText(row.solves)} · max <Rating value={row.hardest} /></span>
                      </span>
                    </span>
                    <span className="num hidden text-right sm:block">{row.solves}</span>
                    <span className="hidden text-right sm:block"><RatingChip value={row.hardest} /></span>
                    <span className="num text-right text-lime">{row.points}</span>
                  </div>
                );
              })}
            </div>
          )}
          <p className="border-t border-line p-4 text-xs text-muted">
            Harder problems and problems above your rating are worth more. Live contest solves get <span className="num">×1.5</span>.
          </p>
        </section>
        <Sidebar />
      </div>
    </div>
  );
}
