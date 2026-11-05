-- These two are rebuilt because SQLite can't change a CHECK: attendance gains 'excused', contests gains the 'other' platform.
PRAGMA defer_foreign_keys = true;

CREATE TABLE attendance_new (
  contest_id INTEGER NOT NULL REFERENCES contests(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  rsvp TEXT CHECK (rsvp IN ('yes','no')),
  status TEXT CHECK (status IN ('present','absent','excused')),
  reason_type TEXT CHECK (reason_type IN ('exams','travel','illness','clash','forgot','other')),
  reason_text TEXT,
  manual INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  exam_week_id INTEGER,
  claimed_at INTEGER,
  PRIMARY KEY (contest_id, user_id)
);
INSERT INTO attendance_new (contest_id, user_id, rsvp, status, reason_type, reason_text)
  SELECT contest_id, user_id, rsvp, status, reason_type, reason_text FROM attendance;
DROP TABLE attendance;
ALTER TABLE attendance_new RENAME TO attendance;
CREATE INDEX attendance_by_user ON attendance (user_id, contest_id);

-- Recreated under its own name: putting the rows back is what clears the foreign-key violations the DROP leaves on attendance, upsolves and the virtual tables. A rename wouldn't.
CREATE TABLE contests_copy AS SELECT * FROM contests;
DROP TABLE contests;
CREATE TABLE contests (
  id INTEGER PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('cf','cc','other')),
  external_id TEXT NOT NULL,
  alt_external_id TEXT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  counts INTEGER NOT NULL DEFAULT 1,
  stage INTEGER NOT NULL DEFAULT 0,
  upsolve_pushes INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'round' CHECK (kind IN ('round','virtual')),
  mandatory INTEGER NOT NULL DEFAULT 0,
  mandatory_reminded INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'cf' CHECK (source IN ('cf','cc','gym','other','offline')),
  UNIQUE (platform, external_id)
);
INSERT INTO contests (id, platform, external_id, alt_external_id, name, url, start_at, end_at, counts, stage, upsolve_pushes, kind, source)
  SELECT id, platform, external_id, alt_external_id, name, url, start_at, end_at, counts, stage, upsolve_pushes, kind, platform FROM contests_copy;
DROP TABLE contests_copy;

ALTER TABLE handles ADD COLUMN status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','approved','rejected'));
ALTER TABLE handles ADD COLUMN reviewed_by INTEGER REFERENCES users(id);
ALTER TABLE handles ADD COLUMN reviewed_at INTEGER;
UPDATE handles SET status = 'approved', reviewed_at = approved_at WHERE approved_at IS NOT NULL;

ALTER TABLE users ADD COLUMN deactivated_at INTEGER;
UPDATE users SET deactivated_at = unixepoch() WHERE active = 0;

ALTER TABLE solves ADD COLUMN voided_points REAL;

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value REAL NOT NULL,
  pending_value REAL,
  pending_from INTEGER,
  updated_by INTEGER REFERENCES users(id),
  updated_at INTEGER
) WITHOUT ROWID;
INSERT INTO settings (key, value) VALUES
  ('potd_bonus', 5),
  ('potd_bonus_revealed', 2),
  ('live_multiplier', 1.5),
  ('fairness_max_solves', 30),
  ('fairness_fast_count', 3),
  ('fairness_fast_minutes', 20),
  ('fairness_fast_gap', 400),
  ('fairness_match_minutes', 10),
  ('risk_no_solve_days', 7),
  ('risk_absences', 2),
  ('risk_attendance_drop', 20),
  ('nudge_gap_days', 3),
  ('snooze_days', 14),
  ('attendance_goal', 70),
  ('reason_inbox_days', 2),
  ('exam_grace_days', 3),
  ('mom_min_solves', 10),
  ('potd_push_minute', 480),
  ('mandatory_reminder_hours', 3),
  ('streak_push_minute', 1260),
  ('recap_push_minute', 1260);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES users(id),
  area TEXT NOT NULL CHECK (area IN ('attendance','handles','fairness','admins','rules','members','contests','sessions','seasons','communicate')),
  action TEXT NOT NULL,
  target TEXT,
  before TEXT,
  after TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX audit_by_time ON audit_log (at);
CREATE INDEX audit_by_area ON audit_log (area, at);

CREATE TABLE admin_notes (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  admin_id INTEGER NOT NULL REFERENCES users(id),
  text TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE TABLE exam_weeks (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  from_at INTEGER NOT NULL,
  to_at INTEGER NOT NULL,
  excuse INTEGER NOT NULL DEFAULT 1,
  mute_practice INTEGER NOT NULL DEFAULT 1,
  hide_at_risk INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE exam_week_batches (
  exam_week_id INTEGER NOT NULL REFERENCES exam_weeks(id),
  batch_year INTEGER NOT NULL,
  PRIMARY KEY (exam_week_id, batch_year)
) WITHOUT ROWID;

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  start_at INTEGER NOT NULL,
  room TEXT,
  practice_url TEXT,
  contest_id INTEGER REFERENCES contests(id),
  remind INTEGER NOT NULL DEFAULT 0,
  reminded INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE session_batches (
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  batch_year INTEGER NOT NULL,
  PRIMARY KEY (session_id, batch_year)
) WITHOUT ROWID;
CREATE TABLE session_checkins (
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  at INTEGER NOT NULL,
  PRIMARY KEY (session_id, user_id)
) WITHOUT ROWID;

CREATE TABLE fairness_flags (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  rule TEXT NOT NULL CHECK (rule IN ('max_solves','fast_solves','matching_solves','duel_problem')),
  day INTEGER NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('high','medium')),
  evidence TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','cleared','adjusted','voided')),
  reason TEXT,
  decided_by INTEGER REFERENCES users(id),
  decided_at INTEGER,
  UNIQUE (user_id, rule, day)
);
CREATE INDEX fairness_by_status ON fairness_flags (status, day);

CREATE TABLE point_adjustments (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  flag_id INTEGER REFERENCES fairness_flags(id),
  kind TEXT NOT NULL CHECK (kind IN ('adjust','void')),
  points REAL NOT NULL,
  solves TEXT,
  reason TEXT NOT NULL,
  admin_id INTEGER NOT NULL REFERENCES users(id),
  at INTEGER NOT NULL,
  undone_at INTEGER
);
CREATE INDEX adjustments_by_user ON point_adjustments (user_id, at);

CREATE TABLE seasons (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  frozen_at INTEGER,
  board TEXT
);
CREATE TABLE member_of_month (
  month TEXT PRIMARY KEY,
  auto_user_id INTEGER REFERENCES users(id),
  user_id INTEGER REFERENCES users(id),
  candidates TEXT NOT NULL,
  announced_at INTEGER
) WITHOUT ROWID;

CREATE TABLE at_risk (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  signals TEXT NOT NULL,
  built_at INTEGER NOT NULL,
  snoozed_until INTEGER
);
CREATE TABLE nudges (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  admin_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX nudges_by_user ON nudges (user_id, at);

CREATE TABLE stats_daily (
  day INTEGER NOT NULL,
  batch_year INTEGER NOT NULL,
  key TEXT NOT NULL,
  value REAL NOT NULL,
  PRIMARY KEY (day, batch_year, key)
) WITHOUT ROWID;
