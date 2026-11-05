CREATE TABLE badges (
  user_id INTEGER NOT NULL REFERENCES users(id),
  badge TEXT NOT NULL,
  earned_at INTEGER NOT NULL,
  seen_at INTEGER,
  PRIMARY KEY (user_id, badge)
) WITHOUT ROWID;

ALTER TABLE users ADD COLUMN notify_badges INTEGER NOT NULL DEFAULT 1;

-- Members who are already here get what they have earned silently on their first check; new sign-ups start at 1.
ALTER TABLE users ADD COLUMN badges_checked INTEGER NOT NULL DEFAULT 1;
UPDATE users SET badges_checked = 0;
