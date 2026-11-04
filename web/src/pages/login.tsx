import { GoogleLogin } from '@react-oauth/google';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, getSession, setSession } from '../api';
import { Box, ErrorText, Tabs } from '../ui';

type Mode = 'signin' | 'signup';

const MODES: { id: Mode; label: string }[] = [
  { id: 'signin', label: 'Sign in' },
  { id: 'signup', label: 'Create account' },
];

const FEATURES = [
  { title: 'Daily, weekly and monthly leaderboards', detail: 'Points are weighted by how hard each problem is.' },
  { title: 'Contest attendance', detail: 'Reminders before Codeforces and CodeChef rounds, checked automatically afterwards.' },
  { title: 'Every platform in one place', detail: 'Codeforces, CodeChef, LeetCode and AtCoder solves all count.' },
];

export function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('signin');
  const [error, setError] = useState('');

  if (getSession()) return <Navigate to="/" replace />;

  async function signIn(idToken?: string) {
    setError('');
    try {
      const { token } = await api<{ token: string }>('/auth/google', 'POST', { idToken });
      setSession(token);
      navigate('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1120px] items-center px-4 py-4 sm:px-6">
          <span className="text-lg font-bold"><span className="text-accent">CP</span> Club Tracker</span>
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-[1120px] flex-1 content-center items-start gap-6 px-4 py-8 sm:px-6 md:grid-cols-[1fr_400px]">
        <section className="order-2 flex flex-col gap-4 md:order-1">
          <h1 className="text-2xl font-bold">Show up. Solve. Climb the board.</h1>
          <p className="text-muted">The home of your college competitive programming club.</p>
          <ul className="flex flex-col gap-3">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="border-l-2 border-accent pl-3">
                <p className="font-semibold">{feature.title}</p>
                <p className="text-muted">{feature.detail}</p>
              </li>
            ))}
          </ul>
        </section>
        <div className="order-1 md:order-2">
          <Box title={mode === 'signin' ? 'Sign in to your account' : 'Join the club'}>
            <div className="flex flex-col gap-4 p-4">
              <Tabs tabs={MODES} value={mode} onChange={setMode} />
              <p className="text-muted">
                {mode === 'signin'
                  ? 'Use the Google account you joined with.'
                  : 'Use your Google account. Then add your year and handles, and an admin approves them.'}
              </p>
              <div className="min-h-11">
                <GoogleLogin
                  key={mode}
                  text={mode === 'signin' ? 'signin_with' : 'signup_with'}
                  onSuccess={({ credential }) => signIn(credential)}
                  onError={() => setError('Google sign-in failed. Please try again.')}
                />
              </div>
              {error && <ErrorText>{error}</ErrorText>}
              <p className="border-t border-border pt-3 text-xs text-muted">
                We only use your name and email. No password to remember.
              </p>
            </div>
          </Box>
          <p className="mt-3 text-center">
            <Link to="/download" className="link">Get the Android app</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
