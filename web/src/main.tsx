import { GoogleOAuthProvider } from '@react-oauth/google';
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { api, getSession, type Announcement, type Me } from './api';
import './index.css';
import { Admin } from './pages/admin';
import { Contests } from './pages/contests';
import { Download } from './pages/download';
import { Feed } from './pages/feed';
import { Home } from './pages/home';
import { Leaderboard } from './pages/leaderboard';
import { Login } from './pages/login';
import { Practice } from './pages/practice';
import { Profile } from './pages/profile';
import { Reason } from './pages/reason';
import { Settings } from './pages/settings';
import { Signup } from './pages/signup';
import { Avatar, Button, ErrorText, Flame, InboxList, Logo, useLoad, type ShellContext } from './ui';

function Banner({ title, helper, action, to }: { title: string; helper: string; action: string; to: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-sun-line bg-sun-tint p-3">
      <span aria-hidden className="display flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-sun text-lg text-ink">!</span>
      <div className="min-w-0 flex-1 basis-48">
        <p className="font-bold text-sun-text">{title}</p>
        <p className="text-xs text-sun-text">{helper}</p>
      </div>
      <Link to={to} className="lift inline-flex h-10 items-center rounded-full bg-sun px-4 font-extrabold text-ink">{action}</Link>
    </div>
  );
}

function BellMenu({ unread, onSeen }: { unread: number; onSeen: () => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Announcement[] | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  async function toggle() {
    setOpen(!open);
    if (open) return;
    const inbox = await api<{ items: Announcement[] }>('/announcements');
    setItems(inbox.items);
    if (unread) {
      await api('/announcements/seen', 'POST');
      onSeen();
    }
  }

  return (
    <div ref={box} className="relative">
      <button aria-label={unread ? `Announcements, ${unread} unread` : 'Announcements'} aria-expanded={open} onClick={toggle} className="lift relative flex size-10 cursor-pointer items-center justify-center rounded-full border border-line bg-card">
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.300 21a2 2 0 0 0 3.400 0" /></svg>
        {unread > 0 && <i className="absolute top-2 right-2 size-2 rounded-full bg-pink" />}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 max-h-[70vh] w-[380px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-[20px] border border-line bg-card">
          {items && <InboxList items={items} />}
        </div>
      )}
    </div>
  );
}

function Shell() {
  const { pathname } = useLocation();
  const { data: me, error, reload } = useLoad(() => api<Me>('/me'), [pathname]);

  if (!getSession()) return <Navigate to="/login" replace />;
  if (error) return <div className="p-6"><ErrorText>{error}</ErrorText></div>;
  if (!me) return null;
  if (me.user.onboardingStep !== 'done') return <Navigate to="/signup" replace />;

  const links = [
    { to: '/', label: 'Home' },
    { to: '/leaderboard', label: 'Leaderboard' },
    { to: '/practice', label: 'Practice' },
    { to: '/duels', label: 'Duels' },
    { to: '/contests', label: 'Contests' },
    { to: '/feed', label: 'Feed' },
    ...(me.user.role === 'admin' ? [{ to: '/admin', label: 'Admin' }] : []),
  ];
  const bottomLinks = [
    { to: '/', label: 'Home' },
    { to: '/leaderboard', label: 'Board' },
    { to: '/practice', label: 'Practice' },
    { to: '/duels', label: 'Duels' },
    { to: '/contests', label: 'Contests' },
  ];
  const pillClass = ({ isActive }: { isActive: boolean }) =>
    `lift flex min-h-10 items-center rounded-full px-4 font-bold ${isActive ? 'bg-text text-ink' : 'text-muted hover:text-text'}`;
  const bottomClass = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-12 items-center justify-center px-1 text-xs font-bold ${isActive ? 'text-lime' : 'text-muted'}`;
  const waiting = me.handles.some((h) => !h.approved);

  return (
    <div className="pb-20 sm:pb-10">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="OOPS.Grind home"><Logo /></Link>
          <nav className="hidden flex-wrap items-center gap-1 sm:flex">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} end className={pillClass}>{link.label}</NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <BellMenu unread={me.unreadAnnouncements} onSeen={reload} />
            <span className="flex h-9 items-center gap-1 rounded-full bg-sun px-3 text-ink" aria-label={`Solve streak: ${me.streak} days`}>
              <Flame /><span className="num">{me.streak}</span>
            </span>
            <Link to="/profile" aria-label="Your profile" className={`rounded-full ${pathname === '/profile' ? 'outline-2 outline-offset-2 outline-lime' : ''}`}>
              <Avatar userId={me.user.id} name={me.user.name} size={44} />
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-6 sm:px-6">
        {waiting && pathname === '/' && (
          <Banner
            title="Waiting for approval"
            helper={me.user.role === 'admin' ? 'Approve your handles under Admin. Solves score from then on.' : 'A coordinator checks each handle. Solves score from then on.'}
            action="See handles"
            to="/settings"
          />
        )}
        {me.pendingReasons.length > 0 && !pathname.startsWith('/reason') && (
          <Banner
            title={`You missed ${me.pendingReasons[0].name}`}
            helper="Tell the coordinators why so it isn't left blank."
            action="Add reason"
            to={`/reason/${me.pendingReasons[0].id}`}
          />
        )}
        <Outlet context={{ me, reload } satisfies ShellContext} />
      </main>
      <nav className="fixed inset-x-0 bottom-0 grid auto-cols-fr grid-flow-col border-t border-line bg-card sm:hidden">
        {bottomLinks.map((link) => (
          <NavLink key={link.to} to={link.to} end className={bottomClass}>{link.label}</NavLink>
        ))}
      </nav>
    </div>
  );
}

function Announcements() {
  const { data, error } = useLoad(async () => {
    const inbox = await api<{ items: Announcement[] }>('/announcements');
    await api('/announcements/seen', 'POST');
    return inbox.items;
  }, []);
  if (error) return <ErrorText>{error}</ErrorText>;
  return (
    <div className="flex max-w-[800px] flex-col gap-4">
      <h1 className="display text-[52px] leading-none tracking-[-0.035em]">Announcements</h1>
      <div className="overflow-hidden rounded-[20px] border border-line bg-card">{data && <InboxList items={data} />}</div>
    </div>
  );
}

function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[640px] flex-col justify-center gap-4 px-4 sm:px-6">
      <Logo />
      <h1 className="display text-5xl leading-none tracking-[-0.035em]">Page not found</h1>
      <p className="text-muted">That link goes nowhere. Your streak is still fine.</p>
      <Link className="font-bold text-lime" to="/">Go home</Link>
    </main>
  );
}

const RELEASE_CHECK_MS = 5 * 60_000;
const RELEASE_SCRIPT = /\/assets\/[^"]+\.js/;

// A deploy changes the hashed script name in index.html, so comparing names needs no build step.
function RefreshToast() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const running = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src')?.match(RELEASE_SCRIPT)?.[0];
    if (!running) return;
    const check = () =>
      fetch('/index.html', { cache: 'no-store' })
        .then((response) => response.text())
        .then((html) => setReady((html.match(RELEASE_SCRIPT)?.[0] ?? running) !== running))
        .catch(() => undefined);
    const timer = setInterval(check, RELEASE_CHECK_MS);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, []);

  if (!ready) return null;
  return (
    <div role="status" className="fixed right-4 bottom-20 z-20 flex items-center gap-3 rounded-2xl border border-line bg-card p-3 sm:bottom-4">
      <span className="font-bold">New version available</span>
      <Button onClick={() => window.location.reload()}>Refresh</Button>
    </div>
  );
}

function App() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
  }, []);

  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <RefreshToast />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/download" element={<Download />} />
          <Route element={<Shell />}>
            <Route path="/" element={<Home />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/practice" element={<Practice />} />
            <Route path="/contests" element={<Contests />} />
            <Route path="/feed" element={<Feed />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/u/:id" element={<Profile />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/announcements" element={<Announcements />} />
            <Route path="/reason/:contestId" element={<Reason />} />
            <Route path="/admin" element={<Admin />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
