import { GoogleLogin } from '@react-oauth/google';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, getSession, setSession } from '../api';
import { ErrorText, Eyebrow, Logo } from '../ui';

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
    <main className="mx-auto grid min-h-screen max-w-[1200px] items-center gap-10 px-6 py-10 min-[900px]:grid-cols-[1fr_440px]">
      <section className="flex flex-col items-start gap-6">
        <Logo />
        <Eyebrow>For the college CP club</Eyebrow>
        <h1 className="display text-5xl leading-[1.08] tracking-[-0.035em] min-[420px]:text-[64px]">
          Show up.<br />
          <span className="text-lime">Solve more.</span><br />
          Climb the{' '}
          <span className="inline-block -rotate-2 rounded-2xl bg-pink px-3 text-ink">board.</span>
        </h1>
        <p className="max-w-[480px] text-base text-muted">
          Contest reminders, attendance and a live leaderboard across Codeforces, CodeChef, AtCoder and LeetCode.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <GoogleLogin
            shape="pill"
            size="large"
            theme="outline"
            text="continue_with"
            onSuccess={({ credential }) => signIn(credential)}
            onError={() => setError('Google sign-in failed. Please try again.')}
          />
          <Link to="/download" className="lift inline-flex h-11 items-center rounded-full border-2 border-line px-5 font-bold">Get the Android app</Link>
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        <p className="text-muted">On iPhone? Open this site in Safari → Share → Add to Home Screen.</p>
      </section>

      <section aria-label="Example of what's inside" className="flex flex-col gap-3">
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
                <span className="font-bold">Student {letter}</span>
                <span aria-hidden className="ml-auto h-3 rounded-full bg-ink/30" style={{ width: 72 - index * 12 }} />
              </div>
            ))}
          </div>
        </div>
        <div className="-rotate-1 flex items-center gap-3 rounded-2xl bg-violet p-3 text-white">
          <span className="num flex size-10 items-center justify-center rounded-[10px] bg-white text-sm text-[#5B21B6]">5m</span>
          <div>
            <p className="font-bold">A round starts in 5 min</p>
            <p className="text-sm text-[#EDE9FE]">Giving it? Yes · No</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3">
          <i aria-hidden className="size-2.5 rounded-full bg-pink" />
          <span>A clubmate just solved a <span className="handle" style={{ color: '#60A5FA' }}>1700</span></span>
        </div>
      </section>
    </main>
  );
}
