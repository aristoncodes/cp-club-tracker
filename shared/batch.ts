import { IST_OFFSET } from './time';

const ACADEMIC_YEAR_START_MONTH = 7; // August, zero-based
const LABELS = ['1st year', '2nd year', '3rd year', '4th year'];

export const STUDY_YEARS = LABELS.map((label, index) => ({ value: index + 1, label }));

function academicYear(now: number): number {
  const date = new Date((now + IST_OFFSET) * 1000);
  return date.getUTCMonth() >= ACADEMIC_YEAR_START_MONTH ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
}

export function batchForStudyYear(studyYear: number, now: number): number {
  return academicYear(now) - studyYear + 1;
}

export function studyYearOf(batchYear: number, now: number): number {
  return academicYear(now) - batchYear + 1;
}

export function studyYearLabel(batchYear: number | null, now: number): string {
  if (!batchYear) return '';
  const year = studyYearOf(batchYear, now);
  if (year < 1) return '';
  return LABELS[year - 1] ?? 'Alumni';
}

export type MemberKind = 'student' | 'coach' | 'alumni';

const ALUMNI_CHOICE = 5;
const COACH_CHOICE = 6;
const LAST_YEAR = 4;

// One list for the year pickers: the four years, then Alumni and Coach.
export const MEMBER_CHOICES = [...STUDY_YEARS, { value: ALUMNI_CHOICE, label: 'Alumni' }, { value: COACH_CHOICE, label: 'Coach' }];

export function memberFromChoice(choice: number, now: number): { kind: MemberKind; batchYear: number | null } {
  if (choice === COACH_CHOICE) return { kind: 'coach', batchYear: null };
  if (choice === ALUMNI_CHOICE) return { kind: 'alumni', batchYear: null };
  return { kind: 'student', batchYear: batchForStudyYear(choice, now) };
}

// Students past 4th year count as Alumni, so the 1 August rollover needs no job.
export function memberChoice(kind: MemberKind, batchYear: number | null, now: number): number {
  if (kind === 'coach') return COACH_CHOICE;
  if (kind === 'alumni') return ALUMNI_CHOICE;
  if (!batchYear) return 0;
  return Math.min(studyYearOf(batchYear, now), ALUMNI_CHOICE);
}

export function memberLabel(kind: MemberKind, batchYear: number | null, now: number): string {
  const choice = memberChoice(kind, batchYear, now);
  return choice > LAST_YEAR ? (choice === COACH_CHOICE ? 'Coach' : 'Alumni') : studyYearLabel(batchYear, now);
}

// Coaches and alumni are on the leaderboards but not tracked for attendance, so CodeChef is optional for them.
export const isTracked = (kind: MemberKind, batchYear: number | null, now: number) => kind === 'student' && (!batchYear || studyYearOf(batchYear, now) <= LAST_YEAR);
