# ARCHITECTURE — CP Club Tracker

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
         src/cf.ts         Codeforces API client (user.status, user.info)
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
  onboarding_step TEXT NOT NULL DEFAULT 'about', -- about, handles, notified, done
  notify_hour INTEGER NOT NULL DEFAULT 1,
  notify_rsvp INTEGER NOT NULL DEFAULT 1,
  notify_result INTEGER NOT NULL DEFAULT 1,
  notify_streak INTEGER NOT NULL DEFAULT 0,
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
4. **Codeforces solves.** Every minute, handles approved but not yet fetched (`synced_at` is NULL) are a queue: up to 4 are fetched, rating first. **Every 10th minute:** refresh Codeforces solves for the 4 students with the oldest `handles.synced_at` for `cf`. Use `user.status?handle=…&from=1&count=50`, 2 s apart, keep `verdict = 'OK'`, upsert `problems`, and insert solves with `live = participantType is CONTESTANT or OUT_OF_COMPETITION`.
   The same sync refreshes `cf_rating_history` from `user.rating`, because one call per student wouldn't fit one run's 50 subrequests.
5. **Daily at 18:30 UTC (00:00 IST):** refresh `cf_rating` for all students with one `user.info?handles=…` call.
6. **Daily at 15:30 UTC (21:00 IST):** streak reminder to users with `notify_streak = 1`, a streak of at least 1 and no solve today.
7. **GitHub jobs:** because GitHub's own schedules proved unreliable, the Worker dispatches `sync-solves.yml` every 30 minutes and `sync-contests.yml` every 6 hours.

Every push checks its own preference column: reminder `notify_hour`, RSVP `notify_rsvp`, results `notify_result`, streak `notify_streak`.

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
| POST | /me/onboarding | student | `{ step }`. Moves forward only, in order; `notified` needs Codeforces and CodeChef handles |
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
| GET | /feed?before= | student | 30 latest solves with problem info |
| GET | /users/:id | student | Profile, @username, period stats, total solves, streak, top and weak tags, heatmap counts, rating history, recent scored solves. `attendance` and `contests` only for your own profile or an admin |
| GET | /admin/attendance?from&to&platform&batch | admin | `{ contests, students, cells }`; the web builds the CSV |
| PATCH | /admin/contests/:id | admin | `{ counts }` |
| GET | /admin/students | admin | Students + handles + approval state |
| PATCH | /admin/handles/:userId/:platform | admin | `{ approved }`. `true` sets `approved_at` to now if unset; `false` clears it. Approving fetches straight away: Codeforces recent solves and rating in the Worker, then `backfill.yml` for 6 months of history on any platform. A failed Codeforces fetch stays queued for the next minute |
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
| `sync-solves.ts` | Every 30 minutes, dispatched by the Worker | cc, atcoder, leetcode (and cf as a backstop) accepted submissions from the last 48 hours for approved handles → `/ingest/solves`, one post per handle |
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
