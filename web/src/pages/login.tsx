import { GoogleLogin } from '@react-oauth/google';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, getSession, setSession } from '../api';
import { ErrorText, Logo } from '../ui';

const EXAMPLE_ROWS = ['A', 'B', 'C', 'D'];

export function Login() {
  const navigate = useNavigate();
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
    <main className="mx-auto grid min-h-screen max-w-[1200px] items-center gap-10 px-6 py-10 min-[900px]:grid-cols-[minmax(0,460px)_1fr] min-[900px]:gap-20">
      <section className="flex flex-col gap-5">
        <Logo />
        <h1 className="display text-[44px] leading-[1.05] tracking-[-0.035em] sm:text-[56px]">
          Welcome back.<br /><span className="text-lime">Let's grind.</span>
        </h1>
        <p className="text-base text-muted">Contest reminders, attendance and a live leaderboard for the club. New here? Use the same button to create your account.</p>
        {/* Google's frame paints a white box unless its page area uses a light colour scheme. */}
        <div className="self-start [color-scheme:light]">
          <GoogleLogin
            shape="pill"
            size="large"
            theme="outline"
            text="continue_with"
            onSuccess={({ credential }) => signIn(credential)}
            onError={() => setError('Google sign-in failed. Please try again.')}
          />
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        <p className="text-xs text-muted">
          <Link to="/download" className="hover:underline">Get the Android app</Link>. On iPhone, open this site in Safari → Share → Add to Home Screen.
        </p>
      </section>

      <section aria-label="Example of what's inside" className="hidden flex-col gap-3 min-[900px]:flex">
        <div className="rotate-2 rounded-[22px] bg-lime p-5 text-ink">
          <div className="mb-3 flex items-center justify-between">
            <span className="display text-lg">This week</span>
            <span className="rounded-full bg-ink px-3 py-1 text-xs font-bold text-lime">Example</span>
          </div>
          <div className="flex flex-col gap-2">
            {EXAMPLE_ROWS.map((letter, index) => (
              <div key={letter} className="flex items-center gap-3 rounded-2xl bg-ink/10 px-3 py-2">
                <span className="num w-4">{index + 1}</span>
                <span className="flex size-8 items-center justify-center rounded-full bg-ink text-xs font-bold text-lime">{letter}</span>
                <span className="handle">@student_{letter.toLowerCase()}</span>
                <span aria-hidden className="ml-auto h-3 rounded-full bg-ink/30" style={{ width: 72 - index * 12 }} />
              </div>
            ))}
          </div>
        </div>
        <div className="-rotate-1 flex items-center gap-3 rounded-2xl bg-violet p-3 text-white">
          <span className="num flex size-10 items-center justify-center rounded-[10px] bg-white text-sm text-[#5B21B6]">5m</span>
          <div>
            <p className="font-bold">A contest starts in 5 minutes</p>
            <p className="text-sm text-violet-pale">Are you participating? Yes · No</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3">
          <i aria-hidden className="size-2.5 rounded-full bg-pink" />
          <span>A club member solved a <span className="handle text-cf-blue">1700</span></span>
        </div>
      </section>
    </main>
  );
}
