import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, getSession, setSession, type User } from '../api';
import { Button, ErrorText, GoogleButton, inputClass, Logo, PasswordInput } from '../ui';

const EXAMPLE_ROWS = ['A', 'B', 'C', 'D'];

export function Login() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (getSession()) return <Navigate to="/" replace />;

  function enter({ token }: { token: string }) {
    setSession(token);
    navigate('/', { replace: true });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      enter(await api<{ token: string; user: User }>('/auth/login', 'POST', { identifier, password }));
    } catch (err) {
      const message = (err as Error).message;
      if (message !== 'verify') return setError(message);
      if (identifier.includes('@')) return navigate('/signup', { state: { verifyEmail: identifier } });
      setError('Sign in with your email to finish verifying it.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-[1200px] items-center gap-10 px-6 py-10 min-[900px]:grid-cols-[minmax(0,460px)_1fr] min-[900px]:gap-20">
      <section className="flex flex-col gap-5">
        <Logo />
        <h1 className="display text-[44px] leading-[1.05] tracking-[-0.035em] sm:text-[56px]">
          Welcome back.<br /><span className="text-lime">Let's grind.</span>
        </h1>
        <p className="text-base text-muted">Contest reminders, attendance and a live leaderboard for the club.</p>
        <GoogleButton text="continue_with" onDone={enter} onError={setError} />
        <div className="flex items-center gap-3 text-xs text-muted"><i className="h-px flex-1 bg-line" />or sign in with email or username<i className="h-px flex-1 bg-line" /></div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input aria-label="Email or username" placeholder="Email or username" autoComplete="username" autoCapitalize="none" className={`${inputClass} h-12 rounded-[14px]`} value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
          <div className="flex flex-col gap-1">
            <Link to="/forgot" className="self-end text-xs font-bold text-lime hover:underline">Forgot password?</Link>
            <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" />
          </div>
          {error && <ErrorText>{error}</ErrorText>}
          <Button type="submit" disabled={busy || !identifier || !password}>Sign in</Button>
        </form>
        <p>New to the club? <Link to="/signup" className="font-bold text-lime hover:underline">Create your account →</Link></p>
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
            <p className="font-bold">A round starts in 5 min</p>
            <p className="text-sm text-violet-pale">Giving it? Yes · No</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3">
          <i aria-hidden className="size-2.5 rounded-full bg-pink" />
          <span>A clubmate just solved a <span className="handle text-cf-blue">1700</span></span>
        </div>
      </section>
    </main>
  );
}
