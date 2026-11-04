import { describe, expect, it } from 'vitest';
import { canFinishOnboarding, normalizeUsername, usernameError } from './accounts';

const COMPLETE = { hasUsername: true, hasBatch: true, hasRequiredHandles: true, isAdmin: false };

describe('usernameError', () => {
  it.each(['abc', 'a_b.c', 'user123', 'a'.repeat(20)])('accepts %s', (name) => {
    expect(usernameError(name)).toBeNull();
  });

  it.each(['ab', 'a'.repeat(21), 'has space', 'UPPER', 'a-b', 'é_name', ''])('rejects %s', (name) => {
    expect(usernameError(name)).not.toBeNull();
  });

  it.each(['admin', 'root', 'support', 'oops', 'grind', 'club', 'api', 'me', 'settings'])('reserves %s', (name) => {
    expect(usernameError(name)).not.toBeNull();
  });

  it('treats case as the same name', () => {
    expect(normalizeUsername(' JoyBoy ')).toBe('joyboy');
    expect(usernameError(normalizeUsername('ADMIN'))).not.toBeNull();
  });
});

describe('canFinishOnboarding', () => {
  it('needs a username, a year and both required handles', () => {
    expect(canFinishOnboarding(COMPLETE)).toBe(true);
    expect(canFinishOnboarding({ ...COMPLETE, hasUsername: false })).toBe(false);
    expect(canFinishOnboarding({ ...COMPLETE, hasBatch: false })).toBe(false);
    expect(canFinishOnboarding({ ...COMPLETE, hasRequiredHandles: false })).toBe(false);
  });

  it('lets admins skip handles, but not a username', () => {
    expect(canFinishOnboarding({ ...COMPLETE, hasRequiredHandles: false, isAdmin: true })).toBe(true);
    expect(canFinishOnboarding({ ...COMPLETE, hasUsername: false, hasRequiredHandles: false, isAdmin: true })).toBe(false);
  });
});
