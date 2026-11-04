import type { Bindings } from './auth';

export async function sendEmail(env: Bindings, to: string, subject: string, text: string): Promise<void> {
  const response = await fetch(env.EMAIL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: env.EMAIL_SECRET, to, subject, text }),
  });
  const result = response.ok ? await response.json<{ ok?: boolean }>() : null;
  if (!result?.ok) throw new Error(`Email sender returned ${response.status}`);
}
