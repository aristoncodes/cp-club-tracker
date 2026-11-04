import type { CfSubmission } from 'shared/cf';

const CF_GAP_MS = 2000;
let lastCallAt = 0;

export class CfError extends Error {}

async function cfGet<T>(path: string): Promise<T> {
  const wait = lastCallAt + CF_GAP_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCallAt = Date.now();
  const response = await fetch(`https://codeforces.com/api/${path}`);
  const body = await response.json<{ status: string; comment?: string; result: T }>();
  if (body.status !== 'OK') throw new CfError(body.comment ?? 'Codeforces request failed');
  return body.result;
}

export function fetchUserStatus(handle: string): Promise<CfSubmission[]> {
  return cfGet(`user.status?handle=${encodeURIComponent(handle)}&from=1&count=50`);
}

export function fetchUserInfo(handles: string[]): Promise<{ handle: string; rating?: number }[]> {
  return cfGet(`user.info?handles=${handles.map(encodeURIComponent).join(';')}`);
}
