import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { batchForStudyYear, STUDY_YEARS, studyYearOf } from 'shared/batch';
import { api, getSession, type Me } from '../api';
import { Button, ErrorText, inputClass, Logo, PLATFORMS } from '../ui';

const LABEL_COLORS: Record<string, string> = { cf: 'text-cf-blue', cc: 'text-orange' };

function Form({ me }: { me: Me }) {
  const navigate = useNavigate();
  const now = Date.now() / 1000;
  const isAdmin = me.user.role === 'admin';
  const [name, setName] = useState(me.user.name);
  const [username, setUsername] = useState(me.user.username ?? '');
  const [year, setYear] = useState(me.user.batchYear ? studyYearOf(me.user.batchYear, now) : 0);
  const [handles, setHandles] = useState<Record<string, string>>(Object.fromEntries(me.handles.map((h) => [h.platform, h.handle])));
  const [check, setCheck] = useState<{ available: boolean; error?: string } | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const required = PLATFORMS.filter((p) => p.required && !isAdmin);

  useEffect(() => {
    if (!username || username === me.user.username) return setCheck(username ? { available: true } : null);
    const timer = setTimeout(() => {
      api<{ available: boolean; error?: string }>(`/auth/username-available?u=${encodeURIComponent(username)}`).then(setCheck).catch(() => setCheck(null));
    }, 300);
    return () => clearTimeout(timer);
  }, [username, me.user.username]);

  async function submit() {
    setError('');
    setSaving(true);
    try {
      await api('/me', 'PUT', { name, username, batchYear: batchForStudyYear(year, now) });
      for (const { id } of PLATFORMS) {
        if (handles[id]?.trim()) await api(`/me/handles/${id}`, 'PUT', { handle: handles[id] });
      }
      await api('/me/onboarding', 'POST');
      navigate('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
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
        <span className="text-xs text-muted">3–20 characters: letters, numbers, _ and . You can change it <b>once</b> later.</span>
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
      <div className="grid gap-3 sm:grid-cols-2">
        {PLATFORMS.map(({ id, label, required: isRequired }) => (
          <label key={id} className="flex flex-col gap-1">
            <span className={`text-xs font-bold ${LABEL_COLORS[id] ?? 'text-muted'}`}>{label}{isRequired && !isAdmin ? '' : ' (optional)'}</span>
            <input className={`${inputClass} handle h-12 rounded-[14px]`} autoCapitalize="none" autoCorrect="off" value={handles[id] ?? ''} onChange={(e) => setHandles((current) => ({ ...current, [id]: e.target.value }))} />
          </label>
        ))}
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      <Button disabled={saving || !name.trim() || !year || !check?.available || required.some((p) => !handles[p.id]?.trim())} onClick={submit}>Continue</Button>
    </div>
  );
}

export function Signup() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!getSession()) return;
    api<Me>('/me')
      .then((data) => {
        if (data.user.onboardingStep === 'done') navigate('/', { replace: true });
        else setMe(data);
      })
      .catch((err: Error) => setError(err.message));
  }, [navigate]);

  if (!getSession()) return <Navigate to="/login" replace />;

  return (
    <main className="mx-auto flex min-h-screen max-w-[640px] flex-col justify-center gap-6 px-4 py-8 sm:px-6">
      <Logo />
      {me && <Form me={me} />}
      {error && <ErrorText>{error}</ErrorText>}
    </main>
  );
}
