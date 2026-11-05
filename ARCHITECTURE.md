# ARCHITECTURE — OOPS.Grind

## Overview

```
 Android app (Expo) ─┐                         ┌─ Expo Push API ─► phones
                     ├─► Cloudflare Worker ────┤
 Website (Worker) ───┘    (API + 1 cron/min)   ├─ Codeforces API (small calls)
                               │  ▲            └─ GitHub API (dispatch participation)
                               ▼  │ POST /ingest/* (shared secret)
                          Cloudflare D1        │
                                         GitHub Actions (jobs/)
                                   CF contest list, CodeChef, AtCoder,
                                   LeetCode adapters
```

- The **Worker** owns the database, the API and everything time-critical: reminders, RSVP pushes, starting verification.
- **GitHub Actions** do every large download or HTML scrape and post compact JSON to the Worker. They never touch D1 directly.

Everything runs on free tiers. Cloudflare Workers Free gives 100k requests/day, 10 ms CPU per invocation, 50 subrequests and 5 cron triggers. D1 Free gives 5 GB, 5M reads and 100k writes per day.

## Dependencies

| Package | Allowed |
|---|---|
| root | `typescript` (dev) |
| `shared` | `vitest` (dev) |
| `api` | `hono`, `jose`, `wrangler` (dev), `vitest` (dev), `@types/node` (dev) |
| `web` | `react`, `react-dom`, `react-router-dom`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `@react-oauth/google`, `@types/react` (dev), `@types/react-dom` (dev) |
| `app` | `react`, `react-native`, `expo`, `expo-router`, `expo-notifications`, `expo-task-manager`, `expo-device`, `expo-auth-session`, `expo-secure-store`, `expo-updates`, `expo-font`, `expo-constants`, `expo-linking`, `react-native-screens`, `react-native-safe-area-context`, `@expo/metro-runtime`, `@expo/log-box`, `react-native-svg`, `@expo-google-fonts/inter`, `@expo-google-fonts/space-grotesk`, `@expo-google-fonts/jetbrains-mono`, `@expo/vector-icons`, `@types/react` (dev) |
| `jobs` | `cheerio`, `tsx`, `@types/node` (dev), `vitest` (dev) |

Ask before adding anything else.

## Files

Target shape. Don't add files beyond this without a reason from `CLAUDE.md`.

```
shared/  scoring.ts  contests.ts  time.ts  types.ts  rating-color.ts  cf.ts  batch.ts  reasons.ts  *.test.ts
api/     migrations/  wrangler.toml  seed.dev.sql
         src/index.ts      Hono app, mounts routes, exports fetch + scheduled
         src/auth.ts       session JWT, requireUser/requireAdmin
         src/accounts.ts   /auth/* routes: Google sign-in, username rules, onboarding rules
         src/routes.ts     student routes
         src/admin.ts      admin routes
         src/ingest.ts     /ingest/* routes
         src/cron.ts       per-minute dispatcher
         src/records.ts    writing solves and contest results, used by cron and ingest
         src/cf.ts         Codeforces API client (user.status, user.info), used only by cf-queue.ts
         src/push.ts       push sender for Expo and web
         src/web-push.ts   RFC 8291 encryption and VAPID for web push
web/     wrangler.toml  src/main.tsx  src/api.ts  src/ui.tsx  src/pages/*.tsx  src/index.css  vite.config.ts
         public/sw.js  public/manifest.webmanifest  public/icon-*.png
app/     index.ts (registers the background task before any screen)
         app/(tabs)/*.tsx  app/user/[id].tsx  app/reason.tsx  app/onboarding.tsx  app/login.tsx  app/+native-intent.ts
         lib/api.ts  lib/push.ts  lib/ui.tsx  lib/profile-view.tsx  theme.ts
jobs/    lib.ts (fetch with UA + delay, ingest poster)
         adapters/{cf,cc,atcoder,leetcode}.ts
         sync-contests.ts  sync-solves.ts  backfill.ts  participation.ts
         fixtures/  (saved responses for tests)
```

## Data model (`api/migrations/`)

`0000_baseline.sql` is the schema that production already has, with `IF NOT EXISTS`, so it does nothing there. Every change is a new file, applied with `wrangler d1 migrations apply`.

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  batch_year INTEGER,                        -- year the student joined; shown as 1st to 4th year
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin')),
  active INTEGER NOT NULL DEFAULT 1,
  cf_rating INTEGER,                         -- NULL = unrated
  created_at INTEGER NOT NULL,
  username TEXT,                             -- lowercase; unique index, case-insensitive
  username_changes INTEGER NOT NULL DEFAULT 0,
  onboarding_step TEXT NOT NULL DEFAULT 'about', -- 'done' once the onboarding page is finished
  notify_hour INTEGER NOT NULL DEFAULT 1,
  notify_rsvp INTEGER NOT NULL DEFAULT 1,
  notify_result INTEGER NOT NULL DEFAULT 1,
  notify_streak INTEGER NOT NULL DEFAULT 0,
  notify_meals INTEGER NOT NULL DEFAULT 1,
  cf_rating_history TEXT                     -- JSON [{ at, rating, contestId, delta }], refreshed with solve sync
);

CREATE TABLE push_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('expo','web'))
);

CREATE TABLE handles (
  user_id INTEGER NOT NULL REFERENCES users(id),
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  approved_at INTEGER,                       -- NULL = not approved; solves before this don't score
  broken INTEGER NOT NULL DEFAULT 0,         -- platform says the handle doesn't exist
  synced_at INTEGER,
  PRIMARY KEY (user_id, platform),
  UNIQUE (platform, handle)
);

CREATE TABLE contests (
  id INTEGER PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('cf','cc')),
  external_id TEXT NOT NULL,                 -- CF contest id / CC contest code
  alt_external_id TEXT,                      -- parallel CF Div. 1 round, checked too
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  counts INTEGER NOT NULL DEFAULT 1,
  stage INTEGER NOT NULL DEFAULT 0,          -- 0 new, 1 reminded, 2 rsvp sent, 3 verify requested, 4 verified
  UNIQUE (platform, external_id)
);

CREATE TABLE attendance (
  contest_id INTEGER NOT NULL REFERENCES contests(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  rsvp TEXT CHECK (rsvp IN ('yes','no')),
  status TEXT CHECK (status IN ('present','absent')),
  reason_type TEXT CHECK (reason_type IN ('exams','travel','illness','clash','forgot','other')),
  reason_text TEXT,
  PRIMARY KEY (contest_id, user_id)
);

CREATE TABLE problems (
  platform TEXT NOT NULL,
  problem_id TEXT NOT NULL,                  -- cf: "1900C", cc: code, etc.
  name TEXT,
  rating INTEGER,                            -- platform's own difficulty (leetcode: Easy/Medium/Hard)
  tags TEXT,                                 -- JSON array of strings
  url TEXT,
  PRIMARY KEY (platform, problem_id)
);

CREATE TABLE solves (
  user_id INTEGER NOT NULL REFERENCES users(id),
  platform TEXT NOT NULL,
  problem_id TEXT NOT NULL,
  solved_at INTEGER NOT NULL,
  live INTEGER NOT NULL DEFAULT 0,
  rp INTEGER NOT NULL,                       -- Codeforces-equivalent rating at insert
  points REAL NOT NULL,
  PRIMARY KEY (user_id, platform, problem_id)
);
CREATE INDEX solves_by_time ON solves (solved_at);
```

- `INSERT OR IGNORE` into `solves` guarantees that only the first accepted submission counts.
- Submissions with `solved_at` before the handle's `approved_at` are stored with `points = 0`, on every path into `solves`. They count as history for profiles (activity, streak, top tags) and never for the leaderboard, feed, challenge or flags, which all filter on `points > 0`. A re-solve of a problem already in history doesn't score, because only the first accepted submission counts.
- Points are computed once at insert, using the student's rating at that moment, and never recomputed.

## Scoring (`shared/scoring.ts`)

```
points = round1( 10 × (Rp / 1000)² × m × b )
m      = clamp(1 + (Rp − Ru) / 400, 0.5, 2)
b      = 1.5 if solved live in a contest (on cf: CONTESTANT or OUT_OF_COMPETITION), else 1
Ru     = student's CF rating, or 1200 if unrated
```

Rp is the Codeforces-equivalent rating of the problem. The conversion is a constant table in `scoring.ts`; changing it is a code change, and only affects new solves.

| Platform | Rp |
|---|---|
| cf | problem rating; unrated → 1200 |
| cc | difficulty − 200; missing → 1200 |
| atcoder | estimated difficulty + 400, floored at 800; missing → 1200 |
| leetcode | Easy 1000, Medium 1300, Hard 1600 |

## Contest rules (`shared/contests.ts`)

- `countsForAttendance(platform, name)`:
  - **cf:** true if the name contains `Div. 2`, `Div. 3`, `Div. 4` or `Educational` (`Div. 1 + Div. 2` contains `Div. 2`), unless it also contains `Kotlin Heroes`, `April Fools`, `Testing Round` or `Q#`.
  - **cc:** true if the name starts with `Starters`.
- **Parallel CF rounds:** in `sync-contests`, a CF Div. 1 round whose `start_at` equals that of a counted Div. 2 round is stored as that round's `alt_external_id`, not as its own row.
- **Non-counted contests** are still stored, with `counts = 0`, so an admin can tick them on. `counts` is set only on insert, so re-syncing never overwrites an admin's choice.

## Time (`shared/time.ts`)

- `IST_OFFSET = 19800`.
- `periodStart(period, now)` returns the unix second of IST midnight today, IST Monday 00:00 this week, or IST 1st 00:00 this month.
- `formatIST(ts)` returns e.g. "Wed, 4 Nov · 8:00 PM".

## Worker cron: one trigger, `* * * * *` (`api/src/cron.ts`)

The contest steps make no Codeforces calls. Other Codeforces calls in a run are 2 s apart, and each run finishes well under 10 ms CPU. "Participants" below means active users, students and admins alike, with an approved handle on the contest's platform.

1. **Reminder:** for counted contests with `stage = 0` and `start_at − 3600 ≤ now < start_at − 300`, send the T−60 push to all participants and set `stage = 1`. A contest first seen inside T−5 skips this and gets only the RSVP push.
2. **RSVP:** for counted contests with `stage ≤ 1` and `now ≥ start_at − 300` (and `now < start_at`):
   - create `attendance` rows for every participant (`INSERT OR IGNORE`),
   - send the RSVP push (category `rsvp`, data `{ contestId }`),
   - set `stage = 2`.

   If the window was missed, still create the rows and skip to verify.
3. **Verify**, for counted contests with `stage < 3` and `now ≥ end_at + 900`: POST to GitHub `actions/workflows/participation.yml/dispatches` with inputs `platform`, `contest`, `alt`, `start` and `end`, and set `stage = 3`. The Action posts to `/ingest/participation`, which marks attendance (handles it lists as present → `present`, everyone else → `absent`), keeps any RSVP reason, sends result pushes (below) and sets `stage = 4`. A contest still at `stage = 3` is dispatched again every hour, up to 24 hours after `end_at + 900`. Codeforces no longer allows filtered `contest.standings` calls, and one call per student doesn't fit the Worker's 50 subrequests, so this runs in `jobs/`.
4. **Codeforces solves.** Runs last in every minute's cron, inside the Codeforces queue (`api/src/cf-queue.ts`), stopping after 25 handles or 48 s, 2 s apart, oldest `handles.synced_at` first (not-yet-fetched handles come first). So every student refreshes every minute up to 25 students, about every 2 minutes at 50. A handle's first fetch reads its rating and `user.status?handle=…&from=1&count=50`; later fetches read `count=10` and only write submissions from the last fetch minus a 10-minute judging margin, so unchanged handles write nothing but `synced_at`. Keep `verdict = 'OK'`, upsert `problems`, and insert solves with `live = participantType is CONTESTANT or OUT_OF_COMPETITION`.
   `cf_rating_history` refreshes from `user.rating` once an hour per handle.
5. **Daily at 18:30 UTC (00:00 IST):** refresh `cf_rating` for all students with one `user.info?handles=…` call.
6. **Daily at 15:30 UTC (21:00 IST):** streak reminder to users with `notify_streak = 1`, a streak of at least 1 and no solve today.
   **At 03:30, 07:30, 11:30 and 15:30 UTC (9 AM, 1 PM, 5 PM, 9 PM IST):** meal-time push to users with `notify_meals = 1`, lines from `api/src/meal-pushes.ts`, chosen by IST day number. People the 15:30 streak reminder goes to skip dinner's line.
7. **GitHub jobs:** because GitHub's own schedules proved unreliable, the Worker dispatches `sync-solves.yml` every 5 minutes (the workflow's concurrency group keeps at most one run and one queued) and `sync-contests.yml` every 6 hours.

8. **Health check:** `health.yml` runs on GitHub's own schedule at 01:00 UTC and is also dispatched by the Worker at 00:30 UTC, so one still fires if the other fails. `jobs/health.ts` reads `GET /api/ingest/health` and recent GitHub runs. Any problem fails the run, and GitHub's failure email is the alert. It covers: a stalled Codeforces fetch, no solves on a platform with 5+ students for 14 days, no upcoming contests, attendance unfinished 6 hours after a contest, broken handles, push errors from Expo in the last 24 hours (other than `DeviceNotRegistered`, stored in `push_errors`), and late or failing jobs. It can't read Cloudflare's CPU or D1 usage; a Worker over its CPU limit shows up as the stalled-fetch problem.

Every push checks its own preference column: reminder `notify_hour`, RSVP `notify_rsvp`, results `notify_result`, streak `notify_streak`, meal-time `notify_meals`.

**Result pushes:**
- present → "Marked present for X".
- absent with no `reason_type` → "You missed X. Why?" with data `{ contestId, screen: 'reason' }`.

**Push sending (`push.ts`):**
- **Expo:** batch up to 100 messages per request to `https://exp.host/--/api/v2/push/send`. Delete tokens that come back as `DeviceNotRegistered`.
- **Web:** `push_tokens.token` holds the browser's subscription as JSON. Send one encrypted request per subscription. Delete subscriptions that return 404 or 410. A tap opens `url` if the push has one, otherwise `/me`, where iPhone users answer RSVPs and give reasons.

## API (`/api/*`, JSON)

Auth: `Authorization: Bearer <session JWT>`. The session is an HS256 JWT with `{ sub: userId, role }`, signed with `SESSION_SECRET`, valid for 30 days.

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | /auth/google | none | `{ idToken }`. Verified with `jose` against Google's keys (audience = web + Android client ids). Creates the user on first sign-in; role `admin` if the email is in `ADMIN_EMAILS`. Returns `{ token, user }` |
| GET | /auth/username-available?u= | none | `{ available, error? }`: rules, reserved list and uniqueness |
| GET | /me | student | User (including `username`, `usernameChangesLeft`, `onboardingStep`, notification preferences), handles with approval state, contests with pending reasons, solve streak |
| PUT | /me | student | `{ name, batchYear, username? }`. `username` only during onboarding, and it doesn't use up the one change |
| POST | /me/onboarding | student | Marks onboarding done. Needs a username, a year and Codeforces and CodeChef handles (admins may skip handles) |
| PATCH | /me/username | student | `{ username }`. 409 if taken, 403 if the one change is used |
| PATCH | /me/notifications | student | Any of `{ notifyHour, notifyRsvp, notifyResult, notifyStreak }` |
| PUT | /me/handles/:platform | student | `{ handle }`. Clears `approved_at` only if the handle is different from the current one. 409 if the handle is taken |
| POST | /me/push-token | student | `{ token, kind }` |
| GET | /contests/upcoming | student | Next 10 counted contests + my RSVP and length, plus how many said yes out of how many can take part. Counts only, never who |
| GET | /contests/past?before= | student | 20 past counted contests with my status, RSVP and reason |
| POST | /contests/:id/rsvp | student | `{ going: boolean, reasonType?, reasonText? }`; a reason is required when `going` is false. Accepted until the contest reaches `stage = 4`, then 409 |
| POST | /contests/:id/reason | student | `{ reasonType, reasonText? }`. Only allowed when my status is `absent` |
| GET | /leaderboard?period=day\|week\|month&batch=&platform= | student | `[{ rank, userId, name, batchYear, cfHandle, cfRating, points, solves, hardest }]`. `hardest` is the highest `solves.rp` in the period; `moved` is the rank change against the previous period of the same length, or null. Only users with a solve in the period; equal points share a rank |
| GET | /leaderboard/extras?period=&platform= | student | `{ years, climbers, toughest }`: points per batch, top 3 rank gains, 3 highest-rated solves. All from `solves`, with no rank-history table |
| GET | /challenge | student | `{ solved, mine, target, minRating }`; target and rating are constants in `shared/` |
| GET | /feed?before= | student | 30 latest solves with problem info. Clients poll it every minute while the feed is open |
| GET | /users/:id | student | Profile, @username, period stats, total solves, streak, top and weak tags, heatmap counts, rating history, recent scored solves. `attendance` and `contests` only for your own profile or an admin |
| GET | /admin/attendance?from&to&platform&batch | admin | `{ contests, students, cells }`; the web builds the CSV |
| PATCH | /admin/contests/:id | admin | `{ counts }` |
| GET | /admin/students | admin | Students + handles + approval state |
| PATCH | /admin/handles/:userId/:platform | admin | `{ approved }`. `true` sets `approved_at` to now if unset; `false` clears it. Approving resets `synced_at`, so the next cron run fetches Codeforces first, and dispatches `backfill.yml` for 6 months of history on any platform |
| PATCH | /admin/users/:id | admin | `{ role?, active?, username? }` |
| POST | /admin/admins | admin | `{ email }`. Promotes the user, or inserts a `users` row with `role = 'admin'` and an empty name, filled in at first sign-in |
| GET | /admin/flags | admin | Users with > 30 solves in one IST day in the last 30 days, and handles with `broken = 1` |
| POST | /ingest/contests | secret | `[{ platform, externalId, altExternalId?, name, url, startAt, endAt, counts }]`, upserted; `counts` applies only on insert |
| POST | /ingest/solves | secret | `[{ platform, handle, problemId, name?, rating?, tags?, url?, solvedAt, live }]`. The Worker maps handle → user, computes points and inserts with `OR IGNORE` |
| POST | /ingest/participation | secret | `{ platform, externalId, presentHandles: string[], brokenHandles?: string[] }` |
| GET | /ingest/handles?platform= | secret | Approved handles for the adapters to fetch |

- Ingest routes check `X-Ingest-Secret` against `INGEST_SECRET`.
- Batches are processed with `D1.batch()`.

## Jobs (GitHub Actions, `jobs/`)

Every adapter exports pure functions: `fetchX(...)` for network and `parseX(raw)` for parsing. Parsers are tested on saved fixtures. One adapter failing logs an error and doesn't stop the others.

| Script | When | Does |
|---|---|---|
| `sync-contests.ts` | Every 6 hours, dispatched by the Worker | CF `contest.list?gym=false` (future contests only) + CodeChef upcoming contests → apply `countsForAttendance` and parallel-round merge → `/ingest/contests` |
| `health.ts` | Daily | Fails the run with a list of problems if anything looks wrong |
| `sync-solves.ts` | Every 5 minutes, dispatched by the Worker | cc, atcoder, leetcode (and cf as a backstop in the first run of each hour) accepted submissions from the last 48 hours for approved handles → `/ingest/solves`, one post per handle |
| `backfill.ts` | `workflow_dispatch` (inputs `platform`, `handle`) | On approval: up to 6 months of accepted submissions → `/ingest/solves`, 50 at a time. Codeforces and AtCoder give full history; CodeChef gives about the last page and LeetCode the last 20 |
| `participation.ts` | `workflow_dispatch` (inputs `platform`, `contest`, `alt`, `start`, `end`) | **cf:** `contest.status?contestId=…&handle=…` for each handle, and for `alt`; any submission with participantType `CONTESTANT` or `OUT_OF_COMPETITION` → present. A handle Codeforces says doesn't exist is reported in `brokenHandles`. **cc:** each handle's recent submissions; any submission linked to the contest or one of its divisions (`START263`, `START263A`…) with a time inside the contest → present. Any other failure stops the run without posting, so nobody is wrongly marked absent → `/ingest/participation` |

**Platform notes:**
- **Codeforces:** official API, 1 call per 2 s. Filtered `contest.standings` is rejected for non-admins; use `contest.status` with `handle`.
- **CodeChef:** no official API. Use `/api/list/contests/all`, `/recent/user` (JSON wrapping an HTML table), `/api/contests/<code>` and `/api/contests/<code>/problems/<problem>`. `/api/rankings` isn't usable. Expect changes; keep parsing in `adapters/cc.ts` only.
- **AtCoder:** AtCoder Problems API for submissions (`from_second`), difficulty estimates, problem names and contest times. A solve is live if it falls inside its contest, for contests up to a day long. Be polite: one request per second.
- **LeetCode:** unofficial GraphQL `recentAcSubmissionList` (about the last 20) plus `question` difficulty. Solves are never live.

**GitHub secrets:** `API_URL`, `INGEST_SECRET`, `EXPO_TOKEN`.
**Worker secrets:** `SESSION_SECRET`, `INGEST_SECRET`, `ADMIN_EMAILS`, `GOOGLE_CLIENT_IDS`, `GITHUB_TOKEN` (fine-grained, Actions write on this repo only), `GITHUB_REPO`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.
**Worker var:** `WEB_ORIGIN` in `wrangler.toml`, used for CORS and as the VAPID subject.

## App notifications (`app/lib/push.ts`)

- At startup, register category `rsvp` with two actions:
  - `yes`: buttonTitle "Yes", `opensAppToForeground: false`.
  - `no`: buttonTitle "No", with `textInput` (placeholder "Why not?") and `opensAppToForeground: false`.
- Handle responses in a background notification task (`expo-task-manager` via `Notifications.registerTaskAsync`). The handler calls `/contests/:id/rsvp`. A No with typed text uses `reasonType: 'other'`. A No with no text calls nothing and posts a local notification, "Tap to give a reason", which opens the Reason screen; that screen sends the reason to `/contests/:id/rsvp` with `going: false`.
- If background handling proves unreliable on test devices, switch both actions to `opensAppToForeground: true` and handle them in `useLastNotificationResponse`. Document the switch in this file.
- A push with `screen: 'reason'` opens `/reason?contestId=…`. A push with `url` opens that page.
- Google sign-in uses `expo-auth-session` with PKCE and the redirect `com.cpclub.tracker:/oauthredirect`.
- Android channel `contests`, importance HIGH.

## Distribution

- **Android:** the `build-apk` workflow runs the EAS `preview` profile locally on GitHub Actions, avoiding Expo's free queue, and publishes the APK as a GitHub Release. The website's `/download` links to the latest release. JS updates go over the air via `expo-updates` (EAS Update).
- **Web:** `vite build`, deployed as a static-assets Worker (`web/wrangler.toml`), because new Cloudflare Pages projects are now Workers. The API Worker has its own `workers.dev` domain, with CORS for the website's origin. Don't run `wrangler pages project create` from `api/`: it deploys that folder as a second Worker, cron included.

## Add-ons

Rules are in `PRD_ADDONS.md` and screens in `DESIGN_ADDONS.md`. This section is the design for them. No new dependencies. Each block of schema below becomes one migration file, written and tested locally in its task, and shown for approval before it touches production.

### New files

```
shared/  upsolve.ts  duel.ts  potd.ts  goal.ts  badges.ts  virtual.ts  app-version.ts  *.test.ts
api/     migrations/0004_announcements.sql … 0012_virtuals.sql
         src/announcements.ts  src/practice.ts  src/rivals.ts  src/badges.ts  src/duels.ts  src/recap.ts  src/virtuals.ts  src/digest.ts
         src/cf-queue.ts       the queue: the only place Worker code starts a Codeforces call
jobs/    sync-problemset.ts    problemset refresh + full history import
app/     app/(tabs)/practice.tsx  app/(tabs)/duels.tsx  app/announcements.tsx  app/badges.tsx  app/recap.tsx
         app/duel/new.tsx  app/duel/[id].tsx  app/virtual/[id].tsx
         lib/update-card.tsx  lib/practice-cards.tsx  lib/duel-cards.tsx  lib/badge-tile.tsx  lib/feed-panel.tsx
web/     src/pages/{practice,duels,duel,badges,recap,virtual,admin-tools}.tsx
.github/workflows/sync-problemset.yml
```

Feed moved from an app tab to `app/lib/feed-panel.tsx`, shown inside Board. Notification paths such as `/duel/5`, `/practice` and `/announcements` are the same on app and web.

### Schema

```sql
-- Announcements
CREATE TABLE announcements (
  id INTEGER PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('all','batch','admins')),
  batch_year INTEGER,                        -- for 'batch': the chosen year of study, converted when sending
  link TEXT,
  send_at INTEGER NOT NULL,
  sent_at INTEGER,                           -- NULL = still scheduled
  pinned INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE users ADD COLUMN inbox_seen_at INTEGER NOT NULL DEFAULT 0; -- unread and "seen by N of M" both compare this with sent_at

-- Upsolves. "Done" is never stored: it's a join on solves, so a practice solve completes the item with no extra write.
CREATE TABLE upsolves (
  user_id INTEGER NOT NULL REFERENCES users(id),
  contest_id INTEGER NOT NULL REFERENCES contests(id),
  problem_id TEXT NOT NULL,
  alt_problem_id TEXT,                       -- the same problem in a parallel Div. 1 round
  PRIMARY KEY (user_id, contest_id, problem_id)
) WITHOUT ROWID;
ALTER TABLE contests ADD COLUMN upsolve_pushes INTEGER NOT NULL DEFAULT 0; -- 0, 1 or 2 reminders sent

-- Problem of the day
ALTER TABLE problems ADD COLUMN contest_at INTEGER; -- round's start; NULL = not eligible for picks
CREATE TABLE cf_rounds (                     -- finished rounds, so a virtual can be looked up without a Codeforces call in the request
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  duration INTEGER NOT NULL
);
CREATE INDEX problems_pick ON problems (platform, rating, contest_at);
CREATE TABLE cf_history (                    -- every problem a member has ever solved on Codeforces
  user_id INTEGER NOT NULL REFERENCES users(id),
  problem_id TEXT NOT NULL,
  PRIMARY KEY (user_id, problem_id)
) WITHOUT ROWID;
ALTER TABLE handles ADD COLUMN history_imported_at INTEGER;
CREATE TABLE potd (
  day INTEGER NOT NULL,                      -- istDay
  band INTEGER NOT NULL,                     -- the band's lower edge; 0 for under 1200
  problem_id TEXT NOT NULL,
  PRIMARY KEY (day, band)
) WITHOUT ROWID;
CREATE TABLE potd_reveals (
  user_id INTEGER NOT NULL REFERENCES users(id),
  day INTEGER NOT NULL,
  revealed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
) WITHOUT ROWID;
ALTER TABLE solves ADD COLUMN potd_bonus INTEGER NOT NULL DEFAULT 0; -- already included in points; > 0 marks a problem-of-the-day solve

-- Weekly goal
CREATE TABLE goals (
  user_id INTEGER NOT NULL REFERENCES users(id),
  week_start INTEGER NOT NULL,               -- periodStart('week')
  target INTEGER NOT NULL CHECK (target IN (3,5,7,10)),
  min_rating INTEGER NOT NULL CHECK (min_rating IN (1000,1200,1300,1400)),
  PRIMARY KEY (user_id, week_start)
) WITHOUT ROWID;

-- Rivals
ALTER TABLE users ADD COLUMN rival_id INTEGER REFERENCES users(id);
ALTER TABLE users ADD COLUMN rival_set_at INTEGER;
ALTER TABLE users ADD COLUMN rival_ahead INTEGER NOT NULL DEFAULT 0;  -- last seen state, so a push fires only on a change
ALTER TABLE users ADD COLUMN rival_pushed_day INTEGER;                -- istDay of the last "passed you"

-- Badges
CREATE TABLE badges (
  user_id INTEGER NOT NULL REFERENCES users(id),
  badge TEXT NOT NULL,
  earned_at INTEGER NOT NULL,
  seen_at INTEGER,                           -- NULL = celebration still to show
  PRIMARY KEY (user_id, badge)               -- this is what makes each badge once-only
) WITHOUT ROWID;

-- Duels
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
  start_at INTEGER,                          -- S
  end_at INTEGER,                            -- E
  winner_id INTEGER REFERENCES users(id),
  winning_submission_id INTEGER,
  winning_time INTEGER,                      -- creationTimeSeconds − S
  gave_up_id INTEGER REFERENCES users(id),
  gave_up_at INTEGER,
  check_requested_at INTEGER,                -- "check now"; picked up by the queue
  last_check_at INTEGER,
  last_check_ok INTEGER NOT NULL DEFAULT 1,  -- 0 shows "Checking…"
  player_status TEXT,                        -- JSON for the status rows
  challenger_delta INTEGER,
  opponent_delta INTEGER
);
CREATE INDEX duels_by_status ON duels (status, start_at);

-- Club virtuals. Each virtual is also a contests row, so RSVP, reminders and the attendance grid need no second copy.
ALTER TABLE contests ADD COLUMN kind TEXT NOT NULL DEFAULT 'round' CHECK (kind IN ('round','virtual')); -- external_id is 'v<cfId>-<start>', so it can't clash with the real round
CREATE TABLE virtual_contests (
  contest_id INTEGER PRIMARY KEY REFERENCES contests(id),
  cf_contest_id INTEGER NOT NULL,
  problems TEXT NOT NULL                     -- JSON [{ index, name }]
);
CREATE TABLE virtual_results (               -- a row exists only for someone who started within 15 minutes
  contest_id INTEGER NOT NULL REFERENCES contests(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  started_at INTEGER NOT NULL,
  results TEXT NOT NULL,                     -- JSON { [index]: { solvedAt?, wrong } }
  PRIMARY KEY (contest_id, user_id)
) WITHOUT ROWID;

-- Notifications
ALTER TABLE users ADD COLUMN notify_practice INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN notify_rival INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN notify_badges INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN notify_recap INTEGER NOT NULL DEFAULT 1;
CREATE TABLE push_log (                      -- event-driven pushes only; scheduled ones fire once per tick by design
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  minute INTEGER NOT NULL,
  PRIMARY KEY (user_id, type, minute)
) WITHOUT ROWID;
```

`duels` also has `rating_gap` (the loser's rating minus the winner's, for Giant slayer) and `finished_at`; `users` also has `badges_checked`, which is 0 only for members who were here when badges launched, so their first check is silent. The recap and digest have no tables; they are computed from existing data when read.

### Pure functions (`shared/`)

```ts
upsolveTarget(contestType, n, rating, divisionPercentile?): number // PRD table, clamped to 2…n
contestType(name): 'div4' | 'div3' | 'div2' | 'educational' | 'div1+2' | 'global' | 'starters' | null
potdBand(rating): number                                           // lower edge of the band; unrated → 0
potdRating(band): number                                           // lower edge + 200; band 0 → 1000
potdBonus(revealedBeforeSolve): 5 | 2
decideDuel({ start, end, problem, a, b, now, gaveUp? }): { status: 'live' | 'checking' | 'judging' | 'won' | 'draw', winner?, submissionId?, time? }
duelRange(difficulty, ratingA, ratingB): { min, max }
elo(rA, rB, outcome): { a, b }
appVersionAction(current, latest, min): 'none' | 'optional' | 'required'
goalLocked(now): boolean; goalSuggestion(weeklyAverage): number
earnedBadges(stats): BadgeId[]; reachedNewColour(ratings): boolean
virtualStart(submissions, cfContestId, clubStart): number | null
applySubmissions(previous, submissions, cfContestId, startedAt); rankVirtual(rows)
```

`decideDuel` takes more than the five arguments first planned, because its tests need them: `problem` (only the duel problem counts), `a` / `b` as `null` when Codeforces didn't answer (returns `checking`, never a decision) and `gaveUp` as `{ player, at }` (an Accepted by that player before `at` still counts; otherwise the other player wins). Elo is applied once, in the same `D1.batch` that moves a duel to a final status, guarded by `WHERE status IN ('live','judging')`.

### Codeforces call queue (`api/src/cf-queue.ts`)

The hard limit is 30 calls a minute. Each cron run has a 48 s budget at 2 s a call, so 24 calls. Module state doesn't reach across isolates, so the only safe gap is having one caller: **only the cron run calls Codeforces from the Worker.** Request handlers record what they want and return.

Before every call, the run picks the most urgent work by reading D1:

1. **Duels:** any `live` or `judging` duel with a requested check (cooldown of 20 s), an automatic check due (60 s since the last), or `now ≥ end_at` with no check since. A check is 2 `contest.status` calls, one per player.
2. **Club virtuals in progress:** every approved handle during the first 15 minutes, then only those with a `virtual_results` row, each at most once per 2 minutes. These are `user.status?count=10` reads, so they also count as that handle's solve sync. `contest.standings` with any parameter is refused, so it can't be used here.
3. **Solve sync:** the existing oldest-first loop gets whatever is left.

Consequences:

- "Check now" returns straight away and the client polls `GET /duels/:id` every 5 s. A check normally starts within seconds, or up to about 12 s if no run is active.
- Approving a handle stops calling Codeforces in the request. It already resets `synced_at`, which puts the handle first in the queue.
- At the 10-duel cap, automatic checks take 20 of the 24 calls, so "check now" has little room and solve sync stops until duels end. A live duel lasts at most 75 minutes. The health check's 30-minute "stalled fetch" alert may fire in that rare case.
- 10 duels during the first 15 minutes of a virtual won't fit. Duels stay on time and standings can run late.

**Actions** run from a different IP, so they keep their own 2 s gap and aren't counted against the Worker's budget. `sync-solves` reads Codeforces only in its first run of each hour, instead of every 5 minutes.

| Source | Calls per minute at 50 handles |
|---|---|
| Live duel, automatic | 2 per duel (20 at the cap) |
| "Check now" | Up to 4 more per duel, when there's room |
| Virtual, first 15 min | About 25 |
| Virtual, after that | About half the number of participants |
| Solve sync | Whatever is left, up to 24 |
| Rating history | About 1 on average |

### D1 write budget

The limit is 100k rows written a day, and handle syncing already uses about 35k. The first problemset load is about 25k writes and full histories perhaps 30–60k, so `sync-problemset` loads the problemset first and stops each history run at 20k rows, continuing the next day. Check D1's usage page before the first run.

### Worker cron additions (`api/src/cron.ts`)

All IST times below are daily unless noted, and fire through `isDailyTick`.

| When | Step |
|---|---|
| Every minute | Send due announcements; expire invites older than 10 minutes; start `queued` duels when a slot is free; move finished virtuals on; run the badge sweep slice if due; process the queue above |
| Every 5 minutes | Rival check: push on a change to "rival ahead this week", at most once a day |
| 00:00 | After the rating refresh, pick each band's problem for the new day with one SQL statement per band: rated exactly `potdRating(band)`, `contest_at` older than 3 months, and not in `cf_history` for anyone in the band |
| 00:10–00:24 | Nightly badge sweep, one fifteenth of members a minute; clear old `push_log` rows; on Mondays, award last week's #1 |
| 08:00 | Problem-of-the-day push (`notify_practice`) |
| Every 5 minutes | Upsolve reminders at end + 2 days and + 6 days (`notify_practice`), using `contests.upsolve_pushes` |
| Sunday 21:00 | Recap push (`notify_recap`); those people skip dinner's line |
| 22:00 | Dispatch `sync-problemset.yml` |

Picks run in the Worker, not an Action, because GitHub's timing is unreliable and the work is only SQL. The health check also reports a day with no problem picked.

**Upsolve lists** are generated when `/ingest/participation` finishes a Codeforces contest. `participation.ts` already reads each handle's contest submissions, so it also posts the round's problems and each handle's in-contest solves. The list comes from `problemset.problems`, falling back to the unparameterised `contest.standings?contestId=<id>` if the round isn't listed yet. The rating at contest time is read in SQL from `cf_rating_history`, so the Worker doesn't parse 50 JSON histories. `insertSolves` also writes `cf_history` and applies the problem-of-the-day bonus.

**Virtual attendance:** a virtual with `counts = 0` still gets reminders and RSVPs but no attendance result. With `counts = 1`, it finishes through `finishContest` using the handles in `virtual_results`, with no GitHub dispatch.

### API additions

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | /app-version | none | `{ latest, min, url, notes }` from `wrangler.toml` vars |
| GET | /announcements | student | Inbox for my audience, plus `unread` and `pinned` |
| POST | /announcements/seen | student | Sets `inbox_seen_at` |
| GET, POST | /admin/announcements | admin | List with seen counts; create |
| PATCH, DELETE | /admin/announcements/:id | admin | PATCH sets or clears the pin; DELETE cancels one still scheduled |
| GET | /practice/potd | student | My band's problem, N of M, bonus left, next time, 7-day strip, band members' status. Tags only if revealed |
| POST | /practice/potd/reveal | student | Saved once with `INSERT OR IGNORE` |
| GET | /practice/upsolves | student | Lists grouped by contest, with done state |
| GET, PUT | /practice/goal | student | Current goal, progress and suggestion; 409 from Thursday |
| PUT | /me/rival | student | `{ userId }`; 409 within 7 days of the last change |
| GET | /me/rival | student | This week's side-by-side |
| GET | /badges?user= | student | All 12 with earned date or progress |
| POST | /badges/seen | student | Marks celebrations as shown |
| GET | /duels | student | Hub: my rating and record, invites, live now, recent, board |
| GET | /duels/opponents?q= | student | Selectable members with approved CF handles |
| POST | /duels | student | Create invite; 409 past 3 open invites |
| GET | /duels/:id | student | State; the problem is hidden from spectators until the end |
| POST | /duels/:id/accept, /decline | student | Opponent only. Accept picks the problem, or queues past 10 live |
| POST | /duels/:id/check | student | Player only; records a request. Never calls Codeforces |
| POST | /duels/:id/give-up | student | Player only; records it, and the next check decides |
| GET | /recap?week= | student | My 3 pages |
| GET, POST | /admin/virtuals | admin | List; create from a contest id and start |
| GET | /admin/virtuals/lookup?contestId= | admin | Name, length and problem count, read from `cf_rounds` and `problems` |
| GET | /virtuals/:contestId/standings | student | Club-only table |
| GET | /admin/digest | admin | The last 7 days, for Admin → Digest |
| POST | /ingest/problemset | secret | `{ rounds, problems }`, up to 500 of each, with `json_each` upserts that write only changed rows |
| GET | /ingest/history-missing | secret | Handles with no `history_imported_at` |
| POST | /ingest/cf-history | secret | `{ handle, problemIds, done }` |

`/ingest/participation` gains optional `problems` and `solved`. `/feed` becomes solves plus finished duels. `/contests/upcoming` and `/contests/past` include virtuals. `PATCH /me/notifications` accepts `notifyPractice`, `notifyRival`, `notifyBadges` and `notifyRecap`.

### Jobs

| Script | When | Does |
|---|---|---|
| `sync-problemset.ts` | Daily, dispatched by the Worker | `problemset.problems` + `contest.list` → drop special rounds and non-`PROGRAMMING` problems, set `contest_at`, keep finished rounds → `/ingest/problemset` in chunks. Then full `user.status` for handles missing history → `/ingest/cf-history`, stopping at 20k rows |

### App and web

- **Over the air:** everything uses existing native modules. Check on open and on foreground with `Updates.checkForUpdateAsync` and `fetchUpdateAsync`, then show the card from `isUpdatePending`. The version and notes shown come from `extra.release` in `app/app.json`, so update those before publishing. `checkAutomatically: NEVER` isn't set, because it would need a new APK and members shouldn't have to reinstall. Because `runtimeVersion` follows the app version, a version bump stops over-the-air updates reaching older APKs, so those phones must first get an update containing the install prompt.
- **Notifications:** a new `duel` category with `duel_accept` and `duel_decline` actions, set up through the same JS calls as `rsvp`. The response handler opens a push's `data.path`.
- **Web toast:** on focus, fetch `/index.html` with `no-store` and compare its script name with the running one. No build changes.

## Admin redesign

Rules are in `PRD_ADMIN.md` and looks in `DESIGN_ADMIN.md`. No new dependencies. Admin is web only.

### Schema (`api/migrations/0013_admin.sql`)

The migration is the truth for columns. `attendance` and `contests` are rebuilt, because SQLite can't change a CHECK. `contests` is recreated under its own name with `defer_foreign_keys` on: putting its rows back is what clears the violations the DROP leaves on its child tables, and a rename doesn't.

- **"Counts" stays `handles.approved_at IS NOT NULL`.** `handles.status` adds Waiting and Rejected for display, and every write sets both together.
- **`users.active` stays the test for "active".** `deactivated_at` records when.
- **Attendance words stay** `present` / `absent` / `excused`. Absent with no `reason_type` is the "?" cell. `manual = 1` means the automatic run must not touch the row. `exam_week_id` marks entries an exam week excused, so deleting it reverts only those.
- **Other-site and in-person contests** use `platform = 'other'`. `source` says how attendance is read. Participants for `platform = 'other'` are all active members.
- **Voiding** moves `solves.points` into `solves.voided_points` and sets points to 0. Every board already filters on `points > 0`, so nothing else changes and undo restores the exact value.
- **Adjusting** adds a `point_adjustments` row. Board queries add active adjustments dated inside the period.
- **`settings`** holds `value`, plus `pending_value` and `pending_from` for a change saved today, so today keeps the old value.

### Audit helper (`api/src/admin-write.ts`)

```ts
adminWrite(c, { area, action, target, before, after }, statements): Promise<D1Result[]>
```

Runs the statements and one `audit_log` insert in a single `D1.batch`, so a write can't happen without its log row. It's the only way admin routes write. A bulk action writes one row per thing changed: Approve all, one per handle; Rules, one per key. Cron jobs aren't admin writes and aren't logged.

### Settings (`api/src/settings.ts`)

`getSettings(db)` reads the table, with defaults from one object in `shared/settings.ts`, the only place those numbers exist. `effectiveValue` picks `pending_value` once `pending_from` has passed, so no job is needed to apply a change. `solvePoints` and `potdBonus` take their values as arguments. The per-minute cron reads settings once per run.

### API (`/api/admin/*`)

All need an admin session, validate input and write through `adminWrite`.

| Method | Path | Notes |
|---|---|---|
| GET | /badges | Sidebar counts: inbox, waiting handles, at-risk, open flags |
| GET | /overview | KPIs, inbox, trend, at-risk preview, upcoming RSVP splits |
| GET | /members | Table; the page filters it |
| GET, PUT | /members/:id, /members/:id/notes | Drawer data; notes |
| GET | /students | Cards with handles; the page filters them |
| PATCH | /handles/:userId/:platform | `{ status }`: approve, reject or back to waiting |
| POST | /handles/approve-all | |
| PATCH | /users/:id | `{ active?, username?, role? }`; role refuses yourself, the last admin and `ADMIN_EMAILS` |
| GET, POST | /admins | List; add by email, 404 "No account with this email" |
| GET | /audit?area=&before= | 50 per page |
| GET | /at-risk | Flagged, hiding snoozed and exam-week members |
| POST | /at-risk/:userId/snooze, /at-risk/:userId/nudge, /at-risk/nudge-all | Nudge returns 409 inside the limit; nudge-all skips those people |
| GET | /attendance | Existing grid, plus manual, note and mandatory |
| PATCH | /attendance/:contestId/:userId | `{ status, note? }`; sets `manual = 1` |
| GET, POST | /exam-weeks, /exam-weeks/preview | Preview returns N, M and K |
| PATCH, DELETE | /exam-weeks/:id | Delete reverts only non-manual entries |
| GET, POST | /contests | Upcoming and past; add custom |
| PATCH | /contests/:id | `{ counts?, mandatory? }` |
| GET, POST | /sessions | List; create, announce |
| GET, PUT | /sessions/:id/checkins, /sessions/:id/checkins/:userId | List; `{ here }` toggles present |
| GET | /engagement?batch= | Reads `stats_daily` |
| GET | /fairness | Open flags and history |
| POST | /fairness/:id/clear, /undo-clear, /adjust, /void | Adjust and void need a reason, and notify the member |
| POST | /fairness/adjustments/:id/undo | Restores points exactly |
| GET, POST | /seasons | List with the live board; start new |
| PATCH, POST | /member-of-month/:month, /member-of-month/:month/announce | Override the draft; announce |
| GET | /reports?from=&to=&sections=, /reports.csv | CSV is generated by the Worker |
| GET, PUT | /rules | PUT stores pending values |

Member routes added: `POST /contests/:id/took-part`, `GET /seasons/current`, `GET /me/point-notices`, `GET /badges/extra`, and `period=season` on `/leaderboard`.

### Cron additions (`api/src/admin-jobs.ts`)

| When (IST) | Job |
|---|---|
| 00:00 | Freeze a season ending today |
| 01:00 | At-risk |
| 01:01 | Fairness |
| 01:02 | `stats_daily` |
| 1st, 02:00 | Member of the month draft |
| Every minute | Session reminders; T−3h for mandatory contests |

Contest pushes, POTD and upsolve reminders leave out members in an active exam week.

**Staying under the CPU limit:** each job is `INSERT … SELECT` run inside D1, so the Worker parses almost no rows. Jobs run in separate minutes, and those minutes skip the Codeforces queue so the costs don't add up. Anything needing JS takes a slice of members per minute, as the badge sweep does. Test 10 measures `cpuTime` on a separate free staging Worker seeded with 50 members and 90 days of solves, because local runs don't enforce the limit.
