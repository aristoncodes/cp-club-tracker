import { effectiveSettings, type Settings, type SettingRow } from 'shared/settings';

export const SETTING_ROWS = 'SELECT key, value, pending_value AS pendingValue, pending_from AS pendingFrom FROM settings';

export async function getSettings(db: D1Database, now = Math.floor(Date.now() / 1000)): Promise<Settings> {
  const { results } = await db.prepare(SETTING_ROWS).all<SettingRow>();
  return effectiveSettings(results, now);
}
