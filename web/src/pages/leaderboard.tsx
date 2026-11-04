import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Period } from 'shared/types';
import { api } from '../api';
import { ErrorText, Rating, Tabs, useLoad, useMe } from '../ui';

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

const TABS: { id: Period; label: string; empty: string }[] = [
  { id: 'day', label: 'Today', empty: 'No solves today yet. One problem gets you on the board.' },
  { id: 'week', label: 'This week', empty: 'No solves this week yet. One problem gets you on the board.' },
  { id: 'month', label: 'This month', empty: 'No solves this month yet. One problem gets you on the board.' },
];

export function Leaderboard() {
  const { me } = useMe();
  const [period, setPeriod] = useState<Period>('day');
  const { data: rows, error } = useLoad(() => api<Row[]>(`/leaderboard?period=${period}`), [period]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Leaderboard</h1>
        <Tabs tabs={TABS} value={period} onChange={setPeriod} />
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      {rows?.length === 0 && <p className="text-muted">{TABS.find((t) => t.id === period)?.empty}</p>}
      {!!rows?.length && (
        <div className="rounded-xl border border-border bg-surface">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="label p-3 font-medium">#</th>
                <th className="label p-3 font-medium">Name</th>
                <th className="label hidden p-3 font-medium sm:table-cell">Handle</th>
                <th className="label hidden p-3 text-right font-medium sm:table-cell">Solves</th>
                <th className="label hidden p-3 text-right font-medium sm:table-cell">Hardest</th>
                <th className="label p-3 text-right font-medium">Points</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.userId}
                  className={`border-b border-border last:border-0 ${row.userId === me.user.id ? 'shadow-[inset_2px_0_0_var(--accent)]' : ''}`}
                >
                  <td className={`num p-3 ${row.rank <= 3 ? 'text-text' : 'text-muted'}`}>{row.rank}</td>
                  <td className="p-3">
                    <Link to={`/u/${row.userId}`} className="font-medium hover:underline">{row.name}</Link>
                    <span className="num ml-2 text-muted">{row.batchYear}</span>
                    <div className="sm:hidden"><Rating value={row.cfRating}>{row.cfHandle}</Rating></div>
                    <div className="text-muted sm:hidden"><span className="num">{row.solves}</span> solves · hardest <Rating value={row.hardest} /></div>
                  </td>
                  <td className="hidden p-3 sm:table-cell"><Rating value={row.cfRating}>{row.cfHandle}</Rating></td>
                  <td className="num hidden p-3 text-right sm:table-cell">{row.solves}</td>
                  <td className="hidden p-3 text-right sm:table-cell"><Rating value={row.hardest} /></td>
                  <td className="num p-3 text-right text-accent">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
