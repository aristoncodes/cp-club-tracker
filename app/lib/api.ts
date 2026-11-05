import * as SecureStore from 'expo-secure-store';
import type { BadgeId } from 'shared/badges';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const SESSION_KEY = 'session';

export type Handle = { platform: string; handle: string; approved: number; status?: string };

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
  notifyPractice: number;
  notifyRival: number;
  notifyBadges: number;
  notifyRecap: number;
  rivalId: number | null;
};

export type Me = {
  user: User;
  handles: Handle[];
  pendingReasons: { id: number; name: string }[];
  streak: number;
  unreadAnnouncements: number;
  newBadges: BadgeId[];
};

export type RivalStats = { points: number; solves: number; contests: number; duels: number };
export type Rival = { rival: null } | { rival: { id: number; name: string; username: string | null }; me: RivalStats; them: RivalStats; changeAt: number };

export type Announcement = {
  id: number;
  title: string;
  body: string;
  audience: string;
  batchYear: number | null;
  link: string | null;
  sentAt: number;
  pinned: number;
  authorName: string;
  unread: number;
};

export type Contest = {
  id: number;
  platform: string;
  name: string;
  url: string;
  startAt: number;
  kind?: string;
  mandatory?: number;
  rsvp: string | null;
  goingCount: number;
  participantCount: number;
};

export type Potd =
  | { problem: null; reason: 'needsHandle' | 'notPicked' }
  | {
      band: number;
      problem: { problemId: string; name: string; rating: number; url: string; tags: string[] | null };
      revealed: boolean;
      bonus: number;
      solvedAt: number | null;
      solvedCount: number;
      bandCount: number;
      nextAt: number;
      streak: number;
      strip: { label: string; state: 'done' | 'today' | 'other' }[];
      bonusFull: number;
      bonusRevealed: number;
      members: { userId: number; name: string; username: string | null; solvedAt: number | null }[];
    };
export type Upsolve = { contestId: number; contestName: string; endAt: number; problemId: string; name: string | null; rating: number | null; url: string | null; done: number };
export type Goal = { goal: { target: number; minRating: number } | null; done: number; locked: boolean; suggestions: Record<string, number> };

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
