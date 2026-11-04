# ARCHITECTURE — CP Club Tracker

## Overview

```
 Android app (Expo) ─┐                         ┌─ Expo Push API ─► phones
                     ├─► Cloudflare Worker ────┤
 Website (Pages) ────┘    (API + 1 cron/min)   ├─ Codeforces API (small calls)
                               │  ▲            └─ GitHub API (dispatch cc-participation)
                               ▼  │ POST /ingest/* (shared secret)
                          Cloudflare D1        │
                                         GitHub Actions (jobs/)
                                   CF contest list, CodeChef, AtCoder,
                                   LeetCode adapters
```

- The **Worker** owns the database, the API and everything time-critical: reminders, RSVP pushes, Codeforces verification.
- **GitHub Actions** do every large download or HTML scrape and post compact JSON to the Worker. They never touch D1 directly.

Everything runs on free tiers. Cloudflare Workers Free gives 100k requests/day, 10 ms CPU per invocation, 50 subrequests and 5 cron triggers. D1 Free gives 5 GB, 5M reads and 100k writes per day.

## Dependencies

| Package | Allowed |
|---|---|
| root | `typescript` (dev) |
| `shared` | `vitest` (dev) |
| `api` | `hono`, `jose`, `wrangler` (dev), `vitest` (dev) |
| `web` | `react`, `react-dom`, `react-router-dom`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `@react-oauth/google` |
| `app` | `react`, `react-native`, `expo`, `expo-router`, `expo-notifications`, `expo-task-manager`, `expo-device`, `expo-auth-session`, `expo-secure-store`, `expo-updates`, `expo-font`, `expo-constants`, `expo-linking`, `react-native-screens`, `react-native-safe-area-context`, `@expo/metro-runtime`, `@expo/log-box`, `@expo-google-fonts/inter`, `@expo-google-fonts/jetbrains-mono`, `@types/react` (dev) |
| `jobs` | `cheerio`, `tsx`, `@types/node` (dev), `vitest` (dev) |

Ask before adding anything else.

## Files

Target shape. Don't add files beyond this without a reason from `CLAUDE.md`.

```
shared/  scoring.ts  contests.ts  time.ts  types.ts  rating-color.ts  *.test.ts
api/     schema.sql  wrangler.toml  seed.dev.sql
         src/index.ts      Hono app, mounts routes, exports fetch + scheduled
         src/auth.ts       Google token verify, session JWT, requireUser/requireAdmin
         src/routes.ts     student routes
         src/admin.ts      admin routes
         src/ingest.ts     /ingest/* routes
         src/cron.ts       per-minute dispatcher
         src/cf.ts         Codeforces API client (standings, user.status, user.info)
         src/push.ts       Expo push sender
web/     src/main.tsx  src/api.ts  src/pages/*.tsx  index.css  tailwind.config.ts
app/     index.ts (registers the background task before any screen)
         app/(tabs)/*.tsx  app/reason.tsx  app/onboarding.tsx  app/login.tsx  app/+native-intent.ts
         lib/api.ts  lib/push.ts  lib/ui.tsx  theme.ts
jobs/    lib.ts (fetch with UA + delay, ingest poster)
         adapters/{cf,cc,atcoder,leetcode}.ts
         sync-contests.ts  sync-solves.ts  cc-participation.ts
         fixtures/  (saved responses for tests)
```

## Data model (`api/schema.sql`)

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  batch_year INTEGER,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin')),
  active INTEGER NOT NULL DEFAULT 1,
  cf_rating INTEGER,                         -- NULL = unrated
  created_at INTEGER NOT NULL
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
- Submissions with `solved_at` before the handle's `approved_at` are dropped, on every path into `solves`. A re-solve of a problem first solved before approval still scores.
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
  - **cf:** true unless the name contains `Div. 1` but not `Div. 2`, or contains `Kotlin Heroes`, `April Fools`, `Testing Round` or `Q#`.
  - **cc:** true if the name starts with `Starters`.
- **Parallel CF rounds:** in `sync-contests`, a CF Div. 1 round whose `start_at` equals that of a counted Div. 2 round is stored as that round's `alt_external_id`, not as its own row.
- **Non-counted contests** are still stored, with `counts = 0`, so an admin can tick them on. `counts` is set only on insert, so re-syncing never overwrites an admin's choice.

## Time (`shared/time.ts`)

- `IST_OFFSET = 19800`.
- `periodStart(period, now)` returns the unix second of IST midnight today, IST Monday 00:00 this week, or IST 1st 00:00 this month.
- `formatIST(ts)` returns e.g. "Wed, 4 Nov · 8:00 PM".

## Worker cron: one trigger, `* * * * *` (`api/src/cron.ts`)

Codeforces calls in a run are 2 s apart, and each run finishes well under 10 ms CPU. "Participants" below means active users, students and admins alike, with an approved handle on the contest's platform.

1. **Reminder:** for counted contests with `stage = 0` and `start_at − 3600 ≤ now < start_at − 300`, send the T−60 push to all participants and set `stage = 1`. A contest first seen inside T−5 skips this and gets only the RSVP push.
2. **RSVP:** for counted contests with `stage ≤ 1` and `now ≥ start_at − 300` (and `now < start_at`):
   - create `attendance` rows for every participant (`INSERT OR IGNORE`),
   - send the RSVP push (category `rsvp`, data `{ contestId }`),
   - set `stage = 2`.

   If the window was missed, still create the rows and skip to verify.
3. **Verify**, for counted contests with `stage < 3` and `now ≥ end_at + 900`:
   - **cf:** call `contest.standings?contestId=…&handles=a;b;…&showUnofficial=true`, and in the same run for `alt_external_id`, then mark once from both results. A handle present with participantType `CONTESTANT` or `OUT_OF_COMPETITION` → `present`; everyone else → `absent`. If `rsvp = 'no'`, the RSVP reason is already in `reason_type`/`reason_text`. Then send result pushes (below) and set `stage = 4`. If Codeforces rejects the call because a handle doesn't exist, set that handle's `broken = 1` and leave it out of later Codeforces calls; the contest retries on the next tick. A handle changed to a different one has `broken` reset to 0.
   - **cc:** POST to GitHub `actions/workflows/cc-participation.yml/dispatches` with input `contest`, and set `stage = 3`. The Action posts to `/ingest/participation`, which applies the same marking and pushes and sets `stage = 4`. A contest still at `stage = 3` is dispatched again every hour, up to 24 hours after `end_at`.
4. **Every 10th minute:** refresh Codeforces solves for the 4 students with the oldest `handles.synced_at` for `cf`. Use `user.status?handle=…&from=1&count=50`, 2 s apart, keep `verdict = 'OK'`, upsert `problems`, and insert solves with `live = participantType is CONTESTANT or OUT_OF_COMPETITION`.
5. **Daily at 18:30 UTC (00:00 IST):** refresh `cf_rating` for all students with one `user.info?handles=…` call.

**Result pushes:**
- present → "Marked present for X".
- absent with no `reason_type` → "You missed X. Why?" with data `{ contestId, screen: 'reason' }`.

**Push sending (`push.ts`):**
- Batch up to 100 messages per request to `https://exp.host/--/api/v2/push/send`.
- Delete tokens that come back as `DeviceNotRegistered`.

## API (`/api/*`, JSON)

Auth: `Authorization: Bearer <session JWT>`. The session is an HS256 JWT with `{ sub: userId, role }`, signed with `SESSION_SECRET`, valid for 30 days.

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | /auth/google | none | Body `{ idToken }`. Verify against Google JWKS with `jose` (audience = web + Android client ids). Create the user on first sign-in; role `admin` if the email is in `ADMIN_EMAILS`. Returns `{ token, user }` |
| GET | /me | student | User, handles with approval state, contests with pending reasons |
| PUT | /me | student | `{ name, batchYear }` |
| PUT | /me/handles/:platform | student | `{ handle }`. Clears `approved_at` only if the handle is different from the current one. 409 if the handle is taken |
| POST | /me/push-token | student | `{ token, kind }` |
| GET | /contests/upcoming | student | Next 10 counted contests + my RSVP |
| POST | /contests/:id/rsvp | student | `{ going: boolean, reasonType?, reasonText? }`; a reason is required when `going` is false. Accepted until the contest reaches `stage = 4`, then 409 |
| POST | /contests/:id/reason | student | `{ reasonType, reasonText? }`. Only allowed when my status is `absent` |
| GET | /leaderboard?period=day\|week\|month | student | `[{ rank, userId, name, batchYear, cfHandle, cfRating, points, solves, hardest }]`. `hardest` is the highest `solves.rp` in the period. Only users with a solve in the period; equal points share a rank |
| GET | /feed?before= | student | Week 2. 30 latest solves with problem info |
| GET | /users/:id | student | Profile, period stats, streak, top tags, heatmap counts (week 2) |
| GET | /admin/attendance?from&to&platform&batch | admin | `{ contests, students, cells }`; the web builds the CSV |
| PATCH | /admin/contests/:id | admin | `{ counts }` |
| GET | /admin/students | admin | Students + handles + approval state |
| PATCH | /admin/handles/:userId/:platform | admin | `{ approved }`. `true` sets `approved_at` to now if unset; `false` clears it |
| PATCH | /admin/users/:id | admin | `{ role?, active? }` |
| POST | /admin/admins | admin | `{ email }`. Promotes the user, or inserts a `users` row with `role = 'admin'` and an empty name, filled in at first sign-in |
| GET | /admin/flags | admin | Users with > 30 solves in one IST day in the last 30 days, and handles with `broken = 1` |
| POST | /ingest/contests | secret | `[{ platform, externalId, altExternalId?, name, url, startAt, endAt, counts }]`, upserted; `counts` applies only on insert |
| POST | /ingest/solves | secret | `[{ platform, handle, problemId, name?, rating?, tags?, url?, solvedAt, live }]`. The Worker maps handle → user, computes points and inserts with `OR IGNORE` |
| POST | /ingest/participation | secret | `{ platform, externalId, presentHandles: string[] }` |
| GET | /ingest/handles?platform= | secret | Approved handles for the adapters to fetch |

- Ingest routes check `X-Ingest-Secret` against `INGEST_SECRET`.
- Batches are processed with `D1.batch()`.

## Jobs (GitHub Actions, `jobs/`)

Every adapter exports pure functions: `fetchX(...)` for network and `parseX(raw)` for parsing. Parsers are tested on saved fixtures. One adapter failing logs an error and doesn't stop the others.

| Script | Schedule (UTC cron) | Does |
|---|---|---|
| `sync-contests.ts` | `0 */6 * * *` | CF `contest.list?gym=false` (future contests only) + CodeChef upcoming contests → apply `countsForAttendance` and parallel-round merge → `/ingest/contests` |
| `sync-solves.ts` | `*/30 * * * *` | cc, atcoder, leetcode (and cf as a backstop) recent accepted submissions for approved handles → `/ingest/solves` |
| `cc-participation.ts` | `workflow_dispatch` (input `contest`) | Scrape the contest rankings / each handle's contest history → `/ingest/participation` |

**Platform notes:**
- **Codeforces:** official API, 1 call per 2 s.
- **CodeChef:** no official API. Use the JSON endpoints the CodeChef website itself calls (contest list, recent submissions), falling back to HTML. Expect changes; keep parsing in `adapters/cc.ts` only.
- **AtCoder:** AtCoder Problems API for submissions (`from_second`) and difficulty estimates. Be polite: one request per second.
- **LeetCode:** unofficial GraphQL `recentAcSubmissionList` (about the last 20) plus `question` difficulty.

**GitHub secrets:** `API_URL`, `INGEST_SECRET`.
**Worker secrets:** `SESSION_SECRET`, `INGEST_SECRET`, `ADMIN_EMAILS`, `GOOGLE_CLIENT_IDS`, `GITHUB_TOKEN` (fine-grained, Actions write on this repo only), `GITHUB_REPO`.

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

- **Android:** an EAS Build `preview` profile produces an APK, linked from the website's `/download`. JS updates go over the air via `expo-updates` (EAS Update).
- **Web:** `vite build`, deployed to Cloudflare Pages. The Worker serves the API under its own `workers.dev` domain with CORS for the Pages origin.
