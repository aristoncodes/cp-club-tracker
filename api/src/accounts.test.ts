import { describe, expect, it } from 'vitest';
import { canAdvance, normalizeUsername, usernameError } from './accounts';

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

describe('canAdvance', () => {
  it('moves one step forward only', () => {
    expect(canAdvance('about', 'handles', COMPLETE)).toBe(true);
    expect(canAdvance('handles', 'notified', COMPLETE)).toBe(true);
    expect(canAdvance('notified', 'done', COMPLETE)).toBe(true);
    expect(canAdvance('about', 'done', COMPLETE)).toBe(false);
    expect(canAdvance('handles', 'about', COMPLETE)).toBe(false);
    expect(canAdvance('done', 'done', COMPLETE)).toBe(false);
  });

  it('needs a username and year, then both required handles', () => {
    expect(canAdvance('about', 'handles', { ...COMPLETE, hasUsername: false })).toBe(false);
    expect(canAdvance('about', 'handles', { ...COMPLETE, hasBatch: false })).toBe(false);
    expect(canAdvance('handles', 'notified', { ...COMPLETE, hasRequiredHandles: false })).toBe(false);
  });
});
