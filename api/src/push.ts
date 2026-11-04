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

type PushTicket = { status: string; details?: { error?: string } };

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
