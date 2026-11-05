export const SETTING_DEFAULTS = {
  potd_bonus: 5,
  potd_bonus_revealed: 2,
  live_multiplier: 1.5,
  fairness_max_solves: 30,
  fairness_fast_count: 3,
  fairness_fast_minutes: 20,
  fairness_fast_gap: 400,
  fairness_match_minutes: 10,
  risk_no_solve_days: 7,
  risk_absences: 2,
  risk_attendance_drop: 20,
  nudge_gap_days: 3,
  snooze_days: 14,
  attendance_goal: 70,
  reason_inbox_days: 2,
  exam_grace_days: 3,
  mom_min_solves: 10,
  potd_push_minute: 480,
  mandatory_reminder_hours: 3,
  streak_push_minute: 1260,
  recap_push_minute: 1260,
};

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type Settings = Record<SettingKey, number>;
export type SettingRow = { key: string; value: number; pendingValue: number | null; pendingFrom: number | null };

// A change saved today carries pendingFrom = the next IST midnight, so today keeps the old value and no job is needed to apply it.
export const effectiveValue = (row: SettingRow, now: number) => (row.pendingValue !== null && row.pendingFrom !== null && row.pendingFrom <= now ? row.pendingValue : row.value);

export function effectiveSettings(rows: SettingRow[], now: number): Settings {
  const settings = { ...SETTING_DEFAULTS };
  for (const row of rows) if (row.key in settings) settings[row.key as SettingKey] = effectiveValue(row, now);
  return settings;
}
