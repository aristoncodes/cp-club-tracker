ALTER TABLE contests ADD COLUMN kind TEXT NOT NULL DEFAULT 'round' CHECK (kind IN ('round','virtual'));

CREATE TABLE virtual_contests (
  contest_id INTEGER PRIMARY KEY REFERENCES contests(id),
  cf_contest_id INTEGER NOT NULL,
  problems TEXT NOT NULL
);

CREATE TABLE virtual_results (
  contest_id INTEGER NOT NULL REFERENCES contests(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  started_at INTEGER NOT NULL,
  results TEXT NOT NULL,
  PRIMARY KEY (contest_id, user_id)
) WITHOUT ROWID;
