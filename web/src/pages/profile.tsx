import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { studyYearLabel } from 'shared/batch';
import { ratingColor } from 'shared/rating-color';
import { formatIST, heatLevel, istDay, solvesText, timeAgo } from 'shared/time';
import { contestResult } from 'shared/reasons';
import { api, type PastContest } from '../api';
import { Avatar, Card, CellMark, ErrorText, platformLabel, PlatformCode, Rating, RatingChip, useLoad, useMe } from '../ui';

type RatingPoint = { at: number; rating: number; contestId: number; delta: number };
type UserProfile = {
  id: number;
  name: string;
  username: string | null;
  batchYear: number | null;
  cfRating: number | null;
  ratingHistory: RatingPoint[];
  handles: { platform: string; handle: string; approved: number }[];
  stats: Record<'dayPoints' | 'daySolves' | 'weekPoints' | 'weekSolves' | 'monthPoints' | 'monthSolves' | 'totalSolves', number>;
  streak: number;
  topTags: { tag: string; count: number }[];
  weakTags: { tag: string; count: number }[];
  recentSolves: { platform: string; problemId: string; problemName: string | null; url: string | null; tags: string[]; rp: number; points: number; solvedAt: number }[];
  heatmap: { day: number; count: number }[];
  today: number;
  attendance?: { total: number; present: number };
  contests?: PastContest[];
};

const round = (points: number) => Math.round(points * 10) / 10;
const DAY_MS = 86_400_000;
const HEAT_OPACITY = [0, 25, 50, 75, 100];

const dateKey = (t: number) => new Date(t).toISOString().slice(0, 10);
const shortDate = (t: number, options: Intl.DateTimeFormatOptions) => new Date(t).toLocaleDateString('en-IN', { timeZone: 'UTC', ...options });
const countsByDate = (heatmap: UserProfile['heatmap']) => Object.fromEntries(heatmap.map((d) => [dateKey(d.day * DAY_MS), d.count]));
const cellStyle = (count: number) => ({
  background: count ? `color-mix(in srgb, var(--lime) ${HEAT_OPACITY[heatLevel(count)]}%, transparent)` : 'var(--card-3)',
});

function Activity({ counts, own }: { counts: Record<string, number>; own: boolean }) {
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (grid.current) grid.current.scrollLeft = grid.current.scrollWidth;
  }, []);
  const today = istDay(Date.now() / 1000) * DAY_MS;
  const start = today - (25 * 7 + ((new Date(today).getUTCDay() + 6) % 7)) * DAY_MS;
  const weeks = Array.from({ length: 26 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => start + (week * 7 + day) * DAY_MS).filter((t) => t <= today),
  );
  const days = weeks.flat().map((t) => counts[dateKey(t)] ?? 0);
  const total = days.reduce((sum, count) => sum + count, 0);
  let longest = 0;
  days.reduce((run, count) => {
    const next = count ? run + 1 : 0;
    longest = Math.max(longest, next);
    return next;
  }, 0);
  const stats = [
    ['Solves', String(total), 'text-lime'],
    ['Active days', String(days.filter(Boolean).length), 'text-text'],
    ['Longest streak', `${longest}d`, 'text-sun'],
    ['Best day', String(Math.max(...days)), 'text-text'],
  ];

  return (
    <section className="rounded-[22px] border border-line bg-card p-6">
      <h2 className="display text-[17px]">Activity</h2>
      <div className="mt-5 flex flex-wrap gap-8">
        <div className="relative max-w-full min-w-0">
          <div ref={grid} className={`flex gap-2 overflow-x-auto ${total ? '' : 'opacity-30'}`} role="img" aria-label={`${solvesText(total)} in the last 6 months`}>
            <div className="mt-[22px] flex shrink-0 flex-col gap-1 text-[11px] leading-[14px] text-muted">
              {['Mon', '', 'Wed', '', 'Fri', '', ''].map((label, index) => <span key={index} className="h-[14px]">{label}</span>)}
            </div>
            <div className="flex gap-1">
              {weeks.map((week) => {
                const firstOfMonth = week.find((t) => new Date(t).getUTCDate() === 1);
                return (
                  <div key={week[0]} className="flex flex-col gap-1">
                    <span className="h-[18px] w-[14px] text-[11px] whitespace-nowrap text-muted">
                      {firstOfMonth ? shortDate(firstOfMonth, { month: 'short' }) : ''}
                    </span>
                    {week.map((t) => {
                      const count = counts[dateKey(t)] ?? 0;
                      return (
                        <span
                          key={t}
                          className="h-[14px] w-[14px] rounded"
                          style={cellStyle(count)}
                          title={`${solvesText(count)} · ${shortDate(t, { weekday: 'short', day: 'numeric', month: 'short' })}`}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          {total === 0 && (
            <p className="absolute inset-0 m-0 flex items-center justify-center text-center text-sm font-semibold">
              {own ? 'Nothing here yet. Your first AC lights this up.' : 'Nothing here yet.'}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4 text-xs text-muted">
            <span>{solvesText(total)} in 6 months</span>
            <span className="flex items-center gap-1">
              Less {[0, 1, 2, 4, 6].map((count) => <span key={count} className="h-[12px] w-[12px] rounded-[3px]" style={cellStyle(count)} />)} More
            </span>
          </div>
        </div>
        <dl className="m-0 grid min-w-[240px] flex-1 grid-cols-2 content-start gap-3">
          {stats.map(([label, value, color]) => (
            <div key={label} className="rounded-2xl bg-card-2 p-4">
              <dt className="text-xs font-bold text-muted">{label}</dt>
              <dd className={`num m-0 text-[28px] tracking-tight ${color}`}>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

const TOPIC_COLORS = ['bg-lime', 'bg-pink', 'bg-sun', 'bg-sky', 'bg-lilac', 'bg-orange'];
const RANK_EDGES = [1200, 1400, 1600, 1900, 2100, 2400];
const CHART_W = 640;
const CHART_H = 220;
const CHART_PAD = 12;

function StatTile({ label, children, detail, filled }: { label: string; children: ReactNode; detail: string; filled?: boolean }) {
  return filled ? (
    <div className="rounded-[20px] bg-lime p-5 text-ink">
      <p className="text-xs font-bold">{label}</p>
      <p className="num text-[32px] tracking-[-0.03em]">{children}</p>
      <p className="text-xs font-bold">{detail}</p>
    </div>
  ) : (
    <Card>
      <p className="label">{label}</p>
      <p className="num text-[32px] tracking-[-0.03em]">{children}</p>
      <p className="text-xs text-muted">{detail}</p>
    </Card>
  );
}

function RatingChart({ history }: { history: RatingPoint[] }) {
  if (history.length < 2) return <Card><h2 className="display mb-2 text-lg">CF rating</h2><p className="text-muted">The chart appears after two rated contests.</p></Card>;
  const ratings = history.map((p) => p.rating);
  const low = Math.min(...ratings) - 100;
  const high = Math.max(...ratings) + 100;
  const x = (index: number) => CHART_PAD + (index / (history.length - 1)) * (CHART_W - CHART_PAD * 2);
  const y = (rating: number) => CHART_H - CHART_PAD - ((rating - low) / (high - low)) * (CHART_H - CHART_PAD * 2);
  const clampY = (rating: number) => Math.max(0, Math.min(CHART_H, y(rating)));
  const bands = [0, ...RANK_EDGES].map((from, index) => ({ from, to: RANK_EDGES[index] ?? 5000 })).filter((b) => b.to > low && b.from < high);
  const last = history[history.length - 1];
  return (
    <Card>
      <h2 className="display mb-3 text-lg">CF rating</h2>
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" role="img" aria-label={`Codeforces rating went from ${history[0].rating} to ${last.rating} over ${history.length} contests`}>
        {bands.map((band) => (
          <rect key={band.from} x={0} width={CHART_W} y={clampY(band.to)} height={clampY(band.from) - clampY(band.to)} fill={ratingColor(band.from)} opacity={0.06} />
        ))}
        {RANK_EDGES.filter((edge) => edge > low && edge < high).map((edge) => (
          <text key={edge} x={4} y={y(edge) - 3} fontSize={11} fill="var(--muted)" fontFamily="var(--font-mono)">{edge}</text>
        ))}
        <polyline fill="none" stroke="var(--lime)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" points={history.map((p, i) => `${x(i)},${y(p.rating)}`).join(' ')} />
        <circle cx={x(history.length - 1)} cy={y(last.rating)} r={5} fill="var(--lime)" />
      </svg>
    </Card>
  );
}

function RivalButton({ id, current, onChange }: { id: number; current: boolean; onChange: () => void }) {
  const [error, setError] = useState('');
  if (current) return <span className="inline-flex h-11 items-center rounded-full bg-pink-tint px-5 font-bold text-pink-text">Your rival</span>;
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        className="lift h-11 cursor-pointer rounded-full border-2 border-line px-5 font-bold"
        onClick={() => api('/me/rival', 'PUT', { userId: id }).then(onChange).catch((err: Error) => setError(err.message))}
      >
        Set as rival
      </button>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

export function Profile() {
  const { id: routeId } = useParams();
  const { me, reload: reloadMe } = useMe();
  const id = routeId ?? String(me.user.id);
  const { data: profile, error } = useLoad(() => api<UserProfile>(`/users/${id}`), [id]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!profile) return null;
  const { stats, attendance, contests } = profile;
  const own = me.user.id === profile.id;
  const year = studyYearLabel(profile.batchYear, Date.now() / 1000);
  const now = Date.now() / 1000;
  const topCount = Math.max(1, ...profile.topTags.map((t) => t.count));
  const maxRating = profile.ratingHistory.length ? Math.max(...profile.ratingHistory.map((p) => p.rating)) : null;
  const presentCount = contests?.filter((c) => c.status === 'present').length ?? 0;
  const weak = profile.topTags.length > 2 ? profile.weakTags : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-5">
        <Avatar userId={profile.id} name={profile.name} size={96} />
        <div className="min-w-0 flex-1 basis-60">
          <h1 className="display text-[44px] leading-tight tracking-[-0.035em]">{profile.name}</h1>
          {profile.username && <p className="handle text-[17px] text-lime">@{profile.username}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {year && <span className="rounded-full bg-card-2 px-3 py-1 text-xs font-bold">{year}</span>}
            {profile.handles.map((h) => (
              <span key={h.platform} className="flex items-center gap-1 rounded-full bg-card-2 px-3 py-1 text-xs" title={platformLabel(h.platform)}>
                <PlatformCode platform={h.platform} />
                {h.platform === 'cf' ? <Rating value={profile.cfRating}>{h.handle}{profile.cfRating ? ` · ${profile.cfRating}` : ''}</Rating> : <span className="handle">{h.handle}</span>}
                {!h.approved && <span className="text-muted">pending</span>}
              </span>
            ))}
          </div>
        </div>
        {!own && <RivalButton id={profile.id} current={me.user.rivalId === profile.id} onChange={reloadMe} />}
        {own && <Link to="/settings" className="lift inline-flex h-11 items-center gap-2 rounded-full border-2 border-line px-5 font-bold"><Gear />Settings</Link>}
        {own && me.user.role === 'admin' && <Link to="/admin" className="lift inline-flex h-11 items-center rounded-full border-2 border-line px-5 font-bold sm:hidden">Admin</Link>}
      </div>
      <div className="flex gap-4">
        <Link to={own ? '/badges' : `/badges?user=${profile.id}`} className="font-bold text-lime hover:underline">Badges →</Link>
        {own && <Link to="/recap" className="font-bold text-lime hover:underline">This week's recap →</Link>}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Points this month" detail={solvesText(stats.monthSolves)} filled>{round(stats.monthPoints)}</StatTile>
        <StatTile label="Total solves" detail="Including from before joining">{stats.totalSolves}</StatTile>
        {attendance && <StatTile label="Attendance" detail={`${attendance.present}/${attendance.total} contests`}>{attendance.total ? `${Math.round((attendance.present / attendance.total) * 100)}%` : '—'}</StatTile>}
        <StatTile label="Streak" detail="days"><span className="text-sun">{profile.streak}</span></StatTile>
        <StatTile label="CF rating" detail={maxRating ? `max ${maxRating}` : 'Unrated'}><Rating value={profile.cfRating} /></StatTile>
      </div>
      <Activity counts={countsByDate(profile.heatmap)} own={own} />
      <div className="grid items-start gap-4 min-[900px]:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <RatingChart history={profile.ratingHistory} />
          <Card className="flex flex-col gap-3">
            <h2 className="display text-lg">Recent solves</h2>
            {profile.recentSolves.length === 0 && <p className="text-muted">Scored solves show up here.</p>}
            {profile.recentSolves.map((solve) => (
              <div key={`${solve.platform}-${solve.problemId}`} className="flex items-center gap-3">
                <PlatformCode platform={solve.platform} />
                <div className="min-w-0 flex-1">
                  <a href={solve.url ?? undefined} target="_blank" rel="noreferrer" className="block truncate font-bold hover:underline">{solve.problemName ?? solve.problemId}</a>
                  <p className="truncate text-xs text-muted">{[...solve.tags.slice(0, 3), timeAgo(solve.solvedAt, now)].join(' · ')}</p>
                </div>
                <RatingChip value={solve.rp} />
                <span className="num text-lime">+{solve.points}</span>
              </div>
            ))}
          </Card>
        </div>
        <aside className="flex flex-col gap-4">
          <Card className="flex flex-col gap-2">
            <h2 className="display text-lg">Top topics</h2>
            {profile.topTags.length === 0 && <p className="text-muted">Topics show up after a few solves.</p>}
            {profile.topTags.map((t, index) => (
              <div key={t.tag} className="flex flex-col gap-1">
                <div className="flex justify-between text-sm"><span>{t.tag}</span><span className="num text-muted">{t.count}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-card-2"><div className={`h-full rounded-full ${TOPIC_COLORS[index % TOPIC_COLORS.length]}`} style={{ width: `${(t.count / topCount) * 100}%` }} /></div>
              </div>
            ))}
            {weak.length > 0 && <p className="mt-1 text-xs text-muted">Least practised: {weak.map((t) => t.tag).join(' and ')}.</p>}
          </Card>
          {contests && (
            <Card className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="display text-lg">Contest history</h2>
                <span className="num text-lime">{presentCount}/{contests.length}</span>
              </div>
              {contests.length === 0 && <p className="text-muted">No counted contests yet.</p>}
              {contests.map((contest) => (
                <div key={contest.id} className="flex items-center gap-3">
                  <CellMark status={contest.status} reasonType={contest.reasonType} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{contest.name}</p>
                    <p className="text-xs text-muted">{formatIST(contest.startAt).split(' · ')[0]} · {contestResult(contest)}</p>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function Gear() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.800 2.800l-.1-.1a1.7 1.7 0 0 0-2.900 1.200V21a2 2 0 1 1-4 0v-.1a1.7 1.700 0 0 0-2.900-1.200l-.1.1a2 2 0 1 1-2.800-2.800l.1-.1a1.700 1.700 0 0 0-1.200-2.900H3a2 2 0 1 1 0-4h.1a1.700 1.700 0 0 0 1.200-2.900l-.1-.1a2 2 0 1 1 2.800-2.800l.1.1a1.700 1.700 0 0 0 2.900-1.200V3a2 2 0 1 1 4 0v.1a1.700 1.700 0 0 0 2.900 1.200l.1-.1a2 2 0 1 1 2.800 2.800l-.1.1a1.700 1.700 0 0 0 1.200 2.900h.1a2 2 0 1 1 0 4h-.1a1.700 1.700 0 0 0-1.500 1z" />
    </svg>
  );
}
