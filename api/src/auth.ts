import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from 'jose';

export type Bindings = {
  DB: D1Database;
  WEB_ORIGIN: string;
  SESSION_SECRET: string;
  INGEST_SECRET: string;
  ADMIN_EMAILS: string;
  GOOGLE_CLIENT_IDS: string;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
};

type User = {
  id: number;
  email: string;
  name: string;
  batchYear: number | null;
  role: 'student' | 'admin';
  active: number;
};

export type AppEnv = { Bindings: Bindings; Variables: { user: User } };

const USER_COLUMNS = 'id, email, name, batch_year AS batchYear, role, active';
const SESSION_DAYS = 30;
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

const sessionKey = (env: Bindings) => new TextEncoder().encode(env.SESSION_SECRET);

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

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/google', async (c) => {
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
    .bind(email, String(payload.name ?? email), isAdmin ? 'admin' : 'student')
    .first<User>();
  if (!user?.active) return c.json({ error: 'Account is not active' }, 403);

  const token = await new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(sessionKey(c.env));
  return c.json({ token, user });
});
