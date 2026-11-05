import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DUEL_CHOICES, DUEL_MINUTES, duelName, duelOutcome, duelRange, formatClock, type Difficulty, type DuelHub, type DuelView } from 'shared/duel';
import { api } from '../api';
import { Avatar, Button, Card, ErrorText, Rating, useLoad, useMe } from '../ui';

type Opponent = { id: number; name: string; username: string | null; cfRating: number | null; duelRating: number };

const INVITE_LIFE = 600;
const OUTCOME_FILL = { W: 'bg-lime text-ink', L: 'bg-pink text-ink', D: 'bg-card-2 text-text' };

export function InviteCard({ duel, myId, now, onChange }: { duel: DuelView; myId: number; now: number; onChange: () => void }) {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const incoming = duel.opponentId === myId;
  const name = incoming ? duelName(duel.challengerUsername, duel.challengerName) : duelName(duel.opponentUsername, duel.opponentName);

  async function act(action: 'accept' | 'decline') {
    setError('');
    try {
      await api(`/duels/${duel.id}/${action}`, 'POST');
      if (action === 'accept') navigate(`/duel/${duel.id}`);
      else onChange();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-pink-line bg-pink-tint p-4">
      <div className="flex items-center gap-3">
        <Avatar userId={incoming ? duel.challengerId : duel.opponentId} name={incoming ? duel.challengerName : duel.opponentName} />
        <div className="min-w-0">
          <p className="font-bold text-pink-soft">{incoming ? `${name} challenged you` : `Waiting for ${name}`}</p>
          <p className="text-xs text-pink-text"><span className="num">{duel.ratingMin}–{duel.ratingMax}</span> · <span className="num">{duel.minutes}</span> min · expires in <span className="num">{formatClock(duel.createdAt + INVITE_LIFE - now)}</span></p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => act('decline')}>{incoming ? 'Decline' : 'Cancel'}</Button>
        {incoming && <button onClick={() => act('accept')} className="lift h-11 flex-1 cursor-pointer rounded-full bg-pink font-extrabold text-ink">Accept</button>}
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </section>
  );
}

function NewDuel({ initialRandom, onSent }: { initialRandom: boolean; onSent: (id: number) => void }) {
  const { me } = useMe();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Opponent | null>(null);
  const [random, setRandom] = useState(initialRandom);
  const [difficulty, setDifficulty] = useState<Difficulty>('even');
  const [minutes, setMinutes] = useState(45);
  const [error, setError] = useState('');
  const opponents = useLoad(() => api<Opponent[]>(`/duels/opponents?q=${encodeURIComponent(query)}`), [query]);
  useEffect(() => setRandom(initialRandom), [initialRandom]);

  const range = duelRange(difficulty, me.user.cfRating, selected?.cfRating ?? me.user.cfRating);
  const who = random ? 'someone within 200' : selected ? duelName(selected.username, selected.name) : null;

  async function send() {
    setError('');
    try {
      const { id } = await api<{ id: number }>('/duels', 'POST', { opponentId: selected?.id, random, difficulty, minutes });
      onSent(id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="display text-lg">New duel</h2>
      <input className="h-11 w-full rounded-2xl border border-line bg-ink px-4 text-text outline-none focus:border-lime" placeholder="Search members" aria-label="Search members" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="flex max-h-56 flex-col gap-1 overflow-y-auto" role="radiogroup" aria-label="Opponent">
        <button role="radio" aria-checked={random} onClick={() => { setRandom(true); setSelected(null); }} className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-2xl px-2 ${random ? 'bg-lime-tint' : ''}`}>
          <span className="font-bold">Random, within 200 rating</span>
          <span className={`flex size-6 items-center justify-center rounded-full border-2 text-xs ${random ? 'border-lime bg-lime text-ink' : 'border-line'}`}>{random ? '✓' : ''}</span>
        </button>
        {opponents.data?.map((person) => {
          const on = !random && selected?.id === person.id;
          return (
            <button key={person.id} role="radio" aria-checked={on} onClick={() => { setSelected(person); setRandom(false); }} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl px-2 text-left ${on ? 'bg-lime-tint' : ''}`}>
              <Avatar userId={person.id} name={person.name} size={32} />
              <span className="min-w-0 flex-1">
                <span className="handle block truncate text-xs">{duelName(person.username, person.name)}</span>
                <span className="text-xs text-muted"><Rating value={person.cfRating} /> · duel <span className="num">{person.duelRating}</span></span>
              </span>
              <span className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-xs ${on ? 'border-lime bg-lime text-ink' : 'border-line'}`}>{on ? '✓' : ''}</span>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Difficulty">
        {DUEL_CHOICES.map((choice) => {
          const shown = duelRange(choice.id, me.user.cfRating, selected?.cfRating ?? me.user.cfRating);
          return (
            <button key={choice.id} role="radio" aria-checked={difficulty === choice.id} onClick={() => setDifficulty(choice.id)} className={`min-h-16 cursor-pointer rounded-2xl border-2 p-2 ${difficulty === choice.id ? 'border-lime bg-lime text-ink' : 'border-line'}`}>
              <span className="block font-bold">{choice.label}</span>
              <span className="num block text-[11px]">{shown.min}–{shown.max}</span>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Time limit">
        {DUEL_MINUTES.map((value) => (
          <button key={value} role="radio" aria-checked={minutes === value} onClick={() => setMinutes(value)} className={`num min-h-11 cursor-pointer rounded-full border-2 ${minutes === value ? 'border-lime bg-lime text-ink' : 'border-line text-muted'}`}>{value}</button>
        ))}
      </div>
      <p className="rounded-2xl bg-violet-tint p-3 text-xs text-violet-soft">The first Accepted on Codeforces wins, by its submission time. If nobody solves it in time, it's a draw.</p>
      <Button disabled={!who} onClick={send}>{who ? `Challenge ${who} · ${range.min}–${range.max} · ${minutes} min` : 'Pick an opponent'}</Button>
      {error && <ErrorText>{error}</ErrorText>}
    </Card>
  );
}

export function Duels() {
  const { me } = useMe();
  const navigate = useNavigate();
  const { data, error, reload } = useLoad(() => api<DuelHub>('/duels'), []);
  const [random, setRandom] = useState(false);
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="display text-[52px] leading-none tracking-[-0.035em]">Duels</h1>
      {error && <ErrorText>{error}</ErrorText>}
      {data && (
        <div className="grid items-start gap-4 min-[900px]:grid-cols-[1fr_380px]">
          <div className="flex min-w-0 flex-col gap-4">
            <section className="flex flex-col gap-4 rounded-[22px] bg-violet p-6 text-white">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold tracking-wider text-violet-soft uppercase">Duel rating</p>
                  <p className="num text-[56px] leading-none tracking-[-0.03em]">{data.me.rating}</p>
                </div>
                {data.me.weekChange !== 0 && <span className={`num rounded-full px-3 py-1 text-sm text-ink ${data.me.weekChange > 0 ? 'bg-lime' : 'bg-pink'}`}>{data.me.weekChange > 0 ? '▲' : '▼'}{Math.abs(data.me.weekChange)} this week</span>}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([['Wins', data.me.wins], ['Losses', data.me.losses], ['Draws', data.me.draws]] as const).map(([label, value]) => (
                  <div key={label} className="rounded-[14px] bg-violet-deep p-2 text-center">
                    <p className="num text-2xl">{value}</p>
                    <p className="text-[10px] font-bold tracking-wider text-violet-soft uppercase">{label}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 min-[900px]:hidden">
                <Button className="flex-1" onClick={() => { setRandom(false); setShowForm(true); }}>Challenge someone</Button>
                <Button variant="onViolet" className="flex-1" onClick={() => { setRandom(true); setShowForm(true); }}>Random</Button>
              </div>
            </section>
            {data.invites.map((duel) => <InviteCard key={duel.id} duel={duel} myId={me.user.id} now={data.now} onChange={reload} />)}
            {data.live.length > 0 && (
              <Card className="flex flex-col gap-2">
                <h2 className="display text-lg">Live now</h2>
                {data.live.map((duel) => (
                  <Link key={duel.id} to={`/duel/${duel.id}`} className="flex min-h-11 items-center justify-between gap-2 hover:underline">
                    <span className="handle truncate text-xs">{duelName(duel.challengerUsername, duel.challengerName)} vs {duelName(duel.opponentUsername, duel.opponentName)}</span>
                    {duel.status === 'queued' ? <span className="text-xs text-muted">Starting soon</span> : <span className="num text-xs text-lime">{duel.ratingMin}–{duel.ratingMax}</span>}
                  </Link>
                ))}
              </Card>
            )}
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <Card className="flex flex-col gap-2">
                <h2 className="display text-lg">Recent duels</h2>
                {data.recent.length === 0 && <p className="text-muted">Your duels show up here.</p>}
                {data.recent.map((duel) => {
                  const outcome = duelOutcome(duel, me.user.id);
                  const mineFirst = duel.challengerId === me.user.id;
                  const delta = (mineFirst ? duel.challengerDelta : duel.opponentDelta) ?? 0;
                  return (
                    <Link key={duel.id} to={`/duel/${duel.id}`} className="flex min-h-11 items-center gap-2">
                      <span className={`num flex size-8 shrink-0 items-center justify-center rounded-[10px] ${OUTCOME_FILL[outcome]}`}>{outcome}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate">vs <span className="handle text-xs">{mineFirst ? duelName(duel.opponentUsername, duel.opponentName) : duelName(duel.challengerUsername, duel.challengerName)}</span></p>
                        <p className="text-xs text-muted">{duel.status === 'draw' ? 'nobody solved it' : duel.gaveUpId ? 'gave up' : duel.winningTime !== null ? `solved in ${formatClock(duel.winningTime)}` : 'finished'}</p>
                      </div>
                      <span className={`num text-xs ${delta >= 0 ? 'text-lime' : 'text-pink-text'}`}>{delta > 0 ? '+' : ''}{delta}</span>
                    </Link>
                  );
                })}
              </Card>
              <Card className="flex flex-col gap-1">
                <h2 className="display mb-1 text-lg">Duel board</h2>
                {data.board.length === 0 && <p className="text-muted">Play a duel to get on the board.</p>}
                {data.board.map((row, index) => (
                  <Link key={row.userId} to={`/u/${row.userId}`} className={`flex min-h-10 items-center gap-2 rounded-[14px] px-2 ${row.userId === me.user.id ? 'border border-lime-line bg-lime-tint' : ''}`}>
                    <span className="num w-6">{index + 1}</span>
                    <span className="handle min-w-0 flex-1 truncate text-xs">{duelName(row.username, row.name)}</span>
                    <span className="num text-xs text-muted">{row.wins}–{row.losses}</span>
                    <span className="num text-lime">{row.rating}</span>
                  </Link>
                ))}
              </Card>
            </div>
          </div>
          <aside className={showForm ? '' : 'max-[899px]:hidden'}>
            <NewDuel initialRandom={random} onSent={(id) => navigate(`/duel/${id}`)} />
          </aside>
        </div>
      )}
    </div>
  );
}
