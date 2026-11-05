import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatClock } from 'shared/duel';
import type { VirtualCell } from 'shared/virtual';
import { api } from '../api';
import { Avatar, Card, ErrorText, ProgressBar, useLoad, useMe } from '../ui';

type Standings = {
  id: number;
  name: string;
  url: string;
  startAt: number;
  endAt: number;
  now: number;
  problems: { index: string; name: string }[];
  rows: { userId: number; name: string; username: string | null; cells: Record<string, VirtualCell>; solved: number; penalty: number; rank: number }[];
};

const REFRESH_MS = 30_000;

function Cell({ cell }: { cell?: VirtualCell }) {
  const base = 'num flex size-[30px] flex-col items-center justify-center rounded-[8px] text-[11px] leading-none';
  if (cell?.solvedAt !== undefined) {
    return (
      <span className={`${base} bg-lime text-ink`}>
        {cell.wrong ? `+${cell.wrong}` : '+'}
        <span className="text-[8px]">{Math.floor(cell.solvedAt / 60)}</span>
      </span>
    );
  }
  if (cell?.wrong) return <span className={`${base} bg-pink-tint text-pink-text`}>−{cell.wrong}</span>;
  return <span className={`${base} bg-card-2`} />;
}

export function VirtualStandings() {
  const { id } = useParams();
  const { me } = useMe();
  const { data, error, reload } = useLoad(() => api<Standings>(`/virtuals/${id}/standings`), [id]);

  useEffect(() => {
    const timer = setInterval(reload, REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return null;
  const live = data.now >= data.startAt && data.now < data.endAt;
  const started = data.now >= data.startAt;
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-[22px] bg-violet p-6 text-white">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white px-3 py-1 text-[11px] font-extrabold tracking-wider text-[#5B21B6] uppercase">Club virtual</span>
          {live && <span className="text-xs font-extrabold tracking-wider text-lime uppercase">Live</span>}
        </div>
        <h1 className="display text-[30px] leading-tight">{data.name}</h1>
        <p className="text-violet-pale">{started ? 'Started' : 'Not started'} · <span className="num">{data.rows.length}</span> {data.rows.length === 1 ? 'member' : 'members'} in</p>
        {live && <p className="num text-[40px] leading-none">{formatClock(data.endAt - data.now)}</p>}
        <a href={data.url} target="_blank" rel="noreferrer" className="lift inline-flex h-11 items-center self-start rounded-full bg-lime px-5 font-extrabold text-ink">Open on Codeforces</a>
      </section>
      <div className="grid items-start gap-4 min-[900px]:grid-cols-[1fr_280px]">
        <Card className="overflow-x-auto">
          {data.rows.length === 0 ? (
            <p className="text-muted">{started ? 'Nobody has started yet. Start the virtual on Codeforces within 15 minutes of the club start.' : 'Standings appear once the virtual starts.'}</p>
          ) : (
            <table className="w-full border-separate border-spacing-y-1 text-left">
              <thead>
                <tr className="label">
                  <th className="px-1">#</th>
                  <th className="px-1">Member</th>
                  {data.problems.map((problem) => <th key={problem.index} title={problem.name} className="px-0.5 text-center">{problem.index}</th>)}
                  <th className="px-1 text-center">Solved</th>
                  <th className="px-1 text-center">Penalty</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.userId} className={row.userId === me.user.id ? 'bg-lime-tint' : ''}>
                    <td className="num px-1">{row.rank}</td>
                    <td className="px-1"><Link to={`/u/${row.userId}`} className="flex items-center gap-2"><Avatar userId={row.userId} name={row.name} size={28} /><span className="handle truncate text-xs">@{row.username ?? row.name}</span></Link></td>
                    {data.problems.map((problem) => <td key={problem.index} className="px-0.5"><Cell cell={row.cells[problem.index]} /></td>)}
                    <td className="num px-1 text-center text-lime">{row.solved}</td>
                    <td className="num px-1 text-center text-muted">{row.penalty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <aside className="flex flex-col gap-3">
          <Card className="flex flex-col gap-2">
            <h2 className="display text-lg">Problems</h2>
            {data.problems.map((problem) => {
              const solved = data.rows.filter((row) => row.cells[problem.index]?.solvedAt !== undefined).length;
              return (
                <div key={problem.index}>
                  <p className="flex justify-between gap-2 text-xs"><span className="truncate"><b>{problem.index}</b> {problem.name}</span><span className="num shrink-0 text-muted">{solved} of {data.rows.length}</span></p>
                  <ProgressBar percent={data.rows.length ? (solved / data.rows.length) * 100 : 0} color="bg-lime" height={6} />
                </div>
              );
            })}
          </Card>
          <Card className="flex flex-col gap-1 text-xs text-muted">
            <p><b className="text-lime">+</b> solved, with wrong tries and minute</p>
            <p><b className="text-pink-text">−N</b> N wrong tries</p>
            <p>Only members who start within 15 minutes of the club start show here.</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
