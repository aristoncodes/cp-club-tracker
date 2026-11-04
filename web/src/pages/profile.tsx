import { useParams } from 'react-router-dom';
import { studyYearLabel } from 'shared/batch';
import { heatmapWeeks, solvesText, weekStrip } from 'shared/time';
import { api } from '../api';
import { Avatar, Card, ErrorText, platformLabel, Rating, useLoad } from '../ui';

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
const HEAT_OPACITY = [0, 0.3, 0.55, 0.8, 1];

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
      <Card>
        <h2 className="display mb-3 text-lg">Last 6 months</h2>
        <div className="flex gap-0.5 overflow-x-auto" role="img" aria-label="Solves per day for the last 26 weeks">
          {heatmapWeeks(profile.heatmap, profile.today).map((week, weekIndex) => (
            <div key={weekIndex} className="flex shrink-0 flex-col gap-0.5">
              {week.map((step, dayIndex) => (
                <div key={dayIndex} className="relative size-2.5 rounded-[3px] bg-card-2" style={{ visibility: step === null ? 'hidden' : undefined }}>
                  <div className="absolute inset-0 rounded-[3px] bg-lime" style={{ opacity: HEAT_OPACITY[step ?? 0] }} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </Card>
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
