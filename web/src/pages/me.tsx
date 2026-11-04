import { useEffect, useState } from 'react';
import { batchForStudyYear, STUDY_YEARS, studyYearOf } from 'shared/batch';
import { REASONS } from 'shared/reasons';
import { api, type Me } from '../api';
import { NextContest, type Contest } from '../next-contest';
import { Button, Card, ErrorText, inputClass, PLATFORMS, useLoad, useMe } from '../ui';

function ReasonForm({ onSubmit }: { onSubmit: (reason: { reasonType: string; reasonText: string }) => Promise<void> }) {
  const [reasonType, setReasonType] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (reasonType === 'other' && !reasonText.trim()) return setError('Please say a little about the reason.');
    setSaving(true);
    setError('');
    try {
      await onSubmit({ reasonType, reasonText });
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="radiogroup">
        {REASONS.map((reason) => (
          <button
            key={reason.id}
            role="radio"
            aria-checked={reasonType === reason.id}
            onClick={() => setReasonType(reason.id)}
            className={`min-h-11 cursor-pointer rounded-full border-2 px-4 font-bold ${reasonType === reason.id ? 'border-sun bg-sun text-ink' : 'border-line text-text'}`}
          >
            {reason.label}
          </button>
        ))}
      </div>
      <input
        className={inputClass}
        value={reasonText}
        onChange={(e) => setReasonText(e.target.value)}
        placeholder={reasonType === 'other' ? 'Tell us a little more' : 'Anything to add? (optional)'}
        aria-label="Reason details"
      />
      {error && <ErrorText>{error}</ErrorText>}
      <div><Button onClick={submit} disabled={!reasonType || saving}>Add reason</Button></div>
    </div>
  );
}

function SetupForm({ me, onSaved }: { me: Me; onSaved: () => void }) {
  const now = Date.now() / 1000;
  const [studyYear, setStudyYear] = useState(me.user.batchYear ? studyYearOf(me.user.batchYear, now) : 0);
  const [handles, setHandles] = useState<Record<string, string>>(Object.fromEntries(me.handles.map((h) => [h.platform, h.handle])));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!STUDY_YEARS.some((y) => y.value === studyYear)) return setError('Choose your year.');
    if (PLATFORMS.some((p) => p.required && !handles[p.id]?.trim())) return setError('Codeforces and CodeChef handles are required.');
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await api('/me', 'PUT', { name: me.user.name, batchYear: batchForStudyYear(studyYear, now) });
      for (const { id } of PLATFORMS) {
        if (handles[id]?.trim()) await api(`/me/handles/${id}`, 'PUT', { handle: handles[id] });
      }
      setMessage('Saved.');
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="display text-xl">Your profile</h2>
      <label className="flex flex-col gap-1">
        <span className="label">Year</span>
        <select className={inputClass} value={studyYear} onChange={(e) => setStudyYear(Number(e.target.value))}>
          <option value={0}>Choose your year</option>
          {STUDY_YEARS.map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}
        </select>
      </label>
      {PLATFORMS.map(({ id, label, required }) => {
        const saved = me.handles.find((h) => h.platform === id);
        return (
          <label key={id} className="flex flex-col gap-1">
            <span className="label">{label}{required ? '' : ' (optional)'}</span>
            <input
              className={`${inputClass} handle`}
              autoCapitalize="none"
              autoCorrect="off"
              value={handles[id] ?? ''}
              onChange={(e) => setHandles((current) => ({ ...current, [id]: e.target.value }))}
            />
            {saved && !saved.approved && <span className="text-xs text-sun">Waiting for admin approval</span>}
          </label>
        );
      })}
      {error && <ErrorText>{error}</ErrorText>}
      {message && <p className="font-bold text-lime">{message}</p>}
      <div><Button onClick={save} disabled={saving}>Save</Button></div>
    </Card>
  );
}

function PushToggle() {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window;
  const [state, setState] = useState<'unknown' | 'on' | 'off'>('unknown');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setState(subscription ? 'on' : 'off'));
  }, [supported]);

  async function enable() {
    setError('');
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: Uint8Array.from(atob(import.meta.env.VITE_VAPID_PUBLIC_KEY.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
      });
      await api('/me/push-token', 'POST', { token: JSON.stringify(subscription), kind: 'web' });
      setState('on');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Card className="flex flex-col gap-2">
      <h2 className="display text-xl">Notifications</h2>
      {!supported && <p className="text-muted">On iPhone, add this site to your Home Screen, then open it from there to turn these on.</p>}
      {supported && state === 'on' && <p className="font-bold text-lime">✓ Notifications are on for this device.</p>}
      {supported && state === 'off' && (
        <>
          <p className="text-muted">Get contest reminders on this device.</p>
          <div><Button variant="secondary" onClick={enable}>Turn on notifications</Button></div>
        </>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </Card>
  );
}

export function MePage() {
  const { me, reload } = useMe();
  const { data: contests, reload: reloadContests } = useLoad(() => api<Contest[]>('/contests/upcoming'), []);
  const next = contests?.[0];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="display text-[52px] leading-none tracking-[-0.035em]">Me</h1>
      {me.pendingReasons.map((contest) => (
        <div key={contest.id} className="flex flex-col gap-3 rounded-2xl border border-sun-line bg-sun-tint p-4">
          <h2 className="display text-lg text-sun-text">What got in the way of {contest.name}?</h2>
          <ReasonForm
            onSubmit={async (reason) => {
              await api(`/contests/${contest.id}/reason`, 'POST', reason);
              reload();
            }}
          />
        </div>
      ))}
      <div className="grid items-start gap-4 min-[900px]:grid-cols-[1fr_360px]">
        <SetupForm me={me} onSaved={reload} />
        <div className="flex flex-col gap-4">
          {next && <NextContest contest={next} onChange={reloadContests} />}
          {contests?.length === 0 && <Card><p className="text-muted">No contests coming up yet. Check back soon.</p></Card>}
          <PushToggle />
        </div>
      </div>
    </div>
  );
}
