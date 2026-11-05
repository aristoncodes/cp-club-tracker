const API_URL = import.meta.env.VITE_API_URL;
const SESSION_KEY = 'session';

export type Handle = { platform: string; handle: string; approved: number };
export type User = {
  id: number;
  email: string;
  name: string;
  username: string | null;
  usernameChangesLeft: number;
  batchYear: number | null;
  role: string;
  onboardingStep: string;
  cfRating: number | null;
  notifyHour: number;
  notifyRsvp: number;
  notifyResult: number;
  notifyStreak: number;
  notifyMeals: number;
};

export type Contest = {
  id: number;
  platform: string;
  name: string;
  url: string;
  startAt: number;
  endAt: number;
  rsvp: string | null;
  goingCount: number;
  participantCount: number;
};

export type PastContest = {
  id: number;
  platform: string;
  name: string;
  url: string;
  startAt: number;
  status: string | null;
  rsvp: string | null;
  reasonType: string | null;
  reasonText: string | null;
  liveSolves: number;
  ratingDelta: number | null;
};

export type Me = {
  user: User;
  handles: Handle[];
  pendingReasons: { id: number; name: string }[];
  streak: number;
  unreadAnnouncements: number;
};

export type Announcement = {
  id: number;
  title: string;
  body: string;
  audience: string;
  batchYear: number | null;
  link: string | null;
  sentAt: number | null;
  pinned: number;
  authorName: string;
  unread?: number;
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
