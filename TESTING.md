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
- **Health check:** stays quiet when healthy; reports a stalled fetch, silent platforms (5+ students only), missing contests, stuck attendance, broken handles, push errors, late jobs and mostly failing jobs; ignores cancelled runs.
- **Meal-time nudges:** fire only at 9 AM, 1 PM, 5 PM and 9 PM IST; no line repeats within its pool; a solver gets a congratulating line at lunch, snacks and dinner; only `notify_meals = 1` users receive them.
- **Leaderboard extras:** climbers and year totals on a small fixture; history at 0 points is excluded.
- **Privacy:** another student's `/users/:id` has no attendance; an admin's does.

### add-ons

- **`upsolveTarget`**
  - Every row and column of the `PRD_ADDONS.md` table: Div. 4, Div. 3, Div. 2, Educational, Div. 1 + 2, Global and Starters.
  - Boundary ratings: 1199/1200, 1299/1300, 1399/1400, 1599/1600, 1899/1900, 2099/2100.
  - An unrated member counts as under 1200.
  - Sub-problems D1/D2 count separately.
  - The result is never below 2 or above n.
  - `contestType` reads each type from a real contest name, and gives null for anything else.
- **Upsolve lists:** problems solved in the contest are excluded; a Div. 1 solve of the parallel problem counts; a member who skipped the contest gets the same list; a later solve marks the item done; the 2-day and 6-day reminders stop when nothing remains.
- **Problem of the day**
  - `potdBand` and `potdRating` at every band edge.
  - The pick excludes problems anyone in the band has solved, and rounds from the last 3 months.
  - +5 without a reveal and +2 with a reveal before the solve.
  - A reveal after the solve doesn't reduce the bonus.
  - A solve on another IST day gets no bonus.
  - A reveal persists across devices (a second session reads it).
- **`decideDuel`**
  1. A's earlier Accepted wins even when only B pressed "check now".
  2. A pending earlier submission blocks the decision (`judging`), then resolves either way.
  3. An exact-second tie goes to the lower submission id.
  4. Submissions before the start or at/after the end are ignored.
  5. A submission made before the end but judged after it still counts, with a 15-minute wait; after that, pending counts as not Accepted.
  6. No Accepted → draw.
  7. "Give up" → loss, unless that player has an Accepted from before giving up.
  8. Only the duel problem counts.
  9. The API being down (`null`) → `checking` with no decision, then the correct decision later.
- **Duels, other:** `duelRange` for all three difficulties; problem selection (unsolved by both, older than 3 months); the 10-live-duel cap queues further accepts; the 20 s check-now cooldown; a check-now request never calls Codeforces from the request; `elo` for a win, a loss and a draw; Elo applies once if a decision runs twice.
- **Codeforces queue:** duels come before virtuals, and virtuals before solve sync; the run stops at its budget; a failed read leaves a duel `checking`.
- **Weekly goal:** counts scored solves at or above the rating within the IST week; editable until Wednesday 23:59 IST and refused from Thursday 00:00 IST.
- **Rivals:** "passed you" fires only on a change and at most once a day; the rival can't be changed within 7 days.
- **Badges:** every one of the 12 rules at and just below its threshold; each is awarded exactly once when the event and the sweep both see it; the first sweep is silent.
- **Virtual standings:** only virtuals started within 15 minutes count; wrong tries and solve times are correct; `counts = 0` writes no attendance.
- **Digest:** the numbers match the admin queries.
- **App version:** `appVersionAction` gives none, optional and required correctly, comparing versions as numbers (1.10 > 1.9).
- **Pushes:** each new type respects its switch; duel and announcement pushes ignore switches; a second push of the same event-driven type in a minute is dropped.

### admin

These run in `api/src/admin.integration.test.ts`, which starts the real Worker on a throwaway local D1.

1. A handle on Waiting or Rejected never adds points, attendance or a duel result. Remove approval stops its solves counting from the next sync.
2. Every admin endpoint returns 403 for non-admins, and every successful write adds its `audit_log` row: one per thing changed.
3. A manual attendance edit survives the automatic attendance job re-running.
4. Exam week: the members in it get no contest reminders and their entries become X. Deleting the exam week reverts only entries that weren't edited by hand.
5. A mandatory contest sends the T−3h reminder. A contest with Counts off is ignored in attendance %.
6. The at-risk flags match each threshold; the nudge limit is one per 3 days; a snoozed member stays hidden until the date.
7. Fairness: voiding solves removes their points from every board and the season; undo restores them exactly.
8. Changing a Rules value takes effect the next day, and the old value still applies today.
9. You can't remove yourself, the last admin or an `ADMIN_EMAILS` admin.
10. The nightly jobs finish with 50 members and 90 days of solves (`admin.integration.test.ts`). Their CPU within the limit is a manual check on a staging Worker, because local runs don't enforce it.

**Migration `0013`:** run it on a copy of production's data with rows in `attendance`, `upsolves` and the virtual tables. Row counts must match, `PRAGMA foreign_key_check` must be empty, and an insert with an unknown contest must still fail.

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
| Over-the-air update | Publish an update to a real phone; "Restart to update" appears within one foreground cycle, and tapping it restarts into the new version |
| Announcements | Schedule one to a single year with a test account in and out of that year; only the right one gets it, unread shows, and the seen count rises after opening the inbox |
| Upsolves | After a real Codeforces round, check two members of different ratings against the table |
| Problem of the day | Solve with a test account with and without a reveal; points match normal + 5 and + 2 |
| Duels | Three real duels between two test accounts: the slower player clicks, nobody clicks, and an earlier pending verdict |
| Club virtual | Start a real virtual with a test handle; it shows within 2 minutes of a submission, and a handle that didn't start doesn't |
| Queue | `wrangler tail` for a full day shows no Codeforces "Call limit exceeded" |
| Digest | Admin → Digest figures match the Attendance and Students pages for the same week |

## Before onboarding the club

- [ ] Run one full real contest cycle (reminder → RSVP → verify) with 3 test students.
- [ ] Check that the APK installs on a clean Android phone and still receives pushes after a reboot.
- [ ] Check that the website works at 375 px width and in light and dark mode.
