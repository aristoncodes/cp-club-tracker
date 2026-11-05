import { useState } from 'react';
import { Link } from 'react-router-dom';
import { studyYearLabel } from 'shared/batch';
import { formatIST, IST_OFFSET } from 'shared/time';
import { api } from '../api';
import { Avatar, ErrorText, useLoad } from '../ui';
import { AButton, Chip, fieldClass, istInputToUnix, Modal, PageHeader, Segmented, useAct } from './admin-ui';

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => <section className={`rounded-[20px] border border-line bg-card p-5 ${className}`}>{children}</section>;
const DAY = 86400;
const round = (n: number) => Math.round(n * 10) / 10;
const FEATURE_LABELS: Record<string, string> = { potd: 'Problem of the day', upsolve: 'Upsolves', duels: 'Duels', virtuals: 'Club virtuals', rivals: 'Rivals' };
const SHADES = [[30, 'bg-pink-tint text-pink-soft'], [45, 'bg-sun-tint text-sun'], [65, 'bg-lime-tint text-lime'], [101, 'bg-[#4D6B10] text-white']] as const;

type EngagementData = {
  kpis: { members: number; active: number; solves: number; potd: number; duels: number };
  weeks: { weeksAgo: number; active: number }[];
  features: { key: string; members: number }[];
  batches: number[];
  topics: string[];
  topicCells: { batchYear: number; tag: string; percent: number }[];
};

export function Engagement() {
  const [batch, setBatch] = useState(0);
  const { data, error } = useLoad(() => api<EngagementData>(`/admin/engagement${batch ? `?batch=${batch}` : ''}`), [batch]);
  const [cell, setCell] = useState<{ tag: string; batchYear: number; percent: number } | null>(null);
  const now = Date.now() / 1000;
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return null;
  const peak = Math.max(1, ...data.weeks.map((w) => w.active));
  const members = Math.max(1, data.kpis.members);
  const rows = batch ? [batch] : data.batches;
  return (
    <>
      <PageHeader title="Engagement" line="Worked out nightly, so this page stays quick." action={<Segmented label="Year" value={batch} onChange={setBatch} tabs={[{ id: 0, label: 'All' }, ...data.batches.map((b) => ({ id: b, label: studyYearLabel(b, now) || String(b) }))]} />} />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-[20px] bg-lime p-5 text-ink"><p className="text-xs font-extrabold uppercase">Active this week</p><p className="num text-[32px]">{data.kpis.active}<span className="text-lg opacity-70">/{data.kpis.members}</span></p></div>
        <Card><p className="label">Solves this week</p><p className="num text-[32px]">{data.kpis.solves}</p></Card>
        <Card><p className="label">POTD solvers</p><p className="num text-[32px] text-sun">{data.kpis.potd}</p></Card>
        <Card><p className="label">Duels</p><p className="num text-[32px] text-pink">{data.kpis.duels}</p></Card>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <h2 className="display text-lg">Weekly active members</h2>
          <div className="flex h-36 items-end gap-1.5">
            {data.weeks.map((w) => <span key={w.weeksAgo} role="img" aria-label={`${w.weeksAgo} weeks ago: ${w.active} active`} title={`${w.active} active`} className={`flex-1 rounded-t-md ${w.weeksAgo === 0 ? 'bg-lime' : 'bg-[#3A3A4A]'}`} style={{ height: `${Math.max((w.active / peak) * 100, 3)}%` }} />)}
          </div>
          <p className="text-xs text-muted">The last 10 weeks; this week in lime.</p>
        </Card>
        <Card className="flex flex-col gap-2">
          <h2 className="display text-lg">Feature use, last 30 days</h2>
          {data.features.map((f) => (
            <div key={f.key}>
              <p className="flex justify-between text-xs"><span>{FEATURE_LABELS[f.key]}</span><span className="num text-muted">{f.members}/{data.kpis.members}</span></p>
              <div className="h-2 overflow-hidden rounded-full bg-card-2"><i className="block h-full rounded-full bg-lime" style={{ width: `${(f.members / members) * 100}%` }} /></div>
            </div>
          ))}
        </Card>
      </div>
      <Card className="flex flex-col gap-3">
        <h2 className="display text-lg">Club topic map</h2>
        <p className="text-muted">Share of each year's members with 3+ solves on the tag.</p>
        {data.topics.length === 0 && <p className="text-muted">Shows after the first nightly run.</p>}
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-1">
            <thead><tr><th /><th colSpan={0} />{data.topics.map((tag) => <th key={tag} className="max-w-20 truncate px-1 text-xs font-bold text-muted" title={tag}>{tag}</th>)}</tr></thead>
            <tbody>
              {rows.map((year) => (
                <tr key={year}>
                  <th className="pr-2 text-left text-xs font-bold whitespace-nowrap">{studyYearLabel(year, now) || year}</th>
                  <td />
                  {data.topics.map((tag) => {
                    const percent = data.topicCells.find((c) => c.batchYear === year && c.tag === tag)?.percent ?? 0;
                    const shade = SHADES.find(([edge]) => percent < edge)![1];
                    return <td key={tag}><button aria-label={`${studyYearLabel(year, now)}, ${tag}: ${percent}%`} onClick={() => setCell({ tag, batchYear: year, percent })} className={`num size-[38px] cursor-pointer rounded-[8px] text-[11px] ${shade}`}>{percent}</button></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cell && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-card-2 p-3">
            <p><b>{cell.tag}</b>: <span className="num">{cell.percent}%</span> of {studyYearLabel(cell.batchYear, now)} have 3+ solves.</p>
            <Link to={`/admin/sessions?topic=${encodeURIComponent(cell.tag)}`} className="lift inline-flex min-h-8 items-center rounded-full bg-lime px-3 text-xs font-extrabold text-ink">Plan a session</Link>
          </div>
        )}
      </Card>
    </>
  );
}

type Evidence = { at: number; platform: string; problemId: string; rp: number; points: number };
type FlagRow = { id: number; userId: number; name: string; username: string | null; rule: string; day: number; severity: string; evidence: Evidence[] };
type History = { id: number; userId: number; name: string; kind: string; points: number; reason: string; at: number; undoneAt: number | null; admin: string };
type Cleared = { id: number; userId: number; name: string; rule: string; at: number; admin: string | null };

const RULES: Record<string, string> = { max_solves: 'Too many solves in a day', fast_solves: 'Fast hard solves', matching_solves: 'Matching solves (a weak signal, not proof)', duel_problem: "Solved a live duel's problem" };

export function Fairness() {
  const { data, error, reload } = useLoad(() => api<{ open: FlagRow[]; history: History[]; cleared: Cleared[] }>('/admin/fairness'), []);
  const act = useAct(reload);
  const [modal, setModal] = useState<{ flag: FlagRow; kind: 'adjust' | 'void' } | null>(null);
  const [reason, setReason] = useState('');
  const [points, setPoints] = useState('');
  const close = () => { setModal(null); setReason(''); setPoints(''); };
  const total = modal?.flag.evidence.reduce((sum, e) => sum + e.points, 0) ?? 0;

  async function decide() {
    if (!modal) return;
    const body = modal.kind === 'void' ? { reason } : { reason, points: Number(points) };
    if (await act.run(() => api(`/admin/fairness/${modal.flag.id}/${modal.kind}`, 'POST', body))) close();
  }

  return (
    <>
      <PageHeader title="Fairness" line="Nightly checks only flag. Nothing changes until you decide." />
      <div className="flex flex-wrap gap-1.5">{Object.values(RULES).map((rule) => <Chip key={rule}>{rule}</Chip>)}</div>
      {(error || act.error) && <ErrorText>{error || act.error}</ErrorText>}
      {data?.open.length === 0 && <Card><p className="text-muted">No open flags.</p></Card>}
      {data?.open.map((flag) => (
        <section key={flag.id} className={`flex flex-col gap-3 rounded-[20px] border bg-card p-5 ${flag.severity === 'high' ? 'border-pink' : 'border-sun'}`}>
          <div className="flex flex-wrap items-center gap-3">
            <Avatar userId={flag.userId} name={flag.name} size={40} />
            <div className="min-w-0 flex-1 basis-48">
              <Link to={`/u/${flag.userId}`} className="font-bold hover:underline">{flag.name}</Link>
              <p className="text-xs text-muted">{RULES[flag.rule]} · {formatIST(flag.day * DAY - IST_OFFSET).split(' · ')[0]}</p>
            </div>
            <Chip tone={flag.severity === 'high' ? 'problem' : 'wait'}>{flag.severity === 'high' ? 'Look at this' : 'Maybe'}</Chip>
          </div>
          <ol className="flex flex-col gap-1 border-l-2 border-line pl-3">
            {flag.evidence.map((e) => (
              <li key={`${e.platform}${e.problemId}`} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="num text-muted">{formatIST(e.at).split(' · ')[1]}</span><Chip>{e.platform}</Chip><span className="handle">{e.problemId}</span><span className="text-muted">rated <span className="num">{e.rp}</span> · <span className="num">+{e.points}</span></span>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <AButton variant="secondary" small onClick={() => act.run(() => api(`/admin/fairness/${flag.id}/clear`, 'POST'))}>Looks fine, clear</AButton>
            <AButton variant="secondary" small onClick={() => setModal({ flag, kind: 'adjust' })}>Adjust…</AButton>
            <AButton variant="void" small onClick={() => setModal({ flag, kind: 'void' })}>Void</AButton>
          </div>
        </section>
      ))}
      <Card className="flex flex-col gap-2">
        <h2 className="display text-lg">History</h2>
        {data?.history.length === 0 && data.cleared.length === 0 && <p className="text-muted">No decisions yet.</p>}
        {data?.history.map((h) => (
          <div key={h.id} className={`flex flex-wrap items-center gap-2 border-t border-line pt-2 text-xs first-of-type:border-0 ${h.undoneAt ? 'opacity-55' : ''}`}>
            <Chip tone={h.kind === 'void' ? 'problem' : 'wait'}>{h.kind === 'void' ? 'Voided' : 'Adjusted'}</Chip>
            <span className="min-w-0 flex-1 basis-60"><b>{h.name}</b> <span className="num">{h.points > 0 ? '+' : ''}{round(h.points)}</span> · {h.reason} <span className="text-muted">· {h.admin}, {formatIST(h.at)}</span></span>
            {h.undoneAt ? <Chip>Undone</Chip> : <AButton variant="secondary" small onClick={() => act.run(() => api(`/admin/fairness/adjustments/${h.id}/undo`, 'POST'))}>Undo</AButton>}
          </div>
        ))}
        {data?.cleared.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center gap-2 border-t border-line pt-2 text-xs">
            <Chip tone="ok">Cleared</Chip>
            <span className="min-w-0 flex-1 basis-60"><b>{f.name}</b> · {RULES[f.rule]} <span className="text-muted">· {f.admin}, {formatIST(f.at)}</span></span>
            <AButton variant="secondary" small onClick={() => act.run(() => api(`/admin/fairness/${f.id}/undo-clear`, 'POST'))}>Reopen</AButton>
          </div>
        ))}
      </Card>
      {modal && (
        <Modal title={modal.kind === 'void' ? `Void ${modal.flag.name}'s solves` : `Adjust ${modal.flag.name}'s points`} onClose={close}>
          <p className="rounded-2xl bg-pink-tint p-3 text-pink-soft">{modal.kind === 'void' ? <>Removes <span className="num">{round(total)}</span> points from all leaderboards and the season. The solves stay on their Codeforces profile. Reversible from History.</> : 'Changes their points on every board straight away. Reversible from History.'}</p>
          {modal.kind === 'adjust' && <label className="flex flex-col gap-1"><span className="label">Points (use − to remove)</span><input className={`${fieldClass} num`} inputMode="decimal" value={points} onChange={(e) => setPoints(e.target.value)} /></label>}
          <label className="flex flex-col gap-1"><span className="label">Reason (the member sees this)</span><textarea className={`${fieldClass} h-20 py-2`} maxLength={280} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          {act.error && <ErrorText>{act.error}</ErrorText>}
          <div className="flex justify-end gap-2">
            <AButton variant="secondary" onClick={close}>Cancel</AButton>
            <AButton variant={modal.kind === 'void' ? 'void' : 'primary'} disabled={!reason.trim() || (modal.kind === 'adjust' && !Number(points)) || act.busy} onClick={decide}>{modal.kind === 'void' ? 'Void solves' : 'Adjust points'}</AButton>
          </div>
        </Modal>
      )}
    </>
  );
}

type BoardRow = { userId: number; name: string; username: string | null; points: number; solves: number };
type Season = { id: number; name: string; startAt: number; endAt: number; frozenAt: number | null; board: BoardRow[] };
type Candidate = { userId: number; name: string; username: string | null; points: number; solves: number; previous: number; gain: number };
type SeasonsData = { now: number; live: Season | null; past: Season[]; upcoming: Omit<Season, 'board'>[]; month: { month: string; autoUserId: number | null; userId: number | null; candidates: Candidate[]; announcedAt: number | null } | null };

export function Seasons() {
  const { data, error, reload } = useLoad(() => api<SeasonsData>('/admin/seasons'), []);
  const act = useAct(reload);
  const [starting, setStarting] = useState(false);
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return null;
  const { live, month } = data;
  const progress = live ? ((data.now - live.startAt) / (live.endAt - live.startAt)) * 100 : 0;

  async function create() {
    if (await act.run(() => api('/admin/seasons', 'POST', { name, startAt: istInputToUnix(`${start}T00:00`), endAt: istInputToUnix(`${end}T00:00`) }))) {
      setStarting(false); setName(''); setStart(''); setEnd('');
    }
  }

  return (
    <>
      <PageHeader title="Seasons" line="A separate board for a date range. All-time points never reset." action={<AButton onClick={() => setStarting(true)}>Start new season</AButton>} />
      {act.error && <ErrorText>{act.error}</ErrorText>}
      {live ? (
        <section className="flex flex-col gap-3 rounded-[22px] bg-gradient-to-br from-violet to-violet-deep p-6 text-white">
          <div className="flex flex-wrap items-center gap-2"><h2 className="display text-[30px] leading-tight">{live.name}</h2><span className="text-xs font-extrabold text-lime uppercase">Live</span></div>
          <p className="text-violet-pale">{formatIST(live.startAt).split(' · ')[0]} – {formatIST(live.endAt).split(' · ')[0]} · <span className="num">{live.board.length}</span> on the board · <span className="num">{round(live.board.reduce((sum, r) => sum + r.points, 0))}</span> points</p>
          <div className="h-2.5 overflow-hidden rounded-full bg-violet-deep"><i className="block h-full rounded-full bg-gradient-to-r from-violet-soft to-lime" style={{ width: `${progress}%` }} /></div>
          <div className="grid gap-2 sm:grid-cols-3">
            {live.board.slice(0, 3).map((row, index) => (
              <div key={row.userId} className="flex items-center gap-2 rounded-2xl bg-violet-deep p-3"><span className="num text-lime">#{index + 1}</span><Avatar userId={row.userId} name={row.name} size={30} /><span className="min-w-0"><span className="block truncate font-bold">{row.name}</span><span className="num text-xs">{round(row.points)} pts</span></span></div>
            ))}
          </div>
        </section>
      ) : <Card><p className="text-muted">No season is running. Start one to give the club a fresh board.</p></Card>}
      {data.upcoming.map((s) => <Card key={s.id}><p className="font-bold">{s.name} <Chip tone="admin">Scheduled</Chip></p><p className="text-xs text-muted">{formatIST(s.startAt).split(' · ')[0]} – {formatIST(s.endAt).split(' · ')[0]}</p></Card>)}
      <Card className="flex flex-col gap-2">
        <h2 className="display text-lg">Member of the month{month ? ` · ${month.month}` : ''}</h2>
        {!month && <p className="text-muted">Drafted automatically on the 1st.</p>}
        {month?.candidates.length === 0 && <p className="text-muted">Nobody reached the minimum solves last month.</p>}
        {month?.candidates.map((candidate) => {
          const on = month.userId === candidate.userId;
          return (
            <button key={candidate.userId} aria-pressed={on} disabled={!!month.announcedAt} onClick={() => act.run(() => api(`/admin/member-of-month/${month.month}`, 'PATCH', { userId: candidate.userId }))} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border p-2 text-left ${on ? 'border-violet bg-violet-tint' : 'border-transparent'}`}>
              <Avatar userId={candidate.userId} name={candidate.name} size={36} />
              <span className="min-w-0 flex-1"><span className="block truncate font-bold">{candidate.name}</span><span className="text-xs text-muted"><span className="num">+{Math.round(candidate.gain)}%</span> · <span className="num">{round(candidate.points)}</span> pts · <span className="num">{candidate.solves}</span> solves</span></span>
              {month.autoUserId === candidate.userId && <span className="text-[11px] font-extrabold text-sun">AUTO PICK</span>}
              {on && <span className="font-bold text-lime">✓</span>}
            </button>
          );
        })}
        {month && month.candidates.length > 0 && (month.announcedAt ? <p className="font-bold text-lime">Announced ✓</p> : <div><AButton disabled={act.busy} onClick={() => act.run(() => api(`/admin/member-of-month/${month.month}/announce`, 'POST'))}>Announce</AButton></div>)}
      </Card>
      {data.past.length > 0 && <h2 className="display text-xl">Past seasons</h2>}
      <div className="grid gap-3 lg:grid-cols-2">
        {data.past.map((s) => (
          <Card key={s.id} className="flex flex-col gap-1">
            <p className="font-bold">{s.name}</p>
            <p className="text-xs text-muted">{formatIST(s.startAt).split(' · ')[0]} – {formatIST(s.endAt).split(' · ')[0]}</p>
            {s.board.slice(0, 5).map((row, index) => <p key={row.userId} className="flex justify-between text-xs"><span><span className="num">#{index + 1}</span> {row.name}</span><span className="num text-lime">{round(row.points)}</span></p>)}
          </Card>
        ))}
      </div>
      {starting && (
        <Modal title="Start new season" onClose={() => setStarting(false)}>
          <p className="text-muted">When it ends, the board freezes, the top 3 get a badge and everyone gets their result. All-time points never reset.</p>
          <input className={fieldClass} placeholder="Name, like Winter Grind" aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1"><span className="label">Starts</span><input className={fieldClass} type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label className="flex flex-col gap-1"><span className="label">Ends</span><input className={fieldClass} type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          </div>
          {act.error && <ErrorText>{act.error}</ErrorText>}
          <div className="flex justify-end gap-2"><AButton variant="secondary" onClick={() => setStarting(false)}>Cancel</AButton><AButton disabled={!name.trim() || !start || !end || act.busy} onClick={create}>Start season</AButton></div>
        </Modal>
      )}
    </>
  );
}
