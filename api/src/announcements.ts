import { Hono } from 'hono';
import { batchForStudyYear } from 'shared/batch';
import { adminWrite } from './admin-write';
import { requireUser, type AppEnv, type Bindings } from './auth';
import { pushUsers } from './push';

const TITLE_MAX = 80;
const BODY_MAX = 280;
const INBOX_SIZE = 30;
const SENT_SIZE = 20;
const IN_AUDIENCE = `(a.audience = 'all' OR (a.audience = 'admins' AND u.role = 'admin') OR (a.audience = 'batch' AND u.batch_year = a.batch_year))`;
const FIELDS = `a.id, a.title, a.body, a.audience, a.batch_year AS batchYear, a.link, a.sent_at AS sentAt, a.pinned, author.name AS authorName`;

export type AnnouncementDraft = { title?: string; body?: string; audience?: string; studyYear?: number; link?: string; sendAt?: number };

export function announcementError({ title, body, audience, studyYear, link }: AnnouncementDraft): string | null {
  if (!title?.trim() || title.trim().length > TITLE_MAX) return `Title must be 1–${TITLE_MAX} characters`;
  if (!body?.trim() || body.trim().length > BODY_MAX) return `Message must be 1–${BODY_MAX} characters`;
  if (audience !== 'all' && audience !== 'batch' && audience !== 'admins') return 'Choose an audience';
  if (audience === 'batch' && ![1, 2, 3, 4].includes(studyYear ?? 0)) return 'Choose a year of study';
  if (link && !/^(https:\/\/|\/(?!\/))/.test(link)) return 'A link must start with https:// or /';
  return null;
}

export const announcementRoutes = new Hono<AppEnv>();
announcementRoutes.use(requireUser);

announcementRoutes.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT ${FIELDS}, a.sent_at > u.inbox_seen_at AS unread
     FROM announcements a JOIN users author ON author.id = a.author_id JOIN users u ON u.id = ?
     WHERE a.sent_at IS NOT NULL AND ${IN_AUDIENCE}
     ORDER BY a.sent_at DESC LIMIT ${INBOX_SIZE}`,
  )
    .bind(c.get('user').id)
    .all<{ pinned: number }>();
  return c.json({ items: results, pinned: results.find((row) => row.pinned) ?? null });
});

announcementRoutes.post('/seen', async (c) => {
  await c.env.DB.prepare('UPDATE users SET inbox_seen_at = unixepoch() WHERE id = ?').bind(c.get('user').id).run();
  return c.json({ ok: true });
});

export const adminAnnouncementRoutes = new Hono<AppEnv>();

adminAnnouncementRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const [items, counts] = await db.batch([
    db.prepare(
      `SELECT ${FIELDS}, a.send_at AS sendAt,
              (SELECT COUNT(*) FROM users u WHERE u.active = 1 AND ${IN_AUDIENCE}) AS audienceCount,
              (SELECT COUNT(*) FROM users u WHERE u.active = 1 AND ${IN_AUDIENCE} AND u.inbox_seen_at >= a.sent_at) AS seenCount
       FROM announcements a JOIN users author ON author.id = a.author_id
       ORDER BY a.send_at DESC LIMIT ${SENT_SIZE}`,
    ),
    db.prepare(`SELECT batch_year AS batchYear, role, COUNT(*) AS n FROM users WHERE active = 1 GROUP BY batch_year, role`),
  ]);
  return c.json({ items: items.results, counts: counts.results });
});

adminAnnouncementRoutes.post('/', async (c) => {
  const draft = await c.req.json<AnnouncementDraft & { pinned?: boolean }>();
  const invalid = announcementError(draft);
  if (invalid) return c.json({ error: invalid }, 400);
  const db = c.env.DB;
  const now = Math.floor(Date.now() / 1000);
  const insert = db
    .prepare(`INSERT INTO announcements (author_id, title, body, audience, batch_year, link, send_at, pinned) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      c.get('user').id,
      draft.title!.trim(),
      draft.body!.trim(),
      draft.audience!,
      draft.audience === 'batch' ? batchForStudyYear(draft.studyYear!, now) : null,
      draft.link?.trim() || null,
      Math.max(draft.sendAt ?? now, now),
      draft.pinned ? 1 : 0,
    );
  await adminWrite(c, { area: 'communicate', action: 'created announcement', target: draft.title!.trim(), after: { audience: draft.audience, pinned: !!draft.pinned } }, draft.pinned ? [db.prepare('UPDATE announcements SET pinned = 0'), insert] : [insert]);
  return c.json({ ok: true });
});

adminAnnouncementRoutes.patch('/:id', async (c) => {
  const { pinned } = await c.req.json<{ pinned?: boolean }>();
  if (typeof pinned !== 'boolean') return c.json({ error: 'pinned must be true or false' }, 400);
  const db = c.env.DB;
  const pin = db.prepare('UPDATE announcements SET pinned = ? WHERE id = ?').bind(pinned ? 1 : 0, Number(c.req.param('id')));
  await adminWrite(c, { area: 'communicate', action: pinned ? 'pinned announcement' : 'unpinned announcement', target: c.req.param('id') }, pinned ? [db.prepare('UPDATE announcements SET pinned = 0'), pin] : [pin]);
  return c.json({ ok: true });
});

adminAnnouncementRoutes.delete('/:id', async (c) => {
  const scheduled = await c.env.DB.prepare('SELECT title FROM announcements WHERE id = ? AND sent_at IS NULL').bind(Number(c.req.param('id'))).first<{ title: string }>();
  if (scheduled) await adminWrite(c, { area: 'communicate', action: 'cancelled announcement', target: scheduled.title }, [c.env.DB.prepare('DELETE FROM announcements WHERE id = ? AND sent_at IS NULL').bind(Number(c.req.param('id')))]);
  if (!scheduled) return c.json({ error: 'Only a scheduled announcement can be cancelled' }, 409);
  return c.json({ ok: true });
});

export async function sendDueAnnouncements(env: Bindings, now: number): Promise<void> {
  const claimed = await env.DB.prepare('UPDATE announcements SET sent_at = ? WHERE sent_at IS NULL AND send_at <= ? RETURNING id, title, body, link')
    .bind(now, now)
    .all<{ id: number; title: string; body: string; link: string | null }>();
  for (const item of claimed.results) {
    const { results } = await env.DB.prepare(
      `SELECT u.id FROM users u JOIN announcements a ON a.id = ? WHERE u.active = 1 AND ${IN_AUDIENCE}`,
    )
      .bind(item.id)
      .all<{ id: number }>();
    await pushUsers(
      env,
      'announcement',
      results.map((u) => ({ userId: u.id, title: item.title, body: item.body, data: { path: '/announcements' } })),
    );
  }
}
