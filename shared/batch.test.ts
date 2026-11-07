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

describe('coach and alumni', () => {
  const now = Date.UTC(2026, 10, 7) / 1000;
  it('turns a picker choice into a kind and batch, and back', async () => {
    const { memberFromChoice, memberChoice, memberLabel, isTracked } = await import('./batch');
    expect(memberFromChoice(2, now)).toEqual({ kind: 'student', batchYear: 2025 });
    expect(memberFromChoice(5, now)).toEqual({ kind: 'alumni', batchYear: null });
    expect(memberFromChoice(6, now)).toEqual({ kind: 'coach', batchYear: null });
    expect(memberChoice('student', 2025, now)).toBe(2);
    expect(memberChoice('coach', null, now)).toBe(6);
    expect(memberLabel('coach', null, now)).toBe('Coach');
    expect(memberLabel('alumni', null, now)).toBe('Alumni');
    expect(memberLabel('student', 2025, now)).toBe('2nd year');
    expect(isTracked('student', 2025, now)).toBe(true);
    expect(isTracked('coach', null, now)).toBe(false);
    expect(isTracked('alumni', null, now)).toBe(false);
  });

  it('makes 4th years alumni on 1 August without a job', async () => {
    const { memberChoice, memberLabel, isTracked } = await import('./batch');
    const july = Date.UTC(2027, 6, 31) / 1000;
    const august = Date.UTC(2027, 7, 1) / 1000;
    expect(memberChoice('student', 2023, july)).toBe(4);
    expect(memberChoice('student', 2023, august)).toBe(5);
    expect(memberLabel('student', 2023, august)).toBe('Alumni');
    expect(isTracked('student', 2023, july)).toBe(true);
    expect(isTracked('student', 2023, august)).toBe(false);
  });
});
