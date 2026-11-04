const USER_AGENT = 'cp-club-tracker/1.0 (college competitive programming club attendance tracker)';
const lastCall = new Map<string, number>();

export async function politeFetch(url: string, gapMs = 1000, init: RequestInit = {}): Promise<Response> {
  const host = new URL(url).host;
  const wait = (lastCall.get(host) ?? 0) + gapMs - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCall.set(host, Date.now());
  return fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...init.headers } });
}

function ingestUrl(path: string): string {
  return `${process.env.API_URL}/api/ingest${path}`;
}

const secretHeader = () => ({ 'X-Ingest-Secret': process.env.INGEST_SECRET ?? '' });

export async function postIngest(path: string, body: unknown): Promise<void> {
  const response = await fetch(ingestUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...secretHeader() },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Ingest ${path} returned ${response.status}: ${await response.text()}`);
}

export async function getHandles(platform: string): Promise<string[]> {
  const response = await fetch(ingestUrl(`/handles?platform=${platform}`), { headers: secretHeader() });
  if (!response.ok) throw new Error(`Handles for ${platform} returned ${response.status}`);
  return response.json() as Promise<string[]>;
}
