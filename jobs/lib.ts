const USER_AGENT = 'cp-club-tracker/1.0 (college competitive programming club attendance tracker)';
const lastCall = new Map<string, number>();

export async function politeFetch(url: string, gapMs = 1000): Promise<Response> {
  const host = new URL(url).host;
  const wait = (lastCall.get(host) ?? 0) + gapMs - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCall.set(host, Date.now());
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response;
}

export async function postIngest(path: string, body: unknown): Promise<void> {
  const response = await fetch(`${process.env.API_URL}/api/ingest${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Ingest-Secret': process.env.INGEST_SECRET ?? '' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Ingest ${path} returned ${response.status}: ${await response.text()}`);
}
