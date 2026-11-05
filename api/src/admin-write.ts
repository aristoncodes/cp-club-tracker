import type { Context } from 'hono';
import type { AppEnv } from './auth';

export type AuditArea = 'attendance' | 'handles' | 'fairness' | 'admins' | 'rules' | 'members' | 'contests' | 'sessions' | 'seasons' | 'communicate';
export type AuditEntry = { area: AuditArea; action: string; target?: string; before?: unknown; after?: unknown };

const text = (value: unknown) => (value === undefined ? null : JSON.stringify(value));

// The only way an admin route writes: the change and its log row go in one batch, so neither can happen alone.
export async function adminWrite(c: Context<AppEnv>, entries: AuditEntry | AuditEntry[], statements: D1PreparedStatement[]): Promise<D1Result[]> {
  const db = c.env.DB;
  const adminId = c.get('user').id;
  const log = db.prepare('INSERT INTO audit_log (admin_id, area, action, target, before, after, at) VALUES (?, ?, ?, ?, ?, ?, unixepoch())');
  const rows = [entries].flat().map((e) => log.bind(adminId, e.area, e.action, e.target ?? null, text(e.before), text(e.after)));
  const results = await db.batch([...statements, ...rows]);
  return results.slice(0, statements.length);
}
