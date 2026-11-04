import { describe, expect, it } from 'vitest';
import { constantTimeEqual, hashCode, hashPassword, randomCode, verifyPassword } from './secrets';

describe('passwords', () => {
  it('round-trips and rejects the wrong password', async () => {
    const stored = await hashPassword('correct horse');
    expect(stored).toMatch(/^pbkdf2\$\d+\$[\w-]+\$[\w-]+$/);
    expect(stored).not.toContain('correct horse');
    expect(await verifyPassword('correct horse', stored)).toBe(true);
    expect(await verifyPassword('wrong horse', stored)).toBe(false);
  });

  it('salts each hash', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });
});

describe('constantTimeEqual', () => {
  it('compares whole strings, including different lengths', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('', 'a')).toBe(false);
  });
});

describe('codes', () => {
  it('makes six digits', () => {
    for (let i = 0; i < 50; i++) expect(randomCode()).toMatch(/^\d{6}$/);
  });

  it('hashes per email and purpose, and never contains the code', async () => {
    const hash = await hashCode('secret', 'a@x.com', 'verify', '123456');
    expect(hash).not.toContain('123456');
    expect(hash).toBe(await hashCode('secret', 'a@x.com', 'verify', '123456'));
    expect(hash).not.toBe(await hashCode('secret', 'b@x.com', 'verify', '123456'));
    expect(hash).not.toBe(await hashCode('secret', 'a@x.com', 'reset', '123456'));
    expect(hash).not.toBe(await hashCode('other', 'a@x.com', 'verify', '123456'));
  });
});
