export const REASONS = [
  { id: 'exams', label: 'Exams', letter: 'E' },
  { id: 'travel', label: 'Travel', letter: 'T' },
  { id: 'illness', label: 'Unwell', letter: 'U' },
  { id: 'clash', label: 'Clash', letter: 'C' },
  { id: 'forgot', label: 'Forgot', letter: 'F' },
  { id: 'other', label: 'Other', letter: 'O' },
];

export const RSVP_REASONS = REASONS.filter((reason) => reason.id !== 'forgot');

export type ContestOutcome = { status: string | null; reasonType: string | null; ratingDelta: number | null; liveSolves: number };

export function contestResult({ status, reasonType, ratingDelta, liveSolves }: ContestOutcome): string {
  if (status === 'absent') return reasonType ? (REASONS.find((r) => r.id === reasonType)?.label ?? 'Reason given') : 'No reason yet';
  if (status !== 'present') return 'Not recorded';
  if (ratingDelta !== null) return `${ratingDelta >= 0 ? '+' : ''}${ratingDelta} rating`;
  return `${liveSolves} solved live`;
}
