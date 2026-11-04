import { GoogleOAuthProvider } from '@react-oauth/google';
import { StrictMode, useEffect, useState } from 'react';
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
import { ErrorText, useLoad, type ShellContext } from './ui';

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

function ThemeToggle() {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme ?? 'light');
  const next = theme === 'light' ? 'dark' : 'light';
  return (
    <button
      className="min-h-11 cursor-pointer px-2 text-accent hover:underline"
      onClick={() => {
        document.documentElement.dataset.theme = next;
        setTheme(next);
        try {
          localStorage.setItem('theme', next);
        } catch {
          // The choice lasts only until the next page load.
        }
      }}
    >
      {next === 'dark' ? 'Dark' : 'Light'}
    </button>
  );
}

function Shell() {
  const { pathname } = useLocation();
  const { data: me, error, reload } = useLoad(() => api<Me>('/me'), [pathname]);

  if (!getSession()) return <Navigate to="/login" replace />;
  if (error) return <div className="p-4"><ErrorText>{error}</ErrorText></div>;
  if (!me) return null;

  const notice = setupNotice(me);
  const links = [
    { to: '/', label: 'Leaderboard' },
    { to: '/feed', label: 'Feed' },
    { to: `/u/${me.user.id}`, label: 'Profile' },
    { to: '/me', label: 'Me' },
    ...(me.user.role === 'admin' ? [{ to: '/admin', label: 'Admin' }] : []),
  ];
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-10 items-center border-r border-border px-4 text-[13px] font-semibold uppercase tracking-wide last:border-r-0 ${isActive ? 'bg-accent text-surface' : 'text-accent hover:bg-surface-2'}`;
  const bottomClass = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-11 items-center justify-center px-1 text-xs font-medium ${isActive ? 'text-accent' : 'text-muted'}`;

  return (
    <div className="pb-20 sm:pb-8">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between px-4 py-2 sm:px-6">
          <Link to="/" className="text-lg font-bold">
            <span className="text-accent">CP</span> Club Tracker
          </Link>
          <div className="flex items-center gap-1">
            <Link to={`/u/${me.user.id}`} className="link mr-2 hidden font-medium sm:inline">{me.user.name}</Link>
            <ThemeToggle />
            <button
              className="min-h-11 cursor-pointer px-2 text-accent hover:underline"
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
      <div className="mx-auto max-w-[1120px] px-4 pt-4 sm:px-6">
        <nav className="hidden overflow-hidden rounded-md border border-border bg-surface sm:flex">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end className={tabClass}>{link.label}</NavLink>
          ))}
        </nav>
      </div>
      <main className="mx-auto flex max-w-[1120px] flex-col gap-3 px-4 py-4 sm:px-6">
        {notice && <Link to="/me" className="rounded-md border border-pending bg-pending/10 px-3 py-2 font-medium text-pending">{notice}</Link>}
        {me.pendingReasons.length > 0 && pathname !== '/me' && (
          <Link to="/me" className="rounded-md border border-pending bg-pending/10 px-3 py-2 font-medium text-pending">
            Give a reason for {me.pendingReasons[0].name}
          </Link>
        )}
        <Outlet context={{ me, reload } satisfies ShellContext} />
      </main>
      <nav className="fixed inset-x-0 bottom-0 grid auto-cols-fr grid-flow-col border-t border-border bg-surface sm:hidden">
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} end className={bottomClass}>{link.label}</NavLink>
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
