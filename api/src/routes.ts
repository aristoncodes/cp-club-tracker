import { Hono } from 'hono';
import { requireUser, type AppEnv } from './auth';

const PLATFORMS = ['cf', 'cc', 'atcoder', 'leetcode'];
const REASON_TYPES = ['exams', 'travel', 'illness', 'clash', 'forgot', 'other'];

type ReasonBody = { reasonType?: string; reasonText?: string };

function reasonError({ reasonType, reasonText }: ReasonBody): string | null {
  if (!reasonType || !REASON_TYPES.includes(reasonType)) return 'A valid reason type is required';
  if (reasonType === 'other' && !reasonText?.trim()) return 'Please say a little about the reason';
  return null;
}

export const studentRoutes = new Hono<AppEnv>();

studentRoutes.use(requireUser);

studentRoutes.get('/me', async (c) => {
  const user = c.get('user');
  const [handles, pendingReasons] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT platform, handle, approved_at IS NOT NULL AS approved FROM handles WHERE user_id = ?`,
    ).bind(user.id),
    c.env.DB.prepare(
      `SELECT c.id, c.name FROM attendance a JOIN contests c ON c.id = a.contest_id
       WHERE a.user_id = ? AND a.status = 'absent' AND a.reason_type IS NULL AND c.counts = 1
       ORDER BY c.start_at DESC`,
    ).bind(user.id),
  ]);
  return c.json({ user, handles: handles.results, pendingReasons: pendingReasons.results });
});

studentRoutes.put('/me', async (c) => {
  const { name, batchYear } = await c.req.json<{ name?: string; batchYear?: number }>();
  if (!name?.trim() || !Number.isInteger(batchYear)) {
    return c.json({ error: 'Name and batch year are required' }, 400);
  }
  await c.env.DB.prepare('UPDATE users SET name = ?, batch_year = ? WHERE id = ?')
    .bind(name.trim(), batchYear, c.get('user').id)
    .run();
  return c.json({ ok: true });
});

studentRoutes.put('/me/handles/:platform', async (c) => {
  const platform = c.req.param('platform');
  const { handle } = await c.req.json<{ handle?: string }>();
  if (!PLATFORMS.includes(platform)) return c.json({ error: 'Unknown platform' }, 400);
  if (!handle?.trim()) return c.json({ error: 'Handle is required' }, 400);
  try {
    await c.env.DB.prepare(
      `INSERT INTO handles (user_id, platform, handle) VALUES (?, ?, ?)
       ON CONFLICT (user_id, platform) DO UPDATE SET
         handle = excluded.handle,
         approved_at = CASE WHEN handle = excluded.handle THEN approved_at END,
         broken = CASE WHEN handle = excluded.handle THEN broken ELSE 0 END,
         synced_at = CASE WHEN handle = excluded.handle THEN synced_at END`,
    )
      .bind(c.get('user').id, platform, handle.trim())
      .run();
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      return c.json({ error: 'That handle is already linked to another student' }, 409);
    }
    throw err;
  }
  return c.json({ ok: true });
});

studentRoutes.post('/me/push-token', async (c) => {
  const { token, kind } = await c.req.json<{ token?: string; kind?: string }>();
  if (!token || (kind !== 'expo' && kind !== 'web')) {
    return c.json({ error: 'token and a valid kind are required' }, 400);
  }
  await c.env.DB.prepare('INSERT OR REPLACE INTO push_tokens (token, user_id, kind) VALUES (?, ?, ?)')
    .bind(token, c.get('user').id, kind)
    .run();
  return c.json({ ok: true });
});

studentRoutes.get('/contests/upcoming', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.platform, c.name, c.url, c.start_at AS startAt, a.rsvp
     FROM contests c LEFT JOIN attendance a ON a.contest_id = c.id AND a.user_id = ?
     WHERE c.counts = 1 AND c.start_at > unixepoch()
     ORDER BY c.start_at LIMIT 10`,
  )
    .bind(c.get('user').id)
    .all();
  return c.json(results);
});

studentRoutes.post('/contests/:id/rsvp', async (c) => {
  const userId = c.get('user').id;
  const contestId = Number(c.req.param('id'));
  const body = await c.req.json<ReasonBody & { going?: boolean }>();
  if (typeof body.going !== 'boolean') return c.json({ error: 'going must be true or false' }, 400);
  const invalid = body.going ? null : reasonError(body);
  if (invalid) return c.json({ error: invalid }, 400);

  const contest = await c.env.DB.prepare(
    `SELECT c.stage FROM contests c
     JOIN handles h ON h.platform = c.platform AND h.user_id = ? AND h.approved_at IS NOT NULL
     WHERE c.id = ? AND c.counts = 1`,
  )
    .bind(userId, contestId)
    .first<{ stage: number }>();
  if (!contest) return c.json({ error: 'Contest not found' }, 404);
  if (contest.stage === 4) return c.json({ error: 'This contest has already been verified' }, 409);

  await c.env.DB.prepare(
    `INSERT INTO attendance (contest_id, user_id, rsvp, reason_type, reason_text) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (contest_id, user_id) DO UPDATE SET
       rsvp = excluded.rsvp,
       reason_type = excluded.reason_type,
       reason_text = excluded.reason_text`,
  )
    .bind(
      contestId,
      userId,
      body.going ? 'yes' : 'no',
      body.going ? null : body.reasonType,
      body.going ? null : body.reasonText?.trim() || null,
    )
    .run();
  return c.json({ ok: true });
});

studentRoutes.post('/contests/:id/reason', async (c) => {
  const body = await c.req.json<ReasonBody>();
  const invalid = reasonError(body);
  if (invalid) return c.json({ error: invalid }, 400);
  const result = await c.env.DB.prepare(
    `UPDATE attendance SET reason_type = ?, reason_text = ?
     WHERE contest_id = ? AND user_id = ? AND status = 'absent'`,
  )
    .bind(body.reasonType, body.reasonText?.trim() || null, Number(c.req.param('id')), c.get('user').id)
    .run();
  if (!result.meta.changes) return c.json({ error: 'You were not marked absent for this contest' }, 409);
  return c.json({ ok: true });
});
