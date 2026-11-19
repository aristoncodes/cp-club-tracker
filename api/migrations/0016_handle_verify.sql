-- Code a member puts in their Codeforces or CodeChef profile to prove the handle is theirs.
ALTER TABLE handles ADD COLUMN verify_code TEXT;
UPDATE handles SET verify_code = 'oops-' || lower(hex(randomblob(3)));
