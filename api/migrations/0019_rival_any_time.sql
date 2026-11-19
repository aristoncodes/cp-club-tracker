-- A rival can be changed or removed at any time, so when it was set no longer matters.
ALTER TABLE users DROP COLUMN rival_set_at;
