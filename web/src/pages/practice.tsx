import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GOAL_RATINGS, GOAL_TARGETS } from 'shared/goal';
import { potdBandLabel } from 'shared/potd';
import { ratingColor } from 'shared/rating-color';
import { formatIST } from 'shared/time';
import { problemLetter } from 'shared/upsolve';
import { api } from '../api';
import { Avatar, Button, Card, ErrorText, RatingChip, useLoad, useMe } from '../ui';

export type Potd =
  | { problem: null; reason: 'needsHandle' | 'notPicked' }
  | {
      band: number;
      problem: { problemId: string; name: string; rating: number; url: string; tags: string[] | null };
      revealed: boolean;
      bonus: number;
      solvedAt: number | null;
      solvedCount: number;
      bandCount: number;
      nextAt: number;
      bonusFull: number;
      bonusRevealed: number;
      streak: number;
      strip: { label: string; state: 'done' | 'today' | 'other' }[];
      members: { userId: number; name: string; username: string | null; solvedAt: number | null }[];
    };
export type Upsolve = { contestId: number; contestName: string; endAt: number; problemId: string; name: string | null; rating: number | null; url: string | null; done: number };
export type Goal = { goal: { target: number; minRating: number } | null; done: number; locked: boolean; suggestions: Record<string, number> };

function timeLeft(until: number): string {
  const left = Math.max(0, until - Math.floor(Date.now() / 1000));
  return `${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}m`;
}

export function PotdCard({ data, onChange, large }: { data: Potd; onChange: () => void; large?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  if (!data.problem) {
    return (
      <Card>
        <p className="label">Problem of the day</p>
        <p className="text-muted">{data.reason === 'needsHandle' ? 'Your problem appears once your Codeforces handle is approved.' : 'Today\'s problem is on its way.'}</p>
      </Card>
    );
  }
  const { problem } = data;

  async function reveal() {
    setError('');
    try {
      await api('/practice/potd/reveal', 'POST');
      setConfirming(false);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="relative flex flex-col gap-3 overflow-hidden rounded-[22px] bg-lime p-6 text-ink">
      <p className="text-xs font-extrabold tracking-wider uppercase">Problem of the day · {potdBandLabel(data.band)}</p>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className={`display min-w-0 ${large ? 'text-[36px]' : 'text-[30px]'} leading-tight`}>{problem.name}</h2>
        <span className="num rounded-full bg-ink px-3 py-1 text-sm" style={{ color: ratingColor(problem.rating) }}>{problem.rating}</span>
      </div>
      <p className="font-bold">
        {data.solvedAt ? <>Solved · streak <span className="num">{data.streak}</span> · </> : null}
        Solved by <span className="num">{data.solvedCount}</span> of <span className="num">{data.bandCount}</span> in your band ·{' '}
        {data.revealed ? <><span className="num opacity-70">+{data.bonusRevealed}</span> bonus · tags revealed</> : <><span className="num">+{data.bonus}</span> bonus</>}
      </p>
      {problem.tags ? (
        <div className="flex flex-wrap gap-1.5">{problem.tags.map((tag) => <span key={tag} className="rounded-full bg-[rgba(14,14,20,.12)] px-3 py-1 text-xs font-bold">{tag}</span>)}</div>
      ) : !confirming ? (
        <button onClick={() => setConfirming(true)} className="min-h-11 cursor-pointer self-start rounded-full border-2 border-dashed border-ink px-4 text-xs font-bold">Reveal tags · bonus +{data.bonusFull} → +{data.bonusRevealed}</button>
      ) : (
        <div role="dialog" aria-label="Reveal tags" className="flex flex-col gap-2 rounded-2xl bg-ink p-4 text-text">
          <p className="font-bold">Reveal tags? Your bonus drops from +{data.bonusFull} to +{data.bonusRevealed}.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setConfirming(false)}>Keep hidden</Button>
            <Button variant="secondary" onClick={reveal}>Reveal</Button>
          </div>
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <a href={problem.url} target="_blank" rel="noreferrer" className="lift inline-flex h-11 items-center rounded-full bg-ink px-5 font-extrabold text-lime">{large ? 'Open on Codeforces' : 'Solve it'}</a>
        {large && <span className="text-xs font-bold">next in <span className="num">{timeLeft(data.nextAt)}</span></span>}
      </div>
      {large && (
        <div className="grid max-w-[320px] grid-cols-7 gap-1.5">
          {data.strip.map((day, index) => (
            <span key={index} aria-label={day.state === 'done' ? `${day.label}: solved` : day.state === 'today' ? 'Today' : day.label} className={`flex aspect-square items-center justify-center rounded-[10px] font-bold ${day.state === 'done' ? 'bg-ink text-lime' : day.state === 'today' ? 'border-2 border-dashed border-ink' : 'bg-[rgba(14,14,20,.12)]'}`}>
              {day.state === 'done' ? '✓' : ''}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

const RING_SIZE = 72;
const RING_STROKE = 8;

export function GoalRing({ done, target, size = RING_SIZE }: { done: number; target: number; size?: number }) {
  const radius = (size - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const share = target ? Math.min(1, done / target) : 0;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg aria-hidden width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={RING_STROKE} className="stroke-card-2" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={RING_STROKE} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - share)} className="stroke-lime" />
      </svg>
      <span className="num absolute text-sm">{target ? `${done}/${target}` : '—'}</span>
    </span>
  );
}

function GoalCard({ data, onChange }: { data: Goal; onChange: () => void }) {
  const [target, setTarget] = useState(data.goal?.target ?? 5);
  const [minRating, setMinRating] = useState(data.goal?.minRating ?? 1200);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!data.goal) setTarget(data.suggestions[minRating] ?? 5);
  }, [minRating, data]);
  const chip = (active: boolean) => `num min-h-11 flex-1 cursor-pointer rounded-full border-2 px-2 ${active ? 'border-lime bg-lime text-ink' : 'border-line text-muted'}`;

  async function save() {
    setError('');
    try {
      await api('/practice/goal', 'PUT', { target, minRating });
      onChange();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const left = data.goal ? Math.max(0, data.goal.target - data.done) : 0;
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="display text-lg">Weekly goal</h2>
      {data.goal ? (
        <div className="flex items-center gap-3">
          <GoalRing done={data.done} target={data.goal.target} />
          <p><span className="num">{data.goal.target}</span> at <span className="num">{data.goal.minRating}+</span> · {left ? <><span className="num">{left}</span> to go</> : 'done!'}</p>
        </div>
      ) : (
        <p className="text-muted">{data.locked ? 'Goals lock on Thursday. Set a new one on Monday.' : 'Pick a goal for this week.'}</p>
      )}
      {!data.locked && (
        <>
          <div>
            <p className="label mb-1">Problems</p>
            <div className="flex gap-1.5">{GOAL_TARGETS.map((value) => <button key={value} aria-pressed={target === value} className={chip(target === value)} onClick={() => setTarget(value)}>{value}</button>)}</div>
          </div>
          <div>
            <p className="label mb-1">Rated at least</p>
            <div className="flex gap-1.5">{GOAL_RATINGS.map((value) => <button key={value} aria-pressed={minRating === value} className={chip(minRating === value)} onClick={() => setMinRating(value)}>{value}</button>)}</div>
          </div>
          <p className="text-xs text-muted">Based on your last 4 weeks, try <span className="num text-text">{data.suggestions[minRating]}</span>. You can change it until Wednesday.</p>
          <Button onClick={save}>Save</Button>
          {error && <ErrorText>{error}</ErrorText>}
        </>
      )}
    </Card>
  );
}

function UpsolveList({ rows }: { rows: Upsolve[] }) {
  const contests = [...new Set(rows.map((row) => row.contestId))];
  if (!rows.length) return <p className="text-muted">Your upsolves appear after your next counted Codeforces round.</p>;
  return (
    <div className="flex flex-col gap-4">
      {contests.map((id) => {
        const items = rows.filter((row) => row.contestId === id);
        return (
          <div key={id} className="flex flex-col gap-2">
            <p className="label">{items[0].contestName}</p>
            {items.map((item) => (
              <div key={item.problemId} className={`flex items-center gap-3 ${item.done ? 'opacity-65' : ''}`}>
                <span className={`num flex size-8 shrink-0 items-center justify-center rounded-[10px] text-xs ${item.done ? 'bg-lime text-ink' : 'bg-card-2'}`}>{item.done ? '✓' : problemLetter(item.problemId)}</span>
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-bold ${item.done ? 'line-through' : ''}`}>{item.name ?? item.problemId}</p>
                  <p className="text-xs text-muted">{formatIST(item.endAt).split(' · ')[0]}</p>
                </div>
                {item.rating ? <RatingChip value={item.rating} /> : null}
                {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="font-bold text-lime hover:underline">Open</a>}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function Practice() {
  const { me } = useMe();
  const potd = useLoad(() => api<Potd>('/practice/potd'), []);
  const upsolves = useLoad(() => api<Upsolve[]>('/practice/upsolves'), []);
  const goal = useLoad(() => api<Goal>('/practice/goal'), []);
  const profile = useLoad(() => api<{ weakTags: { tag: string }[] }>(`/users/${me.user.id}`), [me.user.id]);
  const error = potd.error || upsolves.error || goal.error;
  const left = upsolves.data?.filter((row) => !row.done).length ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="display text-[52px] leading-none tracking-[-0.035em]">Practice</h1>
      {error && <ErrorText>{error}</ErrorText>}
      {potd.data && (
        <div className="grid items-start gap-4 min-[900px]:grid-cols-[1fr_320px]">
          <PotdCard data={potd.data} onChange={potd.reload} large />
          {potd.data.problem && (
            <Card className="flex flex-col gap-3">
              <h2 className="display text-lg">Your band today</h2>
              {potd.data.members.map((member) => (
                <Link key={member.userId} to={`/u/${member.userId}`} className="flex items-center gap-2">
                  <Avatar userId={member.userId} name={member.name} size={32} />
                  <span className="handle min-w-0 flex-1 truncate text-xs">@{member.username ?? member.name}</span>
                  {member.solvedAt ? <span className="text-xs font-bold text-lime">solved · {formatIST(member.solvedAt).split(' · ')[1]}</span> : <span className="text-xs text-muted">not yet</span>}
                </Link>
              ))}
            </Card>
          )}
        </div>
      )}
      <div className="grid items-start gap-4 min-[900px]:grid-cols-[1fr_320px]">
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="display text-lg">Upsolve</h2>
            {left > 0 && <span className="text-xs font-bold text-muted"><span className="num text-pink">{left}</span> left</span>}
          </div>
          {upsolves.data && <UpsolveList rows={upsolves.data} />}
        </Card>
        <aside className="flex flex-col gap-3">
          {goal.data && <GoalCard key={String(goal.data.goal?.target)} data={goal.data} onChange={goal.reload} />}
          {profile.data && profile.data.weakTags.length > 0 && (
            <Card className="flex flex-col gap-2">
              <h2 className="display text-lg">Train a weak topic</h2>
              <div className="flex flex-wrap gap-1.5">
                {profile.data.weakTags.map(({ tag }) => (
                  <a key={tag} href={`https://codeforces.com/problemset?tags=${encodeURIComponent(tag)}`} target="_blank" rel="noreferrer" className="flex min-h-11 items-center rounded-full border-2 border-line px-4 font-bold">{tag}</a>
                ))}
              </div>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
