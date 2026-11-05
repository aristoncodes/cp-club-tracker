CREATE TABLE announcements (
  id INTEGER PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('all','batch','admins')),
  batch_year INTEGER,
  link TEXT,
  send_at INTEGER NOT NULL,
  sent_at INTEGER,
  pinned INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX announcements_by_send ON announcements (sent_at, send_at);

ALTER TABLE users ADD COLUMN inbox_seen_at INTEGER NOT NULL DEFAULT 0;

CREATE TABLE push_log (
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  minute INTEGER NOT NULL,
  PRIMARY KEY (user_id, type, minute)
) WITHOUT ROWID;
