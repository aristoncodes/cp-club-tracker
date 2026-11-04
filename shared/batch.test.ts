import { describe, expect, it } from 'vitest';
import { batchForStudyYear, studyYearLabel, studyYearOf } from './batch';

const ist = (year: number, month: number, day: number) => Date.UTC(year, month - 1, day) / 1000 - 19800;
const NOV_2026 = ist(2026, 11, 4);

describe('study year', () => {
  it('stores the joining year and reads it back', () => {
    expect(batchForStudyYear(1, NOV_2026)).toBe(2026);
    expect(batchForStudyYear(2, NOV_2026)).toBe(2025);
    expect(studyYearOf(2025, NOV_2026)).toBe(2);
  });

  it('moves everyone up when the academic year starts in August', () => {
    expect(studyYearLabel(2025, ist(2027, 7, 31))).toBe('2nd year');
    expect(studyYearLabel(2025, ist(2027, 8, 1))).toBe('3rd year');
  });

  it('labels every year, graduates and missing values', () => {
    expect(studyYearLabel(2026, NOV_2026)).toBe('1st year');
    expect(studyYearLabel(2023, NOV_2026)).toBe('4th year');
    expect(studyYearLabel(2022, NOV_2026)).toBe('Alumni');
    expect(studyYearLabel(null, NOV_2026)).toBe('');
    expect(studyYearLabel(2027, NOV_2026)).toBe('');
  });
});
