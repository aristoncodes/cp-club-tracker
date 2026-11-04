import { useParams } from 'react-router-dom';
import { heatmapWeeks } from 'shared/time';
import { api } from '../api';
import { Card, ErrorText, platformLabel, Rating, useLoad } from '../ui';

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
const HEAT_OPACITY = [0, 0.25, 0.5, 0.75, 1];

function Stat({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return (
    <Card>
      <div className="label">{label}</div>
      <div className="num text-[32px] font-bold">{value}</div>
      {detail && <div className="text-muted">{detail}</div>}
    </Card>
  );
}

export function Profile() {
  const { id } = useParams();
  const { data: profile, error } = useLoad(() => api<UserProfile>(`/users/${id}`), [id]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!profile) return null;
  const { stats } = profile;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">{profile.name}</h1>
        <p className="text-muted">
          {profile.batchYear ? `Batch ${profile.batchYear} · ` : ''}CF rating <Rating value={profile.cfRating} />
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Today" value={round(stats.dayPoints)} detail={`${stats.daySolves} solves`} />
        <Stat label="This week" value={round(stats.weekPoints)} detail={`${stats.weekSolves} solves`} />
        <Stat label="This month" value={round(stats.monthPoints)} detail={`${stats.monthSolves} solves`} />
        <Stat label="Streak" value={profile.streak} detail="days" />
      </div>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">Last 6 months</h2>
        <div className="flex gap-0.5 overflow-x-auto" role="img" aria-label="Solves per day for the last 26 weeks">
          {heatmapWeeks(profile.heatmap, profile.today).map((week, weekIndex) => (
            <div key={weekIndex} className="flex shrink-0 flex-col gap-0.5">
              {week.map((step, dayIndex) => (
                <div
                  key={dayIndex}
                  className="relative size-2.5 rounded-[2px] bg-border"
                  style={{ visibility: step === null ? 'hidden' : undefined }}
                >
                  <div className="absolute inset-0 rounded-[2px] bg-accent" style={{ opacity: HEAT_OPACITY[step ?? 0] }} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Handles</h2>
          {profile.handles.length === 0 && <p className="text-muted">No approved handles yet.</p>}
          {profile.handles.map((h) => (
            <p key={h.platform} className="flex justify-between py-1">
              <span className="text-muted">{platformLabel(h.platform)}</span>
              {h.platform === 'cf' ? <Rating value={profile.cfRating}>{h.handle}</Rating> : <span className="num">{h.handle}</span>}
            </p>
          ))}
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Top tags</h2>
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
