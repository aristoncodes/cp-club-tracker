import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api, getSession, type Me } from '../api';
import { Avatar, ErrorText, Logo, useLoad, type ShellContext } from '../ui';

type Counts = { inbox: number; handles: number; atRisk: number; fairness: number };

const GROUPS: { title: string; items: { to: string; label: string; count?: keyof Counts; urgent?: boolean }[] }[] = [
  {
    title: 'Run the club',
    items: [
      { to: 'overview', label: 'Overview', count: 'inbox', urgent: true },
      { to: 'members', label: 'Members' },
      { to: 'students', label: 'Students & handles', count: 'handles' },
      { to: 'at-risk', label: 'At-risk', count: 'atRisk', urgent: true },
      { to: 'attendance', label: 'Attendance' },
      { to: 'exam-weeks', label: 'Exam weeks' },
      { to: 'contests', label: 'Contests' },
      { to: 'sessions', label: 'Sessions' },
    ],
  },
  {
    title: 'Engagement',
    items: [
      { to: 'engagement', label: 'Engagement' },
      { to: 'fairness', label: 'Fairness', count: 'fairness', urgent: true },
      { to: 'seasons', label: 'Seasons' },
    ],
  },
  {
    title: 'Communicate',
    items: [
      { to: 'announcements', label: 'Announcements' },
      { to: 'digest', label: 'Digest' },
      { to: 'reports', label: 'Reports' },
    ],
  },
  {
    title: 'Settings',
    items: [
      { to: 'admins', label: 'Admins & audit log' },
      { to: 'rules', label: 'Rules' },
    ],
  },
];

function Sidebar({ me, counts, onNavigate }: { me: Me; counts: Counts | null; onNavigate: () => void }) {
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-center gap-2">
        <Logo />
        <span className="rounded-full bg-violet-tint px-2 py-0.5 text-[10px] font-extrabold text-violet-soft">ADMIN</span>
      </div>
      <nav aria-label="Admin" className="flex flex-1 flex-col gap-4">
        {GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-0.5">
            <p className="mb-1 px-3 text-[11px] font-bold tracking-[0.08em] text-[#6E6E80] uppercase">{group.title}</p>
            {group.items.map((item) => {
              const count = item.count && counts ? counts[item.count] : 0;
              return (
                <NavLink
                  key={item.to}
                  to={`/admin/${item.to}`}
                  onClick={onNavigate}
                  className={({ isActive }) => `flex min-h-9 items-center gap-2 rounded-xl px-3 py-2 font-semibold ${isActive ? 'bg-violet-tint text-violet-pale' : 'text-muted hover:text-text'}`}
                >
                  {({ isActive }) => (
                    <>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {isActive && <i aria-hidden className="size-1.5 rounded-full bg-lime" />}
                      {count > 0 && <span className={`num rounded-full px-1.5 text-[11px] text-ink ${item.urgent ? 'bg-pink' : 'bg-sun'}`}>{count}</span>}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
      <Link to="/" className="font-bold text-muted hover:text-text">← Back to the app</Link>
      <div className="flex items-center gap-2 rounded-2xl bg-card p-2">
        <Avatar userId={me.user.id} name={me.user.name} size={32} />
        <div className="min-w-0">
          <p className="truncate font-bold">{me.user.name}</p>
          <p className="text-xs text-muted">Admin</p>
        </div>
      </div>
    </div>
  );
}

export function AdminLayout() {
  const { pathname } = useLocation();
  const me = useLoad(() => api<Me>('/me'), []);
  const counts = useLoad(() => api<Counts>('/admin/badges'), [pathname]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [open]);

  if (!getSession()) return <Navigate to="/login" replace />;
  if (me.error) return <div className="p-6"><ErrorText>{me.error}</ErrorText></div>;
  if (!me.data) return null;
  if (me.data.user.role !== 'admin') return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen lg:pl-[232px]">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[232px] border-r border-line bg-ink lg:block">
        <Sidebar me={me.data} counts={counts.data} onNavigate={() => undefined} />
      </aside>
      <header className="no-print flex h-14 items-center gap-3 border-b border-line px-4 lg:hidden">
        <button aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)} className="flex size-11 cursor-pointer items-center justify-center text-xl">☰</button>
        <Logo />
      </header>
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-[rgba(8,8,12,.75)]" />
          <aside className="absolute inset-y-0 left-0 w-[260px] max-w-[85vw] border-r border-line bg-ink" onClick={(event) => event.stopPropagation()}>
            <Sidebar me={me.data} counts={counts.data} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
      <main className="flex min-w-0 flex-col gap-5 px-4 pt-6 pb-10 lg:px-8 lg:pt-7">
        <Outlet context={{ me: me.data, reload: () => { me.reload(); counts.reload(); } } satisfies ShellContext} />
      </main>
    </div>
  );
}
