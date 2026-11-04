import { useState } from 'react';
import { Link } from 'react-router-dom';
import { studyYearLabel } from 'shared/batch';
import { formatIST, timeAgo } from 'shared/time';
import type { Period } from 'shared/types';
import { api } from '../api';
import { Box, ErrorText, platformLabel, Rating, Tabs, useLoad, useMe } from '../ui';

type Row = {
  rank: number;
  userId: number;
  name: string;
  batchYear: number | null;
  cfHandle: string | null;
  cfRating: number | null;
  points: number;
  solves: number;
  hardest: number;
};
type Contest = { id: number; platform: string; name: string; url: string; startAt: number };
type Solve = { userId: number; name: string; platform: string; problemId: string; problemName: string | null; rp: number; solvedAt: number };

const TABS: { id: Period; label: string; empty: string }[] = [
  { id: 'day', label: 'Today', empty: 'No solves today yet. One problem gets you on the board.' },
  { id: 'week', label: 'This week', empty: 'No solves this week yet. One problem gets you on the board.' },
  { id: 'month', label: 'This month', empty: 'No solves this month yet. One problem gets you on the board.' },
];
const SIDE_CONTESTS = 4;
const SIDE_SOLVES = 6;

function countdown(startAt: number, now: number): string {
  const hours = Math.max(0, Math.floor((startAt - now) / 3600));
  return hours >= 24 ? `in ${Math.floor(hours / 24)}d ${hours % 24}h` : `in ${hours}h ${Math.floor(((startAt - now) % 3600) / 60)}m`;
}

function UpcomingBox() {
  const { data: contests } = useLoad(() => api<Contest[]>('/contests/upcoming'), []);
  const now = Date.now() / 1000;
  return (
    <Box title="Upcoming contests">
      {contests?.length === 0 && <p className="p-3 text-muted">No contests coming up yet. Check back soon.</p>}
      {contests?.slice(0, SIDE_CONTESTS).map((contest) => (
        <div key={contest.id} className="border-b border-border px-3 py-2 last:border-0">
          <a className="link font-medium" href={contest.url} target="_blank" rel="noreferrer">{contest.name}</a>
          <p className="text-xs text-muted">{platformLabel(contest.platform)} · {formatIST(contest.startAt)}</p>
          <p className="num text-xs">{countdown(contest.startAt, now)}</p>
        </div>
      ))}
    </Box>
  );
}

function RecentBox() {
  const { data: solves } = useLoad(() => api<Solve[]>('/feed'), []);
  const now = Date.now() / 1000;
  return (
    <Box title="Recent solves">
      {solves?.length === 0 && <p className="p-3 text-muted">Nothing yet. The first solve shows up here.</p>}
      {solves?.slice(0, SIDE_SOLVES).map((solve) => (
        <div key={`${solve.userId}-${solve.platform}-${solve.problemId}`} className="border-b border-border px-3 py-2 last:border-0">
          <Link className="link font-medium" to={`/u/${solve.userId}`}>{solve.name}</Link> <span className="text-muted">solved</span> <Rating value={solve.rp} />
          <p className="truncate text-xs text-muted">{solve.problemName ?? solve.problemId} · {timeAgo(solve.solvedAt, now)}</p>
        </div>
      ))}
      <Link to="/feed" className="link block border-t border-border px-3 py-2 text-right text-xs">All solves →</Link>
    </Box>
  );
}

function StandingBox({ rows, label, myId }: { rows: Row[]; label: string; myId: number }) {
  const mine = rows.find((row) => row.userId === myId);
  return (
    <Box title={`Your standing: ${label.toLowerCase()}`}>
      <div className="grid grid-cols-3 divide-x divide-border text-center">
        <div className="p-2"><div className="num text-lg font-bold">{mine?.rank ?? '—'}</div><div className="text-xs text-muted">Rank</div></div>
        <div className="p-2"><div className="num text-lg font-bold text-accent">{mine?.points ?? 0}</div><div className="text-xs text-muted">Points</div></div>
        <div className="p-2"><div className="num text-lg font-bold">{mine?.solves ?? 0}</div><div className="text-xs text-muted">Solves</div></div>
      </div>
    </Box>
  );
}

export function Leaderboard() {
  const { me } = useMe();
  const [period, setPeriod] = useState<Period>('day');
  const { data: rows, error } = useLoad(() => api<Row[]>(`/leaderboard?period=${period}`), [period]);
  const tab = TABS.find((t) => t.id === period) ?? TABS[0];

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_300px]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">Leaderboard</h1>
          <Tabs tabs={TABS} value={period} onChange={setPeriod} />
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th>Who</th>
                <th className="right hidden sm:table-cell">Solves</th>
                <th className="right hidden sm:table-cell">Hardest</th>
                <th className="right">Points</th>
              </tr>
            </thead>
            <tbody>
              {rows?.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted">{tab.empty}</td>
                </tr>
              )}
              {rows?.map((row) => (
                <tr key={row.userId} className={row.userId === me.user.id ? 'shadow-[inset_3px_0_0_var(--accent)]' : ''}>
                  <td className={`num ${row.rank <= 3 ? 'font-bold' : 'text-muted'}`}>{row.rank}</td>
                  <td>
                    <Link to={`/u/${row.userId}`} className="hover:underline">
                      <Rating value={row.cfRating}>{row.cfHandle ?? row.name}</Rating>
                    </Link>
                    <span className="ml-2 text-muted">{[row.name, studyYearLabel(row.batchYear, Date.now() / 1000)].filter(Boolean).join(' · ')}</span>
                    <div className="text-xs text-muted sm:hidden">
                      <span className="num">{row.solves}</span> solves · hardest <Rating value={row.hardest} />
                    </div>
                  </td>
                  <td className="num right hidden sm:table-cell">{row.solves}</td>
                  <td className="right hidden sm:table-cell"><Rating value={row.hardest} /></td>
                  <td className="num right font-bold text-accent">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <aside className="flex flex-col gap-3">
        <StandingBox rows={rows ?? []} label={tab.label} myId={me.user.id} />
        <UpcomingBox />
        <RecentBox />
      </aside>
    </div>
  );
}
