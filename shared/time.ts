import type { Period } from './types';

const IST_OFFSET = 19800;
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
