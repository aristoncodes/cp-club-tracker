import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { batchForStudyYear, STUDY_YEARS, studyYearLabel } from 'shared/batch';
import { REASONS } from 'shared/reasons';
import { formatIST, IST_OFFSET, solvesText } from 'shared/time';
import { api } from '../api';
import { Avatar, Button, Card, CellMark, ErrorText, inputClass, platformLabel, ProgressBar, useLoad, useMe } from '../ui';
import { AnnouncementsSection, DigestSection, VirtualsSection } from './admin-tools';

type Section = 'attendance' | 'students' | 'admins' | 'announcements' | 'virtuals' | 'digest' | 'flags';
type GridContest = { id: number; platform: string; name: string; startAt: number; counts: number };
type GridStudent = { id: number; name: string; batchYear: number | null };
type Cell = { contestId: number; userId: number; rsvp: string | null; status: string | null; reasonType: string | null; reasonText: string | null };
type AttendanceData = { contests: GridContest[]; students: GridStudent[]; cells: Cell[] };
type AdminUser = { id: number; email: string; name: string; username: string | null; batchYear: number | null; role: string; active: number };
type AdminHandle = { userId: number; platform: string; handle: string; approved: number; broken: number };

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'attendance', label: 'Attendance' },
  { id: 'students', label: 'Students & handles' },
  { id: 'admins', label: 'Admins' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'virtuals', label: 'Club virtuals' },
  { id: 'digest', label: 'Digest' },
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
  const label = REASONS.find((r) => r.id === cell.reasonType)?.label ?? cell.reasonType;
  return `Absent: ${label}${cell.reasonText ? ` (${cell.reasonText})` : ''}`;
}

const shortName = (contest: GridContest) =>
  contest.name
    .replace('Educational Codeforces Round ', 'Edu ')
    .replace('Codeforces Round ', 'R')
    .replace('Starters ', 'S')
    .replace(/\s*\(.*\)$/, '');

const rateColor = (percent: number) => (percent >= 70 ? 'text-lime' : percent >= 50 ? 'text-sun' : 'text-pink');

const REASON_BARS: Record<string, string> = {
  exams: 'bg-pink',
  clash: 'bg-lilac',
  forgot: 'bg-sun',
  travel: 'bg-sky',
  illness: 'bg-orange',
  other: 'bg-lime',
};

const NUDGE_BELOW = 50;

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

  const pending = countedCells.filter((c) => c.status === 'absent' && !c.reasonType).length;
  const noShows = countedCells.filter((c) => c.status === 'absent' && c.rsvp === 'yes');
  const present = countedCells.filter((c) => c.status === 'present').length;
  const clubRate = countedCells.length ? Math.round((present / countedCells.length) * 100) : null;
  const cfCount = counted.filter((c) => c.platform === 'cf').length;
  const reasons = [...reasonGroups].sort((a, b) => b[1].length - a[1].length);
  const biggest = reasons[0]?.[1].length ?? 1;
  const nudges = (data?.students ?? []).map((student) => ({ student, ...studentStats(student.id) })).filter((row) => row.percent !== null && row.percent < NUDGE_BELOW);
  const filterClass = 'h-11 rounded-full border border-line bg-card px-4 font-bold text-text outline-none focus:border-lime';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-[52px] leading-none tracking-[-0.035em]">Attendance</h1>
          <p className="mt-1 text-muted">Visible to admins only</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" aria-label="From" className={filterClass} value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" aria-label="To" className={filterClass} value={to} onChange={(e) => setTo(e.target.value)} />
          <select aria-label="Platform" className={filterClass} value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="">All platforms</option>
            <option value="cf">Codeforces</option>
            <option value="cc">CodeChef</option>
          </select>
          <select aria-label="Year" className={filterClass} value={batch} onChange={(e) => setBatch(e.target.value)}>
            <option value="">All years</option>
            {STUDY_YEARS.map((y) => <option key={y.value} value={batchForStudyYear(y.value, now)}>{y.label}</option>)}
          </select>
          {data && <Button onClick={() => downloadCsv(counted, data.students, cellOf)}>Export CSV</Button>}
        </div>
      </div>
      {(error || actionError) && <ErrorText>{error || actionError}</ErrorText>}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-[20px] bg-lime p-5 text-ink">
              <p className="text-xs font-bold">Club attendance</p>
              <p className="num text-[40px] leading-tight tracking-[-0.03em]">{clubRate === null ? '—' : `${clubRate}%`}</p>
              <p className="text-xs font-bold">goal 70%</p>
            </div>
            <Card>
              <p className="label">Contests counted</p>
              <p className="num text-[40px] leading-tight tracking-[-0.03em]">{counted.length}</p>
              <p className="text-xs text-muted">{cfCount} Codeforces · {counted.length - cfCount} CodeChef</p>
            </Card>
            <Card>
              <p className="label">Said yes, didn't show</p>
              <p className="num text-[40px] leading-tight tracking-[-0.03em] text-pink">{noShows.length}</p>
              <p className="text-xs text-muted">across {new Set(noShows.map((c) => c.userId)).size} students</p>
            </Card>
            <Card>
              <p className="label">Reasons pending</p>
              <p className="num text-[40px] leading-tight tracking-[-0.03em] text-sun">{pending}</p>
              <p className="text-xs text-muted">still to answer</p>
            </Card>
          </div>
          <div className="grid items-start gap-4 min-[1000px]:grid-cols-[1fr_280px]">
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap gap-4 rounded-2xl border border-line bg-card px-4 py-3 text-muted">
                <span className="flex items-center gap-2"><span className="num flex size-5 items-center justify-center rounded-[6px] bg-lime text-[10px] text-ink">✓</span> Present</span>
                <span className="flex items-center gap-2"><span className="num flex size-5 items-center justify-center rounded-[6px] bg-pink text-[10px] text-ink">E</span> Absent, with reason (letter = reason)</span>
                <span className="flex items-center gap-2"><span className="num flex size-5 items-center justify-center rounded-[6px] border-2 border-dashed border-sun text-[10px] text-sun">?</span> No reason yet</span>
              </div>
              <div className="max-h-[70vh] overflow-auto rounded-[22px] border border-line bg-card">
                <table className="border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className="sticky top-0 left-0 z-20 border-b border-line bg-card p-3 text-left"><span className="label">Student</span></th>
                      <th className="label sticky top-0 z-10 border-b border-line bg-card p-3 text-right">Rate</th>
                      <th className="label sticky top-0 z-10 border-b border-line bg-card p-3 text-right" title="Said yes, didn't show">No-show</th>
                      {counted.map((contest) => (
                        <th key={contest.id} className="sticky top-0 z-10 min-w-20 border-b border-line bg-card p-2 text-center align-top font-normal" title={contest.name}>
                          <span className={`num block text-[10px] ${contest.platform === 'cf' ? 'text-[#60A5FA]' : 'text-orange'}`}>{contest.platform.toUpperCase()}</span>
                          <span className="block text-xs font-bold">{shortName(contest)}</span>
                          <span className="block text-[11px] text-muted">{formatIST(contest.startAt).split(', ')[1]?.split(' · ')[0]}</span>
                          <button className="mt-1 min-h-6 cursor-pointer text-[11px] text-pink hover:underline" onClick={() => setCounts(contest, false)}>Don't count</button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.students.map((student) => {
                      const { percent, noShows: studentNoShows } = studentStats(student.id);
                      return (
                        <tr key={student.id}>
                          <td className="sticky left-0 z-10 border-b border-line bg-card p-2">
                            <span className="flex items-center gap-2 whitespace-nowrap">
                              <Avatar userId={student.id} name={student.name} size={28} />
                              <span>
                                <Link to={`/u/${student.id}`} className="block font-bold hover:underline">{student.name}</Link>
                                <span className="block text-xs text-muted">{studyYearLabel(student.batchYear, now)}</span>
                              </span>
                            </span>
                          </td>
                          <td className={`num border-b border-line p-2 text-right ${percent === null ? 'text-muted' : rateColor(percent)}`}>{percent === null ? '—' : `${percent}%`}</td>
                          <td className="num border-b border-line p-2 text-right">{studentNoShows}</td>
                          {counted.map((contest) => {
                            const cell = cellOf(student.id, contest.id);
                            const text = describeCell(cell);
                            return (
                              <td key={contest.id} className="border-b border-line p-2">
                                <button
                                  aria-label={`${student.name}, ${contest.name}: ${text || 'No record'}`}
                                  title={text}
                                  onClick={() => setDetail(`${student.name}, ${contest.name}: ${text || 'No record'}${cell?.rsvp ? ` · RSVP ${cell.rsvp}` : ''}`)}
                                  className="mx-auto block cursor-pointer"
                                >
                                  <CellMark status={cell?.status} reasonType={cell?.reasonType} />
                                </button>
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
            </div>
            <aside className="flex flex-col gap-3">
              <Card className="flex flex-col gap-3">
                <h2 className="display text-lg">Why people missed</h2>
                {reasons.length === 0 && <p className="text-muted">No reasons in this range yet.</p>}
                {reasons.map(([type, group]) => (
                  <div key={type} className="flex flex-col gap-1">
                  <details>
                    <summary className="flex cursor-pointer items-center justify-between font-bold">
                      {REASONS.find((r) => r.id === type)?.label ?? type}
                      <span className="num">{group.length}</span>
                    </summary>
                    <ul className="mt-1 flex flex-col gap-1 text-xs text-muted">
                      {group.map((cell) => (
                        <li key={`${cell.userId}:${cell.contestId}`}>
                          {data.students.find((s) => s.id === cell.userId)?.name}, {data.contests.find((c) => c.id === cell.contestId)?.name}
                          {cell.reasonText ? `: ${cell.reasonText}` : ''}
                        </li>
                      ))}
                    </ul>
                  </details>
                  <ProgressBar percent={(group.length / biggest) * 100} color={REASON_BARS[type] ?? 'bg-lime'} />
                  </div>
                ))}
              </Card>
              <div className="rounded-[20px] bg-violet-tint p-5">
                <h2 className="display text-lg">Needs a nudge</h2>
                <p className="mb-2 text-violet-soft">Below {NUDGE_BELOW}% in this range</p>
                {nudges.length === 0 && <p className="text-violet-soft">Nobody right now.</p>}
                {nudges.map(({ student, percent }) => (
                  <p key={student.id} className="font-bold">{student.name} <span className="num text-pink">{percent}%</span></p>
                ))}
              </div>
              {notCounted.length > 0 && (
                <Card className="flex flex-col gap-2">
                  <h2 className="display text-lg">Not counted</h2>
                  {notCounted.map((contest) => (
                    <div key={contest.id} className="flex items-center justify-between gap-2 border-t border-line pt-2">
                      <span className="min-w-0 text-xs">{contest.name}<span className="block text-muted">{formatIST(contest.startAt)}</span></span>
                      <button className="min-h-11 shrink-0 cursor-pointer font-bold text-lime hover:underline" onClick={() => setCounts(contest, true)}>Count it</button>
                    </div>
                  ))}
                </Card>
              )}
            </aside>
          </div>
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
              <Link to={`/u/${user.id}`} className="font-bold hover:underline">{user.name || user.email}</Link>
              <span className="ml-2 text-muted">{studyYearLabel(user.batchYear, Date.now() / 1000)}</span>
              <p className="text-muted">{user.email}{user.username ? ` · @${user.username}` : ''}</p>
            </div>
            {user.id !== me.user.id && (
              <Button
                variant="secondary"
                onClick={() => {
                  const username = window.prompt('New username', user.username ?? '');
                  if (username) act(`/admin/users/${user.id}`, { username });
                }}
              >
                Change username
              </Button>
            )}
            {user.id !== me.user.id && (
              <Button variant={user.active ? 'danger' : 'secondary'} onClick={() => act(`/admin/users/${user.id}`, { active: !user.active })}>
                {user.active ? 'Deactivate' : 'Reactivate'}
              </Button>
            )}
          </div>
          {data?.handles.filter((h) => h.userId === user.id).map((handle) => (
            <div key={handle.platform} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2">
              <span>
                <span className="text-muted">{platformLabel(handle.platform)}</span> <span className="num">{handle.handle}</span>
                {!!handle.broken && <span className="ml-2 text-pink">Not found on the platform</span>}
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
        <h2 className="display text-lg">Add an admin</h2>
        <div className="flex gap-2">
          <input className={inputClass} type="email" placeholder="name@example.com" aria-label="Admin email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button onClick={() => run(async () => { await api('/admin/admins', 'POST', { email }); setEmail(''); })} disabled={!email}>Add</Button>
        </div>
      </Card>
      {(error || actionError) && <ErrorText>{error || actionError}</ErrorText>}
      <Card className="flex flex-col divide-y divide-line p-0">
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
        <h2 className="display mb-2 text-lg">More than 30 solves in a day</h2>
        <p className="mb-2 text-muted">For manual review. Nothing happens automatically.</p>
        {data.busyDays.length === 0 && <p className="text-muted">Nobody in the last 30 days.</p>}
        {data.busyDays.map((row) => (
          <p key={`${row.userId}-${row.day}`} className="flex justify-between border-t border-line py-2">
            <Link to={`/u/${row.userId}`} className="hover:underline">{row.name}</Link>
            <span className="text-muted">{formatIST(row.day * DAY - IST_OFFSET).split(' · ')[0]} · {solvesText(row.solves)}</span>
          </p>
        ))}
      </Card>
      <Card>
        <h2 className="display mb-2 text-lg">Handles not found</h2>
        <p className="mb-2 text-muted">These aren't being tracked. The student needs to update their handle.</p>
        {data.brokenHandles.length === 0 && <p className="text-muted">All handles are fine.</p>}
        {data.brokenHandles.map((row) => (
          <p key={`${row.userId}-${row.platform}`} className="flex justify-between border-t border-line py-2">
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
  const waiting = useLoad(() => (me.user.role === 'admin' ? api<{ handles: AdminHandle[] }>('/admin/students') : Promise.resolve({ handles: [] })), [section]);
  if (me.user.role !== 'admin') return <p className="text-muted">This page is for admins.</p>;
  const waitingCount = waiting.data?.handles.filter((h) => !h.approved).length ?? 0;
  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" className="flex flex-wrap gap-1">
        {SECTIONS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={tab.id === section}
            onClick={() => setSection(tab.id)}
            className={`lift flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 font-bold ${tab.id === section ? 'bg-violet-tint text-violet-soft' : 'text-muted hover:text-text'}`}
          >
            {tab.label}
            {tab.id === 'students' && waitingCount > 0 && <span className="num rounded-full bg-pink px-2 text-xs text-ink">{waitingCount}</span>}
          </button>
        ))}
      </div>
      {section === 'attendance' && <Attendance />}
      {section === 'students' && <Students />}
      {section === 'admins' && <Admins />}
      {section === 'announcements' && <AnnouncementsSection />}
      {section === 'virtuals' && <VirtualsSection />}
      {section === 'digest' && <DigestSection />}
      {section === 'flags' && <FlagsSection />}
    </div>
  );
}
