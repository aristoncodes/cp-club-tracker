import { Hono } from 'hono';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { signSession, USER_COLUMNS, type AppEnv, type Bindings, type User } from './auth';
import { sendEmail } from './email';
import { constantTimeEqual, hashCode, hashPassword, randomCode, verifyPassword } from './secrets';

const USERNAME = /^[a-z0-9_.]{3,20}$/;
const RESERVED_USERNAMES = ['admin', 'root', 'support', 'grind', 'club', 'api', 'me', 'settings'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const CODE_TTL = 600;
const CODE_ATTEMPTS = 5;
const RESEND_AFTER = 60;
const SENDS_PER_HOUR = 5;
const HOUR = 3600;
const LOGIN_ATTEMPTS = 5;
const LOCK_SECONDS = 900;
const STEPS = ['verify', 'about', 'handles', 'notified', 'done'];
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

const CODE_EMAILS: Record<string, { subject: string; line: string }> = {
  verify: { subject: 'Your grind.club code', line: 'Your grind.club verification code is' },
  reset: { subject: 'Reset your grind.club password', line: 'Your grind.club password reset code is' },
};

export function usernameError(username: string): string | null {
  if (!USERNAME.test(username)) return 'Use 3–20 lowercase letters, numbers, _ or .';
  if (RESERVED_USERNAMES.includes(username)) return "That name isn't available";
  return null;
}

export const normalizeUsername = (value: unknown) => String(value ?? '').trim().toLowerCase();

export function canAdvance(
  current: string,
  target: string,
  profile: { hasUsername: boolean; hasBatch: boolean; hasRequiredHandles: boolean },
): boolean {
  const from = STEPS.indexOf(current);
  const to = STEPS.indexOf(target);
  if (from < 1 || to !== from + 1) return false;
  if (target === 'handles') return profile.hasUsername && profile.hasBatch;
  if (target === 'notified') return profile.hasRequiredHandles;
  return true;
}

export function resendBlocked(sendTimes: number[], now: number): boolean {
  const recent = sendTimes.filter((at) => at > now - HOUR);
  return recent.length >= SENDS_PER_HOUR || recent.some((at) => at > now - RESEND_AFTER);
}

export function codeUsable(row: { expires_at: number; attempts: number } | null, now: number): boolean {
  return !!row && row.expires_at > now && row.attempts < CODE_ATTEMPTS;
}

export function isLocked(row: { locked_until: number | null } | null, now: number): boolean {
  return !!row?.locked_until && row.locked_until > now;
}

const isAdminEmail = (env: Bindings, email: string) => env.ADMIN_EMAILS.toLowerCase().split(',').includes(email);

async function sendCode(env: Bindings, email: string, purpose: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const { results } = await env.DB.prepare('SELECT created_at FROM auth_codes WHERE email = ? AND purpose = ? AND created_at > ?')
    .bind(email, purpose, now - HOUR)
    .all<{ created_at: number }>();
  if (resendBlocked(results.map((r) => r.created_at), now)) return;

  const code = randomCode();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM auth_codes WHERE created_at <= ?').bind(now - HOUR),
    env.DB.prepare('INSERT INTO auth_codes (email, purpose, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').bind(
      email,
      purpose,
      await hashCode(env.SESSION_SECRET, email, purpose, code),
      now + CODE_TTL,
      now,
    ),
  ]);
  const { subject, line } = CODE_EMAILS[purpose];
  try {
    await sendEmail(env, email, subject, `${line} ${code}. It expires in 10 minutes.`);
  } catch (err) {
    console.error('Sending a code failed:', err instanceof Error ? err.message : 'unknown error');
  }
}

async function checkCode(env: Bindings, email: string, purpose: string, code: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    'SELECT rowid AS id, code_hash, expires_at, attempts FROM auth_codes WHERE email = ? AND purpose = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
  )
    .bind(email, purpose)
    .first<{ id: number; code_hash: string; expires_at: number; attempts: number }>();
  if (!row || !codeUsable(row, now)) return false;
  if (!constantTimeEqual(await hashCode(env.SESSION_SECRET, email, purpose, code), row.code_hash)) {
    await env.DB.prepare('UPDATE auth_codes SET attempts = attempts + 1 WHERE rowid = ?').bind(row.id).run();
    return false;
  }
  await env.DB.prepare('UPDATE auth_codes SET expires_at = 0 WHERE email = ? AND purpose = ?').bind(email, purpose).run();
  return true;
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
  if (typeof payload.email !== 'string' || !payload.email_verified || !payload.sub) {
    return c.json({ error: 'Google account has no verified email' }, 401);
  }

  const email = payload.email.toLowerCase();
  // An unverified password may belong to someone who signed up with this person's email, so it goes.
  const user = await c.env.DB.prepare(
    `INSERT INTO users (email, name, role, google_sub, email_verified, created_at) VALUES (?1, ?2, ?3, ?4, 1, unixepoch())
     ON CONFLICT (email) DO UPDATE SET
       name = CASE WHEN users.name = '' THEN excluded.name ELSE users.name END,
       role = CASE WHEN excluded.role = 'admin' THEN 'admin' ELSE users.role END,
       google_sub = excluded.google_sub,
       password_hash = CASE WHEN users.email_verified = 1 THEN users.password_hash END,
       onboarding_step = CASE WHEN users.onboarding_step = 'verify' THEN 'about' ELSE users.onboarding_step END,
       email_verified = 1
     RETURNING ${USER_COLUMNS}`,
  )
    .bind(email, String(payload.name ?? ''), isAdminEmail(c.env, email) ? 'admin' : 'student', payload.sub)
    .first<User>();
  if (!user?.active) return c.json({ error: 'Account is not active' }, 403);
  return c.json({ token: await signSession(c.env, user), user });
});

accountRoutes.post('/signup', async (c) => {
  const { email: rawEmail, password } = await c.req.json<{ email?: string; password?: string }>();
  const email = String(rawEmail ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) return c.json({ error: 'Enter a valid email' }, 400);
  if (String(password ?? '').length < MIN_PASSWORD) return c.json({ error: 'Use at least 8 characters' }, 400);

  const passwordHash = await hashPassword(String(password));
  const result = await c.env.DB.prepare(
    `INSERT INTO users (email, name, password_hash, onboarding_step, created_at) VALUES (?1, '', ?2, 'verify', unixepoch())
     ON CONFLICT (email) DO UPDATE SET password_hash = excluded.password_hash, onboarding_step = 'verify'
     WHERE users.email_verified = 0`,
  )
    .bind(email, passwordHash)
    .run();
  if (result.meta.changes) await sendCode(c.env, email, 'verify');
  return c.json({ ok: true });
});

accountRoutes.post('/verify', async (c) => {
  const { email: rawEmail, code } = await c.req.json<{ email?: string; code?: string }>();
  const email = String(rawEmail ?? '').trim().toLowerCase();
  if (!(await checkCode(c.env, email, 'verify', String(code ?? '')))) return c.json({ error: "That code didn't work" }, 400);
  const user = await c.env.DB.prepare(
    `UPDATE users SET email_verified = 1, onboarding_step = 'about',
       role = CASE WHEN ?2 THEN 'admin' ELSE role END
     WHERE email = ?1 RETURNING ${USER_COLUMNS}`,
  )
    .bind(email, isAdminEmail(c.env, email) ? 1 : 0)
    .first<User>();
  if (!user) return c.json({ error: "That code didn't work" }, 400);
  return c.json({ token: await signSession(c.env, user), user });
});

accountRoutes.post('/resend', async (c) => {
  const { email: rawEmail, purpose } = await c.req.json<{ email?: string; purpose?: string }>();
  const email = String(rawEmail ?? '').trim().toLowerCase();
  if (purpose !== 'verify' && purpose !== 'reset') return c.json({ error: 'Unknown purpose' }, 400);
  const row = await c.env.DB.prepare('SELECT email_verified AS verified FROM users WHERE email = ?').bind(email).first<{ verified: number }>();
  if (row && (purpose === 'reset' || !row.verified)) await sendCode(c.env, email, purpose);
  return c.json({ ok: true });
});

accountRoutes.post('/login', async (c) => {
  const { identifier: rawIdentifier, password } = await c.req.json<{ identifier?: string; password?: string }>();
  const identifier = String(rawIdentifier ?? '').trim().toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  const db = c.env.DB;
  const failure = await db.prepare('SELECT failures, locked_until FROM login_failures WHERE identifier = ?')
    .bind(identifier)
    .first<{ failures: number; locked_until: number | null }>();
  if (isLocked(failure, now)) return c.json({ error: 'Too many tries. Please wait 15 minutes.' }, 429);

  const row = await db
    .prepare(`SELECT ${USER_COLUMNS}, password_hash AS passwordHash, email_verified AS emailVerified FROM users WHERE ${identifier.includes('@') ? 'email' : 'username'} = ?`)
    .bind(identifier)
    .first<User & { passwordHash: string | null; emailVerified: number }>();
  // Hash even when there's no account, so response time doesn't reveal which identifiers exist.
  const valid = row?.passwordHash ? await verifyPassword(String(password ?? ''), row.passwordHash) : !(await hashPassword(String(password ?? '')));

  if (!row || !valid) {
    const failures = (failure?.failures ?? 0) + 1;
    await db
      .prepare(
        `INSERT INTO login_failures (identifier, failures, locked_until) VALUES (?1, ?2, ?3)
         ON CONFLICT (identifier) DO UPDATE SET failures = excluded.failures, locked_until = excluded.locked_until`,
      )
      .bind(identifier, failures >= LOGIN_ATTEMPTS ? 0 : failures, failures >= LOGIN_ATTEMPTS ? now + LOCK_SECONDS : null)
      .run();
    return c.json({ error: "That email, username or password isn't right" }, 401);
  }

  await db.prepare('DELETE FROM login_failures WHERE identifier = ?').bind(identifier).run();
  if (!row.emailVerified) return c.json({ error: 'verify', email: row.email }, 403);
  if (!row.active) return c.json({ error: 'Account is not active' }, 403);
  const { passwordHash: _hash, emailVerified: _verified, ...user } = row;
  return c.json({ token: await signSession(c.env, user), user });
});

accountRoutes.post('/forgot', async (c) => {
  const { email: rawEmail } = await c.req.json<{ email?: string }>();
  const email = String(rawEmail ?? '').trim().toLowerCase();
  const row = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (row) await sendCode(c.env, email, 'reset');
  return c.json({ ok: true });
});

accountRoutes.post('/reset', async (c) => {
  const { email: rawEmail, code, password } = await c.req.json<{ email?: string; code?: string; password?: string }>();
  const email = String(rawEmail ?? '').trim().toLowerCase();
  if (String(password ?? '').length < MIN_PASSWORD) return c.json({ error: 'Use at least 8 characters' }, 400);
  if (!(await checkCode(c.env, email, 'reset', String(code ?? '')))) return c.json({ error: "That code didn't work" }, 400);
  const user = await c.env.DB.prepare(
    `UPDATE users SET password_hash = ?, email_verified = 1,
       onboarding_step = CASE WHEN onboarding_step = 'verify' THEN 'about' ELSE onboarding_step END
     WHERE email = ? RETURNING ${USER_COLUMNS}`,
  )
    .bind(await hashPassword(String(password)), email)
    .first<User>();
  if (!user) return c.json({ error: "That code didn't work" }, 400);
  await c.env.DB.prepare('DELETE FROM login_failures WHERE identifier IN (?, ?)').bind(email, user.username ?? '').run();
  return c.json({ token: await signSession(c.env, user), user });
});

accountRoutes.get('/username-available', async (c) => {
  const username = normalizeUsername(c.req.query('u'));
  const error = usernameError(username);
  if (error) return c.json({ available: false, error });
  const taken = await c.env.DB.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').bind(username).first();
  return c.json(taken ? { available: false, error: 'That name is taken' } : { available: true });
});
