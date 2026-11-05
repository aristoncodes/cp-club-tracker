CREATE TABLE goals (
  user_id INTEGER NOT NULL REFERENCES users(id),
  week_start INTEGER NOT NULL,
  target INTEGER NOT NULL CHECK (target IN (3,5,7,10)),
  min_rating INTEGER NOT NULL CHECK (min_rating IN (1000,1200,1300,1400)),
  PRIMARY KEY (user_id, week_start)
) WITHOUT ROWID;
