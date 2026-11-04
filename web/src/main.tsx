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
import { ErrorText, useLoad, type ShellContext } from './ui';

function isSetUp({ user, handles }: Me): boolean {
  const linked = (platform: string) => handles.some((h) => h.platform === platform);
  return !!user.batchYear && linked('cf') && linked('cc');
}

function Shell() {
  const { pathname } = useLocation();
  const { data: me, error, reload } = useLoad(() => api<Me>('/me'), [pathname]);

  if (!getSession()) return <Navigate to="/login" replace />;
  if (error) return <div className="p-4"><ErrorText>{error}</ErrorText></div>;
  if (!me) return null;
  if (!isSetUp(me) && pathname !== '/me') return <Navigate to="/me" replace />;

  const links = [
    { to: '/', label: 'Leaderboard' },
    { to: '/feed', label: 'Feed' },
    { to: `/u/${me.user.id}`, label: 'Profile' },
    { to: '/me', label: 'Me' },
    ...(me.user.role === 'admin' ? [{ to: '/admin', label: 'Admin' }] : []),
  ];
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-11 items-center justify-center rounded-lg px-3 font-medium ${isActive ? 'text-accent' : 'text-muted'}`;

  return (
    <div className="pb-20 sm:pb-8">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[960px] items-center justify-between px-4 py-2 sm:px-6">
          <Link to="/" className="font-bold">CP Club Tracker</Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} end className={linkClass}>{link.label}</NavLink>
            ))}
          </nav>
          <button
            className="min-h-11 cursor-pointer px-2 text-muted"
            onClick={() => {
              setSession(null);
              window.location.assign('/login');
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      {me.pendingReasons.length > 0 && pathname !== '/me' && (
        <Link to="/me" className="block bg-pending/12 px-4 py-3 text-center font-medium text-pending">
          Give a reason for {me.pendingReasons[0].name}
        </Link>
      )}
      <main className="mx-auto max-w-[960px] px-4 py-4 sm:px-6">
        <Outlet context={{ me, reload } satisfies ShellContext} />
      </main>
      <nav className="fixed inset-x-0 bottom-0 grid auto-cols-fr grid-flow-col border-t border-border bg-surface sm:hidden">
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} end className={linkClass}>{link.label}</NavLink>
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
