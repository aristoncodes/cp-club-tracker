CREATE TABLE upsolves (
  user_id INTEGER NOT NULL REFERENCES users(id),
  contest_id INTEGER NOT NULL REFERENCES contests(id),
  problem_id TEXT NOT NULL,
  alt_problem_id TEXT,
  PRIMARY KEY (user_id, contest_id, problem_id)
) WITHOUT ROWID;

ALTER TABLE contests ADD COLUMN upsolve_pushes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN notify_practice INTEGER NOT NULL DEFAULT 1;
