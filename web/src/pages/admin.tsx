import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { batchForStudyYear, STUDY_YEARS, studyYearLabel } from 'shared/batch';
import { formatIST, IST_OFFSET } from 'shared/time';
import { api } from '../api';
import { Button, Card, ErrorText, inputClass, platformLabel, Tabs, useLoad, useMe } from '../ui';

type Section = 'attendance' | 'students' | 'admins' | 'flags';
type GridContest = { id: number; platform: string; name: string; startAt: number; counts: number };
type GridStudent = { id: number; name: string; batchYear: number | null };
type Cell = { contestId: number; userId: number; rsvp: string | null; status: string | null; reasonType: string | null; reasonText: string | null };
type AttendanceData = { contests: GridContest[]; students: GridStudent[]; cells: Cell[] };
type AdminUser = { id: number; email: string; name: string; batchYear: number | null; role: string; active: number };
type AdminHandle = { userId: number; platform: string; handle: string; approved: number; broken: number };

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'attendance', label: 'Attendance' },
  { id: 'students', label: 'Students & handles' },
  { id: 'admins', label: 'Admins' },
  { id: 'flags', label: 'Flags' },
];
const DAY = 86400;

const istDate = (ts: number) => new Date((ts + IST_OFFSET) * 1000).toISOString().slice(0, 10);
const istStart = (date: string) => Date.parse(`${date}T00:00:00+05:30`) / 1000;
const istEnd = (date: string) => Date.parse(`${date}T23:59:59+05:30`) / 1000;

function describeCell(cell: Cell | undefined): string {
  if (!cell?.status) return '';
  if (cell.status === 'present') return 'Present';
  if (!cell.reasonType) return 'Absent, no reason';
  return `Absent: ${cell.reasonType}${cell.reasonText ? ` (${cell.reasonText})` : ''}`;
}

function cellColor(cell: Cell | undefined): string {
  if (!cell?.status) return 'bg-surface-2';
  if (cell.status === 'present') return 'bg-present';
  return cell.reasonType ? 'bg-absent' : 'bg-pending';
}

// A leading = + - or @ would run as a formula when the CSV opens in a spreadsheet.
function csvField(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function downloadCsv(contests: GridContest[], students: GridStudent[], cellOf: (userId: number, contestId: number) => Cell | undefined) {
  const header = ['Student', 'Year', ...contests.map((c) => c.name)];
  const rows = students.map((s) => [s.name, studyYearLabel(s.batchYear, Date.now() / 1000), ...contests.map((c) => describeCell(cellOf(s.id, c.id)))]);
  const csv = [header, ...rows].map((row) => row.map(csvField).join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  link.download = 'attendance.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

function Attendance() {
  const now = Math.floor(Date.now() / 1000);
  const [from, setFrom] = useState(istDate(now - 30 * DAY));
  const [to, setTo] = useState(istDate(now + 14 * DAY));
  const [platform, setPlatform] = useState('');
  const [batch, setBatch] = useState('');
  const [detail, setDetail] = useState('');
  const [actionError, setActionError] = useState('');
  const query = `/admin/attendance?from=${istStart(from)}&to=${istEnd(to)}&platform=${platform}&batch=${batch}`;
  const { data, error, reload } = useLoad(() => api<AttendanceData>(query), [query]);

  const cells = useMemo(() => new Map(data?.cells.map((c) => [`${c.userId}:${c.contestId}`, c])), [data]);
  const cellOf = (userId: number, contestId: number) => cells.get(`${userId}:${contestId}`);
  const counted = data?.contests.filter((c) => c.counts) ?? [];
  const notCounted = data?.contests.filter((c) => !c.counts) ?? [];
  const countedIds = new Set(counted.map((c) => c.id));
  const countedCells = data?.cells.filter((c) => countedIds.has(c.contestId) && c.status) ?? [];

  const reasonGroups = new Map<string, Cell[]>();
  for (const cell of countedCells) {
    if (cell.status === 'absent' && cell.reasonType) {
      reasonGroups.set(cell.reasonType, [...(reasonGroups.get(cell.reasonType) ?? []), cell]);
    }
  }

  async function setCounts(contest: GridContest, counts: boolean) {
    setActionError('');
    try {
      await api(`/admin/contests/${contest.id}`, 'PATCH', { counts });
      reload();
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  function studentStats(userId: number) {
    const mine = countedCells.filter((c) => c.userId === userId);
    const present = mine.filter((c) => c.status === 'present').length;
    const noShows = mine.filter((c) => c.status === 'absent' && c.rsvp === 'yes').length;
    return { percent: mine.length ? Math.round((present / mine.length) * 100) : null, noShows };
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1"><span className="label">From</span><input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="flex flex-col gap-1"><span className="label">To</span><input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="flex flex-col gap-1">
          <span className="label">Platform</span>
          <select className={inputClass} value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="">All</option>
            <option value="cf">Codeforces</option>
            <option value="cc">CodeChef</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Year</span>
          <select className={inputClass} value={batch} onChange={(e) => setBatch(e.target.value)}>
            <option value="">All</option>
            {STUDY_YEARS.map((y) => <option key={y.value} value={batchForStudyYear(y.value, now)}>{y.label}</option>)}
          </select>
        </label>
      </div>
      {(error || actionError) && <ErrorText>{error || actionError}</ErrorText>}
      {data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-3 text-muted">
              <span className="flex items-center gap-1"><i className="size-3 rounded-[2px] bg-present" /> Present</span>
              <span className="flex items-center gap-1"><i className="size-3 rounded-[2px] bg-absent" /> Absent, reason given</span>
              <span className="flex items-center gap-1"><i className="size-3 rounded-[2px] bg-pending" /> Absent, no reason</span>
            </div>
            <Button variant="secondary" onClick={() => downloadCsv(counted, data.students, cellOf)}>Export CSV</Button>
          </div>
          <div className="max-h-[70vh] overflow-auto rounded-xl border border-border bg-surface">
            <table className="border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-20 border-b border-border bg-surface p-2 text-left"><span className="label">Student</span></th>
                  <th className="label sticky top-0 z-10 border-b border-border bg-surface p-2 font-medium">%</th>
                  <th className="label sticky top-0 z-10 border-b border-border bg-surface p-2 font-medium" title="Said yes, didn't show">No-show</th>
                  {counted.map((contest) => (
                    <th key={contest.id} className="sticky top-0 z-10 min-w-24 border-b border-border bg-surface p-2 text-left align-top font-normal">
                      <span title={contest.name} className="line-clamp-2 text-xs font-medium">{contest.name}</span>
                      <span className="block text-xs text-muted">{formatIST(contest.startAt).split(' · ')[0]}</span>
                      <button className="mt-1 min-h-6 cursor-pointer text-xs text-absent" onClick={() => setCounts(contest, false)}>Don't count</button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.students.map((student) => {
                  const { percent, noShows } = studentStats(student.id);
                  return (
                    <tr key={student.id}>
                      <td className="sticky left-0 z-10 border-b border-border bg-surface p-2 whitespace-nowrap">
                        <Link to={`/u/${student.id}`} className="hover:underline">{student.name}</Link>
                        <span className="ml-2 text-muted">{studyYearLabel(student.batchYear, now)}</span>
                      </td>
                      <td className="num border-b border-border p-2 text-center">{percent ?? '—'}</td>
                      <td className="num border-b border-border p-2 text-center">{noShows}</td>
                      {counted.map((contest) => {
                        const cell = cellOf(student.id, contest.id);
                        const text = describeCell(cell);
                        return (
                          <td key={contest.id} className="border-b border-border p-2">
                            <button
                              aria-label={`${student.name}, ${contest.name}: ${text || 'No record'}`}
                              title={text}
                              onClick={() => setDetail(`${student.name}, ${contest.name}: ${text || 'No record'}${cell?.rsvp ? ` · RSVP ${cell.rsvp}` : ''}`)}
                              className={`block size-5 cursor-pointer rounded-[4px] ${cellColor(cell)}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {detail && <p className="text-muted">{detail}</p>}
          {counted.length === 0 && <p className="text-muted">No counted contests in this range.</p>}
          <Card>
            <h2 className="mb-2 text-lg font-semibold">Reasons by type</h2>
            {reasonGroups.size === 0 && <p className="text-muted">No reasons in this range yet.</p>}
            {[...reasonGroups].map(([type, group]) => (
              <details key={type} className="border-b border-border py-2 last:border-0">
                <summary className="cursor-pointer">{type} <span className="num text-muted">{group.length}</span></summary>
                <ul className="mt-2 flex flex-col gap-1 text-muted">
                  {group.map((cell) => (
                    <li key={`${cell.userId}:${cell.contestId}`}>
                      {data.students.find((s) => s.id === cell.userId)?.name}, {data.contests.find((c) => c.id === cell.contestId)?.name}
                      {cell.reasonText ? `: ${cell.reasonText}` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </Card>
          {notCounted.length > 0 && (
            <Card>
              <h2 className="mb-2 text-lg font-semibold">Not counted</h2>
              {notCounted.map((contest) => (
                <div key={contest.id} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0">
                  <span>{contest.name} <span className="text-muted">· {formatIST(contest.startAt)}</span></span>
                  <Button variant="secondary" onClick={() => setCounts(contest, true)}>Count it</Button>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Students() {
  const { me } = useMe();
  const { data, error, reload } = useLoad(() => api<{ users: AdminUser[]; handles: AdminHandle[] }>('/admin/students'), []);
  const [actionError, setActionError] = useState('');
  const [onlyWaiting, setOnlyWaiting] = useState(false);

  async function act(path: string, body: unknown) {
    setActionError('');
    try {
      await api(path, 'PATCH', body);
      reload();
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  const hasWaiting = (userId: number) => data?.handles.some((h) => h.userId === userId && !h.approved);
  const users = data?.users.filter((u) => !onlyWaiting || hasWaiting(u.id)) ?? [];

  return (
    <div className="flex flex-col gap-3">
      {(error || actionError) && <ErrorText>{error || actionError}</ErrorText>}
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={onlyWaiting} onChange={(e) => setOnlyWaiting(e.target.checked)} /> Only show handles waiting for approval
      </label>
      {data && users.length === 0 && <p className="text-muted">Nothing here right now.</p>}
      {users.map((user) => (
        <Card key={user.id} className={user.active ? '' : 'opacity-60'}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <Link to={`/u/${user.id}`} className="font-semibold hover:underline">{user.name || user.email}</Link>
              <span className="ml-2 text-muted">{studyYearLabel(user.batchYear, Date.now() / 1000)}</span>
              <p className="text-muted">{user.email}</p>
            </div>
            {user.id !== me.user.id && (
              <Button variant={user.active ? 'danger' : 'secondary'} onClick={() => act(`/admin/users/${user.id}`, { active: !user.active })}>
                {user.active ? 'Deactivate' : 'Reactivate'}
              </Button>
            )}
          </div>
          {data?.handles.filter((h) => h.userId === user.id).map((handle) => (
            <div key={handle.platform} className="flex flex-wrap items-center justify-between gap-2 border-t border-border py-2">
              <span>
                <span className="text-muted">{platformLabel(handle.platform)}</span> <span className="num">{handle.handle}</span>
                {!!handle.broken && <span className="ml-2 text-absent">Not found on the platform</span>}
              </span>
              <Button
                variant={handle.approved ? 'secondary' : 'primary'}
                onClick={() => act(`/admin/handles/${user.id}/${handle.platform}`, { approved: !handle.approved })}
              >
                {handle.approved ? 'Remove approval' : 'Approve'}
              </Button>
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}

function Admins() {
  const { me } = useMe();
  const { data, error, reload } = useLoad(() => api<{ users: AdminUser[] }>('/admin/students'), []);
  const [email, setEmail] = useState('');
  const [actionError, setActionError] = useState('');

  async function run(work: () => Promise<unknown>) {
    setActionError('');
    try {
      await work();
      reload();
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Add an admin</h2>
        <div className="flex gap-2">
          <input className={inputClass} type="email" placeholder="name@example.com" aria-label="Admin email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button onClick={() => run(async () => { await api('/admin/admins', 'POST', { email }); setEmail(''); })} disabled={!email}>Add</Button>
        </div>
      </Card>
      {(error || actionError) && <ErrorText>{error || actionError}</ErrorText>}
      <Card className="flex flex-col divide-y divide-border p-0">
        {data?.users.filter((u) => u.role === 'admin').map((user) => (
          <div key={user.id} className="flex items-center justify-between gap-3 p-3">
            <div>
              <p className="font-medium">{user.name || 'Hasn\'t signed in yet'}</p>
              <p className="text-muted">{user.email}</p>
            </div>
            {user.id !== me.user.id && (
              <Button variant="danger" onClick={() => run(() => api(`/admin/users/${user.id}`, 'PATCH', { role: 'student' }))}>Remove</Button>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}

type Flags = {
  busyDays: { userId: number; name: string; day: number; solves: number }[];
  brokenHandles: { userId: number; name: string; platform: string; handle: string }[];
};

function FlagsSection() {
  const { data, error } = useLoad(() => api<Flags>('/admin/flags'), []);
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return null;
  return (
    <div className="flex flex-col gap-3">
      <Card>
        <h2 className="mb-2 text-lg font-semibold">More than 30 solves in a day</h2>
        <p className="mb-2 text-muted">For manual review. Nothing happens automatically.</p>
        {data.busyDays.length === 0 && <p className="text-muted">Nobody in the last 30 days.</p>}
        {data.busyDays.map((row) => (
          <p key={`${row.userId}-${row.day}`} className="flex justify-between border-t border-border py-2">
            <Link to={`/u/${row.userId}`} className="hover:underline">{row.name}</Link>
            <span className="text-muted">{formatIST(row.day * DAY - IST_OFFSET).split(' · ')[0]} · <span className="num">{row.solves}</span> solves</span>
          </p>
        ))}
      </Card>
      <Card>
        <h2 className="mb-2 text-lg font-semibold">Handles not found</h2>
        <p className="mb-2 text-muted">These aren't being tracked. The student needs to update their handle.</p>
        {data.brokenHandles.length === 0 && <p className="text-muted">All handles are fine.</p>}
        {data.brokenHandles.map((row) => (
          <p key={`${row.userId}-${row.platform}`} className="flex justify-between border-t border-border py-2">
            <Link to={`/u/${row.userId}`} className="hover:underline">{row.name}</Link>
            <span className="text-muted">{platformLabel(row.platform)} <span className="num">{row.handle}</span></span>
          </p>
        ))}
      </Card>
    </div>
  );
}

export function Admin() {
  const { me } = useMe();
  const [section, setSection] = useState<Section>('attendance');
  if (me.user.role !== 'admin') return <p className="text-muted">This page is for admins.</p>;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Admin</h1>
      <Tabs tabs={SECTIONS} value={section} onChange={setSection} />
      {section === 'attendance' && <Attendance />}
      {section === 'students' && <Students />}
      {section === 'admins' && <Admins />}
      {section === 'flags' && <FlagsSection />}
    </div>
  );
}
