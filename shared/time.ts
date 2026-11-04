import type { Period } from './types';

export const IST_OFFSET = 19800;
const DAY = 86400;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function periodStart(period: Period, now: number): number {
  const ist = now + IST_OFFSET;
  const dayNumber = Math.floor(ist / DAY);
  if (period === 'day') return dayNumber * DAY - IST_OFFSET;
  if (period === 'week') {
    // Day 0 of unix time was a Thursday, 3 days after a Monday.
    const daysSinceMonday = (dayNumber + 3) % 7;
    return (dayNumber - daysSinceMonday) * DAY - IST_OFFSET;
  }
  const date = new Date(ist * 1000);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000 - IST_OFFSET;
}

export function formatIST(ts: number): string {
  const d = new Date((ts + IST_OFFSET) * 1000);
  const hour = d.getUTCHours() % 12 || 12;
  const minute = String(d.getUTCMinutes()).padStart(2, '0');
  const suffix = d.getUTCHours() < 12 ? 'AM' : 'PM';
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} · ${hour}:${minute} ${suffix}`;
}

export function istDay(ts: number): number {
  return Math.floor((ts + IST_OFFSET) / DAY);
}

export function solveStreak(solveDays: number[], today: number): number {
  const days = new Set(solveDays);
  let day = days.has(today) ? today : today - 1;
  let streak = 0;
  while (days.has(day)) {
    streak += 1;
    day -= 1;
  }
  return streak;
}

export function timeAgo(ts: number, now: number): string {
  const minutes = Math.floor((now - ts) / 60);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

const HEATMAP_WEEKS = 26;

export const heatLevel = (count: number) => (count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 5 ? 3 : 4);

// Columns of Monday-to-Sunday cells: a step from 0 to 4, or null for days after today.
export function heatmapWeeks(counts: { day: number; count: number }[], today: number, weeks = HEATMAP_WEEKS): (number | null)[][] {
  const byDay = new Map(counts.map((c) => [c.day, c.count]));
  const thisMonday = today - ((today + 3) % 7);
  return Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const day = thisMonday - (weeks - 1 - week) * 7 + weekday;
      if (day > today) return null;
      return heatLevel(byDay.get(day) ?? 0);
    }),
  );
}

export type StreakDay = { label: string; state: 'done' | 'today' | 'other' };

export function weekStrip(counts: { day: number; count: number }[], today: number): StreakDay[] {
  const solved = new Set(counts.filter((c) => c.count > 0).map((c) => c.day));
  const monday = today - ((today + 3) % 7);
  return ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) => {
    const day = monday + index;
    if (solved.has(day)) return { label, state: 'done' };
    return { label, state: day === today ? 'today' : 'other' };
  });
}

export const solvesText = (count: number) => `${count} ${count === 1 ? 'solve' : 'solves'}`;
