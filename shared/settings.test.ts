import { describe, expect, it } from 'vitest';
import { effectiveSettings, effectiveValue, SETTING_DEFAULTS } from './settings';
import { potdBonus } from './potd';
import { solvePoints } from './scoring';

const row = { key: 'risk_absences', value: 2, pendingValue: 3, pendingFrom: 1000 };

describe('settings', () => {
  it('keeps the old value until the change takes effect', () => {
    expect(effectiveValue(row, 999)).toBe(2);
    expect(effectiveValue(row, 1000)).toBe(3);
  });

  it('falls back to defaults and ignores unknown keys', () => {
    const settings = effectiveSettings([row, { key: 'nope', value: 9, pendingValue: null, pendingFrom: null }], 5);
    expect(settings.risk_absences).toBe(2);
    expect(settings.snooze_days).toBe(SETTING_DEFAULTS.snooze_days);
    expect('nope' in settings).toBe(false);
  });

  it('feeds scoring and the bonus', () => {
    expect(solvePoints(1200, 1200, true, 2)).toBe(28.8);
    expect(solvePoints(1200, 1200, true)).toBe(21.6);
    expect(potdBonus(false, 7, 3)).toBe(7);
    expect(potdBonus(true, 7, 3)).toBe(3);
  });
});
