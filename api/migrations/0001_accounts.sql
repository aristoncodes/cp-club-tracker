ALTER TABLE users ADD COLUMN username TEXT;
ALTER TABLE users ADD COLUMN username_changes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN google_sub TEXT;
ALTER TABLE users ADD COLUMN onboarding_step TEXT NOT NULL DEFAULT 'about';
ALTER TABLE users ADD COLUMN notify_hour INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN notify_rsvp INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN notify_result INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN notify_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN cf_rating_history TEXT;

-- Everyone so far signed in with Google, except admins who haven't signed in yet (no name).
UPDATE users SET email_verified = 1 WHERE name != '';

CREATE UNIQUE INDEX users_username ON users (username COLLATE NOCASE);
CREATE UNIQUE INDEX users_email_nocase ON users (email COLLATE NOCASE);
CREATE UNIQUE INDEX users_google_sub ON users (google_sub);

CREATE TABLE auth_codes (
  email TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify','reset')),
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX auth_codes_lookup ON auth_codes (email, purpose, created_at);

CREATE TABLE login_failures (
  identifier TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  locked_until INTEGER
);
