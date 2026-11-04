-- Local development only. Replace the push token with your own device's token.
INSERT INTO users (id, email, name, batch_year, role, cf_rating, created_at) VALUES
  (1, 'admin@example.com', 'Test Admin', 2024, 'admin', 1500, strftime('%s', 'now')),
  (2, 'student1@example.com', 'Test Student One', 2025, 'student', NULL, strftime('%s', 'now')),
  (3, 'student2@example.com', 'Test Student Two', 2026, 'student', 1200, strftime('%s', 'now'));

INSERT INTO handles (user_id, platform, handle, approved_at) VALUES
  (1, 'cf', 'tourist', 1),
  (1, 'cc', 'gennady.korotkevich', 1),
  (2, 'cf', 'jiangly', 1),
  (2, 'cc', 'jiangly', 1),
  (3, 'cf', 'Benq', 1),
  (3, 'cc', 'benq', NULL);

INSERT INTO push_tokens (token, user_id, kind) VALUES
  ('ExponentPushToken[REPLACE_WITH_YOUR_TOKEN]', 1, 'expo');

INSERT INTO contests (platform, external_id, name, url, start_at, end_at) VALUES
  ('cf', 'dev-upcoming', 'Dev Round (Div. 2)', 'https://codeforces.com/contests', strftime('%s', 'now') + 360, strftime('%s', 'now') + 7560),
  ('cf', '1900', 'Codeforces Round 911 (Div. 2)', 'https://codeforces.com/contest/1900', strftime('%s', 'now') - 8000, strftime('%s', 'now') - 960);
