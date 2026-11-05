import { describe, expect, it } from 'vitest';
import { appVersionAction } from './app-version';

describe('appVersionAction', () => {
  it('asks nothing of a current app', () => {
    expect(appVersionAction('1.5.0', '1.5.0', '1.0.0')).toBe('none');
    expect(appVersionAction('1.6.0', '1.5.0', '1.0.0')).toBe('none');
  });

  it('offers an update below latest', () => {
    expect(appVersionAction('1.4.0', '1.5.0', '1.0.0')).toBe('optional');
  });

  it('requires an update below min', () => {
    expect(appVersionAction('1.4.0', '1.5.0', '1.5.0')).toBe('required');
  });

  it('compares versions as numbers', () => {
    expect(appVersionAction('1.9.0', '1.10.0', '1.0.0')).toBe('optional');
    expect(appVersionAction('1.10.0', '1.9.0', '1.0.0')).toBe('none');
    expect(appVersionAction('1.5', '1.5.1', '1.0')).toBe('optional');
  });
});
