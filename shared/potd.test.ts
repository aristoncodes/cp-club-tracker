import { describe, expect, it } from 'vitest';
import { potdBand, potdBonus, potdRating } from './potd';

describe('problem of the day', () => {
  it.each([[null, 0], [1199, 0], [1200, 1200], [1399, 1200], [1400, 1400], [1599, 1400], [1600, 1600], [1899, 1600], [1900, 1900], [3000, 1900]])('puts %s in band %i', (rating, band) => {
    expect(potdBand(rating)).toBe(band);
  });

  it.each([[0, 1000], [1200, 1400], [1400, 1600], [1600, 1800], [1900, 2100]])('band %i gets a %i', (band, rating) => {
    expect(potdRating(band)).toBe(rating);
  });

  it('gives +5 without a reveal and +2 with one', () => {
    expect(potdBonus(false)).toBe(5);
    expect(potdBonus(true)).toBe(2);
  });
});
