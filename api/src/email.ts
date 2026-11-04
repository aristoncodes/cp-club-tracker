import type { Bindings } from './auth';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

export async function sendEmail(env: Bindings, to: string, subject: string, text: string): Promise<void> {
  const response = await fetch(BREVO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': env.BREVO_API_KEY },
    body: JSON.stringify({ sender: { name: 'grind.club', email: env.EMAIL_FROM }, to: [{ email: to }], subject, textContent: text }),
  });
  if (!response.ok) throw new Error(`Brevo returned ${response.status}`);
}
