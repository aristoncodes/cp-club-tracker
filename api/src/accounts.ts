import { Hono } from 'hono';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { signSession, USER_COLUMNS, type AppEnv, type User } from './auth';

const USERNAME = /^[a-z0-9_.]{3,20}$/;
const RESERVED_USERNAMES = ['admin', 'root', 'support', 'oops', 'grind', 'club', 'api', 'me', 'settings'];
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export function usernameError(username: string): string | null {
  if (!USERNAME.test(username)) return 'Use 3–20 lowercase letters, numbers, _ or .';
  if (RESERVED_USERNAMES.includes(username)) return "That name isn't available";
  return null;
}

const PROFILE_LINK = /^(?:https?:\/\/)?(?:www\.)?(?:codeforces\.com\/profile|codechef\.com\/users|atcoder\.jp\/users|leetcode\.com(?:\/u)?)\/([^/?#\s]+)\/?(?:[?#].*)?$/i;

// Members often paste their profile link; only the handle at the end of it is useful.
export function handleFromInput(input: string): string {
  const trimmed = input.trim();
  return trimmed.match(PROFILE_LINK)?.[1] ?? trimmed;
}

export const normalizeUsername = (value: unknown) => String(value ?? '').trim().toLowerCase();

export function canFinishOnboarding(profile: { hasUsername: boolean; hasBatch: boolean; hasRequiredHandles: boolean; isAdmin: boolean }): boolean {
  return profile.hasUsername && profile.hasBatch && (profile.hasRequiredHandles || profile.isAdmin);
}

export const accountRoutes = new Hono<AppEnv>();

accountRoutes.post('/google', async (c) => {
  const { idToken } = await c.req.json<{ idToken?: string }>();
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(idToken ?? '', googleKeys, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: c.env.GOOGLE_CLIENT_IDS.split(','),
    }));
  } catch {
    return c.json({ error: 'Invalid Google token' }, 401);
  }
  if (typeof payload.email !== 'string' || !payload.email_verified) {
    return c.json({ error: 'Google account has no verified email' }, 401);
  }

  const email = payload.email.toLowerCase();
  const isAdmin = c.env.ADMIN_EMAILS.toLowerCase().split(',').includes(email);
  const user = await c.env.DB.prepare(
    `INSERT INTO users (email, name, role, created_at) VALUES (?, ?, ?, unixepoch())
     ON CONFLICT (email) DO UPDATE SET
       name = CASE WHEN users.name = '' THEN excluded.name ELSE users.name END,
       role = CASE WHEN excluded.role = 'admin' THEN 'admin' ELSE users.role END
     RETURNING ${USER_COLUMNS}`,
  )
    .bind(email, String(payload.name ?? ''), isAdmin ? 'admin' : 'student')
    .first<User>();
  if (!user?.active) return c.json({ error: 'Account is not active' }, 403);
  return c.json({ token: await signSession(c.env, user), user });
});

accountRoutes.get('/username-available', async (c) => {
  const username = normalizeUsername(c.req.query('u'));
  const error = usernameError(username);
  if (error) return c.json({ available: false, error });
  const taken = await c.env.DB.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').bind(username).first();
  return c.json(taken ? { available: false, error: 'That name is taken' } : { available: true });
});
