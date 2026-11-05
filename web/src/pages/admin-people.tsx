import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { STUDY_YEARS, batchForStudyYear, studyYearLabel, studyYearOf } from 'shared/batch';
import { formatIST, timeAgo } from 'shared/time';
import { api } from '../api';
import { Avatar, CellMark, ErrorText, Rating, useLoad, useMe } from '../ui';
import { AButton, ATable, Chip, fieldClass, Modal, PageHeader, PlatformChip, Segmented, useAct } from './admin-ui';

type AdminUser = { id: number; email: string; name: string; username: string | null; batchYear: number | null; role: string; active: number; cfRating: number | null };
type AdminHandle = { userId: number; platform: string; handle: string; status: string; broken: number; solved: number };

const STATUS_CHIP = { approved: ['ok', 'Approved'], waiting: ['wait', 'Waiting'], rejected: ['problem', 'Rejected'] } as const;

function UsernameModal({ user, onClose, onSaved }: { user: AdminUser; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState(user.username ?? '');
  const [check, setCheck] = useState<{ available: boolean; error?: string } | null>(null);
  const act = useAct(onSaved);
  useEffect(() => {
    setCheck(null);
    const name = value.trim().toLowerCase();
    if (!name || name === user.username) return;
    const timer = setTimeout(() => api<{ available: boolean; error?: string }>(`/auth/username-available?u=${encodeURIComponent(name)}`).then(setCheck).catch(() => undefined), 300);
    return () => clearTimeout(timer);
  }, [value]);
  return (
    <Modal title="Change username" onClose={onClose}>
      <p className="text-muted">An admin can change this at any time. Current: <span className="handle">@{user.username ?? 'none'}</span></p>
      <label className="flex flex-col gap-1">
        <span className="label">New username</span>
        <input className={`${fieldClass} handle`} value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      {check && <p className={check.available ? 'font-bold text-lime' : 'font-bold text-pink-text'}>{check.available ? '✓ available' : check.error ?? 'taken'}</p>}
      {act.error && <ErrorText>{act.error}</ErrorText>}
      <div className="flex justify-end gap-2">
        <AButton variant="secondary" onClick={onClose}>Cancel</AButton>
        <AButton disabled={!check?.available || act.busy} onClick={async () => { if (await act.run(() => api(`/admin/users/${user.id}`, 'PATCH', { username: value }))) onClose(); }}>Save</AButton>
      </div>
    </Modal>
  );
}

export function Students() {
  const { me } = useMe();
  const { data, error, reload } = useLoad(() => api<{ users: AdminUser[]; handles: AdminHandle[] }>('/admin/students'), []);
  const act = useAct(reload);
  const [onlyWaiting, setOnlyWaiting] = useState(false);
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<AdminUser | null>(null);
  const now = Date.now() / 1000;
  const q = query.trim().toLowerCase();
  const handlesOf = (id: number) => data?.handles.filter((h) => h.userId === id) ?? [];
  const waiting = data?.handles.filter((h) => h.status === 'waiting' && data.users.find((u) => u.id === h.userId)?.active) ?? [];
  const users = (data?.users ?? []).filter((u) => (!onlyWaiting || handlesOf(u.id).some((h) => h.status === 'waiting')) && (!q || `${u.name} ${u.email} ${u.username} ${handlesOf(u.id).map((h) => h.handle).join(' ')}`.toLowerCase().includes(q)));

  const setStatus = (handle: AdminHandle, status: string) => act.run(() => api(`/admin/handles/${handle.userId}/${handle.platform}`, 'PATCH', { status }));

  return (
    <>
      <PageHeader title="Students & handles" line="Only approved handles count for leaderboards, attendance and duels." action={waiting.length > 0 && <AButton disabled={act.busy} onClick={() => act.run(() => api('/admin/handles/approve-all', 'POST'))}>Approve all <span className="num">{waiting.length}</span></AButton>} />
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${fieldClass} max-w-[360px]`} placeholder="Search names, emails, handles" aria-label="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 font-bold ${onlyWaiting ? 'border-lime-line bg-lime-tint' : 'border-line'}`}>
          <input type="checkbox" checked={onlyWaiting} onChange={(e) => setOnlyWaiting(e.target.checked)} /> Only show handles waiting for approval
        </label>
      </div>
      {(error || act.error) && <ErrorText>{error || act.error}</ErrorText>}
      {data && users.length === 0 && <p className="text-muted">{onlyWaiting ? 'Nothing waiting. Every handle is reviewed ✓' : 'Nobody matches that search.'}</p>}
      {users.map((user) => (
        <section key={user.id} className={`flex flex-col gap-2 rounded-[20px] border border-line bg-card p-5 ${user.active ? '' : 'opacity-55'}`}>
          <div className="flex flex-wrap items-center gap-3">
            <Avatar userId={user.id} name={user.name || user.email} size={40} />
            <div className="min-w-0 flex-1 basis-48">
              <p className="flex flex-wrap items-center gap-2 font-bold">
                <Link to={`/u/${user.id}`} className="hover:underline">{user.name || user.email}</Link>
                <span className="font-normal text-muted">{studyYearLabel(user.batchYear, now)}</span>
                <Chip tone={user.active ? 'ok' : 'plain'}>{user.active ? 'Active' : 'Deactivated'}</Chip>
                {user.role === 'admin' && <Chip tone="admin">Admin</Chip>}
              </p>
              <p className="truncate text-xs text-muted">{user.email}{user.username ? <> · <span className="handle text-violet-soft">@{user.username}</span></> : ''}</p>
            </div>
            <AButton variant="secondary" small onClick={() => setRenaming(user)}>Change username</AButton>
            {user.id !== me.user.id && (user.active
              ? <AButton variant="danger" small onClick={() => act.run(() => api(`/admin/users/${user.id}`, 'PATCH', { active: false }))}>Deactivate</AButton>
              : <AButton small onClick={() => act.run(() => api(`/admin/users/${user.id}`, 'PATCH', { active: true }))}>Reactivate</AButton>)}
          </div>
          {handlesOf(user.id).length === 0 && <p className="text-xs text-muted">No handles linked.</p>}
          {handlesOf(user.id).map((handle) => {
            const [tone, label] = STATUS_CHIP[handle.status as keyof typeof STATUS_CHIP] ?? STATUS_CHIP.waiting;
            return (
              <div key={handle.platform} className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
                <PlatformChip platform={handle.platform} wide />
                <span className="handle min-w-0 truncate">{handle.handle}</span>
                <span className="flex-1 text-xs text-muted">{handle.platform === 'cf' && user.cfRating ? <>rating <span className="num">{user.cfRating}</span> · </> : null}<span className="num">{handle.solved}</span> solved</span>
                {handle.broken ? <Chip tone="problem">Not found</Chip> : null}
                <Chip tone={tone}>{label}</Chip>
                {handle.status === 'approved'
                  ? <AButton variant="secondary" small onClick={() => setStatus(handle, 'waiting')}>Remove approval</AButton>
                  : (
                    <>
                      {handle.status === 'waiting' && <AButton variant="danger" small onClick={() => setStatus(handle, 'rejected')}>Reject</AButton>}
                      <AButton small onClick={() => setStatus(handle, 'approved')}>Approve</AButton>
                    </>
                  )}
              </div>
            );
          })}
        </section>
      ))}
      {renaming && <UsernameModal user={renaming} onClose={() => setRenaming(null)} onSaved={reload} />}
    </>
  );
}

type Member = AdminUser & { lastSolve: number | null; present: number; total: number };
type MemberDetail = {
  stats: { solves: number; monthPoints: number; duelRating: number; nudges: number };
  contests: { id: number; name: string; status: string; reasonType: string | null }[];
  handles: { platform: string; handle: string; status: string }[];
  note: { text: string; at: number; admin: string } | null;
};

function statusOf(member: Member, now: number): 'active' | 'deactivated' | 'alumni' {
  if (!member.active) return 'deactivated';
  return member.batchYear && studyYearOf(member.batchYear, now) > 4 ? 'alumni' : 'active';
}

function MemberDrawer({ member, onClose, onChange }: { member: Member; onClose: () => void; onChange: () => void }) {
  const { me } = useMe();
  const { data, error, reload } = useLoad(() => api<MemberDetail>(`/admin/members/${member.id}`), [member.id]);
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);
  const act = useAct(() => { reload(); onChange(); });
  useEffect(() => {
    setText(data?.note?.text ?? '');
  }, [data?.note?.text]);
  return (
    <aside className="flex w-full shrink-0 flex-col gap-3 rounded-[20px] border border-line bg-card p-5 xl:sticky xl:top-4 xl:w-[340px]" aria-label={`${member.name} details`}>
      <div className="flex items-center gap-3">
        <Avatar userId={member.id} name={member.name} size={44} />
        <div className="min-w-0 flex-1">
          <Link to={`/u/${member.id}`} className="block truncate font-bold hover:underline">{member.name}</Link>
          <p className="handle truncate text-xs text-violet-soft">@{member.username}</p>
        </div>
        <button aria-label="Close details" onClick={onClose} className="flex size-10 cursor-pointer items-center justify-center text-xl">×</button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {([['Total solves', data.stats.solves], ['Points this month', Math.round(data.stats.monthPoints * 10) / 10], ['Duel rating', data.stats.duelRating], ['Nudges', data.stats.nudges]] as const).map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-card-2 p-3">
                <p className="num text-xl">{value}</p>
                <p className="text-xs text-muted">{label}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="label mb-1">Last 8 contests</p>
            <div className="flex flex-wrap gap-1">
              {data.contests.length === 0 && <span className="text-xs text-muted">None yet.</span>}
              {data.contests.map((contest) => <span key={contest.id} title={contest.name}><CellMark status={contest.status} reasonType={contest.reasonType} /></span>)}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <p className="label">Handles</p>
            {data.handles.map((handle) => (
              <p key={handle.platform} className="flex items-center gap-2 text-xs">
                <PlatformChip platform={handle.platform} /><span className="handle min-w-0 flex-1 truncate">{handle.handle}</span><span className="text-muted">{handle.status}</span>
              </p>
            ))}
          </div>
          <label className="flex flex-col gap-1">
            <span className="label">Admin notes (never shown to the member)</span>
            <textarea className={`${fieldClass} h-24 py-2`} value={text} onChange={(e) => { setText(e.target.value); setSaved(false); }} />
          </label>
          <div className="flex items-center gap-2">
            <AButton small disabled={act.busy} onClick={async () => { if (await act.run(() => api(`/admin/members/${member.id}/notes`, 'PUT', { text }))) setSaved(true); }}>Save notes</AButton>
            {saved && <span className="text-xs font-bold text-lime">Saved</span>}
          </div>
          {member.id !== me.user.id && (
            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              <AButton variant="danger" small onClick={() => act.run(() => api(`/admin/users/${member.id}`, 'PATCH', { active: !member.active }))}>{member.active ? 'Deactivate' : 'Reactivate'}</AButton>
              {member.role !== 'admin' && <AButton variant="secondary" small onClick={() => act.run(() => api(`/admin/users/${member.id}`, 'PATCH', { role: 'admin' }))}>Make admin</AButton>}
            </div>
          )}
          {act.error && <ErrorText>{act.error}</ErrorText>}
        </>
      )}
    </aside>
  );
}

export function Members() {
  const { data, error, reload } = useLoad(() => api<Member[]>('/admin/members'), []);
  const [query, setQuery] = useState('');
  const [batch, setBatch] = useState('');
  const [status, setStatus] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const now = Date.now() / 1000;
  const q = query.trim().toLowerCase();
  const rows = (data ?? []).filter((m) => (!q || `${m.name} ${m.username} ${m.email}`.toLowerCase().includes(q)) && (!batch || m.batchYear === Number(batch)) && (!status || statusOf(m, now) === status));
  const open = data?.find((m) => m.id === openId);
  const select = 'h-11 rounded-full border border-line bg-card px-4 font-bold outline-none focus:border-lime';
  return (
    <>
      <PageHeader title="Members" line="Everyone in the club. Open a row for notes and history." />
      <div className="flex flex-wrap gap-2">
        <input className={`${fieldClass} max-w-[320px]`} placeholder="Search" aria-label="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select aria-label="Year" className={select} value={batch} onChange={(e) => setBatch(e.target.value)}>
          <option value="">All years</option>
          {STUDY_YEARS.map((y) => <option key={y.value} value={batchForStudyYear(y.value, now)}>{y.label}</option>)}
        </select>
        <select aria-label="Status" className={select} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="deactivated">Deactivated</option>
          <option value="alumni">Alumni</option>
        </select>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex flex-col items-start gap-4 xl:flex-row">
        <div className="w-full min-w-0 flex-1">
          <ATable>
            <table className="w-full text-left">
              <thead>
                <tr className="label border-b border-line"><th className="p-3">Name</th><th className="p-3">Year</th><th className="p-3">Username</th><th className="p-3 text-right">CF</th><th className="p-3 text-right">Attendance</th><th className="p-3">Last solve</th><th className="p-3">Status</th></tr>
              </thead>
              <tbody>
                {rows.map((member) => {
                  const rate = member.total ? Math.round((member.present / member.total) * 100) : null;
                  const state = statusOf(member, now);
                  return (
                    <tr key={member.id} className={`border-b border-line last:border-0 ${openId === member.id ? 'bg-[#1F1F29]' : ''}`}>
                      <td className="p-2"><button onClick={() => setOpenId(member.id)} className="flex cursor-pointer items-center gap-2 whitespace-nowrap font-bold hover:underline"><Avatar userId={member.id} name={member.name} size={28} />{member.name}</button></td>
                      <td className="p-2 whitespace-nowrap text-muted">{studyYearLabel(member.batchYear, now)}</td>
                      <td className="handle p-2 text-xs text-violet-soft">@{member.username}</td>
                      <td className="p-2 text-right"><Rating value={member.cfRating} /></td>
                      <td className="num p-2 text-right">{rate === null ? '—' : `${rate}%`}</td>
                      <td className="p-2 whitespace-nowrap text-xs text-muted">{member.lastSolve ? timeAgo(member.lastSolve, now) : 'Never'}</td>
                      <td className="p-2"><Chip tone={state === 'active' ? 'ok' : state === 'alumni' ? 'info' : 'plain'}>{state}</Chip></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ATable>
        </div>
        {open && <MemberDrawer member={open} onClose={() => setOpenId(null)} onChange={reload} />}
      </div>
    </>
  );
}

type AdminRow = { id: number; name: string; username: string | null; email: string; owner: boolean };
type AuditRow = { id: number; area: string; action: string; target: string | null; before: string | null; after: string | null; at: number; admin: string };

const AREAS = [
  { id: '', label: 'All' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'handles', label: 'Handles' },
  { id: 'fairness', label: 'Fairness' },
  { id: 'admins', label: 'Admins' },
  { id: 'rules', label: 'Rules' },
];

export function AdminsAudit() {
  const { me } = useMe();
  const admins = useLoad(() => api<AdminRow[]>('/admin/admins'), []);
  const [email, setEmail] = useState('');
  const [area, setArea] = useState('');
  const [items, setItems] = useState<AuditRow[]>([]);
  const [more, setMore] = useState(false);
  const act = useAct(() => { admins.reload(); load(); });

  async function load(before?: number) {
    const page = await api<{ items: AuditRow[]; pageSize: number }>(`/admin/audit?area=${area}${before ? `&before=${before}` : ''}`);
    setItems((current) => (before ? [...current, ...page.items] : page.items));
    setMore(page.items.length === page.pageSize);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, [area]);

  return (
    <>
      <PageHeader title="Admins & audit log" line="Everyone here is a full admin. Every admin write is logged below." />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-2 rounded-[20px] border border-line bg-card p-5">
          <h2 className="display text-lg">Add an admin</h2>
          <div className="flex gap-2">
            <input className={fieldClass} type="email" placeholder="name@example.com" aria-label="Admin email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <AButton disabled={!email || act.busy} onClick={async () => { if (await act.run(() => api('/admin/admins', 'POST', { email }))) setEmail(''); }}>Add</AButton>
          </div>
          <p className="text-xs text-muted">They need an account first.</p>
          {act.error && <ErrorText>{act.error}</ErrorText>}
        </section>
        <section className="flex flex-col gap-2 rounded-[20px] border border-line bg-card p-5">
          <h2 className="display text-lg">Admins</h2>
          {admins.data?.map((admin) => (
            <div key={admin.id} className="flex flex-wrap items-center gap-2 border-t border-line pt-2 first-of-type:border-0 first-of-type:pt-0">
              <Avatar userId={admin.id} name={admin.name || admin.email} size={30} />
              <span className="min-w-0 flex-1"><span className="block truncate font-bold">{admin.name || admin.email}</span><span className="block truncate text-xs text-muted">{admin.email}</span></span>
              {admin.id === me.user.id && <Chip tone="admin">You</Chip>}
              {admin.owner && <Chip tone="wait">Owner</Chip>}
              {admin.id !== me.user.id && !admin.owner && <AButton variant="danger" small onClick={() => act.run(() => api(`/admin/users/${admin.id}`, 'PATCH', { role: 'student' }))}>Remove</AButton>}
            </div>
          ))}
          {admins.data?.some((a) => a.owner) && <p className="text-xs text-muted">Owners are set in the ADMIN_EMAILS secret, so signing in would make them an admin again.</p>}
        </section>
      </div>
      <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="display text-lg">Audit log</h2>
          <Segmented label="Filter audit log" tabs={AREAS} value={area} onChange={setArea} />
        </div>
        {items.length === 0 && <p className="text-muted">Nothing logged yet.</p>}
        {items.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center gap-2 border-t border-line pt-2 text-xs first-of-type:border-0 first-of-type:pt-0">
            <span className="num text-muted">{formatIST(item.at)}</span>
            <Chip>{item.area}</Chip>
            <span className="min-w-0 flex-1 basis-60"><b>{item.action}</b>{item.target ? ` · ${item.target}` : ''}{item.after ? <span className="text-muted"> → {item.after}</span> : null}</span>
            <span className="text-muted">{item.admin}</span>
          </div>
        ))}
        {more && <div><AButton variant="secondary" small onClick={() => load(items[items.length - 1].id)}>Show more</AButton></div>}
      </section>
    </>
  );
}
