import { useEffect, useState } from 'react';
import { formatIST } from 'shared/time';
import { api, type Me } from '../api';
import { Button, Card, ErrorText, inputClass, platformLabel, PLATFORMS, useLoad, useMe } from '../ui';

type Contest = { id: number; platform: string; name: string; startAt: number; rsvp: string | null };

const REASONS = [
  { id: 'exams', label: 'Exams' },
  { id: 'travel', label: 'Travel' },
  { id: 'illness', label: 'Illness' },
  { id: 'clash', label: 'Other commitment' },
  { id: 'forgot', label: 'Forgot' },
  { id: 'other', label: 'Other' },
];

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
            className={`min-h-11 cursor-pointer rounded-full border px-4 ${reasonType === reason.id ? 'border-accent text-accent' : 'border-border bg-surface-2'}`}
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
      <div><Button onClick={submit} disabled={!reasonType || saving}>Submit</Button></div>
    </div>
  );
}

function SetupForm({ me, onSaved }: { me: Me; onSaved: () => void }) {
  const [batchYear, setBatchYear] = useState(me.user.batchYear ? String(me.user.batchYear) : '');
  const [handles, setHandles] = useState<Record<string, string>>(Object.fromEntries(me.handles.map((h) => [h.platform, h.handle])));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!/^\d{4}$/.test(batchYear)) return setError('Enter your 4-digit batch year.');
    if (PLATFORMS.some((p) => p.required && !handles[p.id]?.trim())) return setError('Codeforces and CodeChef handles are required.');
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await api('/me', 'PUT', { name: me.user.name, batchYear: Number(batchYear) });
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
      <h2 className="text-lg font-semibold">Your profile</h2>
      <label className="flex flex-col gap-1">
        <span className="label">Batch year</span>
        <input className={`${inputClass} num`} inputMode="numeric" maxLength={4} value={batchYear} onChange={(e) => setBatchYear(e.target.value)} />
      </label>
      {PLATFORMS.map(({ id, label, required }) => {
        const saved = me.handles.find((h) => h.platform === id);
        return (
          <label key={id} className="flex flex-col gap-1">
            <span className="label">{label}{required ? '' : ' (optional)'}</span>
            <input
              className={`${inputClass} num`}
              autoCapitalize="none"
              autoCorrect="off"
              value={handles[id] ?? ''}
              onChange={(e) => setHandles((current) => ({ ...current, [id]: e.target.value }))}
            />
            {saved && !saved.approved && <span className="text-xs text-pending">Waiting for admin approval</span>}
          </label>
        );
      })}
      {error && <ErrorText>{error}</ErrorText>}
      {message && <p className="text-present">{message}</p>}
      <div><Button onClick={save} disabled={saving}>Save</Button></div>
    </Card>
  );
}

function UpcomingContest({ contest, onChange }: { contest: Contest; onChange: () => void }) {
  const [answeringNo, setAnsweringNo] = useState(false);
  const [error, setError] = useState('');

  async function going() {
    try {
      await api(`/contests/${contest.id}/rsvp`, 'POST', { going: true });
      setAnsweringNo(false);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div>
        <span className="label">{platformLabel(contest.platform)}</span>
        <p className="font-medium">{contest.name}</p>
        <p className="num text-muted">{formatIST(contest.startAt)}</p>
      </div>
      {contest.rsvp && <p className="text-muted">{contest.rsvp === 'yes' ? "You said you're going." : "You said you can't make it."}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={going}>Yes, giving it</Button>
        <Button variant="secondary" onClick={() => setAnsweringNo(true)}>Can't make it</Button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      {answeringNo && (
        <ReasonForm
          onSubmit={async (reason) => {
            await api(`/contests/${contest.id}/rsvp`, 'POST', { going: false, ...reason });
            setAnsweringNo(false);
            onChange();
          }}
        />
      )}
    </div>
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
      <h2 className="text-lg font-semibold">Notifications</h2>
      {!supported && <p className="text-muted">On iPhone, add this site to your Home Screen, then open it from there to turn these on.</p>}
      {supported && state === 'on' && <p className="text-present">Notifications are on for this device.</p>}
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

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Me</h1>
      {me.pendingReasons.map((contest) => (
        <Card key={contest.id} className="flex flex-col gap-3 border-pending">
          <h2 className="text-lg font-semibold">What got in the way of {contest.name}?</h2>
          <ReasonForm
            onSubmit={async (reason) => {
              await api(`/contests/${contest.id}/reason`, 'POST', reason);
              reload();
            }}
          />
        </Card>
      ))}
      <SetupForm me={me} onSaved={reload} />
      <Card>
        <h2 className="mb-3 text-lg font-semibold">Upcoming contests</h2>
        {contests?.length === 0 && <p className="text-muted">No contests coming up yet. Check back soon.</p>}
        <div className="divide-y divide-border">
          {contests?.slice(0, 3).map((contest) => <UpcomingContest key={contest.id} contest={contest} onChange={reloadContests} />)}
        </div>
      </Card>
      <PushToggle />
    </div>
  );
}
