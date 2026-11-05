# TESTING — OOPS.Grind

Test logic that is pure and easy to get wrong. Verify the rest by running it. No end-to-end framework, no UI snapshot tests, no mocks of D1: use a real local D1 through `wrangler dev`.

## Automated (Vitest)

Run all of them with `pnpm -r test`. Tests sit next to the code as `*.test.ts`.

### shared

- **`scoring`**
  - User 1200 solving CF 800 → 3.2, 1200 → 14.4, 1400 → 29.4.
  - The multiplier is clamped at 0.5 and 2.
  - A live solve gives × 1.5.
  - An unrated user counts as 1200.
  - The Rp mapping is correct for each platform, including missing ratings.
- **`contests.countsForAttendance`**
  - True for Div. 2, Div. 3, Div. 4, Educational, Div. 1 + Div. 2, and CodeChef Starters.
  - False for Div. 1 only, Global Round, a round with no "Div." in its name, Kotlin Heroes, April Fools, Testing Round, Q#, and CodeChef Cook-Off / Lunchtime.
- **`time.periodStart`**
  - At 2026-11-04 23:59 IST, "day" starts at 2026-11-04 00:00 IST.
  - At 00:01 IST it moves to the new day.
  - "week" starts on Monday even when now is a Sunday at 23:59 IST.
  - "month" works across month ends.
- **`time` helpers:** `istDay` changes at IST midnight; `solveStreak` still counts when today has no solve yet and breaks on a missed day; `heatmapWeeks` gives 26 weeks ending in the current week.
- **`cf`:** keeps only accepted submissions; `CONTESTANT` and `OUT_OF_COMPETITION` are live; reads a missing handle from either Codeforces error.

### jobs

- Every adapter's `parse*` runs against a saved real response in `jobs/fixtures/`. It keeps only accepted verdicts and extracts problem id, rating, tags and time correctly.
- When a site changes, update the fixture and the parser together.
- `sync-contests` merges a parallel Div. 1 round into its Div. 2 round (fixture with two contests sharing a start time).

### api

- **Web push:** a message from `encryptPayload` decrypts correctly with an independent implementation.
- **Leaderboard ranks:** equal points share a rank.
- **Cron decision functions** (pure helpers in `cron.ts`): given `now` and a contest row, they return reminder / rsvp / verify / nothing at the right boundaries (T−3600, T−300, end+900). A contest first seen inside T−5 returns rsvp, not reminder. They do nothing for `counts = 0`.
- **Live participation** (`jobs`): `CONTESTANT` and `OUT_OF_COMPETITION` → present; `VIRTUAL`, `PRACTICE` and no submissions → absent. On CodeChef, only submissions to that contest or its divisions, inside the contest window, count.

### accounts (api)

- **Username:** valid and invalid forms, reserved names, case-insensitive uniqueness. The second user change gets 403; an admin can still change it.
- **Onboarding:** finishing needs a username, a year and both required handles; admins may skip handles.
- **Streak reminder:** targets only `notify_streak = 1`, streak ≥ 1, no solve today.
- **Health check:** stays quiet when healthy; reports a stalled fetch, silent platforms (5+ students only), missing contests, stuck attendance, broken handles, late jobs and mostly failing jobs; ignores cancelled runs.
- **Daily reminders:** fire only at 9 AM, 1 PM, 5 PM and 9 PM IST; no line repeats within its pool; a solver gets a congratulating line at lunch, snacks and dinner; only `notify_meals = 1` users receive them.
- **Leaderboard extras:** climbers and year totals on a small fixture; history at 0 points is excluded.
- **Privacy:** another student's `/users/:id` has no attendance; an admin's does.

## Manual checks per task

Set up local data first:

```bash
pnpm --filter api db:local
pnpm --filter api db:seed
pnpm --filter api dev    # includes --test-scheduled
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

`seed.dev.sql` inserts 3 users (1 admin), approved handles (including one real active CF handle), a contest starting in 6 minutes, and a finished real CF contest id.

| Task | Check |
|---|---|
| Auth | Sign in on web and app; an admin email sees `/admin`, a student gets 403 on `/api/admin/*` |
| Ingest | A call without `X-Ingest-Secret` gets 401; posting the same solve twice leaves one row; a solve dated before the handle's `approved_at` is stored with 0 points and appears on the profile but not on the leaderboard or feed |
| Reminder / RSVP | Trigger the cron at T−60 and T−5; exactly one push each arrives on your device; triggering again sends nothing (stage advanced) |
| RSVP from notification | With the app killed, tap Yes → row has `rsvp = 'yes'`. No + text → reason stored, no "why" push later |
| Verify (CF) | Run `participation` on a finished contest with one handle that took part and one that didn't; statuses match, an earlier RSVP reason is kept and pushes arrive |
| Verify (CC) | Run `participation` on a Starters within an hour of it ending, while CodeChef shows relative times; statuses update |
| Solves | Submit an AC on Codeforces with a test handle; within 2 min of cron runs it's in `solves` with the expected points |
| Accounts | Google sign-in and resuming onboarding, on web and on a real Android phone |
| Leaderboard | Today / Week / Month totals match a hand-written `SELECT SUM(points)` with the same boundaries |
| Admin grid | Grid and CSV agree with the `attendance` table for the range |
| CPU | `wrangler tail` during cron runs shows no `exceededCpu` outcome |

## Before onboarding the club

- [ ] Run one full real contest cycle (reminder → RSVP → verify) with 3 test students.
- [ ] Check that the APK installs on a clean Android phone and still receives pushes after a reboot.
- [ ] Check that the website works at 375 px width and in light and dark mode.
