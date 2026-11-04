import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const SESSION_KEY = 'session';

export type Handle = { platform: string; handle: string; approved: number };

export type Me = {
  user: { id: number; name: string; batchYear: number | null };
  handles: Handle[];
  pendingReasons: { id: number; name: string }[];
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const getSession = () => SecureStore.getItemAsync(SESSION_KEY);
export const setSession = (token: string) => SecureStore.setItemAsync(SESSION_KEY, token);
export const clearSession = () => SecureStore.deleteItemAsync(SESSION_KEY);

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const token = await getSession();
  const response = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) throw new ApiError(json.error ?? 'Something went wrong', response.status);
  return json;
}
