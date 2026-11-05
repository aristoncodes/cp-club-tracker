import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RSVP_REASONS } from 'shared/reasons';
import { solvePoints } from 'shared/scoring';
import { formatIST, IST_OFFSET, timeAgo, weekStrip } from 'shared/time';
import { api, type Contest } from '../api';
import { Avatar, Button, Card, ContestRow, ErrorText, inputClass, platformLabel, ProgressBar, Rating, RatingChip, useLoad, useMe } from '../ui';

type Standing = { userId: number; name: string; rank: number; points: number; solves: number; cfRating: number | null };
type Solve = { userId: number; name: string; platform: string; problemId: string; problemName: string | null; tags: string[]; rp: number; solvedAt: number };
type Profile = {
  stats: { weekPoints: number; weekSolves: number };
  attendance?: { total: number; present: number };
  heatmap: { day: number; count: number }[];
  today: number;
};
type Challenge = { solved: number; mine: number; target: number; minRating: number };

const HINT_RATING = 1500;
const DOTS = ['bg-lime', 'bg-pink', 'bg-sun', 'bg-sky'];
const COMING_UP = 4;
const FEED_ITEMS = 3;
const round = (points: number) => Math.round(points * 10) / 10;

function greeting(): string {
  const hour = new Date(Date.now() + IST_OFFSET * 1000).getUTCHours();
  if (hour < 12) return 'Morning';
  return hour < 17 ? 'Afternoon' : 'Evening';
}

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className="w-[72px] rounded-[14px] bg-violet-deep p-2 text-center">
      <div className="num text-2xl text-white">{String(value).padStart(2, '0')}</div>
      <div className="text-[10px] font-bold tracking-wider text-violet-soft uppercase">{label}</div>
    </div>
  );
}

function NextContest({ contest, onChange }: { contest: Contest; onChange: () => void }) {
  const [choosing, setChoosing] = useState(false);
  const [reasonType, setReasonType] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [error, setError] = useState('');
  const left = Math.max(0, contest.startAt - Math.floor(Date.now() / 1000));
  const hours = Math.round(((contest.endAt - contest.startAt) / 3600) * 10) / 10;

  async function send(body: Record<string, unknown>) {
    setError('');
    try {
      await api(`/contests/${contest.id}/rsvp`, 'POST', body);
      setChoosing(false);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-[22px] bg-violet p-6 text-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-64">
          <span className="rounded-full bg-white px-3 py-1 text-[11px] font-extrabold tracking-wider text-[#5B21B6] uppercase">{platformLabel(contest.platform)}</span>
          <h2 className="display mt-3 text-[30px] leading-tight"><a href={contest.url} target="_blank" rel="noreferrer" className="hover:underline">{contest.name}</a></h2>
          <p className="text-sm text-violet-pale">{formatIST(contest.startAt)} · <span className="num">{hours}</span> h · <span className="num">{contest.goingCount}</span> of <span className="num">{contest.participantCount}</span> going</p>
        </div>
        <div className="flex gap-2">
          <Tile value={Math.floor(left / 86400)} label="Days" />
          <Tile value={Math.floor((left % 86400) / 3600)} label="Hrs" />
          <Tile value={Math.floor((left % 3600) / 60)} label="Min" />
        </div>
      </div>
      {contest.rsvp === 'yes' && !choosing && (
        <div className="flex items-center justify-between rounded-full bg-lime px-5 py-2 font-extrabold text-ink">
          <span>You're participating. Good luck!</span>
          <button className="min-h-8 cursor-pointer font-bold underline" onClick={() => setChoosing(true)}>Change</button>
        </div>
      )}
      {!contest.rsvp && !choosing && (
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => send({ going: true })}>Participating</Button>
          <Button variant="onViolet" className="flex-1" onClick={() => setChoosing(true)}>Can't attend</Button>
        </div>
      )}
      {contest.rsvp === 'no' && !choosing && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-violet-pale">You've marked that you can't attend.</span>
          <Button onClick={() => send({ going: true })}>I can participate after all</Button>
        </div>
      )}
      {choosing && (
        <div className="flex flex-col gap-2">
          <p className="font-bold">What's the reason?</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup">
            {RSVP_REASONS.map((reason) => (
              <button
                key={reason.id}
                role="radio"
                aria-checked={reasonType === reason.id}
                onClick={() => setReasonType(reason.id)}
                className={`min-h-11 cursor-pointer rounded-full border-2 px-4 font-bold ${reasonType === reason.id ? 'border-lime bg-lime text-ink' : 'border-violet-soft text-white'}`}
              >
                {reason.label}
              </button>
            ))}
          </div>
          {reasonType === 'other' && <input className={inputClass} placeholder="Please add a few details" aria-label="Reason details" value={reasonText} onChange={(e) => setReasonText(e.target.value)} />}
          <div className="flex gap-2">
            <Button className="flex-1" disabled={!reasonType || (reasonType === 'other' && !reasonText.trim())} onClick={() => send({ going: false, reasonType, reasonText })}>Submit</Button>
            <Button variant="onViolet" className="flex-1" onClick={() => send({ going: true })}>I can participate after all</Button>
          </div>
        </div>
      )}
      {error && <p className="rounded-2xl bg-ink px-3 py-2"><ErrorText>{error}</ErrorText></p>}
      <span aria-hidden className="flex">
        {DOTS.map((dot) => <i key={dot} className={`-ml-1 size-4 rounded-full border-2 border-violet first:ml-0 ${dot}`} />)}
      </span>
    </section>
  );
}

function StatTile({ label, value, detail, accent, children }: { label: string; value?: string | number; detail: string; accent?: boolean; children?: React.ReactNode }) {
  return (
    <Card>
      <p className="label">{label}</p>
      {children ?? <p className={`num text-[32px] tracking-[-0.03em] ${accent ? 'text-lime' : ''}`}>{value}</p>}
      <p className="text-xs text-muted">{detail}</p>
    </Card>
  );
}

export function Home() {
  const { me } = useMe();
  const now = Date.now() / 1000;
  const contests = useLoad(() => api<Contest[]>('/contests/upcoming'), []);
  const board = useLoad(() => api<Standing[]>('/leaderboard?period=week'), []);
  const profile = useLoad(() => api<Profile>(`/users/${me.user.id}`), [me.user.id]);
  const challenge = useLoad(() => api<Challenge>('/challenge'), []);
  const feed = useLoad(() => api<Solve[]>('/feed'), []);

  const rows = board.data ?? [];
  const index = rows.findIndex((row) => row.userId === me.user.id);
  const mine = rows[index];
  const above = rows[index - 1];
  const strip = profile.data ? weekStrip(profile.data.heatmap, profile.data.today) : [];
  const solvedToday = strip.length > 0 && strip.every((day) => day.state !== 'today');
  const attendance = profile.data?.attendance;
  const next = contests.data?.[0];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-muted">{formatIST(now).split(' · ')[0]}</p>
        <h1 className="display text-5xl leading-tight tracking-[-0.035em]">{greeting()}, {me.user.name.split(' ')[0]}.</h1>
        <p className="text-muted">
          {mine ? <>You're <span className="num text-lime">#{mine.rank}</span> this week</> : "You're not on the leaderboard yet this week"}
          {' · '}
          {me.streak ? <><span className="num text-sun">{me.streak}</span>-day streak</> : 'no streak yet'}
        </p>
      </div>
      <div className="grid items-start gap-5 min-[900px]:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          {next ? <NextContest contest={next} onChange={contests.reload} /> : contests.data && <Card><p className="text-muted">No upcoming contests. Check back soon.</p></Card>}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Points this week" value={round(profile.data?.stats.weekPoints ?? 0)} detail={mine ? `#${mine.rank} in club` : 'Not ranked yet'} accent />
            <StatTile label="Solves this week" value={profile.data?.stats.weekSolves ?? 0} detail="Scored this week" />
            <StatTile label="Attendance" value={attendance?.total ? `${Math.round((attendance.present / attendance.total) * 100)}%` : '—'} detail={attendance ? `${attendance.present}/${attendance.total} contests` : ''} />
            <StatTile label="CF rating" detail="Codeforces">
              <p className="text-[32px] tracking-[-0.03em]"><Rating value={me.user.cfRating} /></p>
            </StatTile>
          </div>
          <Card>
            <h2 className="display mb-2 text-lg">Upcoming</h2>
            {contests.data?.length === 0 && <p className="text-muted">Nothing scheduled yet.</p>}
            <div className="flex flex-col divide-y divide-line">
              {contests.data?.slice(0, COMING_UP).map((contest) => <ContestRow key={contest.id} contest={contest} />)}
            </div>
            <Link to="/contests" className="mt-2 inline-block font-bold text-lime hover:underline">All contests →</Link>
          </Card>
        </div>
        <aside className="flex flex-col gap-3">
          <Link to="/leaderboard" className="lift block">
            <Card className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h2 className="display text-lg">Next rank</h2>
                <span className="font-bold text-lime">Leaderboard →</span>
              </div>
              <p className="text-muted">
                {!mine
                  ? 'Solve one problem this week to join the leaderboard.'
                  : above
                    ? <><b className="text-text">{above.name.split(' ')[0]}</b> is <span className="num text-text">{round(above.points - mine.points)}</span> pts ahead. One {HINT_RATING} problem is worth about <span className="num text-lime">{solvePoints(HINT_RATING, mine.cfRating, false)}</span>.</>
                    : "You're first this week."}
              </p>
              {mine && above && <ProgressBar percent={(mine.points / above.points) * 100} color="bg-lime" />}
            </Card>
          </Link>
          <Card className="flex flex-col gap-3">
            <h2 className="display text-lg">Streak</h2>
            <div className="grid grid-cols-7 gap-1.5">
              {strip.map((day, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <span
                    aria-label={day.state === 'done' ? 'Solved' : day.state === 'today' ? 'Today' : 'No solve'}
                    className={`flex aspect-square w-full items-center justify-center rounded-[10px] font-bold ${day.state === 'done' ? 'bg-sun text-ink' : day.state === 'today' ? 'border-2 border-dashed border-sun text-sun' : 'bg-card-2'}`}
                  >
                    {day.state === 'done' ? '✓' : day.state === 'today' ? '·' : ''}
                  </span>
                  <span className="text-[11px] font-bold text-muted">{day.label}</span>
                </div>
              ))}
            </div>
            <p className="text-muted">
              {solvedToday ? <>Solved today. Current streak: <span className="num text-sun">{me.streak}</span>.</> : <>Solve a problem today to reach a streak of <span className="num text-sun">{me.streak + 1}</span>.</>}
            </p>
          </Card>
          {challenge.data && (
            <Card className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h2 className="display text-lg">Weekly challenge</h2>
                <span className="num text-pink">{challenge.data.solved}/{challenge.data.target}</span>
              </div>
              <p className="text-muted">Club goal: {challenge.data.target} problems rated {challenge.data.minRating}+ by Sunday. Your contribution: <span className="num text-text">{challenge.data.mine}</span>.</p>
              <ProgressBar percent={(challenge.data.solved / challenge.data.target) * 100} color="bg-pink" height={12} />
            </Card>
          )}
          <Card className="flex flex-col gap-3">
            <h2 className="display flex items-center gap-2 text-lg"><i aria-hidden className="size-2 rounded-full bg-lime" />Live feed</h2>
            {feed.data?.length === 0 && <p className="text-muted">No solves yet.</p>}
            {feed.data?.slice(0, FEED_ITEMS).map((solve) => (
              <div key={`${solve.userId}-${solve.platform}-${solve.problemId}`} className="flex items-start gap-2">
                <Avatar userId={solve.userId} name={solve.name} size={32} />
                <div className="min-w-0 flex-1">
                  <p><Link to={`/u/${solve.userId}`} className="font-bold hover:underline">{solve.name.split(' ')[0]}</Link> solved {solve.problemName ?? solve.problemId} on {platformLabel(solve.platform)}</p>
                  <p className="text-xs text-muted">{[...solve.tags.slice(0, 2), timeAgo(solve.solvedAt, now)].join(' · ')}</p>
                </div>
                <RatingChip value={solve.rp} />
              </div>
            ))}
            <Link to="/feed" className="font-bold text-lime hover:underline">See all →</Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}
