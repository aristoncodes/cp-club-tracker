ALTER TABLE users ADD COLUMN kind TEXT NOT NULL DEFAULT 'student' CHECK (kind IN ('student','coach','alumni'));
