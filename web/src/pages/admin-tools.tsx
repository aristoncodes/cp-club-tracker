import { useState } from 'react';
import { Link } from 'react-router-dom';
import { batchForStudyYear, STUDY_YEARS } from 'shared/batch';
import { formatIST, IST_OFFSET } from 'shared/time';
import { api, type Announcement, type Contest } from '../api';
import { audienceLabel, Button, Card, ErrorText, inputClass, ProgressBar, Toggle, useLoad } from '../ui';

const TITLE_MAX = 80;
const BODY_MAX = 280;
const chip = (active: boolean) => `min-h-11 cursor-pointer rounded-full border-2 px-4 font-bold ${active ? 'border-text bg-text text-ink' : 'border-line text-muted'}`;

// The browser's date-time field has no zone, so its value is read as IST.
function istInputToUnix(value: string): number {
  return Date.parse(`${value}:00Z`) / 1000 - IST_OFFSET;
}

type SentAnnouncement = Announcement & { sendAt: number; audienceCount: number; seenCount: number };
type AudienceCount = { batchYear: number | null; role: string; n: number };

export function AnnouncementsSection() {
  const { data, error, reload } = useLoad(() => api<{ items: SentAnnouncement[]; counts: AudienceCount[] }>('/admin/announcements'), []);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'all' | 'batch' | 'admins'>('all');
  const [studyYear, setStudyYear] = useState(1);
  const [link, setLink] = useState('');
  const [schedule, setSchedule] = useState(false);
  const [sendAt, setSendAt] = useState('');
  const [pinned, setPinned] = useState(false);
  const [actionError, setActionError] = useState('');

  const counts = data?.counts ?? [];
  const now = Date.now() / 1000;
  const reach = counts
    .filter((row) => audience === 'all' || (audience === 'admins' ? row.role === 'admin' : row.batchYear === batchForStudyYear(studyYear, now)))
    .reduce((sum, row) => sum + row.n, 0);

  async function run(work: () => Promise<unknown>) {
    setActionError('');
    try {
      await work();
      reload();
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  async function send() {
    await run(async () => {
      await api('/admin/announcements', 'POST', { title, body, audience, studyYear, link, pinned, sendAt: schedule ? istInputToUnix(sendAt) : undefined });
      setTitle('');
      setBody('');
      setLink('');
      setPinned(false);
      setSchedule(false);
      setSendAt('');
    });
  }

  return (
    <div className="grid items-start gap-4 min-[900px]:grid-cols-[1fr_380px]">
      <Card className="flex flex-col gap-3">
        <h1 className="display text-2xl">New announcement</h1>
        <input className={inputClass} placeholder="Title" aria-label="Title" maxLength={TITLE_MAX} value={title} onChange={(e) => setTitle(e.target.value)} />
        <div>
          <textarea className={`${inputClass} h-28 py-3`} placeholder="Message" aria-label="Message" maxLength={BODY_MAX} value={body} onChange={(e) => setBody(e.target.value)} />
          <p className="num text-right text-xs text-muted">{body.length} / {BODY_MAX}</p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Audience">
          <button role="radio" aria-checked={audience === 'all'} className={chip(audience === 'all')} onClick={() => setAudience('all')}>Everyone</button>
          {STUDY_YEARS.map((year) => (
            <button key={year.value} role="radio" aria-checked={audience === 'batch' && studyYear === year.value} className={chip(audience === 'batch' && studyYear === year.value)} onClick={() => { setAudience('batch'); setStudyYear(year.value); }}>{year.label}</button>
          ))}
          <button role="radio" aria-checked={audience === 'admins'} className={chip(audience === 'admins')} onClick={() => setAudience('admins')}>Admins</button>
        </div>
        <input className={inputClass} placeholder="Link (optional): a URL, or a page like /contests" aria-label="Link" value={link} onChange={(e) => setLink(e.target.value)} />
        <div className="flex flex-wrap gap-1.5">
          <button className={chip(!schedule)} onClick={() => setSchedule(false)}>Send now</button>
          <button className={chip(schedule)} onClick={() => setSchedule(true)}>Schedule</button>
        </div>
        {schedule && (
          <label className="flex flex-col gap-1">
            <span className="label">When (IST)</span>
            <input className={inputClass} type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} />
          </label>
        )}
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-bold">Pin to Home</p>
            <p className="text-xs text-muted">Replaces any current pin.</p>
          </div>
          <Toggle label="Pin to Home" on={pinned} onChange={setPinned} />
        </div>
        {actionError && <ErrorText>{actionError}</ErrorText>}
        <Button disabled={!title.trim() || !body.trim() || (schedule && !sendAt)} onClick={send}>
          {schedule ? 'Schedule for' : 'Send to'} <span className="num">{reach}</span> {reach === 1 ? 'member' : 'members'}
        </Button>
      </Card>
      <aside className="flex flex-col gap-3">
        <div className="rounded-[20px] bg-[#1B2233] p-4">
          <p className="label mb-2">Preview</p>
          <div className="rounded-2xl bg-card p-3">
            <p className="text-xs text-muted">OOPS · now</p>
            <p className="font-bold">{title || 'Title'}</p>
            <p className="text-muted">{body || 'Your message'}</p>
          </div>
        </div>
        <Card className="flex flex-col gap-3">
          <h2 className="display text-lg">Sent</h2>
          {error && <ErrorText>{error}</ErrorText>}
          {data?.items.length === 0 && <p className="text-muted">Nothing sent yet.</p>}
          {data?.items.map((item) => (
            <div key={item.id} className="flex flex-col gap-1 border-t border-line pt-2 first-of-type:border-0 first-of-type:pt-0">
              <p className="font-bold">{item.title}</p>
              <p className="text-xs text-muted">{audienceLabel(item)} · {formatIST(item.sentAt ?? item.sendAt)}{item.sentAt ? '' : ' · scheduled'}{item.pinned ? ' · pinned' : ''}</p>
              {item.sentAt ? (
                <>
                  <ProgressBar percent={item.audienceCount ? (item.seenCount / item.audienceCount) * 100 : 0} color="bg-lime" height={6} />
                  <p className="text-xs text-muted">Seen by <span className="num">{item.seenCount}</span> of <span className="num">{item.audienceCount}</span></p>
                </>
              ) : null}
              <div className="flex gap-3">
                {item.sentAt ? (
                  <button className="min-h-8 cursor-pointer text-xs font-bold text-lime" onClick={() => run(() => api(`/admin/announcements/${item.id}`, 'PATCH', { pinned: !item.pinned }))}>{item.pinned ? 'Unpin' : 'Pin to Home'}</button>
                ) : (
                  <button className="min-h-8 cursor-pointer text-xs font-bold text-pink" onClick={() => run(() => api(`/admin/announcements/${item.id}`, 'DELETE'))}>Cancel</button>
                )}
              </div>
            </div>
          ))}
        </Card>
      </aside>
    </div>
  );
}

type RoundInfo = { name: string; duration: number; problemCount: number };

export function VirtualsSection() {
  const list = useLoad(() => api<(Contest & { counts: number; startedCount: number })[]>('/virtuals'), []);
  const [contestId, setContestId] = useState('');
  const [start, setStart] = useState('');
  const [counts, setCounts] = useState(false);
  const [round, setRound] = useState<RoundInfo | null>(null);
  const [error, setError] = useState('');

  async function lookup(id: string) {
    setContestId(id);
    setRound(null);
    setError('');
    if (!id) return;
    try {
      setRound(await api<RoundInfo>(`/admin/virtuals/lookup?contestId=${id}`));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function schedule() {
    setError('');
    try {
      await api('/admin/virtuals', 'POST', { cfContestId: Number(contestId), startAt: istInputToUnix(start), counts });
      setContestId('');
      setStart('');
      setCounts(false);
      setRound(null);
      list.reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="grid items-start gap-4 min-[900px]:grid-cols-[1fr_380px]">
      <Card className="flex flex-col gap-3">
        <h1 className="display text-2xl">Schedule a club virtual</h1>
        <label className="flex flex-col gap-1">
          <span className="label">Codeforces contest id</span>
          <input className={`${inputClass} num`} inputMode="numeric" value={contestId} onChange={(e) => lookup(e.target.value.replace(/\D/g, ''))} />
        </label>
        {round && <p className="rounded-2xl border border-lime-line bg-lime-tint p-3 font-bold text-lime">✓ {round.name} · <span className="num">{Math.round(round.duration / 60)}</span> min · <span className="num">{round.problemCount}</span> problems</p>}
        <label className="flex flex-col gap-1">
          <span className="label">Start (IST)</span>
          <input className={inputClass} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-bold">Counts for attendance</p>
            <p className="text-xs text-muted">Members who don't start it would be marked absent.</p>
          </div>
          <Toggle label="Counts for attendance" on={counts} onChange={setCounts} />
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        <Button disabled={!round || !start} onClick={schedule}>Schedule virtual</Button>
      </Card>
      <Card className="flex flex-col gap-2">
        <h2 className="display text-lg">Scheduled</h2>
        {list.data?.length === 0 && <p className="text-muted">None yet.</p>}
        {list.data?.map((item) => (
          <Link key={item.id} to={`/virtual/${item.id}`} className="border-t border-line pt-2 first-of-type:border-0 first-of-type:pt-0 hover:underline">
            <p className="font-bold">{item.name}</p>
            <p className="text-xs text-muted">{formatIST(item.startAt)} · <span className="num">{item.goingCount}</span> going · <span className="num">{item.startedCount}</span> started{item.counts ? ' · counts' : ''}</p>
          </Link>
        ))}
      </Card>
    </div>
  );
}

type Digest = {
  attendance: { present: number; total: number };
  lastAttendance: { present: number; total: number };
  members: { active: number; total: number };
  solves: number;
  turnout: { id: number; name: string; startAt: number; present: number; total: number }[];
  quiet: { userId: number; name: string }[];
  pendingReasons: number;
  handlesWaiting: number;
  newSignups: number;
  climbers: { userId: number; name: string; gained: number; rank: number }[];
};

const percent = (part: { present: number; total: number }) => (part.total ? Math.round((part.present / part.total) * 100) : null);

export function DigestSection() {
  const { data, error } = useLoad(() => api<Digest>('/admin/digest'), []);
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return null;
  const attendance = percent(data.attendance);
  const last = percent(data.lastAttendance);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="display text-[44px] leading-none tracking-[-0.035em]">Digest</h1>
      <p className="text-muted">The last 7 days. Coordinators read it here until an email service is chosen.</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-[20px] bg-lime p-5 text-ink">
          <p className="text-xs font-extrabold uppercase">Attendance</p>
          <p className="num text-[32px]">{attendance === null ? '—' : `${attendance}%`}</p>
          <p className="text-xs font-bold">{attendance !== null && last !== null ? <>{attendance >= last ? '▲' : '▼'} <span className="num">{Math.abs(attendance - last)}</span> from last week</> : 'No comparison yet'}</p>
        </div>
        <Card><p className="label">Active members</p><p className="num text-[32px]">{data.members.active}<span className="text-muted">/{data.members.total}</span></p></Card>
        <Card><p className="label">Club solves</p><p className="num text-[32px]">{data.solves}</p></Card>
        <Card><p className="label">Pending reasons</p><p className="num text-[32px] text-sun">{data.pendingReasons}</p></Card>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <h2 className="display text-lg">Contest turnout</h2>
          {data.turnout.length === 0 && <p className="text-muted">No counted contests this week.</p>}
          {data.turnout.map((contest) => (
            <p key={contest.id} className="flex justify-between gap-2 border-t border-line pt-2 first-of-type:border-0 first-of-type:pt-0">
              <span className="min-w-0 truncate">{contest.name}</span>
              <span className="num shrink-0">{contest.present}/{contest.total}</span>
            </p>
          ))}
        </Card>
        <Card className="flex flex-col gap-2 bg-pink-tint">
          <h2 className="display text-lg">Needs a nudge</h2>
          <p className="text-xs text-pink-text">No solves in 7 days.</p>
          {data.quiet.length === 0 && <p className="text-pink-text">Everyone solved something.</p>}
          <div className="flex flex-wrap gap-1.5">
            {data.quiet.map((member) => <Link key={member.userId} to={`/u/${member.userId}`} className="rounded-full bg-ink px-3 py-1 text-xs font-bold">{member.name}</Link>)}
          </div>
        </Card>
        <Card className="flex flex-col gap-2">
          <h2 className="display text-lg">Top climbers</h2>
          {data.climbers.length === 0 && <p className="text-muted">Nobody climbed yet.</p>}
          {data.climbers.map((climber) => (
            <p key={climber.userId} className="flex justify-between gap-2">
              <Link to={`/u/${climber.userId}`} className="hover:underline">{climber.name}</Link>
              <span className="num text-lime">▲{climber.gained} · #{climber.rank}</span>
            </p>
          ))}
        </Card>
        <div className="grid grid-cols-2 gap-3">
          <Card><p className="label">Handles waiting</p><p className="num text-[32px] text-pink">{data.handlesWaiting}</p></Card>
          <Card><p className="label">New sign-ups</p><p className="num text-[32px]">{data.newSignups}</p></Card>
        </div>
      </div>
    </div>
  );
}
