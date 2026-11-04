import { GoogleOAuthProvider } from '@react-oauth/google';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { api, getSession, setSession, type Me } from './api';
import './index.css';
import { Admin } from './pages/admin';
import { Download } from './pages/download';
import { Feed } from './pages/feed';
import { Leaderboard } from './pages/leaderboard';
import { Login } from './pages/login';
import { MePage } from './pages/me';
import { Profile } from './pages/profile';
import { Avatar, ErrorText, Flame, Logo, useLoad, type ShellContext } from './ui';

function setupNotice({ user, handles }: Me): string | null {
  const linked = (platform: string) => handles.some((h) => h.platform === platform);
  if (!user.batchYear || !linked('cf') || !linked('cc')) return 'Finish your profile: choose your year and add your Codeforces and CodeChef handles.';
  if (handles.some((h) => !h.approved)) {
    return user.role === 'admin'
      ? 'Your handles need approval. Approve them under Admin → Students & handles; solves count from then on.'
      : 'Your handles are waiting for admin approval. Solves count from the moment they are approved.';
  }
  return null;
}

function Banner({ title, helper, action }: { title: string; helper: string; action?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-sun-line bg-sun-tint p-3">
      <span aria-hidden className="display flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-sun text-lg text-ink">!</span>
      <div className="min-w-0 flex-1 basis-48">
        <p className="font-bold text-sun-text">{title}</p>
        <p className="text-xs text-sun-text">{helper}</p>
      </div>
      <Link to="/me" className="lift inline-flex h-10 items-center rounded-full bg-sun px-4 font-extrabold text-ink">{action ?? 'Open Me'}</Link>
    </div>
  );
}

function Shell() {
  const { pathname } = useLocation();
  const { data: me, error, reload } = useLoad(() => api<Me>('/me'), [pathname]);

  if (!getSession()) return <Navigate to="/login" replace />;
  if (error) return <div className="p-6"><ErrorText>{error}</ErrorText></div>;
  if (!me) return null;

  const notice = setupNotice(me);
  const links = [
    { to: '/', label: 'Leaderboard', short: 'Board' },
    { to: '/feed', label: 'Feed', short: 'Feed' },
    { to: `/u/${me.user.id}`, label: 'Profile', short: 'Profile' },
    { to: '/me', label: 'Me', short: 'Me' },
    ...(me.user.role === 'admin' ? [{ to: '/admin', label: 'Admin', short: 'Admin' }] : []),
  ];
  const pillClass = ({ isActive }: { isActive: boolean }) =>
    `lift flex min-h-10 items-center rounded-full px-4 font-bold ${isActive ? 'bg-text text-ink' : 'text-muted hover:text-text'}`;
  const bottomClass = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-12 items-center justify-center px-1 text-xs font-bold ${isActive ? 'text-lime' : 'text-muted'}`;

  return (
    <div className="pb-20 sm:pb-10">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="grind.club home"><Logo /></Link>
          <nav className="hidden flex-wrap items-center gap-1 sm:flex">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} end className={pillClass}>{link.label}</NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="flex h-9 items-center gap-1 rounded-full bg-sun px-3 text-ink" aria-label={`Solve streak: ${me.streak} days`}>
              <Flame /><span className="num">{me.streak}</span>
            </span>
            <Link to={`/u/${me.user.id}`} aria-label="Your profile"><Avatar userId={me.user.id} name={me.user.name} /></Link>
            <button
              className="min-h-11 cursor-pointer px-2 text-muted hover:text-text"
              onClick={() => {
                setSession(null);
                window.location.assign('/login');
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-6 sm:px-6">
        {notice && <Banner title={notice} helper="It only takes a minute." />}
        {me.pendingReasons.length > 0 && pathname !== '/me' && (
          <Banner title={`You missed ${me.pendingReasons[0].name}`} helper="Tell the coordinators why so it isn't left blank." action="Add reason" />
        )}
        <Outlet context={{ me, reload } satisfies ShellContext} />
      </main>
      <nav className="fixed inset-x-0 bottom-0 grid auto-cols-fr grid-flow-col border-t border-line bg-card sm:hidden">
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} end className={bottomClass}>{link.short}</NavLink>
        ))}
      </nav>
    </div>
  );
}

function App() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
  }, []);

  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/download" element={<Download />} />
          <Route element={<Shell />}>
            <Route path="/" element={<Leaderboard />} />
            <Route path="/feed" element={<Feed />} />
            <Route path="/u/:id" element={<Profile />} />
            <Route path="/me" element={<MePage />} />
            <Route path="/admin" element={<Admin />} />
          </Route>
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
