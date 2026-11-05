import { describe, expect, it } from 'vitest';
import { announcementError } from './announcements';

const draft = { title: 'Hello', body: 'World', audience: 'all' };

describe('announcementError', () => {
  it('accepts a valid draft', () => {
    expect(announcementError(draft)).toBeNull();
    expect(announcementError({ ...draft, audience: 'batch', studyYear: 2, link: '/contests' })).toBeNull();
  });

  it('enforces the length limits', () => {
    expect(announcementError({ ...draft, title: 'x'.repeat(81) })).toMatch(/Title/);
    expect(announcementError({ ...draft, title: 'x'.repeat(80) })).toBeNull();
    expect(announcementError({ ...draft, body: 'x'.repeat(281) })).toMatch(/Message/);
    expect(announcementError({ ...draft, body: ' ' })).toMatch(/Message/);
  });

  it('needs a year for a batch audience', () => {
    expect(announcementError({ ...draft, audience: 'batch' })).toMatch(/year/);
    expect(announcementError({ ...draft, audience: 'everyone' })).toMatch(/audience/);
  });

  it('refuses links that could run script', () => {
    expect(announcementError({ ...draft, link: 'javascript:alert(1)' })).toMatch(/link/);
    expect(announcementError({ ...draft, link: '//evil.example' })).toMatch(/link/);
    expect(announcementError({ ...draft, link: 'https://codeforces.com' })).toBeNull();
  });
});
