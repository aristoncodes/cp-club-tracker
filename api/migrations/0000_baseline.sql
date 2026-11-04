CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  batch_year INTEGER,                        -- year the student joined; shown as 1st to 4th year
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin')),
  active INTEGER NOT NULL DEFAULT 1,
  cf_rating INTEGER,                         -- NULL = unrated
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS push_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('expo','web'))
);

CREATE TABLE IF NOT EXISTS handles (
  user_id INTEGER NOT NULL REFERENCES users(id),
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  approved_at INTEGER,                       -- NULL = not approved; solves before this don't score
  broken INTEGER NOT NULL DEFAULT 0,         -- platform says the handle doesn't exist
  synced_at INTEGER,
  PRIMARY KEY (user_id, platform),
  UNIQUE (platform, handle)
);

CREATE TABLE IF NOT EXISTS contests (
  id INTEGER PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('cf','cc')),
  external_id TEXT NOT NULL,                 -- CF contest id / CC contest code
  alt_external_id TEXT,                      -- parallel CF Div. 1 round, checked too
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  counts INTEGER NOT NULL DEFAULT 1,
  stage INTEGER NOT NULL DEFAULT 0,          -- 0 new, 1 reminded, 2 rsvp sent, 3 verify requested, 4 verified
  UNIQUE (platform, external_id)
);

CREATE TABLE IF NOT EXISTS attendance (
  contest_id INTEGER NOT NULL REFERENCES contests(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  rsvp TEXT CHECK (rsvp IN ('yes','no')),
  status TEXT CHECK (status IN ('present','absent')),
  reason_type TEXT CHECK (reason_type IN ('exams','travel','illness','clash','forgot','other')),
  reason_text TEXT,
  PRIMARY KEY (contest_id, user_id)
);

CREATE TABLE IF NOT EXISTS problems (
  platform TEXT NOT NULL,
  problem_id TEXT NOT NULL,                  -- cf: "1900C", cc: code, etc.
  name TEXT,
  rating INTEGER,                            -- platform's own difficulty (leetcode: Easy/Medium/Hard)
  tags TEXT,                                 -- JSON array of strings
  url TEXT,
  PRIMARY KEY (platform, problem_id)
);

CREATE TABLE IF NOT EXISTS solves (
  user_id INTEGER NOT NULL REFERENCES users(id),
  platform TEXT NOT NULL,
  problem_id TEXT NOT NULL,
  solved_at INTEGER NOT NULL,
  live INTEGER NOT NULL DEFAULT 0,
  rp INTEGER NOT NULL,                       -- Codeforces-equivalent rating at insert
  points REAL NOT NULL,
  PRIMARY KEY (user_id, platform, problem_id)
);
CREATE INDEX IF NOT EXISTS solves_by_time ON solves (solved_at);
