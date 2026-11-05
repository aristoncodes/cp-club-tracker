ALTER TABLE problems ADD COLUMN contest_at INTEGER;
CREATE INDEX problems_pick ON problems (platform, rating, contest_at);

CREATE TABLE cf_rounds (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  duration INTEGER NOT NULL
);

CREATE TABLE cf_history (
  user_id INTEGER NOT NULL REFERENCES users(id),
  problem_id TEXT NOT NULL,
  PRIMARY KEY (user_id, problem_id)
) WITHOUT ROWID;
CREATE INDEX cf_history_by_problem ON cf_history (problem_id);

ALTER TABLE handles ADD COLUMN history_imported_at INTEGER;

CREATE TABLE potd (
  day INTEGER NOT NULL,
  band INTEGER NOT NULL,
  problem_id TEXT NOT NULL,
  PRIMARY KEY (day, band)
) WITHOUT ROWID;

CREATE TABLE potd_reveals (
  user_id INTEGER NOT NULL REFERENCES users(id),
  day INTEGER NOT NULL,
  revealed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
) WITHOUT ROWID;

ALTER TABLE solves ADD COLUMN potd_bonus INTEGER NOT NULL DEFAULT 0;
