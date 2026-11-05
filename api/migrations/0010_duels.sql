ALTER TABLE users ADD COLUMN duel_rating INTEGER NOT NULL DEFAULT 1200;

CREATE TABLE duels (
  id INTEGER PRIMARY KEY,
  challenger_id INTEGER NOT NULL REFERENCES users(id),
  opponent_id INTEGER NOT NULL REFERENCES users(id),
  rating_min INTEGER NOT NULL,
  rating_max INTEGER NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes IN (30,45,60)),
  status TEXT NOT NULL CHECK (status IN ('invited','queued','live','judging','won','draw','declined','expired')),
  created_at INTEGER NOT NULL,
  problem_id TEXT,
  start_at INTEGER,
  end_at INTEGER,
  winner_id INTEGER REFERENCES users(id),
  winning_submission_id INTEGER,
  winning_time INTEGER,
  gave_up_id INTEGER REFERENCES users(id),
  gave_up_at INTEGER,
  check_requested_at INTEGER,
  last_check_at INTEGER,
  last_check_ok INTEGER NOT NULL DEFAULT 1,
  player_status TEXT,
  challenger_delta INTEGER,
  opponent_delta INTEGER,
  rating_gap INTEGER,
  finished_at INTEGER
);
CREATE INDEX duels_by_status ON duels (status, start_at);
CREATE INDEX duels_by_finish ON duels (finished_at);
