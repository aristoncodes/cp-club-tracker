-- Local development only. Replace the push token with your own device's token.
INSERT INTO users (id, email, name, username, batch_year, role, cf_rating, email_verified, onboarding_step, created_at) VALUES
  (1, 'admin@example.com', 'Test Admin', 'test_admin', 2024, 'admin', 1500, 1, 'done', strftime('%s', 'now')),
  (2, 'student1@example.com', 'Test Student One', 'student_one', 2025, 'student', NULL, 1, 'done', strftime('%s', 'now')),
  (3, 'student2@example.com', 'Test Student Two', 'student_two', 2026, 'student', 1200, 1, 'done', strftime('%s', 'now'));

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
