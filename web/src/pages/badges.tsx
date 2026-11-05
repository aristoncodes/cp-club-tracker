import { Link, useSearchParams } from 'react-router-dom';
import { BADGES, type BadgeId } from 'shared/badges';
import { formatIST } from 'shared/time';
import { api } from '../api';
import { Card, ErrorText, ProgressBar, useLoad } from '../ui';

const ACCENTS: Record<string, string> = { lime: 'bg-lime', pink: 'bg-pink', sun: 'bg-sun', sky: 'bg-sky' };
type BadgeRow = { id: BadgeId; goal: number; value: number; earnedAt: number | null };

export function BadgeTile({ id, earned, size = 60 }: { id: BadgeId; earned: boolean; size?: number }) {
  const badge = BADGES.find((b) => b.id === id)!;
  return (
    <span style={{ width: size, height: size, fontSize: size * 0.3 }} className={`num flex shrink-0 -rotate-6 items-center justify-center rounded-2xl ${earned ? `${ACCENTS[badge.accent]} text-ink` : 'bg-lock text-lock-glyph'}`}>
      {badge.glyph}
    </span>
  );
}

const CONFETTI = [
  ['left-[8%] top-[12%] rotate-12', 'bg-lime'], ['left-[22%] top-[6%] -rotate-45', 'bg-pink'], ['left-[78%] top-[8%] rotate-45', 'bg-sun'], ['left-[90%] top-[20%] rotate-12', 'bg-sky'],
  ['left-[5%] top-[40%] -rotate-12', 'bg-sun'], ['left-[92%] top-[46%] rotate-45', 'bg-pink'], ['left-[12%] top-[70%] rotate-45', 'bg-sky'], ['left-[84%] top-[74%] -rotate-12', 'bg-lime'],
];

export function Celebration({ id, onDone }: { id: BadgeId; onDone: () => void }) {
  const badge = BADGES.find((b) => b.id === id)!;
  const next = BADGES.find((b) => b.stat === badge.stat && b.goal > badge.goal);
  return (
    <div role="dialog" aria-label={`New badge: ${badge.name}`} className="fixed inset-0 z-40 flex items-center justify-center bg-ink/80 p-4">
      <div className="relative flex w-full max-w-[420px] flex-col items-center gap-3 overflow-hidden rounded-[22px] border border-line bg-card p-8 text-center">
        {CONFETTI.map(([place, color], index) => <i key={index} aria-hidden className={`absolute h-3 w-2 ${place} ${color}`} />)}
        <p className="label">New badge</p>
        <BadgeTile id={id} earned size={116} />
        <h2 className="display text-[34px] leading-tight">{badge.name}</h2>
        <p className="text-muted">{next ? `Next: ${next.name}. ${next.how}.` : badge.how}</p>
        <button onClick={onDone} className="lift h-11 cursor-pointer rounded-full bg-lime px-8 font-extrabold text-ink">Nice!</button>
      </div>
    </div>
  );
}

export function Badges() {
  const [params] = useSearchParams();
  const user = params.get('user');
  const { data, error } = useLoad(() => api<BadgeRow[]>(`/badges${user ? `?user=${user}` : ''}`), [user]);
  const earned = data?.filter((row) => row.earnedAt).length ?? 0;
  const closest = data?.filter((row) => !row.earnedAt && row.value > 0).sort((a, b) => b.value / b.goal - a.value / a.goal)[0];
  return (
    <div className="flex flex-col gap-4">
      <Link to={user ? `/u/${user}` : '/profile'} className="font-bold text-lime hover:underline">← Back to profile</Link>
      <h1 className="display text-[52px] leading-none tracking-[-0.035em]">Badges</h1>
      <p className="text-muted"><span className="num text-text">{earned}</span> of <span className="num text-text">{BADGES.length}</span> earned{closest ? ` · closest next: ${BADGES.find((b) => b.id === closest.id)!.name}` : ''}</p>
      {error && <ErrorText>{error}</ErrorText>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
        {data?.map((row) => {
          const badge = BADGES.find((b) => b.id === row.id)!;
          return (
            <Card key={row.id} className="flex flex-col items-start gap-2">
              <BadgeTile id={row.id} earned={!!row.earnedAt} />
              <h2 className="display text-lg">{badge.name}</h2>
              <p className="text-xs text-muted">{badge.how}</p>
              {row.earnedAt ? (
                <span className="rounded-full bg-lime-tint px-3 py-1 text-xs font-bold text-lime">Earned {formatIST(row.earnedAt).split(', ')[1].split(' · ')[0]}</span>
              ) : badge.stat ? (
                <div className="w-full">
                  <ProgressBar percent={(row.value / row.goal) * 100} color="bg-lime" height={6} />
                  <p className="num mt-1 text-xs text-muted">{row.value} of {row.goal}</p>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
