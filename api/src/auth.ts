import { createMiddleware } from 'hono/factory';
import { jwtVerify, SignJWT, type JWTPayload } from 'jose';

export type Bindings = {
  DB: D1Database;
  WEB_ORIGIN: string;
  APP_LATEST: string;
  APP_MIN: string;
  APP_URL: string;
  APP_NOTES: string;
  SESSION_SECRET: string;
  INGEST_SECRET: string;
  ADMIN_EMAILS: string;
  GOOGLE_CLIENT_IDS: string;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
};

export type User = {
  id: number;
  email: string;
  name: string;
  username: string | null;
  usernameChangesLeft: number;
  batchYear: number | null;
  role: 'student' | 'admin';
  active: number;
  onboardingStep: string;
  cfRating: number | null;
  notifyHour: number;
  notifyRsvp: number;
  notifyResult: number;
  notifyStreak: number;
  notifyMeals: number;
};

export type AppEnv = { Bindings: Bindings; Variables: { user: User } };

export const USER_COLUMNS = `id, email, name, username, 1 - username_changes AS usernameChangesLeft, batch_year AS batchYear,
  role, active, onboarding_step AS onboardingStep,
  cf_rating AS cfRating, notify_hour AS notifyHour, notify_rsvp AS notifyRsvp, notify_result AS notifyResult, notify_streak AS notifyStreak, notify_meals AS notifyMeals`;
const SESSION_DAYS = 30;

const sessionKey = (env: Bindings) => new TextEncoder().encode(env.SESSION_SECRET);

export function signSession(env: Bindings, user: User): Promise<string> {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(sessionKey(env));
}

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer /, '') ?? '';
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, sessionKey(c.env), { algorithms: ['HS256'] }));
  } catch {
    return c.json({ error: 'Sign in required' }, 401);
  }
  const user = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
    .bind(Number(payload.sub))
    .first<User>();
  if (!user?.active) return c.json({ error: 'Account is not active' }, 403);
  c.set('user', user);
  await next();
});

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('user').role !== 'admin') return c.json({ error: 'Admins only' }, 403);
  await next();
});
