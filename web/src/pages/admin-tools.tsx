import { useState } from 'react';
import { batchForStudyYear, STUDY_YEARS } from 'shared/batch';
import { formatIST, IST_OFFSET } from 'shared/time';
import { api, type Announcement } from '../api';
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
