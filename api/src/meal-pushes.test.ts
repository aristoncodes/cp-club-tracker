import { describe, expect, it } from 'vitest';
import { MEAL_LINES, mealAt, mealPush, SOLVED_LINES } from './meal-pushes';

const at = (hour: number, minute: number) => Date.UTC(2026, 10, 5, hour, minute) / 1000;

describe('meal pushes', () => {
  it('fires at 9 AM, 1 PM, 5 PM and 9 PM IST only', () => {
    expect(mealAt(at(3, 30))).toBe('breakfast');
    expect(mealAt(at(7, 30))).toBe('lunch');
    expect(mealAt(at(11, 30))).toBe('snacks');
    expect(mealAt(at(15, 30) + 59)).toBe('dinner');
    expect(mealAt(at(15, 31))).toBeNull();
    expect(mealAt(at(3, 29))).toBeNull();
  });

  it('never reuses a line anywhere', () => {
    const lines = [...Object.values(MEAL_LINES).flat(), ...SOLVED_LINES].map(([title, body]) => `${title}|${body}`);
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('gives each meal a new line for 30 days', () => {
    for (const meal of ['breakfast', 'lunch', 'snacks', 'dinner'] as const) {
      const month = Array.from({ length: 30 }, (_, day) => mealPush(meal, 20000 + day, false, 0).title);
      expect(new Set(month).size).toBe(30);
    }
  });

  it('gives no solver the same line twice in 10 days', () => {
    const lines = Array.from({ length: 10 }, (_, day) => (['lunch', 'snacks', 'dinner'] as const).map((meal) => mealPush(meal, 20000 + day, true, 9).title)).flat();
    expect(new Set(lines).size).toBe(30);
  });

  it('congratulates solvers, but not at breakfast', () => {
    expect(SOLVED_LINES.map(([title]) => title)).toContain(mealPush('lunch', 20000, true, 0).title);
    expect(MEAL_LINES.breakfast.map(([title]) => title)).toContain(mealPush('breakfast', 20000, true, 0).title);
  });

  it('mentions peers only to non-solvers, and only when at least 2 have solved', () => {
    expect(mealPush('lunch', 20000, false, 6).body).toContain('6 clubmates already have.');
    expect(mealPush('lunch', 20000, false, 1).body).not.toContain('clubmates already have');
    expect(mealPush('lunch', 20000, true, 6).body).not.toContain('clubmates already have');
    expect(mealPush('breakfast', 20000, false, 6).body).not.toContain('clubmates already have');
  });
});
