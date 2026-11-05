import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { duelFinished, duelHeadline, duelLive, duelName, duelOutcome, formatClock, playerStatusText, type DuelDetail, type PlayerStatus } from 'shared/duel';
import { formatIST } from 'shared/time';
import { api } from '../api';
import { Avatar, Button, ErrorText, RatingChip, useLoad, useMe } from '../ui';
import { InviteCard } from './duels';

const POLL_MS = 5000;
const COOLDOWN = 20;
const OUTCOME_FILL = { W: 'bg-lime text-ink', L: 'bg-pink text-ink', D: 'bg-card-2 text-text' };
const timeOfDay = (ts: number) => formatIST(ts).split(' · ')[1];

function StatusRow({ name, status, now }: { name: string; status: PlayerStatus | undefined; now: number }) {
  const state = status?.state ?? 'none';
  const tone = { none: 'bg-card text-muted', testing: 'bg-sun-tint text-sun', wrong: 'bg-pink-tint text-pink-soft', accepted: 'bg-lime-tint text-lime' }[state];
  return (
    <div className={`flex items-center gap-2 rounded-2xl border border-line p-3 ${tone}`}>
      {state === 'testing' && <i aria-hidden className="size-2 shrink-0 animate-pulse rounded-full bg-sun" />}
      <div className="min-w-0">
        <p className="handle truncate text-xs">{name}</p>
        <p className="text-sm font-bold">{playerStatusText(status, now, timeOfDay)}</p>
      </div>
    </div>
  );
}

function Result({ duel, myId }: { duel: DuelDetail; myId: number }) {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const outcome = duel.isPlayer ? duelOutcome(duel, myId) : duel.status === 'draw' ? 'D' : 'W';
  const winnerName = duel.winnerId === duel.challengerId ? duelName(duel.challengerUsername, duel.challengerName) : duelName(duel.opponentUsername, duel.opponentName);
  const rematch = () => api<{ id: number }>('/duels', 'POST', { rematchOf: duel.id }).then(({ id }) => navigate(`/duel/${id}`)).catch((err: Error) => setError(err.message));
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <span className={`display flex size-[130px] -rotate-6 items-center justify-center rounded-[28px] text-[64px] ${OUTCOME_FILL[outcome]}`}>{outcome}</span>
      <h1 className="display text-5xl leading-tight tracking-[-0.03em]">{duel.isPlayer ? duelHeadline[outcome] : duel.status === 'draw' ? 'Nobody solved it.' : `${winnerName} won.`}</h1>
      {duel.winningTime !== null && <p className="text-muted">Accepted <span className="num text-text">{formatClock(duel.winningTime)}</span> after the start</p>}
      {duel.gaveUpId && duel.winningTime === null && <p className="text-muted">{duel.gaveUpId === duel.challengerId ? duelName(duel.challengerUsername, duel.challengerName) : duelName(duel.opponentUsername, duel.opponentName)} gave up</p>}
      {duel.problem && <a href={duel.problem.url} target="_blank" rel="noreferrer" className="font-bold text-lime hover:underline">{duel.problem.name}</a>}
      <div className="flex gap-6">
        {([[duel.challengerUsername ?? duel.challengerName, duel.challengerDelta], [duel.opponentUsername ?? duel.opponentName, duel.opponentDelta]] as const).map(([name, delta]) => (
          <p key={name}><span className="handle text-xs text-muted">@{name}</span><br /><span className={`num text-xl ${(delta ?? 0) >= 0 ? 'text-lime' : 'text-pink-text'}`}>{(delta ?? 0) > 0 ? '+' : ''}{delta ?? 0}</span></p>
        ))}
      </div>
      <div className="flex gap-2">
        {duel.isPlayer && <Button onClick={rematch}>Rematch</Button>}
        <Link to="/duels" className="lift inline-flex h-11 items-center rounded-full border-2 border-line px-5 font-bold">Back</Link>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

export function Duel() {
  const { id } = useParams();
  const { me } = useMe();
  const { data: duel, error, reload } = useLoad(() => api<DuelDetail>(`/duels/${id}`), [id]);
  const [, setTick] = useState(0);
  const [checkedAt, setCheckedAt] = useState(0);
  const [actionError, setActionError] = useState('');
  const open = !duel || (!duelFinished(duel.status) && duel.status !== 'declined' && duel.status !== 'expired');

  useEffect(() => {
    if (!open) return;
    const poll = setInterval(reload, POLL_MS);
    const clock = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [open]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!duel) return null;
  const now = Math.floor(Date.now() / 1000);
  const challenger = duelName(duel.challengerUsername, duel.challengerName);
  const opponent = duelName(duel.opponentUsername, duel.opponentName);

  async function act(path: string) {
    setActionError('');
    try {
      await api(`/duels/${id}/${path}`, 'POST');
      reload();
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  const wrapper = 'mx-auto flex w-full max-w-[900px] flex-col gap-4';
  if (duelFinished(duel.status)) return <div className={wrapper}><Result duel={duel} myId={me.user.id} /></div>;
  if (duel.status === 'invited') return <div className={wrapper}><InviteCard duel={duel} myId={me.user.id} now={now} onChange={reload} /></div>;
  if (duel.status === 'queued') return <div className={wrapper}><h1 className="display text-5xl">Starting soon</h1><p className="text-muted">The club has 10 duels running. Yours starts as soon as a slot opens.</p></div>;
  if (!duelLive(duel.status)) return <div className={wrapper}><h1 className="display text-5xl">This invite has ended</h1><Link to="/duels" className="font-bold text-lime">Back to duels</Link></div>;

  const waiting = duel.players.challenger?.state === 'testing' ? challenger : opponent;
  const cooling = duel.lastCheckAt !== null && now - duel.lastCheckAt < COOLDOWN;
  const justAsked = now - checkedAt < COOLDOWN;
  return (
    <div className={wrapper}>
      <div className="flex items-center justify-center gap-4">
        <Link to={`/u/${duel.challengerId}`} className={`rounded-full ${duel.challengerId === me.user.id ? 'outline-3 outline-offset-2 outline-lime' : ''}`}><Avatar userId={duel.challengerId} name={duel.challengerName} size={56} /></Link>
        <div className="text-center">
          <p className="num text-[68px] leading-none tracking-[-0.03em]">{formatClock((duel.endAt ?? now) - now)}</p>
          <p className="text-xs font-extrabold tracking-wider text-lime uppercase">Live</p>
        </div>
        <Link to={`/u/${duel.opponentId}`} className={`rounded-full ${duel.opponentId === me.user.id ? 'outline-3 outline-offset-2 outline-lime' : ''}`}><Avatar userId={duel.opponentId} name={duel.opponentName} size={56} /></Link>
      </div>
      {duel.problem ? (
        <section className="flex flex-col gap-3 rounded-[22px] bg-violet p-6 text-white">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="display text-3xl">{duel.problem.name}</h1>
            <RatingChip value={duel.problem.rating} />
          </div>
          <a href={duel.problem.url} target="_blank" rel="noreferrer" className="lift inline-flex h-11 items-center self-start rounded-full bg-lime px-5 font-extrabold text-ink">Open on Codeforces</a>
        </section>
      ) : (
        <p className="text-center text-muted">The problem shows here when the duel ends.</p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <StatusRow name={challenger} status={duel.players.challenger} now={now} />
        <StatusRow name={opponent} status={duel.players.opponent} now={now} />
      </div>
      {duel.status === 'judging' && <p className="rounded-2xl border border-sun-line bg-sun-tint p-3 font-bold text-sun-text">Judging… Waiting for {waiting}'s earlier submission to be judged</p>}
      {!duel.lastCheckOk && <p className="rounded-2xl border border-sun-line bg-sun-tint p-3 font-bold text-sun-text">Checking… Codeforces isn't answering. The result won't change.</p>}
      {duel.isPlayer && (
        <div className="flex flex-col items-center gap-2">
          <Button
            className="w-full max-w-[420px]"
            disabled={cooling || justAsked}
            onClick={() => {
              setCheckedAt(now);
              act('check');
            }}
          >
            {cooling || justAsked ? 'Checked a moment ago' : 'I submitted, check now'}
          </Button>
          <button className="min-h-11 cursor-pointer font-bold text-pink" disabled={!!duel.gaveUpId} onClick={() => act('give-up')}>{duel.gaveUpId ? 'Giving up…' : 'Give up'}</button>
        </div>
      )}
      <p className="text-center text-xs text-muted">Checked automatically every minute{duel.lastCheckAt ? <> · last check <span className="num">{formatClock(now - duel.lastCheckAt)}</span> ago</> : ''}</p>
      {actionError && <ErrorText>{actionError}</ErrorText>}
    </div>
  );
}
