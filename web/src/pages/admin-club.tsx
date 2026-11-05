import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { STUDY_YEARS, batchForStudyYear, studyYearLabel } from 'shared/batch';
import { REASONS } from 'shared/reasons';
import { formatIST, IST_OFFSET, timeAgo } from 'shared/time';
import { api } from '../api';
import { Avatar, CellMark, ErrorText, useLoad } from '../ui';
import { AButton, AToggle, ATable, Chip, fieldClass, istInputToUnix, Modal, PageHeader, PlatformChip, Segmented, unixToIstDate, useAct } from './admin-ui';

const DAY = 86400;
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : null);
const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => <section className={`rounded-[20px] border border-line bg-card p-5 ${className}`}>{children}</section>;
const RULE_LABELS: Record<string, string> = { max_solves: 'Too many solves', fast_solves: 'Fast hard solves', matching_solves: 'Matching solves', duel_problem: 'Duel problem' };

type Signals = { noSolveDays: number; absences: number; drop: number | null; lastSolve: number | null; recentRate: number | null };
type OverviewData = {
  attendanceGoal: number;
  attendance: { present: number; total: number };
  active: { active: number; total: number };
  potdSolvers: number;
  duels: number;
  inbox: {
    handles: { userId: number; name: string; platform: string; handle: string }[];
    reasons: { contestId: number; userId: number; name: string; contest: string; endAt: number }[];
    flags: { id: number; userId: number; name: string; rule: string; severity: string; day: number }[];
  };
  trend: { id: number; name: string; present: number; total: number }[];
  atRisk: { userId: number; name: string; signals: Signals }[];
  upcoming: { id: number; name: string; platform: string; startAt: number; mandatory: number; going: number; notGoing: number; members: number }[];
};

function RsvpBar({ going, notGoing, members }: { going: number; notGoing: number; members: number }) {
  const of = Math.max(members, 1);
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-line" role="img" aria-label={`${going} going, ${notGoing} not going, ${Math.max(0, members - going - notGoing)} no reply`}>
      <i className="bg-lime" style={{ width: `${(going / of) * 100}%` }} />
      <i className="bg-pink" style={{ width: `${(notGoing / of) * 100}%` }} />
    </div>
  );
}

const signalChips = (signals: Signals, t?: { noSolveDays: number; absences: number; drop: number }) => [
  ...(signals.noSolveDays >= (t?.noSolveDays ?? 7) ? [`No solves for ${signals.noSolveDays} days`] : []),
  ...(signals.absences >= (t?.absences ?? 2) ? [`${signals.absences} absences in a row`] : []),
  ...((signals.drop ?? 0) >= (t?.drop ?? 20) ? [`Attendance down ${Math.round(signals.drop!)}%`] : []),
];

export function Overview() {
  const { data, error, reload } = useLoad(() => api<OverviewData>('/admin/overview'), []);
  const act = useAct(reload);
  const [tab, setTab] = useState<'handles' | 'reasons' | 'flags'>('handles');
  const now = Date.now() / 1000;
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return null;
  const rate = pct(data.attendance.present, data.attendance.total);
  const inbox = data.inbox;
  return (
    <>
      <PageHeader title="Overview" line="What needs you today, and how the club is doing." />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-[20px] bg-lime p-5 text-ink">
          <p className="text-xs font-extrabold uppercase">Attendance, 4 weeks</p>
          <p className="num text-[38px] leading-tight">{rate === null ? '—' : `${rate}%`}</p>
          <p className="text-xs font-bold">goal <span className="num">{data.attendanceGoal}%</span></p>
        </div>
        <Card><p className="label">Active this week</p><p className="num text-[38px] leading-tight">{data.active.active}<span className="text-xl text-muted">/{data.active.total}</span></p></Card>
        <Card><p className="label">POTD solvers, week</p><p className="num text-[38px] leading-tight text-sun">{data.potdSolvers}</p></Card>
        <Card><p className="label">Duels this week</p><p className="num text-[38px] leading-tight text-pink">{data.duels}</p></Card>
      </div>
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="display text-lg">Action inbox</h2>
          <Segmented label="Inbox type" value={tab} onChange={setTab} tabs={[{ id: 'handles', label: <>Handles <span className="num">{inbox.handles.length}</span></> }, { id: 'reasons', label: <>Reasons <span className="num">{inbox.reasons.length}</span></> }, { id: 'flags', label: <>Flags <span className="num">{inbox.flags.length}</span></> }]} />
          {tab === 'handles' && inbox.handles.length > 0 && <AButton small disabled={act.busy} onClick={() => act.run(() => api('/admin/handles/approve-all', 'POST'))}>Approve all handles</AButton>}
        </div>
        {act.error && <ErrorText>{act.error}</ErrorText>}
        {tab === 'handles' && inbox.handles.length === 0 && <p className="text-muted">Nothing waiting. Every handle is reviewed ✓</p>}
        {tab === 'handles' && inbox.handles.map((h) => (
          <div key={`${h.userId}${h.platform}`} className="flex flex-wrap items-center gap-2 border-t border-line pt-2 first-of-type:border-0">
            <Avatar userId={h.userId} name={h.name} size={30} /><Chip tone="wait">Handle</Chip>
            <span className="min-w-0 flex-1 basis-40 font-bold">{h.name} <span className="handle font-normal text-muted">{h.platform}: {h.handle}</span></span>
            <AButton variant="danger" small onClick={() => act.run(() => api(`/admin/handles/${h.userId}/${h.platform}`, 'PATCH', { status: 'rejected' }))}>Reject</AButton>
            <AButton small onClick={() => act.run(() => api(`/admin/handles/${h.userId}/${h.platform}`, 'PATCH', { status: 'approved' }))}>Approve</AButton>
          </div>
        ))}
        {tab === 'reasons' && inbox.reasons.length === 0 && <p className="text-muted">Nobody owes a reason.</p>}
        {tab === 'reasons' && inbox.reasons.map((r) => (
          <div key={`${r.userId}:${r.contestId}`} className="flex flex-wrap items-center gap-2 border-t border-line pt-2 first-of-type:border-0">
            <Avatar userId={r.userId} name={r.name} size={30} /><Chip tone="problem">Reason</Chip>
            <span className="min-w-0 flex-1 basis-40 font-bold">{r.name} <span className="font-normal text-muted">{r.contest} · {timeAgo(r.endAt, now)}</span></span>
            <AButton variant="secondary" small onClick={() => act.run(() => api(`/admin/attendance/${r.contestId}/${r.userId}/remind`, 'POST'))}>Remind</AButton>
            <AButton small onClick={() => act.run(() => api(`/admin/attendance/${r.contestId}/${r.userId}`, 'PATCH', { status: 'excused' }))}>Excuse</AButton>
          </div>
        ))}
        {tab === 'flags' && inbox.flags.length === 0 && <p className="text-muted">No open flags.</p>}
        {tab === 'flags' && inbox.flags.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center gap-2 border-t border-line pt-2 first-of-type:border-0">
            <Avatar userId={f.userId} name={f.name} size={30} /><Chip tone="problem">Flag</Chip>
            <span className="min-w-0 flex-1 basis-40 font-bold">{f.name} <span className="font-normal text-muted">{RULE_LABELS[f.rule]}</span></span>
            <Link to="/admin/fairness" className="lift inline-flex min-h-8 items-center rounded-full border border-line px-3 text-xs font-bold">Review</Link>
            <AButton small onClick={() => act.run(() => api(`/admin/fairness/${f.id}/clear`, 'POST'))}>Clear</AButton>
          </div>
        ))}
      </Card>
      <div className="grid items-start gap-4 xl:grid-cols-3">
        <Card className="flex flex-col gap-2">
          <h2 className="display text-lg">Attendance trend</h2>
          {data.trend.length === 0 && <p className="text-muted">Shows after the first verified contest.</p>}
          <div className="flex h-28 items-end gap-1.5">
            {data.trend.map((t) => {
              const p = pct(t.present, t.total) ?? 0;
              return <i key={t.id} title={`${t.name}: ${p}%`} aria-label={`${t.name}: ${p}%`} role="img" className={`flex-1 rounded-t-md ${p >= data.attendanceGoal ? 'bg-lime' : 'bg-[#3A3A4A]'}`} style={{ height: `${Math.max(p, 3)}%` }} />;
            })}
          </div>
        </Card>
        <Card className="flex flex-col gap-2">
          <div className="flex items-center justify-between"><h2 className="display text-lg">At-risk</h2><Link to="/admin/at-risk" className="text-xs font-bold text-lime hover:underline">See all →</Link></div>
          {data.atRisk.length === 0 && <p className="text-muted">Nobody flagged.</p>}
          {data.atRisk.map((m) => (
            <div key={m.userId} className="flex items-center gap-2"><Avatar userId={m.userId} name={m.name} size={30} /><span className="min-w-0"><span className="block truncate font-bold">{m.name}</span><span className="block truncate text-xs text-muted">{signalChips(m.signals)[0]}</span></span></div>
          ))}
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="display text-lg">Upcoming contests</h2>
          {data.upcoming.length === 0 && <p className="text-muted">Nothing scheduled.</p>}
          {data.upcoming.map((u) => (
            <div key={u.id} className="flex flex-col gap-1">
              <p className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate font-bold">{u.name}</span>{u.mandatory ? <Chip tone="wait">★ Must attend</Chip> : null}</p>
              <RsvpBar going={u.going} notGoing={u.notGoing} members={u.members} />
              <p className="text-xs text-muted">{formatIST(u.startAt)} · <span className="num">{u.going}</span> going · <span className="num">{u.notGoing}</span> not · <span className="num">{Math.max(0, u.members - u.going - u.notGoing)}</span> no reply</p>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}

type RiskData = {
  thresholds: { noSolveDays: number; absences: number; drop: number; nudgeGapDays: number; snoozeDays: number };
  members: { userId: number; name: string; username: string | null; batchYear: number | null; signals: Signals; lastNudge: number | null }[];
};

const TEMPLATES = [
  { id: 'contests', label: 'Miss you at contests', body: 'Hey {name}, we miss you at contests. See you at the next one?' },
  { id: 'potd', label: 'Quick POTD', body: "Hey {name}, today's problem of the day is a good one. Fancy a quick try?" },
  { id: 'custom', label: 'Custom', body: '' },
];

function NudgeModal({ title, name, onClose, send }: { title: string; name: string; onClose: () => void; send: (body: string) => Promise<unknown> }) {
  const [template, setTemplate] = useState('contests');
  const [body, setBody] = useState(TEMPLATES[0].body);
  const act = useAct();
  return (
    <Modal title={title} onClose={onClose} wide>
      <Segmented label="Template" value={template} onChange={(id) => { setTemplate(id); setBody(TEMPLATES.find((t) => t.id === id)!.body); }} tabs={TEMPLATES.map((t) => ({ id: t.id, label: t.label }))} />
      <label className="flex flex-col gap-1">
        <span className="label">Message (shown to the member)</span>
        <textarea className={`${fieldClass} h-24 py-2`} maxLength={280} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <div className="rounded-2xl bg-[#1B2233] p-3">
        <p className="text-xs text-muted">OOPS · now</p>
        <p className="font-bold">From your coordinators</p>
        <p className="text-muted">{body.replaceAll('{name}', name.split(' ')[0]) || 'Your message'}</p>
      </div>
      {act.error && <ErrorText>{act.error}</ErrorText>}
      <div className="flex justify-end gap-2">
        <AButton variant="secondary" onClick={onClose}>Cancel</AButton>
        <AButton disabled={!body.trim() || act.busy} onClick={async () => { if (await act.run(() => send(body))) onClose(); }}>Send nudge</AButton>
      </div>
    </Modal>
  );
}

export function AtRisk() {
  const { data, error, reload } = useLoad(() => api<RiskData>('/admin/at-risk'), []);
  const act = useAct(reload);
  const [nudging, setNudging] = useState<{ userId: number; name: string } | 'all' | null>(null);
  const now = Date.now() / 1000;
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return null;
  const t = data.thresholds;
  const count = (test: (s: Signals) => boolean) => data.members.filter((m) => test(m.signals)).length;
  return (
    <>
      <PageHeader title="At-risk" line="Rebuilt nightly at 1 AM. Nothing happens automatically; you decide." action={data.members.length > 0 && <AButton onClick={() => setNudging('all')}>Nudge all</AButton>} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><p className="label">No solves for {t.noSolveDays}+ days</p><p className="num text-[32px] text-pink">{count((s) => s.noSolveDays >= t.noSolveDays)}</p></Card>
        <Card><p className="label">{t.absences}+ absences in a row</p><p className="num text-[32px] text-sun">{count((s) => s.absences >= t.absences)}</p></Card>
        <Card><p className="label">Attendance down {t.drop}%+</p><p className="num text-[32px]">{count((s) => (s.drop ?? 0) >= t.drop)}</p></Card>
      </div>
      {act.error && <ErrorText>{act.error}</ErrorText>}
      {data.members.length === 0 && <Card><p className="text-muted">Nobody is flagged. Good news.</p></Card>}
      {data.members.map((m) => {
        const recent = m.lastNudge !== null && now - m.lastNudge < t.nudgeGapDays * DAY;
        return (
          <Card key={m.userId} className="flex flex-wrap items-center gap-3">
            <Avatar userId={m.userId} name={m.name} size={44} />
            <div className="min-w-0 flex-1 basis-56">
              <p className="font-bold">{m.name} <span className="font-normal text-muted">{studyYearLabel(m.batchYear, now)}</span></p>
              <div className="mt-1 flex flex-wrap gap-1">{signalChips(m.signals, t).map((chip) => <Chip key={chip} tone="problem">{chip}</Chip>)}</div>
              <p className="mt-1 text-xs text-muted">Last solve {m.signals.lastSolve ? timeAgo(m.signals.lastSolve, now) : 'never'} · attendance <span className="num">{m.signals.recentRate === null ? '—' : `${Math.round(m.signals.recentRate)}%`}</span> · nudged {m.lastNudge ? timeAgo(m.lastNudge, now) : 'never'}</p>
            </div>
            <AButton variant="secondary" small onClick={() => act.run(() => api(`/admin/at-risk/${m.userId}/snooze`, 'POST'))}>OK for 2 weeks</AButton>
            <Link to={`/u/${m.userId}`} className="lift inline-flex min-h-8 items-center rounded-full border border-line px-3 text-xs font-bold">Open</Link>
            <AButton small disabled={recent} title={recent ? `One nudge every ${t.nudgeGapDays} days` : undefined} onClick={() => setNudging({ userId: m.userId, name: m.name })}>Nudge</AButton>
          </Card>
        );
      })}
      {nudging && (
        <NudgeModal
          title={nudging === 'all' ? `Nudge everyone flagged` : `Nudge ${nudging.name}`}
          name={nudging === 'all' ? 'Sam' : nudging.name}
          onClose={() => { setNudging(null); reload(); }}
          send={(body) => (nudging === 'all' ? api('/admin/at-risk/nudge-all', 'POST', { body }) : api(`/admin/at-risk/${nudging.userId}/nudge`, 'POST', { body }))}
        />
      )}
    </>
  );
}

type GridContest = { id: number; platform: string; source: string; name: string; startAt: number; counts: number; mandatory: number };
type GridStudent = { id: number; name: string; batchYear: number | null };
type Cell = { contestId: number; userId: number; rsvp: string | null; status: string | null; reasonType: string | null; reasonText: string | null; manual: number; note: string | null; claimedAt: number | null };
type AttendanceData = { contests: GridContest[]; students: GridStudent[]; cells: Cell[]; examWeek: { name: string; toAt: number } | null };

const istDate = (ts: number) => new Date((ts + IST_OFFSET) * 1000).toISOString().slice(0, 10);
const istStart = (date: string) => Date.parse(`${date}T00:00:00+05:30`) / 1000;
const istEnd = (date: string) => Date.parse(`${date}T23:59:59+05:30`) / 1000;
const shortName = (c: GridContest) => c.name.replace('Educational Codeforces Round ', 'Edu ').replace('Codeforces Round ', 'R').replace('Starters ', 'S').replace(/\s*\(.*\)$/, '');
const rateColor = (p: number) => (p >= 70 ? 'text-lime' : p >= 50 ? 'text-sun' : 'text-pink');

function describeCell(cell: Cell | undefined): string {
  if (cell?.claimedAt && !cell.status) return 'Says they took part';
  if (!cell?.status) return 'No record';
  if (cell.status === 'present') return 'Present';
  if (cell.status === 'excused') return 'Excused';
  if (!cell.reasonType) return 'Absent · no reason';
  return `Absent: ${REASONS.find((r) => r.id === cell.reasonType)?.label ?? cell.reasonType}${cell.reasonText ? ` (${cell.reasonText})` : ''}`;
}

const csvField = (value: string) => `"${(/^[=+\-@]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;

function EditPanel({ student, contest, cell, onClose, onSaved }: { student: GridStudent; contest: GridContest; cell: Cell | undefined; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState(cell?.status ?? 'absent');
  const [note, setNote] = useState(cell?.note ?? '');
  const act = useAct(onSaved);
  useEffect(() => {
    setStatus(cell?.status ?? (cell?.claimedAt ? 'present' : 'absent'));
    setNote(cell?.note ?? '');
  }, [student.id, contest.id, cell?.status, cell?.note]);
  return (
    <aside className="flex w-full shrink-0 flex-col gap-3 rounded-[20px] border border-line bg-card p-5 xl:sticky xl:top-4 xl:w-[320px]" aria-label="Edit entry">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold">{student.name}</p>
          <p className="text-xs text-muted">{contest.name}</p>
        </div>
        <button aria-label="Close" onClick={onClose} className="flex size-10 shrink-0 cursor-pointer items-center justify-center text-xl">×</button>
      </div>
      <p className="text-xs text-muted">Now: {describeCell(cell)}{cell?.rsvp ? ` · RSVP ${cell.rsvp}` : ''}{cell?.manual ? ' · edited by hand' : ''}</p>
      <Segmented label="Status" value={status} onChange={setStatus} tabs={[{ id: 'present', label: '✓ Present' }, { id: 'excused', label: 'X Excused' }, { id: 'absent', label: 'Absent' }]} />
      <label className="flex flex-col gap-1">
        <span className="label">Note (shown to the member)</span>
        <textarea className={`${fieldClass} h-20 py-2`} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {act.error && <ErrorText>{act.error}</ErrorText>}
      <AButton disabled={act.busy} onClick={() => act.run(() => api(`/admin/attendance/${contest.id}/${student.id}`, 'PATCH', { status, note }))}>Save</AButton>
      <p className="text-xs text-muted">A manual entry always wins over the automatic run.</p>
    </aside>
  );
}

export function Attendance() {
  const now = Math.floor(Date.now() / 1000);
  const [from, setFrom] = useState(istDate(now - 30 * DAY));
  const [to, setTo] = useState(istDate(now + 14 * DAY));
  const [batch, setBatch] = useState('');
  const [selected, setSelected] = useState<{ userId: number; contestId: number } | null>(null);
  const query = `/admin/attendance?from=${istStart(from)}&to=${istEnd(to)}&batch=${batch}`;
  const { data, error, reload } = useLoad(() => api<AttendanceData>(query), [query]);
  const grid = useRef<HTMLDivElement>(null);
  const cells = useMemo(() => new Map(data?.cells.map((c) => [`${c.userId}:${c.contestId}`, c])), [data]);
  const counted = data?.contests.filter((c) => c.counts) ?? [];
  const cellOf = (userId: number, contestId: number) => cells.get(`${userId}:${contestId}`);

  function rate(userId: number) {
    const mine = counted.map((c) => cellOf(userId, c.id)).filter((c) => c?.status === 'present' || c?.status === 'absent');
    return pct(mine.filter((c) => c?.status === 'present').length, mine.length);
  }

  function exportCsv() {
    if (!data) return;
    const rows = [['Student', 'Year', 'Rate', ...counted.map((c) => c.name)], ...data.students.map((s) => [s.name, studyYearLabel(s.batchYear, now), `${rate(s.id) ?? ''}`, ...counted.map((c) => describeCell(cellOf(s.id, c.id)))])];
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(csvField).join(',')).join('\n')], { type: 'text/csv' }));
    link.download = 'attendance.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function move(event: React.KeyboardEvent, row: number, column: number) {
    const step = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key];
    if (!step) return;
    event.preventDefault();
    grid.current?.querySelector<HTMLElement>(`[data-cell="${row + step[0]}:${column + step[1]}"]`)?.focus();
  }

  const open = selected && data ? { student: data.students.find((s) => s.id === selected.userId), contest: data.contests.find((c) => c.id === selected.contestId) } : null;
  const filter = 'h-10 rounded-full border border-line bg-card px-3 font-bold outline-none focus:border-lime';
  return (
    <>
      <PageHeader
        title="Attendance"
        line="Rate = present ÷ (contests − excused). Click a cell to edit it."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" aria-label="From" className={filter} value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" aria-label="To" className={filter} value={to} onChange={(e) => setTo(e.target.value)} />
            <select aria-label="Year" className={filter} value={batch} onChange={(e) => setBatch(e.target.value)}>
              <option value="">All years</option>
              {STUDY_YEARS.map((y) => <option key={y.value} value={batchForStudyYear(y.value, now)}>{y.label}</option>)}
            </select>
            <AButton onClick={exportCsv}>Export CSV</AButton>
          </div>
        }
      />
      {error && <ErrorText>{error}</ErrorText>}
      {data?.examWeek && <p className="rounded-2xl bg-[#13263A] p-3 font-bold text-[#7DD3FC]">Exam week: {data.examWeek.name}, until {formatIST(data.examWeek.toAt).split(' · ')[0]}.</p>}
      <div className="flex flex-wrap gap-4 rounded-2xl border border-line bg-card px-4 py-3 text-xs text-muted">
        <span className="flex items-center gap-2"><CellMark status="present" reasonType={null} /> Present</span>
        <span className="flex items-center gap-2"><CellMark status="excused" reasonType={null} /> Excused</span>
        <span className="flex items-center gap-2"><CellMark status="absent" reasonType="exams" /> Absent, reason letter</span>
        <span className="flex items-center gap-2"><CellMark status="absent" reasonType={null} /> No reason</span>
      </div>
      {data && (
        <div className="flex flex-col items-start gap-4 xl:flex-row">
          <div ref={grid} className="max-h-[75vh] w-full min-w-0 flex-1 overflow-auto rounded-[20px] border border-line bg-card">
            <table className="border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-20 border-b border-line bg-card p-3 text-left"><span className="label">Member</span></th>
                  <th className="label sticky top-0 z-10 border-b border-line bg-card p-3 text-right">Rate</th>
                  {counted.map((c) => (
                    <th key={c.id} title={c.name} className={`sticky top-0 z-10 min-w-16 border-b border-line p-2 text-center font-normal ${selected?.contestId === c.id ? 'bg-[#1F1F29]' : 'bg-card'}`}>
                      <span className={`num block text-[10px] ${c.platform === 'cf' ? 'text-[#60A5FA]' : c.platform === 'cc' ? 'text-orange' : 'text-violet-soft'}`}>{c.mandatory ? '★ ' : ''}{c.platform.toUpperCase()}</span>
                      <span className="block text-xs font-bold whitespace-nowrap">{shortName(c)}</span>
                      <span className="block text-[11px] text-muted">{formatIST(c.startAt).split(', ')[1]?.split(' · ')[0]}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.students.map((s, row) => {
                  const p = rate(s.id);
                  return (
                    <tr key={s.id}>
                      <td className="sticky left-0 z-10 border-b border-line bg-card p-2">
                        <span className="flex items-center gap-2 whitespace-nowrap"><Avatar userId={s.id} name={s.name} size={28} /><span><span className="block font-bold">{s.name}</span><span className="block text-xs text-muted">{studyYearLabel(s.batchYear, now)}</span></span></span>
                      </td>
                      <td className={`num border-b border-line p-2 text-right ${p === null ? 'text-muted' : rateColor(p)}`}>{p === null ? '—' : `${p}%`}</td>
                      {counted.map((c, column) => {
                        const cell = cellOf(s.id, c.id);
                        const on = selected?.userId === s.id && selected.contestId === c.id;
                        return (
                          <td key={c.id} className={`border-b border-line p-1.5 ${selected?.contestId === c.id ? 'bg-[#1F1F29]' : ''}`}>
                            <button
                              data-cell={`${row}:${column}`}
                              aria-label={`${s.name}, ${shortName(c)}: ${describeCell(cell)}`}
                              title={`${describeCell(cell)}${cell?.note ? ` · ${cell.note}` : ''}`}
                              onClick={() => setSelected({ userId: s.id, contestId: c.id })}
                              onKeyDown={(event) => move(event, row, column)}
                              className={`mx-auto block cursor-pointer rounded-[8px] ${on ? 'outline-2 outline-white' : ''}`}
                            >
                              {cell?.claimedAt && !cell.status ? <span className="num flex size-6 items-center justify-center rounded-[7px] bg-violet-tint text-xs text-violet-soft">!</span> : <CellMark status={cell?.status} reasonType={cell?.reasonType} />}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {counted.length === 0 && <p className="p-4 text-muted">No counted contests in this range.</p>}
          </div>
          {open?.student && open.contest && <EditPanel student={open.student} contest={open.contest} cell={cellOf(open.student.id, open.contest.id)} onClose={() => setSelected(null)} onSaved={reload} />}
        </div>
      )}
    </>
  );
}

type ExamWeek = { id: number; name: string; fromAt: number; toAt: number; excuse: number; mutePractice: number; hideAtRisk: number; batches: number[]; excused: number };

const examEnd = (date: string) => istEnd(date);

function YearPills({ now, value, onChange }: { now: number; value: number[]; onChange: (next: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {STUDY_YEARS.map((y) => {
        const batch = batchForStudyYear(y.value, now);
        const on = value.includes(batch);
        return <button key={y.value} aria-pressed={on} onClick={() => onChange(on ? value.filter((b) => b !== batch) : [...value, batch])} className={`min-h-10 cursor-pointer rounded-full border px-3 text-xs font-bold ${on ? 'border-lime bg-lime text-ink' : 'border-line text-muted'}`}>{y.label}</button>;
      })}
    </div>
  );
}

export function ExamWeeks() {
  const { data, error, reload } = useLoad(() => api<ExamWeek[]>('/admin/exam-weeks'), []);
  const act = useAct(reload);
  const now = Math.floor(Date.now() / 1000);
  const blank = { id: 0, name: '', from: '', to: '', batches: [] as number[], excuse: true, mute: true, hide: false };
  const [form, setForm] = useState(blank);
  const [preview, setPreview] = useState<{ contests: number; members: number; entries: number } | null>(null);
  const ready = form.name.trim() && form.from && form.to && form.batches.length > 0;

  useEffect(() => {
    setPreview(null);
    if (!form.from || !form.to || !form.batches.length) return;
    api<{ contests: number; members: number; entries: number }>('/admin/exam-weeks/preview', 'POST', { from: istStart(form.from), to: examEnd(form.to), batches: form.batches }).then(setPreview).catch(() => undefined);
  }, [form.from, form.to, form.batches.join()]);

  async function save() {
    const body = { name: form.name, from: istStart(form.from), to: examEnd(form.to), batches: form.batches, excuse: form.excuse, mutePractice: form.mute, hideAtRisk: form.hide };
    if (await act.run(() => (form.id ? api(`/admin/exam-weeks/${form.id}`, 'PATCH', body) : api('/admin/exam-weeks', 'POST', body)))) setForm(blank);
  }

  const edit = (w: ExamWeek) => setForm({ id: w.id, name: w.name, from: unixToIstDate(w.fromAt), to: unixToIstDate(w.toAt), batches: w.batches, excuse: !!w.excuse, mute: !!w.mutePractice, hide: !!w.hideAtRisk });
  const endEarly = (w: ExamWeek) => act.run(() => api(`/admin/exam-weeks/${w.id}`, 'PATCH', { name: w.name, from: w.fromAt, to: now, batches: w.batches, excuse: !!w.excuse, mutePractice: !!w.mutePractice, hideAtRisk: !!w.hideAtRisk }));

  return (
    <>
      <PageHeader title="Exam weeks" line="Excuse a batch's contests and go quiet while they're in exams." />
      <div className="grid items-start gap-4 xl:grid-cols-[1fr_1fr]">
        <Card className="flex flex-col gap-3">
          <h2 className="display text-lg">{form.id ? 'Edit exam week' : 'New exam week'}</h2>
          <input className={fieldClass} placeholder="Name, like Mid-sems" aria-label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1"><span className="label">From</span><input className={fieldClass} type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></label>
            <label className="flex flex-col gap-1"><span className="label">To</span><input className={fieldClass} type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></label>
          </div>
          <YearPills now={now} value={form.batches} onChange={(batches) => setForm({ ...form, batches })} />
          {([['excuse', 'Excuse contests automatically'], ['mute', 'Mute POTD and upsolve reminders'], ['hide', 'Hide from at-risk during it and for 3 days after']] as const).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-3"><span className="font-bold">{label}</span><AToggle label={label} on={form[key]} onChange={(on) => setForm({ ...form, [key]: on })} /></div>
          ))}
          {preview && <p className="rounded-2xl bg-[#13263A] p-3 font-bold text-[#7DD3FC]">Affects <span className="num">{preview.contests}</span> contests × <span className="num">{preview.members}</span> members = <span className="num">{preview.entries}</span> entries excused</p>}
          {act.error && <ErrorText>{act.error}</ErrorText>}
          <div className="flex gap-2">
            <AButton disabled={!ready || act.busy} onClick={save}>{form.id ? 'Save' : 'Create exam week'}</AButton>
            {form.id ? <AButton variant="secondary" onClick={() => setForm(blank)}>Cancel</AButton> : null}
          </div>
        </Card>
        <div className="flex flex-col gap-3">
          {error && <ErrorText>{error}</ErrorText>}
          {data?.length === 0 && <Card><p className="text-muted">No exam weeks yet.</p></Card>}
          {data?.map((w) => {
            const state = now < w.fromAt ? 'Scheduled' : now > w.toAt ? 'Done' : 'Active';
            return (
              <section key={w.id} className={`flex flex-col gap-2 rounded-[20px] border bg-card p-5 ${state === 'Active' ? 'border-[#7DD3FC]' : 'border-line'}`}>
                <p className="flex flex-wrap items-center gap-2 font-bold">{w.name}<Chip tone={state === 'Active' ? 'info' : state === 'Scheduled' ? 'admin' : 'plain'}>{state}</Chip></p>
                <p className="text-xs text-muted">{formatIST(w.fromAt).split(' · ')[0]} – {formatIST(w.toAt).split(' · ')[0]} · {w.batches.map((b) => studyYearLabel(b, now)).join(', ')} · <span className="num">{w.excused}</span> excused</p>
                <div className="flex flex-wrap gap-2">
                  <AButton variant="secondary" small onClick={() => edit(w)}>Edit</AButton>
                  {state === 'Active' && <AButton variant="secondary" small onClick={() => endEarly(w)}>End early</AButton>}
                  <AButton variant="danger" small onClick={() => act.run(() => api(`/admin/exam-weeks/${w.id}`, 'DELETE'))}>Delete</AButton>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}

type AdminContest = { id: number; name: string; platform: string; source: string; kind: string; url: string; startAt: number; endAt: number; counts: number; mandatory: number; stage: number; going: number; notGoing: number; members: number; attended: number };

export function Contests() {
  const { data, error, reload } = useLoad(() => api<AdminContest[]>('/admin/contests'), []);
  const act = useAct(reload);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [source, setSource] = useState<'gym' | 'other' | 'offline'>('gym');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [gymId, setGymId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [mandatory, setMandatory] = useState(false);
  const now = Date.now() / 1000;
  const rows = (data ?? []).filter((c) => (tab === 'upcoming' ? c.endAt > now : c.endAt <= now)).sort((a, b) => (tab === 'upcoming' ? a.startAt - b.startAt : b.startAt - a.startAt));
  const set = (c: AdminContest, body: { counts?: boolean; mandatory?: boolean }) => act.run(() => api(`/admin/contests/${c.id}`, 'PATCH', body));

  async function add() {
    const body = { source, name, url, gymId: Number(gymId) || undefined, startAt: istInputToUnix(start), endAt: istInputToUnix(end), mandatory };
    if (await act.run(() => api('/admin/contests', 'POST', body))) {
      setName(''); setUrl(''); setGymId(''); setStart(''); setEnd(''); setMandatory(false);
    }
  }

  return (
    <>
      <PageHeader title="Contests" line="Choose what counts for attendance, and what's a must-attend." action={<Segmented label="When" value={tab} onChange={setTab} tabs={[{ id: 'upcoming', label: 'Upcoming' }, { id: 'past', label: 'Past' }]} />} />
      {(error || act.error) && <ErrorText>{error || act.error}</ErrorText>}
      <ATable>
        <table className="w-full text-left">
          <thead><tr className="label border-b border-line"><th className="p-3">Contest</th><th className="p-3">When</th><th className="p-3">{tab === 'upcoming' ? 'RSVP' : 'Attended'}</th><th className="p-3">Counts</th><th className="p-3">★ Mandatory</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className={`border-b border-line last:border-0 ${c.counts ? '' : 'opacity-55'}`}>
                <td className="p-2"><span className="flex items-center gap-2"><PlatformChip platform={c.platform} /><a href={c.url} target="_blank" rel="noreferrer" className="font-bold hover:underline">{c.name}</a></span></td>
                <td className="p-2 whitespace-nowrap text-xs text-muted">{formatIST(c.startAt)}</td>
                <td className="min-w-40 p-2">{tab === 'upcoming' ? <><RsvpBar going={c.going} notGoing={c.notGoing} members={c.members} /><span className="text-xs text-muted"><span className="num">{c.going}</span>/<span className="num">{c.members}</span> going</span></> : <span className="num">{c.attended}/{c.members}</span>}</td>
                <td className="p-2"><AToggle label={`Counts: ${c.name}`} on={!!c.counts} onChange={(on) => set(c, { counts: on })} /></td>
                <td className="p-2"><AToggle label={`Mandatory: ${c.name}`} on={!!c.mandatory} onChange={(on) => set(c, { mandatory: on })} /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="p-4 text-muted">Nothing here.</td></tr>}
          </tbody>
        </table>
      </ATable>
      <div className="grid items-start gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="flex flex-col gap-3">
          <h2 className="display text-lg">Add a custom contest</h2>
          <Segmented label="Where" value={source} onChange={setSource} tabs={[{ id: 'gym', label: 'CF gym/group' }, { id: 'other', label: 'Other site' }, { id: 'offline', label: 'In person' }]} />
          <input className={fieldClass} placeholder="Name" aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          {source === 'gym' && <input className={`${fieldClass} num`} placeholder="Codeforces contest id" aria-label="Codeforces contest id" inputMode="numeric" value={gymId} onChange={(e) => setGymId(e.target.value.replace(/\D/g, ''))} />}
          {source === 'other' && <input className={fieldClass} placeholder="https://…" aria-label="Link" value={url} onChange={(e) => setUrl(e.target.value)} />}
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1"><span className="label">Start (IST)</span><input className={fieldClass} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label className="flex flex-col gap-1"><span className="label">End (IST)</span><input className={fieldClass} type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          </div>
          <div className="flex items-center justify-between gap-3"><span className="font-bold">★ Mandatory</span><AToggle label="Mandatory" on={mandatory} onChange={setMandatory} /></div>
          <p className="text-xs text-muted">{source === 'gym' ? "Attendance is read from each member's submissions. A private group Codeforces won't let us read needs manual entry." : source === 'other' ? 'Members tap "I took part", and you confirm it on Attendance.' : 'Attendance comes from check-in on Sessions. A session is created with it.'}</p>
          <div><AButton disabled={!name.trim() || !start || !end || act.busy} onClick={add}>Add contest</AButton></div>
        </Card>
        <section className="flex flex-col gap-2 rounded-[20px] border border-[#4A3B12] bg-[#1E1A0E] p-5">
          <h2 className="display text-lg text-sun-text">What mandatory does</h2>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-sun-text">
            <li>Adds a "Must attend" tag for members</li>
            <li>Sends an extra reminder 3 hours before</li>
            <li>Counts double in reports and the at-risk check</li>
            <li>Alerts admins when someone is absent with no reason</li>
          </ul>
        </section>
      </div>
    </>
  );
}

type SessionRow = { id: number; title: string; startAt: number; room: string | null; practiceUrl: string | null; contestId: number | null; batches: number[]; here: number };
type CheckinRow = { id: number; name: string; username: string | null; batchYear: number | null; checkedInAt: number | null };

function CheckIn({ session, onClose, onChange }: { session: SessionRow; onClose: () => void; onChange: () => void }) {
  const { data, error, reload } = useLoad(() => api<CheckinRow[]>(`/admin/sessions/${session.id}/checkins`), [session.id]);
  const [query, setQuery] = useState('');
  const act = useAct(() => { reload(); onChange(); });
  const rows = (data ?? []).filter((m) => `${m.name} ${m.username}`.toLowerCase().includes(query.trim().toLowerCase()));
  const here = data?.filter((m) => m.checkedInAt).length ?? 0;
  return (
    <aside className="flex w-full shrink-0 flex-col gap-3 rounded-[20px] border border-line bg-card p-5 xl:sticky xl:top-4 xl:w-[360px]" aria-label="Check-in">
      <div className="flex items-center justify-between gap-2">
        <h2 className="display min-w-0 truncate text-lg">{session.title}</h2>
        <button aria-label="Close check-in" onClick={onClose} className="flex size-10 shrink-0 cursor-pointer items-center justify-center text-xl">×</button>
      </div>
      <p className="num text-[44px] leading-none">{here}<span className="text-xl text-muted"> / {data?.length ?? 0} here</span></p>
      <input className={fieldClass} placeholder="Search names" aria-label="Search names" value={query} onChange={(e) => setQuery(e.target.value)} />
      {(error || act.error) && <ErrorText>{error || act.error}</ErrorText>}
      <div className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
        {rows.map((m) => (
          <button key={m.id} aria-pressed={!!m.checkedInAt} onClick={() => act.run(() => api(`/admin/sessions/${session.id}/checkins/${m.id}`, 'PUT', { here: !m.checkedInAt }))} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-1 text-left hover:bg-card-2">
            <span className={`flex size-[26px] shrink-0 items-center justify-center rounded-[8px] font-bold ${m.checkedInAt ? 'bg-lime text-ink' : 'border-2 border-line'}`}>{m.checkedInAt ? '✓' : ''}</span>
            <span className="min-w-0 flex-1 truncate font-bold">{m.name}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

export function Sessions() {
  const { data, error, reload } = useLoad(() => api<{ sessions: SessionRow[]; topics: { tag: string; value: number }[] }>('/admin/sessions'), []);
  const act = useAct(reload);
  const now = Math.floor(Date.now() / 1000);
  const prefill = new URLSearchParams(window.location.search).get('topic') ?? '';
  const [title, setTitle] = useState(prefill ? `${prefill} session` : '');
  const [start, setStart] = useState('');
  const [room, setRoom] = useState('');
  const [practice, setPractice] = useState('');
  const [batches, setBatches] = useState<number[]>([]);
  const [announce, setAnnounce] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const open = data?.sessions.find((s) => s.id === openId);

  async function create() {
    if (await act.run(() => api('/admin/sessions', 'POST', { title, startAt: istInputToUnix(start), room, practiceUrl: practice, batches, announce }))) {
      setTitle(''); setStart(''); setRoom(''); setPractice(''); setBatches([]);
    }
  }

  return (
    <>
      <PageHeader title="Sessions" line="Plan a club session, announce it, and check people in." />
      {data && data.topics.length > 0 && (
        <section className="flex flex-col gap-2 rounded-[20px] bg-gradient-to-br from-violet to-violet-deep p-5 text-white">
          <h2 className="display text-lg">Suggested topics</h2>
          <p className="text-violet-pale">The club's three weakest tags.</p>
          <div className="flex flex-wrap gap-2">
            {data.topics.map((t) => <button key={t.tag} onClick={() => setTitle(`${t.tag} session`)} className="lift min-h-10 cursor-pointer rounded-full bg-white px-4 text-xs font-bold text-[#5B21B6]">Use this: {t.tag} · <span className="num">{Math.round(t.value)}%</span></button>)}
          </div>
        </section>
      )}
      <div className="flex flex-col items-start gap-4 xl:flex-row">
        <div className="flex w-full min-w-0 flex-1 flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <h2 className="display text-lg">New session</h2>
            <input className={fieldClass} placeholder="Title" aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1"><span className="label">Date and time (IST)</span><input className={fieldClass} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></label>
              <label className="flex flex-col gap-1"><span className="label">Room</span><input className={fieldClass} value={room} onChange={(e) => setRoom(e.target.value)} /></label>
            </div>
            <input className={fieldClass} placeholder="Practice set link (optional)" aria-label="Practice set link" value={practice} onChange={(e) => setPractice(e.target.value)} />
            <div><p className="label mb-1">Target years (none = everyone)</p><YearPills now={now} value={batches} onChange={setBatches} /></div>
            <div className="flex items-center justify-between gap-3"><span className="font-bold">Announce now + remind 1 hour before</span><AToggle label="Announce" on={announce} onChange={setAnnounce} /></div>
            {act.error && <ErrorText>{act.error}</ErrorText>}
            <div><AButton disabled={!title.trim() || !start || act.busy} onClick={create}>Create session</AButton></div>
          </Card>
          <Card className="flex flex-col gap-2">
            <h2 className="display text-lg">Sessions</h2>
            {error && <ErrorText>{error}</ErrorText>}
            {data?.sessions.length === 0 && <p className="text-muted">None yet.</p>}
            {data?.sessions.map((s) => {
              const [weekday, day] = formatIST(s.startAt).split(' · ')[0].split(', ');
              return (
                <button key={s.id} onClick={() => setOpenId(s.id)} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl p-1 text-left ${openId === s.id ? 'bg-card-2' : ''}`}>
                  <span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-[14px] bg-card-2"><span className="text-[10px] font-bold text-muted uppercase">{weekday}</span><span className="num leading-none">{day.split(' ')[0]}</span></span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-bold">{s.title}</span><span className="block text-xs text-muted">{formatIST(s.startAt).split(' · ')[1]}{s.room ? ` · ${s.room}` : ''} · <span className="num">{s.here}</span> here</span></span>
                  <Chip tone={s.startAt > now ? 'admin' : 'plain'}>{s.startAt > now ? 'Upcoming' : 'Past'}</Chip>
                </button>
              );
            })}
          </Card>
        </div>
        {open && <CheckIn session={open} onClose={() => setOpenId(null)} onChange={reload} />}
      </div>
    </>
  );
}
