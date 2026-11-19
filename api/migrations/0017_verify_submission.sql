-- Handles are verified by a compilation error on a given problem within a few minutes, not by a code in the profile.
ALTER TABLE handles DROP COLUMN verify_code;
ALTER TABLE handles ADD COLUMN verify_problem TEXT;
ALTER TABLE handles ADD COLUMN verify_started_at INTEGER;
