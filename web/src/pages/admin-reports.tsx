import { useEffect, useState } from 'react';
import { studyYearLabel } from 'shared/batch';
import { SETTING_DEFAULTS, type SettingKey } from 'shared/settings';
import { formatIST, periodStart } from 'shared/time';
import { api, getSession } from '../api';
import { ErrorText, useLoad } from '../ui';
import { AButton, Chip, fieldClass, istInputToUnix, PageHeader, Segmented, Stepper, useAct } from './admin-ui';

const DAY = 86400;
const SEMESTER_DAYS = 150;
const round = (n: number) => Math.round(n * 10) / 10;
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');

type Member = { userId: number; name: string; username: string | null; batchYear: number | null; present: number; total: number; solves: number; points: number; ratingStart: number | null; ratingEnd: number | null };
type Report = { from: number; to: number; contests: number; members: Member[]; top: Member[]; batches: { batchYear: number | null; present: number; total: number; members: number }[]; growth: Member[]; sessions: { id: number; title: string; startAt: number; room: string | null; here: number }[] };

const SECTIONS = [
  { id: 'summary', label: 'Summary numbers' },
  { id: 'batches', label: 'Attendance by year' },
  { id: 'top', label: 'Top performers' },
  { id: 'growth', label: 'Rating growth' },
  { id: 'members', label: 'Per-member table' },
  { id: 'sessions', label: 'Sessions held' },
];

function range(period: string, now: number, from: string, to: string) {
  const month = periodStart('month', now);
  if (period === 'last') return { from: periodStart('month', month - 1), to: month };
  if (period === 'semester') return { from: now - SEMESTER_DAYS * DAY, to: now };
  if (period === 'custom' && from && to) return { from: istInputToUnix(`${from}T00:00`), to: istInputToUnix(`${to}T23:59`) };
  return { from: month, to: now + DAY };
}

export function Reports() {
  const now = Math.floor(Date.now() / 1000);
  const [period, setPeriod] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [shown, setShown] = useState(new Set(SECTIONS.map((s) => s.id)));
  const [format, setFormat] = useState<'pdf' | 'csv'>('pdf');
  const [csvError, setCsvError] = useState('');
  const { from, to } = range(period, now, customFrom, customTo);
  const query = `from=${from}&to=${to}`;
  const { data, error } = useLoad(() => api<Report>(`/admin/reports?${query}`), [query]);

  async function download() {
    setCsvError('');
    if (format === 'pdf') return window.print();
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/reports.csv?${query}`, { headers: { Authorization: `Bearer ${getSession()}` } });
      if (!response.ok) throw new Error('Could not build the CSV');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(await response.blob());
      link.download = 'report.csv';
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      setCsvError((err as Error).message);
    }
  }

  const present = data?.members.reduce((sum, m) => sum + m.present, 0) ?? 0;
  const total = data?.members.reduce((sum, m) => sum + m.total, 0) ?? 0;
  const stats = data ? [['Attendance', pct(present, total)], ['Contests', data.contests], ['Solves', data.members.reduce((sum, m) => sum + m.solves, 0)], ['Sessions', data.sessions.length]] : [];
  const has = (id: string) => shown.has(id);
  const heading = 'mt-4 mb-1 font-bold';
  return (
    <>
      <div className="no-print flex flex-col gap-4">
        <PageHeader title="Reports" line="A one-page summary for faculty. Mandatory contests count twice." />
        <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-card p-5">
          <Segmented label="Period" value={period} onChange={setPeriod} tabs={[{ id: 'month', label: 'This month' }, { id: 'last', label: 'Last month' }, { id: 'semester', label: 'This semester' }, { id: 'custom', label: 'Custom' }]} />
          {period === 'custom' && (
            <div className="grid max-w-md grid-cols-2 gap-2">
              <input className={fieldClass} type="date" aria-label="From" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <input className={fieldClass} type="date" aria-label="To" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {SECTIONS.map((s) => (
              <label key={s.id} className="flex min-h-9 cursor-pointer items-center gap-2 font-bold">
                <input type="checkbox" checked={has(s.id)} onChange={() => setShown((current) => { const next = new Set(current); if (next.has(s.id)) next.delete(s.id); else next.add(s.id); return next; })} /> {s.label}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented label="Format" value={format} onChange={setFormat} tabs={[{ id: 'pdf', label: 'PDF' }, { id: 'csv', label: 'CSV' }]} />
            <AButton onClick={download}>{format === 'pdf' ? 'Save as PDF' : 'Download CSV'}</AButton>
          </div>
          {(error || csvError) && <ErrorText>{error || csvError}</ErrorText>}
        </section>
      </div>
      {data && (
        <div className="overflow-x-auto">
          <article className="print-sheet mx-auto w-[210mm] min-h-[297mm] bg-white p-[14mm] text-[12px] text-[#16161E]">
            <h1 className="display text-[26px]">OOPS club report</h1>
            <p>{formatIST(data.from).split(' · ')[0]} – {formatIST(data.to).split(' · ')[0]}</p>
            {has('summary') && <div className="mt-3 grid grid-cols-4 gap-2">{stats.map(([label, value]) => <div key={label} className="rounded-lg bg-[#F3F2F8] p-3"><p className="num text-[22px]">{value}</p><p>{label}</p></div>)}</div>}
            {has('batches') && <><h2 className={heading}>Attendance by year</h2>{data.batches.map((b) => <p key={String(b.batchYear)} className="flex justify-between"><span>{studyYearLabel(b.batchYear, now) || 'Not set'} (<span className="num">{b.members}</span>)</span><span className="num">{pct(b.present, b.total)}</span></p>)}</>}
            {has('top') && <><h2 className={heading}>Top performers</h2>{data.top.map((m, i) => <p key={m.userId} className="flex justify-between"><span><span className="num">{i + 1}.</span> {m.name}</span><span className="num">{round(m.points)} pts · {m.solves} solves</span></p>)}</>}
            {has('growth') && <><h2 className={heading}>Rating growth</h2>{data.growth.length === 0 && <p>No rating changes in this period.</p>}{data.growth.map((m) => <p key={m.userId} className="flex justify-between"><span>{m.name}</span><span className="num">{m.ratingStart} → {m.ratingEnd}</span></p>)}</>}
            {has('sessions') && <><h2 className={heading}>Sessions held</h2>{data.sessions.length === 0 && <p>None in this period.</p>}{data.sessions.map((s) => <p key={s.id} className="flex justify-between"><span>{s.title}</span><span>{formatIST(s.startAt).split(' · ')[0]} · <span className="num">{s.here}</span> here</span></p>)}</>}
            {has('members') && (
              <>
                <h2 className={heading}>Members</h2>
                <table className="w-full text-left">
                  <thead><tr className="border-b border-[#16161E]"><th>Name</th><th>Year</th><th className="text-right">Attendance</th><th className="text-right">Solves</th><th className="text-right">Points</th></tr></thead>
                  <tbody>{data.members.map((m) => <tr key={m.userId} className="border-b border-[#E5E4EC]"><td>{m.name}</td><td>{studyYearLabel(m.batchYear, now)}</td><td className="num text-right">{pct(m.present, m.total)}</td><td className="num text-right">{m.solves}</td><td className="num text-right">{round(m.points)}</td></tr>)}</tbody>
                </table>
              </>
            )}
          </article>
        </div>
      )}
    </>
  );
}

const minutesToClock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const RULE_GROUPS: { title: string; items: { key: SettingKey; label: string; step?: number; clock?: boolean }[] }[] = [
  { title: 'Points', items: [{ key: 'potd_bonus', label: 'POTD bonus' }, { key: 'potd_bonus_revealed', label: 'POTD bonus if tags were revealed first' }, { key: 'live_multiplier', label: 'Live contest multiplier', step: 0.1 }] },
  { title: 'Fairness', items: [{ key: 'fairness_max_solves', label: 'Max solves per day' }, { key: 'fairness_fast_count', label: 'Fast hard solves: how many' }, { key: 'fairness_fast_minutes', label: 'Fast hard solves: within minutes', step: 5 }, { key: 'fairness_fast_gap', label: 'Fast hard solves: above own rating by', step: 50 }, { key: 'fairness_match_minutes', label: 'Matching solves: within minutes' }] },
  { title: 'At-risk', items: [{ key: 'risk_no_solve_days', label: 'No solves for (days)' }, { key: 'risk_absences', label: 'Absences in a row' }, { key: 'risk_attendance_drop', label: 'Attendance drop vs previous month (%)', step: 5 }, { key: 'nudge_gap_days', label: 'Days between nudges' }, { key: 'snooze_days', label: '"OK for" snooze (days)' }] },
  { title: 'Attendance', items: [{ key: 'attendance_goal', label: 'Goal (%)', step: 5 }, { key: 'reason_inbox_days', label: 'Reason inbox after (days)' }, { key: 'exam_grace_days', label: 'Exam-week at-risk grace (days)' }] },
  { title: 'Seasons', items: [{ key: 'mom_min_solves', label: 'Member of the month minimum solves' }] },
  { title: 'Reminders', items: [{ key: 'potd_push_minute', label: 'POTD posted', step: 15, clock: true }, { key: 'mandatory_reminder_hours', label: 'Mandatory reminder (hours before)' }, { key: 'streak_push_minute', label: 'Streak reminder', step: 15, clock: true }, { key: 'recap_push_minute', label: 'Weekly recap (Sunday)', step: 15, clock: true }] },
];

const UPSOLVE_TABLE = [
  ['Div. 4', ['1400+: all', '1300+: n−1', '1200+: n−2', 'under: n−3']],
  ['Div. 3', ['1600+: all', '1400+: n−1', '1200+: n−2', 'under: n−3']],
  ['Div. 2, Educational', ['2100+: all', '1900+: n−1', '1600+: n−2', '1400+: n−3', 'under: n−4']],
  ['Div. 1 + 2, Global', ['2100+: 7', '1900+: 6', '1600+: 5', '1400+: 4', '1200+: 3', 'under: 2']],
  ['Starters', ['Top 20%: all', 'Others: n−2']],
] as const;

type RuleRow = { key: SettingKey; current: number; pendingValue: number | null; pendingFrom: number | null };

export function Rules() {
  const { data, error, reload } = useLoad(() => api<{ now: number; rules: RuleRow[] }>('/admin/rules'), []);
  const [draft, setDraft] = useState<Partial<Record<SettingKey, number>>>({});
  const [savedAt, setSavedAt] = useState(0);
  const act = useAct(reload);
  useEffect(() => setSavedAt(0), [Object.keys(draft).length]);
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return null;
  const row = (key: SettingKey) => data.rules.find((r) => r.key === key);
  const stored = (key: SettingKey) => { const r = row(key); return r ? (r.pendingValue ?? r.current) : SETTING_DEFAULTS[key]; };
  const changes = Object.entries(draft).filter(([key, value]) => value !== stored(key as SettingKey));

  async function save() {
    if (await act.run(() => api('/admin/rules', 'PUT', { values: Object.fromEntries(changes) }))) {
      setDraft({});
      setSavedAt(Date.now());
    }
  }

  return (
    <>
      <PageHeader title="Rules" line="Every number lives here. Changes apply from midnight IST." />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {RULE_GROUPS.map((group) => (
          <section key={group.title} className="flex flex-col gap-2 rounded-[20px] border border-line bg-card p-5">
            <h2 className="display text-lg">{group.title}</h2>
            {group.items.map(({ key, label, step, clock }) => {
              const value = draft[key] ?? stored(key);
              const pending = row(key)?.pendingValue;
              return (
                <div key={key} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 first-of-type:border-0">
                  <span className="min-w-0 flex-1 basis-40"><span className="block font-bold">{label}</span>{clock && <span className="num text-xs text-muted">{minutesToClock(value)} IST</span>}{pending !== null && pending !== undefined && <span className="block text-xs text-sun">From tomorrow; today it's <span className="num">{clock ? minutesToClock(row(key)!.current) : row(key)!.current}</span></span>}</span>
                  <Stepper label={label} value={value} step={step} changed={value !== stored(key)} onChange={(next) => setDraft({ ...draft, [key]: next })} />
                </div>
              );
            })}
          </section>
        ))}
        <section className="flex flex-col gap-2 rounded-[20px] border border-line bg-card p-5 lg:col-span-2">
          <h2 className="display text-lg">Upsolve targets <Chip>Read-only</Chip></h2>
          {UPSOLVE_TABLE.map(([type, cells]) => (
            <div key={type} className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2 first-of-type:border-0">
              <span className="w-40 font-bold">{type}</span>
              {cells.map((cell) => <Chip key={cell}>{cell}</Chip>)}
            </div>
          ))}
        </section>
      </div>
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-[rgba(14,14,20,.94)] px-4 py-3 lg:-mx-8 lg:px-8">
        <span className={`flex-1 font-bold ${changes.length ? 'text-sun' : savedAt ? 'text-lime' : 'text-muted'}`}>
          {changes.length ? <><span className="num">{changes.length}</span> unsaved {changes.length === 1 ? 'change' : 'changes'}</> : savedAt ? 'Saved. Applies from midnight IST.' : 'No changes'}
        </span>
        {act.error && <ErrorText>{act.error}</ErrorText>}
        <AButton variant="secondary" disabled={!changes.length} onClick={() => setDraft({})}>Discard</AButton>
        <AButton disabled={!changes.length || act.busy} onClick={save}>Save</AButton>
      </div>
    </>
  );
}
