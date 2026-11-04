import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { batchForStudyYear, STUDY_YEARS, studyYearOf } from 'shared/batch';
import { api, setSession, type Me } from '../api';
import { Avatar, Button, Card, ErrorText, inputClass, Pill, PLATFORMS, Toggle, useMe } from '../ui';

const TILE_COLORS: Record<string, string> = { cf: 'bg-cf-blue', cc: 'bg-orange', atcoder: 'bg-text', leetcode: 'bg-sun' };
const TILE_CODES: Record<string, string> = { cf: 'CF', cc: 'CC', atcoder: 'AC', leetcode: 'LC' };
const SWITCHES = [
  { key: 'notifyHour', title: '1 hour before', detail: 'A reminder before each counted contest.' },
  { key: 'notifyRsvp', title: '5 min RSVP', detail: 'Tell us if you are giving it.' },
  { key: 'notifyResult', title: 'After contest', detail: 'Your attendance result.' },
  { key: 'notifyStreak', title: 'Streak about to break', detail: "At 9 PM, if you haven't solved today." },
] as const;

function HandleRow({ platform, me, onChange }: { platform: (typeof PLATFORMS)[number]; me: Me; onChange: () => void }) {
  const linked = me.handles.find((h) => h.platform === platform.id);
  const [editing, setEditing] = useState(!linked);
  const [value, setValue] = useState(linked?.handle ?? '');
  const [error, setError] = useState('');

  async function save() {
    setError('');
    try {
      await api(`/me/handles/${platform.id}`, 'PUT', { handle: value });
      setEditing(false);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line py-3 first:border-0">
      <span className={`handle flex size-10 shrink-0 items-center justify-center rounded-xl text-sm text-ink ${TILE_COLORS[platform.id]}`}>{TILE_CODES[platform.id]}</span>
      <div className="min-w-0 flex-1 basis-32">
        <p className="font-bold">{platform.label}</p>
        <p className="text-xs text-muted">{platform.required ? 'Required' : 'Optional'}</p>
      </div>
      {editing ? (
        <div className="flex items-center gap-2">
          <input aria-label={`${platform.label} handle`} className="handle h-11 w-40 rounded-full border border-line bg-card-2 px-4 outline-none focus:border-lime" autoCapitalize="none" autoCorrect="off" value={value} onChange={(e) => setValue(e.target.value)} />
          <Button disabled={!value.trim()} onClick={save}>{linked ? 'Save' : 'Link'}</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="handle">@{linked?.handle}</span>
          <Pill tone={linked?.approved ? 'lime' : 'sun'}>{linked?.approved ? 'Approved' : 'Waiting for approval'}</Pill>
          <button className="min-h-11 cursor-pointer px-2 font-bold text-lime hover:underline" onClick={() => setEditing(true)}>Edit</button>
        </div>
      )}
      {error && <div className="w-full"><ErrorText>{error}</ErrorText></div>}
    </div>
  );
}

function UsernameField({ me, onChange }: { me: Me; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(me.user.username ?? '');
  const [check, setCheck] = useState<{ available: boolean; error?: string } | null>(null);
  const [error, setError] = useState('');
  const left = me.user.usernameChangesLeft;

  useEffect(() => {
    if (!editing || value === me.user.username) return setCheck(null);
    const timer = setTimeout(() => {
      api<{ available: boolean; error?: string }>(`/auth/username-available?u=${encodeURIComponent(value)}`).then(setCheck).catch(() => setCheck(null));
    }, 300);
    return () => clearTimeout(timer);
  }, [value, editing, me.user.username]);

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <span className="label">Username</span>
        <span className="flex h-12 items-center gap-1 rounded-[14px] border border-line bg-card-2 px-4">
          <span className="handle text-muted">@</span>
          <input aria-label="New username" className="handle min-w-0 flex-1 bg-transparent outline-none" autoCapitalize="none" autoCorrect="off" value={value} onChange={(e) => setValue(e.target.value.trim().toLowerCase())} />
          {check?.available && <span className="text-xs font-bold text-lime">✓ available</span>}
        </span>
        {check && !check.available && <span className="text-xs text-pink">{check.error ?? 'taken'}</span>}
        <p className="rounded-2xl border border-sun-line bg-sun-tint p-3 text-sm text-sun-text">You can only change your username once. After this it's locked for good.</p>
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => { setEditing(false); setValue(me.user.username ?? ''); }}>Cancel</Button>
          <Button
            variant="warning"
            disabled={!check?.available}
            onClick={async () => {
              setError('');
              try {
                await api('/me/username', 'PATCH', { username: value });
                setEditing(false);
                onChange();
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            Use this name for good
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="label">Username</span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="handle text-lg text-lime">@{me.user.username}</span>
        {left > 0 ? <Pill tone="muted">1 change left</Pill> : <Pill tone="muted"><Lock />Locked</Pill>}
        {left > 0 && <Button variant="secondary" onClick={() => setEditing(true)}>Change</Button>}
      </div>
      {left < 1 && <p className="text-xs text-muted">You've used your one change. Ask a coordinator if you really need another.</p>}
    </div>
  );
}

function Lock() {
  return (
    <svg aria-hidden className="mr-1" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function AboutCard({ me, onChange }: { me: Me; onChange: () => void }) {
  const now = Date.now() / 1000;
  const [name, setName] = useState(me.user.name);
  const [year, setYear] = useState(me.user.batchYear ? studyYearOf(me.user.batchYear, now) : 0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="display text-xl">About you</h2>
      <UsernameField me={me} onChange={onChange} />
      <label className="flex flex-col gap-1">
        <span className="label">Display name</span>
        <input className={inputClass} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">Year</span>
        <select className={inputClass} value={year} onChange={(e) => setYear(Number(e.target.value))}>
          <option value={0}>Choose your year</option>
          {STUDY_YEARS.map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}
        </select>
      </label>
      {error && <ErrorText>{error}</ErrorText>}
      {message && <p className="font-bold text-lime">{message}</p>}
      <div>
        <Button
          disabled={!name.trim() || !year}
          onClick={async () => {
            setError('');
            setMessage('');
            try {
              await api('/me', 'PUT', { name, batchYear: batchForStudyYear(year, now) });
              setMessage('Saved.');
              onChange();
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          Save
        </Button>
      </div>
    </Card>
  );
}

function PushToggle() {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window;
  const [on, setOn] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()).then((subscription) => setOn(!!subscription));
  }, [supported]);

  if (!supported) return <p className="text-sm text-violet-pale">On iPhone, add this site to your Home Screen, then open it from there to turn on notifications.</p>;
  if (on) return <p className="font-bold">✓ Notifications are on for this browser.</p>;
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="onViolet"
        onClick={async () => {
          setError('');
          try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: Uint8Array.from(atob(import.meta.env.VITE_VAPID_PUBLIC_KEY.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
            });
            await api('/me/push-token', 'POST', { token: JSON.stringify(subscription), kind: 'web' });
            setOn(true);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        Turn on browser notifications
      </Button>
      {error && <p className="text-sm text-violet-pale">{error}</p>}
    </div>
  );
}

export function Settings() {
  const { me, reload } = useMe();
  const [error, setError] = useState('');
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    notifyHour: !!me.user.notifyHour,
    notifyRsvp: !!me.user.notifyRsvp,
    notifyResult: !!me.user.notifyResult,
    notifyStreak: !!me.user.notifyStreak,
  });

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-4">
      <Link to="/profile" className="font-bold text-lime hover:underline">← Back to profile</Link>
      <h1 className="display text-[52px] leading-none tracking-[-0.035em]">Settings</h1>
      <Card className="flex flex-wrap items-center gap-4">
        <Avatar userId={me.user.id} name={me.user.name} size={56} />
        <div className="min-w-0 flex-1 basis-48">
          <p className="display text-xl">{me.user.name}</p>
          <p className="truncate text-muted">@{me.user.username} · {me.user.email}</p>
        </div>
        <Button
          variant="danger"
          onClick={() => {
            setSession(null);
            window.location.assign('/login');
          }}
        >
          Sign out
        </Button>
      </Card>
      <Card>
        <h2 className="display mb-1 text-xl">Coding handles</h2>
        {PLATFORMS.map((platform) => <HandleRow key={platform.id} platform={platform} me={me} onChange={reload} />)}
      </Card>
      <Card>
        <h2 className="display mb-1 text-xl">Notifications</h2>
        {SWITCHES.map(({ key, title, detail }) => (
          <div key={key} className="flex items-center justify-between gap-3 border-t border-line py-3 first-of-type:border-0">
            <div>
              <p className="font-bold">{title}</p>
              <p className="text-xs text-muted">{detail}</p>
            </div>
            <Toggle
              label={title}
              on={prefs[key]}
              onChange={async (on) => {
                setError('');
                setPrefs((current) => ({ ...current, [key]: on }));
                try {
                  await api('/me/notifications', 'PATCH', { [key]: on });
                } catch (err) {
                  setPrefs((current) => ({ ...current, [key]: !on }));
                  setError((err as Error).message);
                }
              }}
            />
          </div>
        ))}
        {error && <ErrorText>{error}</ErrorText>}
      </Card>
      <AboutCard me={me} onChange={reload} />
      <section className="flex flex-col items-start gap-3 rounded-[22px] bg-violet p-6 text-white">
        <h2 className="display text-xl">Get the app</h2>
        <p className="text-violet-pale">Contest reminders and one-tap RSVP on Android.</p>
        <a className="lift inline-flex h-11 items-center rounded-full bg-lime px-5 font-extrabold text-ink" href="/download">Get the app</a>
        <PushToggle />
      </section>
    </div>
  );
}
