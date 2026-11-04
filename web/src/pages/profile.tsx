import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { studyYearLabel } from 'shared/batch';
import { heatLevel, istDay, solvesText, weekStrip } from 'shared/time';
import { api } from '../api';
import { Avatar, Card, ErrorText, platformLabel, Rating, useLoad, useMe } from '../ui';

type UserProfile = {
  id: number;
  name: string;
  batchYear: number | null;
  cfRating: number | null;
  handles: { platform: string; handle: string }[];
  stats: Record<'dayPoints' | 'daySolves' | 'weekPoints' | 'weekSolves' | 'monthPoints' | 'monthSolves', number>;
  streak: number;
  topTags: { tag: string; count: number }[];
  heatmap: { day: number; count: number }[];
  today: number;
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

function Stat({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <Card>
      <div className="label">{label}</div>
      <div className="num text-[32px] tracking-[-0.03em] text-lime">{value}</div>
      <div className="text-muted">{detail}</div>
    </Card>
  );
}

export function Profile() {
  const { id } = useParams();
  const { me } = useMe();
  const { data: profile, error } = useLoad(() => api<UserProfile>(`/users/${id}`), [id]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!profile) return null;
  const { stats } = profile;
  const year = studyYearLabel(profile.batchYear, Date.now() / 1000);
  const solvedToday = weekStrip(profile.heatmap, profile.today).every((d) => d.state !== 'today');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Avatar userId={profile.id} name={profile.name} size={64} />
        <div className="min-w-0">
          <h1 className="display text-4xl tracking-[-0.035em]">{profile.name}</h1>
          <p className="text-muted">{[year, 'CF rating'].filter(Boolean).join(' · ')} <Rating value={profile.cfRating} /></p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Today" value={round(stats.dayPoints)} detail={solvesText(stats.daySolves)} />
        <Stat label="This week" value={round(stats.weekPoints)} detail={solvesText(stats.weekSolves)} />
        <Stat label="This month" value={round(stats.monthPoints)} detail={solvesText(stats.monthSolves)} />
      </div>
      <Card className="flex flex-col gap-3">
        <h2 className="display text-lg">Streak · <span className="num text-sun">{profile.streak}</span></h2>
        <div className="grid max-w-[420px] grid-cols-7 gap-2">
          {weekStrip(profile.heatmap, profile.today).map((day, index) => (
            <div key={index} className="flex flex-col items-center gap-1">
              <span
                aria-label={day.state === 'done' ? 'Solved' : day.state === 'today' ? 'Today' : 'No solve'}
                className={`flex aspect-square w-full items-center justify-center rounded-[10px] font-bold ${day.state === 'done' ? 'bg-sun text-ink' : day.state === 'today' ? 'border-2 border-dashed border-sun text-sun' : 'bg-card-2'}`}
              >
                {day.state === 'done' ? '✓' : day.state === 'today' ? '·' : ''}
              </span>
              <span className="text-xs font-bold text-muted">{day.label}</span>
            </div>
          ))}
        </div>
        <p className="text-muted">
          {solvedToday
            ? <>Solved today. Streak is at <span className="num text-sun">{profile.streak}</span>.</>
            : <>Solve one problem today to make it <span className="num text-sun">{profile.streak + 1}</span>.</>}
        </p>
      </Card>
      <Activity counts={countsByDate(profile.heatmap)} own={me.user.id === profile.id} />
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <h2 className="display mb-3 text-lg">Handles</h2>
          {profile.handles.length === 0 && <p className="text-muted">No approved handles yet.</p>}
          {profile.handles.map((h) => (
            <p key={h.platform} className="flex justify-between py-1">
              <span className="text-muted">{platformLabel(h.platform)}</span>
              <Rating value={h.platform === 'cf' ? profile.cfRating : null}>@{h.handle}</Rating>
            </p>
          ))}
        </Card>
        <Card>
          <h2 className="display mb-3 text-lg">Top tags</h2>
          {profile.topTags.length === 0 && <p className="text-muted">Tags show up after a few solves.</p>}
          {profile.topTags.map((t) => (
            <p key={t.tag} className="flex justify-between py-1">
              <span>{t.tag}</span>
              <span className="num text-muted">{t.count}</span>
            </p>
          ))}
        </Card>
      </div>
    </div>
  );
}
