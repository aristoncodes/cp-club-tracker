const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

export type PushMessage = {
  to: string;
  body: string;
  data?: Record<string, unknown>;
  categoryId?: string;
};

type PushTicket = { status: string; details?: { error?: string } };

export async function sendPushes(db: D1Database, messages: PushMessage[]): Promise<void> {
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch.map((m) => ({ ...m, channelId: 'contests', priority: 'high' }))),
    });
    if (!response.ok) throw new Error(`Expo push returned ${response.status}: ${await response.text()}`);

    const { data } = await response.json<{ data: PushTicket[] }>();
    const deadTokens = batch.filter((_, index) => data[index]?.details?.error === 'DeviceNotRegistered');
    if (deadTokens.length) {
      const remove = db.prepare('DELETE FROM push_tokens WHERE token = ?');
      await db.batch(deadTokens.map((m) => remove.bind(m.to)));
    }
  }
}
