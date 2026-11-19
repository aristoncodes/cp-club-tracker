-- A member asking for their account to be deleted, with why. An admin deletes or dismisses it.
CREATE TABLE deletion_requests (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  reason TEXT NOT NULL,
  at INTEGER NOT NULL
);
