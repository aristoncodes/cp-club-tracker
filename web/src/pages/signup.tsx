import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { batchForStudyYear, STUDY_YEARS, studyYearOf } from 'shared/batch';
import { api, getSession, setSession, type Me } from '../api';
import { Button, Card, ErrorText, Eyebrow, GoogleButton, inputClass, Logo, PasswordInput, Pill, PLATFORMS } from '../ui';

type Step = 'account' | 'verify' | 'about' | 'handles' | 'notified' | 'finished';

const STEP_LIST = [
  { id: 'account', label: 'Account', detail: 'Google or email' },
  { id: 'verify', label: 'Verify email', detail: 'A 6-digit code' },
  { id: 'about', label: 'About you', detail: 'Name, username and year' },
  { id: 'handles', label: 'Handles', detail: 'Where you solve' },
  { id: 'notified', label: 'Get notified', detail: 'Never miss a contest' },
];
const RESEND_SECONDS = 60;
const CODE_LENGTH = 6;
const LABEL_COLORS: Record<string, string> = { cf: 'text-cf-blue', cc: 'text-orange' };

function StepList({ step, google }: { step: Step; google: boolean }) {
  const current = STEP_LIST.findIndex((s) => s.id === step);
  return (
    <ol className="flex flex-col gap-5">
      {STEP_LIST.map((item, index) => {
        const skipped = google && item.id === 'verify';
        const done = step === 'finished' || index < current;
        const circle = skipped
          ? 'border-2 border-dashed border-violet-soft text-violet-soft'
          : done
            ? 'bg-lime text-ink'
            : index === current
              ? 'bg-white text-violet'
              : 'border-2 border-violet-soft text-violet-soft';
        return (
          <li key={item.id} className="flex items-center gap-3">
            <span className={`num flex size-8 shrink-0 items-center justify-center rounded-full text-sm ${circle}`}>
              {skipped ? '–' : done ? '✓' : index + 1}
            </span>
            <span>
              <span className="block font-bold text-white">{item.label}</span>
              <span className="block text-xs text-violet-pale">{skipped ? 'Not needed with Google' : item.detail}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function strength(password: string): { segments: number; label: string } {
  if (password.length < 8) return { segments: password ? 1 : 0, label: 'Too short · at least 8 characters' };
  if (password.length < 12) return { segments: 2, label: 'Good · at least 8 characters' };
  return { segments: 3, label: 'Strong' };
}

function AccountStep({ onSent, onSignedIn, setError }: { onSent: (email: string) => void; onSignedIn: (token: string) => void; setError: (message: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { segments, label } = strength(password);
  return (
    <>
      <h1 className="display text-5xl leading-none tracking-[-0.035em]">Create your account</h1>
      <p className="text-muted">Takes about two minutes.</p>
      <GoogleButton text="signup_with" onDone={({ token }) => onSignedIn(token)} onError={setError} />
      <div className="flex items-center gap-3 text-xs text-muted"><i className="h-px flex-1 bg-line" />or with email<i className="h-px flex-1 bg-line" /></div>
      <input type="email" aria-label="Email" placeholder="Email" autoComplete="email" className={`${inputClass} h-12 rounded-[14px]`} value={email} onChange={(e) => setEmail(e.target.value)} />
      <PasswordInput autoComplete="new-password" value={password} onChange={setPassword} />
      <div className="flex flex-col gap-1">
        <div className="grid grid-cols-3 gap-1" aria-hidden>
          {[1, 2, 3].map((n) => <i key={n} className={`h-1.5 rounded-full ${n <= segments ? 'bg-lime' : 'bg-card-2'}`} />)}
        </div>
        <span className="text-xs text-muted">{label}</span>
      </div>
      <Button
        disabled={!email || password.length < 8}
        onClick={async () => {
          setError('');
          try {
            await api('/auth/signup', 'POST', { email, password });
            onSent(email);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        Create account
      </Button>
      <p className="text-xs text-muted">We'll email you a 6-digit code to check it's you.</p>
    </>
  );
}

function VerifyStep({ email, onVerified, onChangeEmail, setError }: { email: string; onVerified: (token: string) => void; onChangeEmail: () => void; setError: (message: string) => void }) {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [wait, setWait] = useState(RESEND_SECONDS);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  function fill(index: number, value: string) {
    const next = [...digits];
    value.replace(/\D/g, '').slice(0, CODE_LENGTH - index).split('').forEach((digit, offset) => { next[index + offset] = digit; });
    if (!value) next[index] = '';
    setDigits(next);
    if (value) boxes.current[Math.min(index + value.length, CODE_LENGTH - 1)]?.focus();
  }

  const code = digits.join('');
  return (
    <>
      <h1 className="display text-5xl leading-none tracking-[-0.035em]">Check your email</h1>
      <p className="text-muted">We sent a 6-digit code to {email}. It expires in 10 minutes.</p>
      <div className="grid max-w-[420px] grid-cols-6 gap-2">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(element) => { boxes.current[index] = element; }}
            aria-label={`Digit ${index + 1}`}
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            value={digit}
            onChange={(e) => fill(index, e.target.value.slice(-1))}
            onPaste={(e: ClipboardEvent) => { e.preventDefault(); fill(0, e.clipboardData.getData('text')); }}
            onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Backspace' && !digit) boxes.current[index - 1]?.focus(); }}
            className="num h-[68px] w-full rounded-[14px] border border-line bg-card text-center text-[28px] outline-none focus:border-lime"
          />
        ))}
      </div>
      <p className="text-sm text-muted">
        {wait > 0 ? <>Resend in <span className="num">0:{String(wait).padStart(2, '0')}</span></> : (
          <button className="cursor-pointer font-bold text-lime hover:underline" onClick={async () => { await api('/auth/resend', 'POST', { email, purpose: 'verify' }); setWait(RESEND_SECONDS); }}>Resend code</button>
        )}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onChangeEmail}>Change email</Button>
        <Button
          className="flex-1"
          disabled={code.length !== CODE_LENGTH}
          onClick={async () => {
            setError('');
            try {
              const { token } = await api<{ token: string }>('/auth/verify', 'POST', { email, code });
              onVerified(token);
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          Verify
        </Button>
      </div>
    </>
  );
}

function AboutStep({ me, onDone, setError }: { me: Me; onDone: () => void; setError: (message: string) => void }) {
  const now = Date.now() / 1000;
  const [name, setName] = useState(me.user.name);
  const [username, setUsername] = useState(me.user.username ?? '');
  const [year, setYear] = useState(me.user.batchYear ? studyYearOf(me.user.batchYear, now) : 0);
  const [check, setCheck] = useState<{ available: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (!username || username === me.user.username) return setCheck(username ? { available: true } : null);
    const timer = setTimeout(() => {
      api<{ available: boolean; error?: string }>(`/auth/username-available?u=${encodeURIComponent(username)}`).then(setCheck).catch(() => setCheck(null));
    }, 300);
    return () => clearTimeout(timer);
  }, [username, me.user.username]);

  return (
    <>
      <div><Eyebrow>{me.user.hasGoogle ? 'Signed up with Google' : '✓ Email verified'}</Eyebrow></div>
      <h1 className="display text-5xl leading-none tracking-[-0.035em]">Welcome to the club</h1>
      <label className="flex flex-col gap-1">
        <span className="label">Display name</span>
        <input className={`${inputClass} h-12 rounded-[14px]`} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">Username</span>
        <span className={`flex h-12 items-center gap-1 rounded-[14px] border bg-card px-4 ${check?.available ? 'border-lime-line' : 'border-line'}`}>
          <span className="handle text-muted">@</span>
          <input className="handle min-w-0 flex-1 bg-transparent outline-none" autoCapitalize="none" autoCorrect="off" value={username} onChange={(e) => setUsername(e.target.value.trim().toLowerCase())} />
          {check?.available && <span className="text-xs font-bold text-lime">✓ available</span>}
        </span>
        {check && !check.available && <span className="text-xs text-pink">{check.error ?? 'taken'}</span>}
        <span className="text-xs text-muted">3–20 characters: letters, numbers, _ and . You can sign in with it, and change it <b>once</b> later.</span>
      </label>
      <div className="flex flex-col gap-1">
        <span className="label">Year</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Year">
          {STUDY_YEARS.map((option) => (
            <button
              key={option.value}
              role="radio"
              aria-checked={year === option.value}
              onClick={() => setYear(option.value)}
              className={`min-h-12 cursor-pointer rounded-[14px] border font-bold ${year === option.value ? 'border-lime bg-lime text-ink' : 'border-line bg-card'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <Button
        className="w-full"
        disabled={!name.trim() || !year || !check?.available}
        onClick={async () => {
          setError('');
          try {
            await api('/me', 'PUT', { name, username, batchYear: batchForStudyYear(year, now) });
            await api('/me/onboarding', 'POST', { step: 'handles' });
            onDone();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        Continue
      </Button>
    </>
  );
}

function HandlesStep({ me, onDone, setError }: { me: Me; onDone: () => void; setError: (message: string) => void }) {
  const [handles, setHandles] = useState<Record<string, string>>(Object.fromEntries(me.handles.map((h) => [h.platform, h.handle])));
  const [showOptional, setShowOptional] = useState(PLATFORMS.some((p) => !p.required && me.handles.some((h) => h.platform === p.id)));
  const field = ({ id, label }: { id: string; label: string }) => (
    <label key={id} className="flex flex-col gap-1">
      <span className={`text-xs font-bold ${LABEL_COLORS[id] ?? 'text-muted'}`}>{label}</span>
      <input className={`${inputClass} handle h-12 rounded-[14px]`} autoCapitalize="none" autoCorrect="off" value={handles[id] ?? ''} onChange={(e) => setHandles((current) => ({ ...current, [id]: e.target.value }))} />
    </label>
  );
  return (
    <>
      <h1 className="display text-5xl leading-none tracking-[-0.035em]">Link your handles</h1>
      <p className="text-muted">Codeforces and CodeChef are required.</p>
      {PLATFORMS.filter((p) => p.required).map(field)}
      {showOptional
        ? <div className="grid gap-3 sm:grid-cols-2">{PLATFORMS.filter((p) => !p.required).map(field)}</div>
        : <button onClick={() => setShowOptional(true)} className="min-h-11 cursor-pointer rounded-[14px] border-2 border-dashed border-line font-bold text-muted hover:text-text">+ AtCoder, LeetCode (optional)</button>}
      <p className="rounded-2xl bg-violet-tint p-3 text-sm text-violet-soft">A coordinator checks each handle, usually within a day.</p>
      <Button
        className="w-full"
        disabled={PLATFORMS.some((p) => p.required && !handles[p.id]?.trim())}
        onClick={async () => {
          setError('');
          try {
            for (const { id } of PLATFORMS) {
              if (handles[id]?.trim()) await api(`/me/handles/${id}`, 'PUT', { handle: handles[id] });
            }
            await api('/me/onboarding', 'POST', { step: 'notified' });
            onDone();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        Continue
      </Button>
    </>
  );
}

function NotifiedStep({ onDone, setError }: { onDone: () => void; setError: (message: string) => void }) {
  return (
    <>
      <h1 className="display text-5xl leading-none tracking-[-0.035em]">Never miss a contest</h1>
      <p className="text-muted">Reminders work best from the app.</p>
      <Card className="flex flex-col items-start gap-2">
        <h2 className="display text-xl">Android</h2>
        <a className="lift inline-flex h-11 items-center rounded-full bg-lime px-5 font-extrabold text-ink" href={import.meta.env.VITE_APK_URL}>Download APK</a>
      </Card>
      <Card className="flex flex-col gap-2">
        <h2 className="display text-xl">iPhone</h2>
        <p className="text-muted">Open this site in Safari, tap Share, then Add to Home Screen. Turn on notifications in Settings.</p>
      </Card>
      <Button
        className="w-full"
        onClick={async () => {
          setError('');
          try {
            await api('/me/onboarding', 'POST', { step: 'done' });
            onDone();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        Finish
      </Button>
    </>
  );
}

function FinishedStep({ me }: { me: Me }) {
  return (
    <>
      <span aria-hidden className="flex size-16 rotate-[-6deg] items-center justify-center rounded-[14px] bg-lime text-3xl font-bold text-ink">✓</span>
      <h1 className="display text-5xl leading-tight tracking-[-0.035em]">You're in, <span className="text-lime">@{me.user.username}</span>.</h1>
      <p className="text-muted">You can use everything now. You'll join the leaderboard once a coordinator approves your handles.</p>
      <div className="flex flex-col gap-2">
        {me.handles.map((h) => (
          <div key={h.platform} className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-card p-3">
            <span className="handle">@{h.handle}</span>
            <Pill tone={h.approved ? 'lime' : 'sun'}>{h.approved ? 'Approved' : 'Waiting for approval'}</Pill>
          </div>
        ))}
      </div>
      <a href="/" className="lift inline-flex h-11 items-center justify-center rounded-full bg-lime px-5 font-extrabold text-ink">Go to Home</a>
    </>
  );
}

export function Signup() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialEmail = (location.state as { verifyEmail?: string } | null)?.verifyEmail ?? '';
  const [email, setEmail] = useState(initialEmail);
  const [me, setMe] = useState<Me | null>(null);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState('');

  async function refresh(justFinished = false) {
    setError('');
    const data = await api<Me>('/me');
    setMe(data);
    if (justFinished) setFinished(true);
    else if (data.user.onboardingStep === 'done') navigate('/', { replace: true });
  }

  useEffect(() => {
    if (getSession()) refresh().catch((err: Error) => setError(err.message));
  }, []);

  const signedIn = (token: string) => {
    setSession(token);
    refresh().catch((err: Error) => setError(err.message));
  };

  const step: Step = finished ? 'finished' : me ? (me.user.onboardingStep as Step) : email ? 'verify' : 'account';

  return (
    <div className="grid min-h-screen min-[900px]:grid-cols-[380px_1fr]">
      <aside className="flex flex-col gap-8 bg-violet p-6 min-[900px]:p-8">
        <span className="flex items-center gap-2">
          <span className="flex size-[34px] -rotate-6 items-center justify-center rounded-[10px] bg-ink text-sm font-bold text-lime" style={{ fontFamily: 'var(--font-mono)' }}>&gt;_</span>
          <span className="display text-xl text-white">grind.club</span>
        </span>
        <div className="hidden min-[900px]:block"><StepList step={step} google={!!me?.user.hasGoogle} /></div>
        <p className="mt-auto hidden text-violet-pale min-[900px]:block">Already a member? <Link to="/login" className="font-bold text-white hover:underline">Sign in</Link></p>
      </aside>
      <main className="flex items-center justify-center p-6">
        <div className="flex w-full max-w-[560px] flex-col gap-4">
          {step === 'account' && <AccountStep onSent={setEmail} onSignedIn={signedIn} setError={setError} />}
          {step === 'verify' && <VerifyStep email={email} onVerified={signedIn} onChangeEmail={() => setEmail('')} setError={setError} />}
          {step === 'about' && me && <AboutStep me={me} onDone={() => refresh()} setError={setError} />}
          {step === 'handles' && me && <HandlesStep me={me} onDone={() => refresh()} setError={setError} />}
          {step === 'notified' && <NotifiedStep onDone={() => refresh(true)} setError={setError} />}
          {step === 'finished' && me && <FinishedStep me={me} />}
          {error && <ErrorText>{error}</ErrorText>}
          {step === 'account' && <p className="min-[900px]:hidden">Already a member? <Link to="/login" className="font-bold text-lime hover:underline">Sign in</Link></p>}
        </div>
      </main>
    </div>
  );
}
