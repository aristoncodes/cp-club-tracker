import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatIST } from 'shared/time';
import { api } from '../api';
import { Avatar, ErrorText, useLoad, useMe } from '../ui';

export type Recap = {
  week: number;
  points: number;
  rank: number | null;
  rankChange: number | null;
  solves: number;
  hardest: { rp: number; name: string | null } | null;
  contests: number;
  streak: number;
  topTopic: string | null;
  duels: { wins: number; losses: number; draws: number };
  goal: { target: number; minRating: number; done: number } | null;
  shoutout: { kind: string; userId: number; name: string; username: string | null; gained: number } | null;
  upcoming: { id: number; name: string; platform: string; startAt: number }[];
};

const DAY = 86400;
const PAGES = 3;

function Highlight({ glyph, fill, label, value }: { glyph: string; fill: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-violet-deep p-3">
      <span className={`num flex size-11 shrink-0 items-center justify-center rounded-[12px] text-ink ${fill}`}>{glyph}</span>
      <div className="min-w-0">
        <p className="text-xs font-bold tracking-wider text-violet-soft uppercase">{label}</p>
        <p className="truncate font-bold">{value}</p>
      </div>
    </div>
  );
}

export function RecapPage() {
  const { me } = useMe();
  const navigate = useNavigate();
  const { data, error } = useLoad(() => api<Recap>('/recap'), []);
  const [page, setPage] = useState(0);
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return null;
  const dates = `${formatIST(data.week).split(', ')[1].split(' · ')[0]} – ${formatIST(data.week + 6 * DAY).split(', ')[1].split(' · ')[0]}`;
  const headlines = [`Big week, ${me.user.name.split(' ')[0]}.`, 'Your highlights.', 'Around the club.'];
  const roundButton = 'lift flex size-12 cursor-pointer items-center justify-center rounded-full border border-line bg-card font-bold disabled:opacity-30 max-sm:hidden';
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center gap-4 overflow-y-auto bg-[#08080C] p-4">
      <button aria-label="Previous" className={roundButton} disabled={page === 0} onClick={() => setPage(page - 1)}>←</button>
      <section className="flex min-h-[min(860px,100%)] w-full max-w-[460px] flex-col gap-4 rounded-[22px] bg-violet p-6 text-white">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 gap-1">
            {Array.from({ length: PAGES }, (_, index) => <i key={index} className={`h-1 flex-1 rounded-full ${index <= page ? 'bg-white' : 'bg-white/30'}`} />)}
          </div>
          <button aria-label="Close" className="flex size-11 cursor-pointer items-center justify-center text-2xl" onClick={() => navigate('/')}>×</button>
        </div>
        <p className="text-sm font-bold text-violet-soft">Your week · {dates}</p>
        <h1 className="display text-[44px] leading-none tracking-[-0.03em]">{headlines[page]}</h1>
        <div className="flex flex-1 flex-col gap-3">
          {page === 0 && (
            <>
              <div className="-rotate-2 rounded-[22px] bg-lime p-6 text-ink">
                <p className="text-xs font-extrabold tracking-wider uppercase">Points</p>
                <p className="num text-[68px] leading-none tracking-[-0.03em]">{data.points}</p>
                <p className="font-bold">{data.rank ? <>Rank <span className="num">#{data.rank}</span></> : 'Not on the board this week'}{data.rankChange ? <> · <span className="num">{data.rankChange > 0 ? '▲' : '▼'}{Math.abs(data.rankChange)}</span></> : null}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-[14px] bg-violet-deep p-3"><p className="num text-3xl">{data.solves}</p><p className="text-xs font-bold text-violet-soft">Solves{data.hardest ? ` · hardest ${data.hardest.rp}` : ''}</p></div>
                <div className="rounded-[14px] bg-violet-deep p-3"><p className="num text-3xl">{data.contests}</p><p className="text-xs font-bold text-violet-soft">Contests attended</p></div>
              </div>
            </>
          )}
          {page === 1 && (
            <>
              <Highlight glyph="7d" fill="bg-sun" label="Streak" value={`${data.streak} ${data.streak === 1 ? 'day' : 'days'}`} />
              <Highlight glyph="#" fill="bg-sky" label="Top topic" value={data.topTopic ?? 'Nothing yet this week'} />
              <Highlight glyph="VS" fill="bg-pink" label="Duels" value={`${data.duels.wins}W · ${data.duels.losses}L · ${data.duels.draws}D`} />
              <Highlight glyph="GO" fill="bg-lime" label="Weekly goal" value={data.goal ? `${data.goal.done} of ${data.goal.target} at ${data.goal.minRating}+` : 'No goal this week'} />
            </>
          )}
          {page === 2 && (
            <>
              {data.shoutout && (
                <div className="flex -rotate-2 items-center gap-3 rounded-[22px] bg-ink p-5">
                  <Avatar userId={data.shoutout.userId} name={data.shoutout.name} size={52} />
                  <div className="min-w-0">
                    <p className="handle truncate text-lime">@{data.shoutout.username ?? data.shoutout.name}</p>
                    <p className="text-sm text-muted">{data.shoutout.kind === 'climber' ? <>Climbed <span className="num">{data.shoutout.gained}</span> places this week</> : 'Top of the board this week'}</p>
                  </div>
                </div>
              )}
              <div className="rounded-[14px] bg-violet-deep p-4">
                <p className="mb-1 text-xs font-bold tracking-wider text-violet-soft uppercase">Next week</p>
                {data.upcoming.length === 0 && <p className="text-violet-pale">Nothing scheduled yet.</p>}
                {data.upcoming.map((contest) => <p key={contest.id} className="truncate text-sm">{formatIST(contest.startAt).split(' · ')[0]} · {contest.name}</p>)}
              </div>
            </>
          )}
        </div>
        {page < PAGES - 1 ? (
          <button onClick={() => setPage(page + 1)} className="lift h-11 cursor-pointer rounded-full bg-white font-extrabold text-[#5B21B6]">Next</button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setPage(0)} className="lift h-11 flex-1 cursor-pointer rounded-full border-2 border-violet-soft font-bold">Replay</button>
            <button onClick={() => navigate('/')} className="lift h-11 flex-1 cursor-pointer rounded-full bg-lime font-extrabold text-ink">Done</button>
          </div>
        )}
      </section>
      <button aria-label="Next" className={roundButton} disabled={page === PAGES - 1} onClick={() => setPage(page + 1)}>→</button>
    </div>
  );
}
