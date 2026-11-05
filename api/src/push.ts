import type { Bindings } from './auth';
import { sendWebPush } from './web-push';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

export type PushMessage = {
  to: string;
  title?: string;
  body: string;
  data?: Record<string, unknown>;
  categoryId?: string;
};

type PushTicket = { status: string; message?: string; details?: { error?: string } };

// DeviceNotRegistered only means an old phone; anything else means nobody is getting pushes, so the health check reports it.
export function ticketErrors(tickets: PushTicket[]): string[] {
  const errors = tickets.filter((t) => t.status === 'error' && t.details?.error !== 'DeviceNotRegistered');
  return [...new Set(errors.map((t) => t.details?.error ?? t.message ?? 'Unknown push error'))];
}

// Web push subscriptions are stored as JSON; Expo tokens are plain strings.
const isWebSubscription = (token: string) => token.startsWith('{');

async function deleteTokens(db: D1Database, tokens: string[]): Promise<void> {
  if (!tokens.length) return;
  const remove = db.prepare('DELETE FROM push_tokens WHERE token = ?');
  await db.batch(tokens.map((token) => remove.bind(token)));
}

async function sendExpo(db: D1Database, messages: PushMessage[]): Promise<void> {
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch.map((m) => ({ ...m, channelId: 'contests', priority: 'high' }))),
    });
    if (!response.ok) throw new Error(`Expo push returned ${response.status}: ${await response.text()}`);

    const { data } = await response.json<{ data: PushTicket[] }>();
    const errors = ticketErrors(data);
    if (errors.length) {
      const record = db.prepare('INSERT INTO push_errors (at, error) VALUES (unixepoch(), ?)');
      await db.batch(errors.map((error) => record.bind(error)));
    }
    await deleteTokens(
      db,
      batch.filter((_, index) => data[index]?.details?.error === 'DeviceNotRegistered').map((m) => m.to),
    );
  }
}

async function sendWeb(env: Bindings, messages: PushMessage[]): Promise<void> {
  const dead: string[] = [];
  for (const message of messages) {
    const payload = JSON.stringify({ title: message.title, body: message.body, data: message.data ?? {} });
    try {
      if (await sendWebPush(env, message.to, payload)) dead.push(message.to);
    } catch (err) {
      console.error('Web push failed:', err);
    }
  }
  await deleteTokens(env.DB, dead);
}

export async function sendPushes(env: Bindings, messages: PushMessage[]): Promise<void> {
  await sendWeb(env, messages.filter((m) => isWebSubscription(m.to)));
  await sendExpo(env.DB, messages.filter((m) => !isWebSubscription(m.to)));
}

export type PushPreference = 'notify_practice' | 'notify_rival' | 'notify_badges' | 'notify_recap';
export type UserPush = Omit<PushMessage, 'to'> & { userId: number };

// Sends each message to all of a member's devices. push_log drops a second push of the same type in the same minute.
export async function pushUsers(env: Bindings, type: string, messages: UserPush[], preference?: PushPreference): Promise<void> {
  if (!messages.length) return;
  const db = env.DB;
  const minute = Math.floor(Date.now() / 60_000);
  const log = db.prepare('INSERT OR IGNORE INTO push_log (user_id, type, minute) VALUES (?, ?, ?) RETURNING user_id');
  const logged = await db.batch<{ user_id: number }>(messages.map((m) => log.bind(m.userId, type, minute)));
  const fresh = logged.flatMap((result) => result.results.map((row) => row.user_id));
  const { results } = await db
    .prepare(
      `SELECT p.token, p.user_id AS userId FROM push_tokens p JOIN users u ON u.id = p.user_id
       WHERE u.active = 1 ${preference ? `AND u.${preference} = 1` : ''} AND p.user_id IN (SELECT value FROM json_each(?))`,
    )
    .bind(JSON.stringify(fresh))
    .all<{ token: string; userId: number }>();
  await sendPushes(
    env,
    results.flatMap(({ token, userId }) => {
      const message = messages.find((m) => m.userId === userId);
      if (!message) return [];
      const { userId: _, ...rest } = message;
      return [{ to: token, ...rest }];
    }),
  );
}
