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
