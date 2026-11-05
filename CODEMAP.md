# CODEMAP — where things are

Read this first, then open only what the task needs. Update it in the same commit when a file, route group or table is added, removed or changes job.

## Which doc to read

| Task touches | Read |
|---|---|
| Attendance, scoring or who can see what | `PRD.md` in full; `ARCHITECTURE.md → Scoring` |
| An add-on's rules | `PRD_ADDONS.md`: **Decisions**, then that feature's section |
| Duel results | `PRD_ADDONS.md → Phase C`, all of it |
| Schema | `ARCHITECTURE.md → Data model` and `Add-ons → Schema`; `api/migrations/` is the truth |
| Endpoints | `ARCHITECTURE.md → API` and `Add-ons → API additions` |
| Cron, pushes or Codeforces calls | `ARCHITECTURE.md → Worker cron`, `Add-ons → Codeforces call queue`, `Add-ons → Worker cron additions` |
| How a screen looks | `DESIGN.md`: Tokens, then its component and screen. Add-ons: `DESIGN_ADDONS.md` |
| Testing a change | The matching section of `TESTING.md` |
| Admin pages | `PRD_ADMIN.md` (Decisions, then that page), `DESIGN_ADMIN.md`, `ARCHITECTURE.md → Admin redesign` |
| Releasing | `SETUP.md → Releasing the add-ons` |

Current state and what's left: `PROGRESS.md`.

## shared/ (pure TS, used by every package)

| File | Holds |
|---|---|
| `scoring.ts` | `problemRp`, `solvePoints`, challenge constants |
| `contests.ts` | `countsForAttendance`, `SPECIAL_CF_ROUNDS` |
| `time.ts` | IST helpers: `periodStart`, `istDay`, `formatIST`, `solveStreak`, `weekStrip`, `heatmapWeeks` |
| `batch.ts` | Joining year ↔ year of study |
| `reasons.ts` | Absence reasons, `contestResult` |
| `rating-color.ts` | `ratingColor` |
| `cf.ts` | `CfSubmission`, `cfSolves`, `isLiveSubmission` |
| `types.ts` | Platform and ingest types, `HealthReport` |
| `upsolve.ts` | `contestType`, `upsolveTarget`, `upsolveItems`, `upsolveReminderDue` |
| `potd.ts` | Bands, `potdRating`, `potdBonus` |
| `goal.ts` | `goalLocked`, `goalSuggestion`, choices |
| `badges.ts` | The 12 `BADGES`, `earnedBadges` |
| `duel.ts` | `decideDuel`, `playerStatus`, `duelRange`, `elo`, `duelCheckDue`, duel view types and text |
| `virtual.ts` | `virtualStart`, `applySubmissions`, `rankVirtual` |
| `app-version.ts` | `appVersionAction` |
| `settings.ts` | `SETTING_DEFAULTS`, `effectiveValue` |

## api/src/ (Cloudflare Worker; mounted in `index.ts`)

| File | Routes | Also holds |
|---|---|---|
| `index.ts` | `/health`, `/app-version`, mounts everything | Exports `fetch` and `scheduled` |
| `auth.ts` | | `requireUser`, `requireAdmin`, `USER_COLUMNS`, `Bindings` |
| `accounts.ts` | `/auth/*` | Username and onboarding rules |
| `routes.ts` | `/me*`, `/contests/*`, `/leaderboard*`, `/challenge`, `/feed`, `/users/:id` | `withRanks`, `biggestClimbers`, `duelFeedText` |
| `admin.ts` | `/admin/` badges, students, handles, users, admins, audit | |
| `ingest.ts` | `/ingest/*` (secret) | Health report |
| `announcements.ts` | `/announcements`, `/admin/announcements` | `sendDueAnnouncements` |
| `practice.ts` | `/practice/*` (potd, upsolves, goal) | `createUpsolves`, `pickPotd`, `potdBonuses`, reminders |
| `rivals.ts` | `/me/rival` | `checkRivals` |
| `badges.ts` | `/badges` | `checkBadges`, `sweepBadges`, `badgeStats` |
| `duels.ts` | `/duels/*` | `checkNextDuel`, `duelHousekeeping` |
| `recap.ts` | `/recap` | `sendRecapPush` |
| `virtuals.ts` | `/virtuals`, `/admin/virtuals` | `nextVirtualRead`, `recordVirtual`, `finishVirtual` |
| `digest.ts` | `/admin/digest` | |
| `admin-club.ts` | `/admin/` overview, members, at-risk, attendance, exam-weeks, contests, sessions | |
| `admin-engage.ts` | `/admin/` engagement, fairness, seasons, member-of-month, reports, rules | |
| `admin-jobs.ts` | | Nightly at-risk, fairness, stats; member of the month; season freeze; session reminders; `inExamWeek` |
| `admin-write.ts` | | `adminWrite`: the only way admin routes write |
| `settings.ts` | | `getSettings` |
| `cron.ts` | | `runCron` (per-minute dispatcher), `contestAction`, tick checks, `dispatchWorkflow`, streak and meal pushes |
| `cf-queue.ts` | | `runCfQueue`: the only starter of Worker Codeforces calls; `refreshRatings` |
| `cf.ts` | | Codeforces client with the 2 s gap |
| `records.ts` | | `insertSolves` (points, bonus, history), `finishContest`, `createAttendanceRows` |
| `push.ts` | | `sendPushes`, `pushUsers` (preference and per-minute limit) |
| `web-push.ts` | | RFC 8291 encryption, VAPID |
| `meal-pushes.ts` | | Meal lines and timing |

Migrations: `0000` baseline, `0001` accounts, `0002` meals, `0003` push errors, `0004` announcements + `push_log`, `0005` upsolves, `0006` problem of the day + `cf_history`, `0007` goals, `0008` rivals, `0009` badges, `0010` duels, `0011` recap switch, `0012` virtuals, `0013` admin redesign.

## jobs/ (GitHub Actions; `.github/workflows/` has one file per script)

| File | Does |
|---|---|
| `lib.ts` | `politeFetch`, ingest helpers, `healthProblems` |
| `adapters/{cf,cc,atcoder,leetcode}.ts` | Fetch and parse per platform; tests use `fixtures/` |
| `sync-contests.ts` | Contest list |
| `sync-solves.ts` | Solves; Codeforces only in the first run of each hour |
| `sync-problemset.ts` | Problems, rounds and full history import |
| `participation.ts` | Attendance and upsolve data after a contest |
| `backfill.ts` | 6 months of solves on approval |
| `health.ts` | Daily check; failure emails via GitHub |

## web/src/ (Vite + React + Tailwind)

- `main.tsx`: routes, `Shell` (nav, banners, celebration), `BellMenu`, `RefreshToast`, `/announcements`.
- `ui.tsx`: shared pieces (`Button`, `Card`, `Tabs`, `Avatar`, `ContestRow`, `InboxList`, `useLoad`, `useMe`).
- `api.ts`: `api()` and shared types. `index.css`: tokens.
- `pages/`: `home`, `leaderboard`, `practice` (also exports `PotdCard`, `GoalRing`), `duels` (also exports `InviteCard`), `duel`, `contests`, `virtual`, `feed`, `badges` (also exports `Celebration`), `recap`, `profile`, `settings`, `reason`, `login`, `signup`, `download`, `admin` (layout and sidebar), `admin-ui` (shared pieces), `admin-club` (Overview, At-risk, Attendance, Exam weeks, Contests, Sessions), `admin-people` (Students, Members, Admins), `admin-engage` (Engagement, Fairness, Seasons), `admin-reports` (Reports, Rules), `admin-tools` (Announcements, virtuals, Digest).

## app/ (Expo; pushed screens use the same paths as web where possible)

- `app/_layout.tsx`: root, fonts, notification routing. `app/(tabs)/`: `index` (Home), `leaderboard` (Board + Feed), `practice`, `duels`, `contests`.
- Pushed screens in `app/`: `profile`, `user/[id]`, `settings`, `reason`, `announcements`, `badges`, `recap`, `duel/new`, `duel/[id]`, `virtual/[id]`, `login`, `signup`.
- `lib/`: `api.ts`, `ui.tsx`, `push.ts`, `update-card.tsx` (update card and APK prompts), `practice-cards.tsx`, `duel-cards.tsx`, `badge-tile.tsx`, `feed-panel.tsx`, `profile-view.tsx`. Tokens: `theme.ts`.

## Things that are easy to get wrong

- Only `cf-queue.ts` may start a Codeforces call in the Worker; request handlers record what they want.
- Duel winners come only from submission data, through `decideDuel`.
- Points are set once at insert in `insertSolves`, and the problem-of-the-day bonus is part of them.
- Web and app have separate UI code, so a screen change usually means both.
- Admin writes go through `adminWrite`, and thresholds come from `settings`.
- `eas update` needs the `EXPO_PUBLIC_*` values exported by hand (`SETUP.md`).
