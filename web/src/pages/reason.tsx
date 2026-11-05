import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { REASONS } from 'shared/reasons';
import { api } from '../api';
import { Button, Card, ErrorText, inputClass, useMe } from '../ui';

export function Reason() {
  const { contestId } = useParams();
  const { me } = useMe();
  const navigate = useNavigate();
  const [reasonType, setReasonType] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const contest = me.pendingReasons.find((c) => String(c.id) === contestId);

  async function submit() {
    if (reasonType === 'other' && !reasonText.trim()) return setError('Please add a few details about the reason.');
    setSaving(true);
    setError('');
    try {
      await api(`/contests/${contestId}/reason`, 'POST', { reasonType, reasonText });
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <Card className="flex max-w-[560px] flex-col gap-4">
      <h1 className="display text-3xl">What got in the way{contest ? ` of ${contest.name}` : ''}?</h1>
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
        placeholder={reasonType === 'other' ? 'Please add a few details' : 'Additional details (optional)'}
        aria-label="Reason details"
      />
      {error && <ErrorText>{error}</ErrorText>}
      <div><Button onClick={submit} disabled={!reasonType || saving}>Add reason</Button></div>
    </Card>
  );
}
