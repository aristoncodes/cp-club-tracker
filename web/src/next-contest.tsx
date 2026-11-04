import { useState } from 'react';
import { RSVP_REASONS } from 'shared/reasons';
import { formatIST } from 'shared/time';
import { api } from './api';
import { Button, ErrorText, inputClass, platformLabel } from './ui';

export type Contest = {
  id: number;
  platform: string;
  name: string;
  url: string;
  startAt: number;
  rsvp: string | null;
  goingCount: number;
  participantCount: number;
};

const DOTS = ['bg-lime', 'bg-pink', 'bg-sun', 'bg-sky'];

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex-1 rounded-[14px] bg-violet-deep p-2 text-center">
      <div className="num text-2xl text-white">{String(value).padStart(2, '0')}</div>
      <div className="text-[10px] font-bold tracking-wider text-violet-soft uppercase">{label}</div>
    </div>
  );
}

export function NextContest({ contest, onChange }: { contest: Contest; onChange: () => void }) {
  const [choosing, setChoosing] = useState(false);
  const [reasonType, setReasonType] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [error, setError] = useState('');

  const left = Math.max(0, contest.startAt - Math.floor(Date.now() / 1000));

  async function send(body: Record<string, unknown>) {
    setError('');
    try {
      await api(`/contests/${contest.id}/rsvp`, 'POST', body);
      setChoosing(false);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const answeredNo = contest.rsvp === 'no' && !choosing;

  return (
    <section className="flex flex-col gap-3 rounded-[22px] bg-violet p-5 text-white">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-extrabold tracking-wider text-[#5B21B6] uppercase">{platformLabel(contest.platform)}</span>
        <span className="text-xs font-semibold text-[#EDE9FE]">Next contest</span>
      </div>
      <div>
        <h2 className="display text-xl"><a href={contest.url} target="_blank" rel="noreferrer" className="hover:underline">{contest.name}</a></h2>
        <p className="text-sm text-[#EDE9FE]">{formatIST(contest.startAt)}</p>
      </div>
      <div className="flex gap-2">
        <Tile value={Math.floor(left / 86400)} label="Days" />
        <Tile value={Math.floor((left % 86400) / 3600)} label="Hrs" />
        <Tile value={Math.floor((left % 3600) / 60)} label="Min" />
      </div>

      {contest.rsvp === 'yes' && !choosing && (
        <div className="flex items-center justify-between rounded-full bg-lime px-4 py-2 font-extrabold text-ink">
          <span>You're in. Good luck!</span>
          <button className="min-h-8 cursor-pointer font-bold underline" onClick={() => setChoosing(true)}>Change</button>
        </div>
      )}
      {!contest.rsvp && !choosing && (
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => send({ going: true })}>I'm in</Button>
          <Button variant="onViolet" className="flex-1" onClick={() => setChoosing(true)}>Can't make it</Button>
        </div>
      )}
      {answeredNo && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[#EDE9FE]">You can't make this one.</span>
          <Button onClick={() => send({ going: true })}>Actually, I'm in</Button>
        </div>
      )}
      {choosing && (
        <div className="flex flex-col gap-2">
          <p className="font-bold">What's stopping you?</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup">
            {RSVP_REASONS.map((reason) => (
              <button
                key={reason.id}
                role="radio"
                aria-checked={reasonType === reason.id}
                onClick={() => setReasonType(reason.id)}
                className={`min-h-9 cursor-pointer rounded-full border-2 px-3 text-sm font-bold ${reasonType === reason.id ? 'border-lime bg-lime text-ink' : 'border-violet-soft text-white'}`}
              >
                {reason.label}
              </button>
            ))}
          </div>
          {reasonType === 'other' && (
            <input className={inputClass} placeholder="Tell us a little more" aria-label="Reason details" value={reasonText} onChange={(e) => setReasonText(e.target.value)} />
          )}
          <div className="flex gap-2">
            <Button className="flex-1" disabled={!reasonType || (reasonType === 'other' && !reasonText.trim())} onClick={() => send({ going: false, reasonType, reasonText })}>Send</Button>
            <Button variant="onViolet" className="flex-1" onClick={() => send({ going: true })}>Actually, I'm in</Button>
          </div>
        </div>
      )}
      {error && <p className="rounded-2xl bg-ink px-3 py-2"><ErrorText>{error}</ErrorText></p>}

      <div className="flex items-center gap-2 text-sm text-[#EDE9FE]">
        <span aria-hidden className="flex">
          {DOTS.map((dot) => <i key={dot} className={`-ml-1 size-4 rounded-full border-2 border-violet first:ml-0 ${dot}`} />)}
        </span>
        <span><span className="num text-white">{contest.goingCount}</span> of <span className="num">{contest.participantCount}</span> are going</span>
      </div>
    </section>
  );
}
