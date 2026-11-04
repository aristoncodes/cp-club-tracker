const API_URL = import.meta.env.VITE_API_URL;
const SESSION_KEY = 'session';

export type Handle = { platform: string; handle: string; approved: number };
export type Me = {
  user: { id: number; email: string; name: string; batchYear: number | null; role: string };
  handles: Handle[];
  pendingReasons: { id: number; name: string }[];
  streak: number;
};

export function getSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function setSession(token: string | null): void {
  try {
    if (token) localStorage.setItem(SESSION_KEY, token);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Without storage the session lasts only until the next page load.
  }
}

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getSession()}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json();
  if (response.status === 401 && getSession()) {
    setSession(null);
    window.location.assign('/login');
  }
  if (!response.ok) throw new Error(json.error ?? 'Something went wrong');
  return json;
}
