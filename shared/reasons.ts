export const REASONS = [
  { id: 'exams', label: 'Exams', letter: 'E' },
  { id: 'travel', label: 'Travel', letter: 'T' },
  { id: 'illness', label: 'Unwell', letter: 'U' },
  { id: 'clash', label: 'Clash', letter: 'C' },
  { id: 'forgot', label: 'Forgot', letter: 'F' },
  { id: 'other', label: 'Other', letter: 'O' },
];

export const RSVP_REASONS = REASONS.filter((reason) => reason.id !== 'forgot');
