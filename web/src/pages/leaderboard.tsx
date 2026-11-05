import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { batchForStudyYear, STUDY_YEARS, studyYearLabel } from 'shared/batch';
import { solvePoints } from 'shared/scoring';
import { formatIST, IST_OFFSET, periodStart, solvesText } from 'shared/time';
import type { Period } from 'shared/types';
import { api } from '../api';
import { Avatar, Card, ErrorText, Eyebrow, initials, Pill, platformLabel, PLATFORMS, ProgressBar, Rating, RatingChip, Tabs, useLoad, useMe } from '../ui';

type Row = {
  rank: number;
  moved: number | null;
  userId: number;
  name: string;
  batchYear: number | null;
  username: string | null;
  cfRating: number | null;
  points: number;
  solves: number;
  hardest: number;
};
type Extras = {
  years: { batchYear: number; points: number }[];
  climbers: { userId: number; name: string; rank: number; gained: number }[];
  toughest: { userId: number; name: string; platform: string; problemId: string; problemName: string | null; rp: number }[];
};

const TABS: { id: Period; label: string; title: string; empty: string }[] = [
  { id: 'day', label: 'Today', title: 'Today', empty: 'No solves today yet. Solve one problem to join the leaderboard.' },
  { id: 'week', label: 'Week', title: 'This week', empty: 'No solves this week yet. Solve one problem to join the leaderboard.' },
  { id: 'month', label: 'Month', title: 'This month', empty: 'No solves this month yet. Solve one problem to join the leaderboard.' },
];
const PODIUM = [
  { fill: 'bg-lime', height: 250, place: '1st' },
  { fill: 'bg-pink', height: 226, place: '2nd' },
  { fill: 'bg-sun', height: 210, place: '3rd' },
];
const HINT_RATING = 1500;
const YEAR_COLORS = ['bg-sky', 'bg-pink', 'bg-sun', 'bg-lilac'];
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
            <p className="handle text-xs">{row.username ? `@${row.username}` : ''}{row.cfRating ? ` · ${row.cfRating}` : ''}</p>
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
    ? "You're not on the leaderboard yet."
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

function Sidebar({ extras }: { extras: Extras | null }) {
  const now = NOW();
  const totals = STUDY_YEARS.map((y) => ({
    ...y,
    points: extras?.years.find((row) => row.batchYear === batchForStudyYear(y.value, now))?.points ?? 0,
  }));
  const leader = Math.max(1, ...totals.map((t) => t.points));
  return (
    <aside className="flex flex-col gap-3">
      <Card className="flex flex-col gap-3">
        <h2 className="display text-lg">Year vs year</h2>
        {totals.map((total, index) => (
          <div key={total.value} className="flex flex-col gap-1">
            <div className="flex justify-between font-bold"><span>{total.label}</span><span className="num">{Math.round(total.points)}</span></div>
            <ProgressBar percent={(total.points / leader) * 100} color={YEAR_COLORS[index]} height={12} />
          </div>
        ))}
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="display text-lg">Biggest climbers</h2>
        {extras?.climbers.length === 0 && <p className="text-muted">No rank changes this period.</p>}
        {extras?.climbers.map((row) => (
          <Link key={row.userId} to={`/u/${row.userId}`} className="flex items-center gap-2">
            <Avatar userId={row.userId} name={row.name} size={32} />
            <span className="min-w-0 flex-1"><span className="block truncate font-bold">{row.name}</span><span className="text-xs text-muted">now <span className="num">#{row.rank}</span></span></span>
            <Pill tone="lime">▲{row.gained}</Pill>
          </Link>
        ))}
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="display text-lg">Hardest solves</h2>
        {extras?.toughest.length === 0 && <p className="text-muted">Nothing solved yet this period.</p>}
        {extras?.toughest.map((row) => (
          <Link key={`${row.userId}-${row.platform}-${row.problemId}`} to={`/u/${row.userId}`} className="flex items-center gap-2">
            <Avatar userId={row.userId} name={row.name} size={32} />
            <span className="min-w-0 flex-1"><span className="block truncate font-bold">{row.name}</span><span className="block truncate text-xs text-muted">{row.problemName ?? row.problemId} · {platformLabel(row.platform)}</span></span>
            <RatingChip value={row.rp} />
          </Link>
        ))}
      </Card>
    </aside>
  );
}

export function Leaderboard() {
  const { me } = useMe();
  const now = NOW();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>('week');
  const [batch, setBatch] = useState(0);
  const [platform, setPlatform] = useState('');
  const query = `period=${period}&platform=${platform}`;
  const { data: rows, error } = useLoad(() => api<Row[]>(`/leaderboard?${query}&batch=${batch || ''}`), [query, batch]);
  const club = useLoad(() => api<Row[]>(`/leaderboard?period=${period}`), [period]);
  const extras = useLoad(() => api<Extras>(`/leaderboard/extras?${query}`), [query]);
  const tab = TABS.find((t) => t.id === period) ?? TABS[0];
  const list = rows ?? [];
  const totalSolves = list.reduce((sum, row) => sum + row.solves, 0);
  const chipClass = (active: boolean) => `lift min-h-11 cursor-pointer rounded-full border px-4 font-bold ${active ? 'border-text bg-text text-ink' : 'border-line'}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col items-start gap-2">
          <Eyebrow>Leaderboard</Eyebrow>
          <h1 className="display text-[52px] leading-none tracking-[-0.035em]">{tab.title}</h1>
          <p className="text-muted">
            {periodLine(period)} · <span className="num">{list.length}</span> ranked · <span className="num">{totalSolves}</span> {totalSolves === 1 ? 'solve' : 'solves'}
          </p>
        </div>
        <Tabs tabs={TABS} value={period} onChange={setPeriod} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className={chipClass(batch === 0)} aria-pressed={batch === 0} onClick={() => setBatch(0)}>All</button>
        {STUDY_YEARS.map((y) => {
          const value = batchForStudyYear(y.value, now);
          return <button key={y.value} className={chipClass(batch === value)} aria-pressed={batch === value} onClick={() => setBatch(value)}>{y.label}</button>;
        })}
        <i aria-hidden className="mx-1 h-6 w-px bg-line" />
        <select aria-label="Platform" className="h-11 rounded-full border border-line bg-card px-4 font-bold text-text outline-none focus:border-lime" value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="">All platforms</option>
          {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      {list.length > 0 && <Podium rows={list} />}
      <div className="grid items-start gap-5 min-[900px]:grid-cols-[1fr_320px]">
        <section className="min-w-0 overflow-hidden rounded-[22px] border border-line bg-card">
          <ChaseBar rows={club.data ?? []} myId={me.user.id} />
          {rows?.length === 0 && <p className="px-4 pb-6 text-muted">{tab.empty}</p>}
          {list.length > 3 && (
            <div className="flex flex-col gap-1 px-2 pb-2">
              <div className="label hidden grid-cols-[64px_1fr_64px_72px_80px] gap-2 px-3 py-2 sm:grid">
                <span>Rank</span><span>Student</span><span className="text-right">Solves</span><span className="text-right">Max</span><span className="text-right">Points</span>
              </div>
              {list.slice(3).map((row) => {
                const mine = row.userId === me.user.id;
                return (
                  <div
                    key={row.userId}
                    role="link"
                    tabIndex={0}
                    onClick={() => navigate(mine ? '/profile' : `/u/${row.userId}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(mine ? '/profile' : `/u/${row.userId}`); }}
                    className={`grid cursor-pointer grid-cols-[52px_1fr_auto] items-center gap-2 rounded-[14px] border px-3 py-2 hover:bg-card-2 sm:grid-cols-[64px_1fr_64px_72px_80px] ${mine ? 'border-lime-line bg-lime-tint' : 'border-transparent'}`}
                  >
                    <span className="flex items-center gap-1"><span className="num">{row.rank}</span><Movement moved={row.moved} /></span>
                    <span className="flex min-w-0 items-center gap-2">
                      <Avatar userId={row.userId} name={row.name} />
                      <span className="min-w-0">
                        <span className="block truncate font-bold">{mine ? 'You' : row.name} <span className="font-normal text-muted">{studyYearLabel(row.batchYear, now)}</span></span>
                        {row.username && <span className="block truncate text-xs"><Rating value={row.cfRating}>@{row.username}</Rating></span>}
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
        <Sidebar extras={extras.data} />
      </div>
    </div>
  );
}
