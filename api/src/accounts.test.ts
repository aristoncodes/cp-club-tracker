import { describe, expect, it } from 'vitest';
import { canAdvance, codeUsable, isLocked, normalizeUsername, resendBlocked, usernameError } from './accounts';

const NOW = 1_000_000;
const COMPLETE = { hasUsername: true, hasBatch: true, hasRequiredHandles: true };

describe('usernameError', () => {
  it.each(['abc', 'a_b.c', 'user123', 'a'.repeat(20)])('accepts %s', (name) => {
    expect(usernameError(name)).toBeNull();
  });

  it.each(['ab', 'a'.repeat(21), 'has space', 'UPPER', 'a-b', 'é_name', ''])('rejects %s', (name) => {
    expect(usernameError(name)).not.toBeNull();
  });

  it.each(['admin', 'root', 'support', 'grind', 'club', 'api', 'me', 'settings'])('reserves %s', (name) => {
    expect(usernameError(name)).not.toBeNull();
  });

  it('treats case as the same name', () => {
    expect(normalizeUsername(' JoyBoy ')).toBe('joyboy');
    expect(usernameError(normalizeUsername('ADMIN'))).not.toBeNull();
  });
});

describe('code rules', () => {
  it('expires', () => {
    expect(codeUsable({ expires_at: NOW + 1, attempts: 0 }, NOW)).toBe(true);
    expect(codeUsable({ expires_at: NOW, attempts: 0 }, NOW)).toBe(false);
    expect(codeUsable(null, NOW)).toBe(false);
  });

  it('allows five attempts', () => {
    expect(codeUsable({ expires_at: NOW + 1, attempts: 4 }, NOW)).toBe(true);
    expect(codeUsable({ expires_at: NOW + 1, attempts: 5 }, NOW)).toBe(false);
  });

  it('waits 60 s between sends', () => {
    expect(resendBlocked([NOW - 59], NOW)).toBe(true);
    expect(resendBlocked([NOW - 60], NOW)).toBe(false);
  });

  it('allows five sends an hour', () => {
    const four = [1000, 900, 800, 700].map((ago) => NOW - ago);
    expect(resendBlocked(four, NOW)).toBe(false);
    expect(resendBlocked([...four, NOW - 600], NOW)).toBe(true);
    expect(resendBlocked([...four, NOW - 3600], NOW)).toBe(false);
  });
});

describe('lockout', () => {
  it('holds only until the time passes', () => {
    expect(isLocked({ locked_until: NOW + 1 }, NOW)).toBe(true);
    expect(isLocked({ locked_until: NOW }, NOW)).toBe(false);
    expect(isLocked({ locked_until: null }, NOW)).toBe(false);
    expect(isLocked(null, NOW)).toBe(false);
  });
});

describe('canAdvance', () => {
  it('moves one step forward only', () => {
    expect(canAdvance('about', 'handles', COMPLETE)).toBe(true);
    expect(canAdvance('handles', 'notified', COMPLETE)).toBe(true);
    expect(canAdvance('notified', 'done', COMPLETE)).toBe(true);
    expect(canAdvance('about', 'done', COMPLETE)).toBe(false);
    expect(canAdvance('handles', 'about', COMPLETE)).toBe(false);
    expect(canAdvance('done', 'done', COMPLETE)).toBe(false);
  });

  it("can't leave verify without a verified email", () => {
    expect(canAdvance('verify', 'about', COMPLETE)).toBe(false);
  });

  it('needs a username and year, then both required handles', () => {
    expect(canAdvance('about', 'handles', { ...COMPLETE, hasUsername: false })).toBe(false);
    expect(canAdvance('about', 'handles', { ...COMPLETE, hasBatch: false })).toBe(false);
    expect(canAdvance('handles', 'notified', { ...COMPLETE, hasRequiredHandles: false })).toBe(false);
  });
});
