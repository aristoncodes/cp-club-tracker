# PRD — CP Club Tracker

## Problem

The college competitive programming club (40–50 students across all years) has gone inconsistent: people skip contests and practice irregularly, and nobody can see it happening. Duels help, but they are one-day events.

## Goal

1. Make contest participation a habit by treating every counted contest as **attendance**, with a reason required for every absence.
2. Create healthy competition by showing **who is grinding and what they are solving**: daily, weekly and monthly leaderboards weighted by problem difficulty.

**Success after 1 month:** contest attendance ≥ 70%, and ≥ 60% of students with at least one solve per week.

## Users and roles

| Role | Who | Can |
|---|---|---|
| Student | Club members | Link handles, answer RSVPs, give absence reasons, see leaderboard, feed and profiles |
| Admin | 4–5 coordinators | Everything a student can, plus: see attendance and reasons, approve handles, add admins, deactivate students |

- Sign-in is Google only. The first admin comes from the `ADMIN_EMAILS` secret; other admins are added from the admin page.
- Attendance data (RSVPs, statuses, reasons) is **visible only to admins**. Leaderboard, feed and profiles are visible to every signed-in student.

## Platforms

- **Android app** (Expo): the main way students use it, because of notifications. Distributed as an APK from the website, not the Play Store.
- **Website:** leaderboard, profiles, and the admin dashboard. iPhone users use the website, installable as a PWA. Web push for iPhone comes in week 2.
- No iOS app and no desktop app.

## Feature 1 — Contest attendance

### Contests that count

- **Codeforces:** every contest except pure Div. 1 rounds and special rounds (Kotlin Heroes, April Fools, testing rounds, Q#). A pure Div. 1 round that runs in parallel with a counted Div. 2 round is merged into the Div. 2 entry, so a student in either one is present.
- **CodeChef:** Starters (all divisions are one entry).
- Admins can untick any contest so it doesn't count (e.g. during exams).

### Rules

- Every counted contest creates one attendance entry per active user, students and admins alike, with an approved handle on that contest's platform.
- **Present** = the student made a submission in the contest as a live participant, during the contest. On Codeforces, `CONTESTANT` and `OUT_OF_COMPETITION` both count.
- **Absent** = no live submission. A reason is required. A virtual or practice attempt later still counts as absent, but its solves count on the leaderboard.
- Present or absent is decided by the platform's data, not by what the student answered. A student who said No but took part is present.
- The RSVP answer is kept separately so admins can see "said Yes, didn't show". RSVPs are accepted until the contest is verified.
- Reason types: `exams`, `travel`, `illness`, `clash` (other commitment), `forgot`, `other`, plus optional free text. Text is required for `other`.

### Notifications

| When | Message | Action |
|---|---|---|
| T − 60 min | "Codeforces Round 1095 (Div. 2) starts at 8:05 PM — in 1 hour." | Opens contest page |
| T − 5 min | "Codeforces Round 1095 starts in 5 min. Giving it?" | Buttons: **Yes**, **No** (No asks for a reason) |
| About T + 20 min after end (present) | "Marked present for Codeforces Round 1095." | none |
| About T + 20 min after end (absent, no reason yet) | "You missed Codeforces Round 1095. Why?" | Opens reason form |

- If the student answered **No** with a reason, that reason becomes the absence reason and no "why" push is sent.
- Students with a pending reason see a banner on the app home screen and on the website until they answer.

### Admin attendance view (web)

- Grid of students (rows) × contests (columns), filtered by date range, platform and batch year. Cells show Present / Absent + reason / Absent, no reason.
- Per-student attendance % and count of "said Yes, didn't show".
- Reasons grouped by type.
- CSV export of the current grid.

**Done when:** a contest inserted locally 6 minutes in the future produces the T−5 push on a real device. Answering No + reason from the notification stores it. After the end, a handle with a live submission is marked present and one without is marked absent with the stored reason.

## Feature 2 — Leaderboard

- Counts every first accepted submission per problem on Codeforces, CodeChef, AtCoder and LeetCode, made after that handle was approved. Version 1 covers Codeforces, CodeChef and LeetCode; AtCoder comes in week 2. LeetCode contests don't count for attendance.
- Each solve earns points (formula in `ARCHITECTURE.md → Scoring`). Harder problems are worth much more, and problems above your own rating get a bonus.
- Tabs: **Today**, **This week** (Monday to Sunday, IST), **This month**. Each row shows rank, name, batch year, points, number of solves, and the hardest problem solved in the period, by Codeforces-equivalent rating. Only students with at least one solve in the period are listed. Equal points share a rank.
- **Feed (week 2):** latest solves across the club, e.g. "Aman solved 1700 · dp, greedy · 12 min ago".
- **Profile:** linked handles, CF rating, points today/week/month, solve streak, 6-month heatmap (week 2), and top tags.
- Admin page lists students with more than 30 solves in one day, for manual review. There is no automatic penalty.

**Done when:** a Codeforces AC appears on the leaderboard within 2 hours (usually about 30 min), with points matching the formula.

## Handles

- Each student must link a Codeforces and a CodeChef handle to finish onboarding. Other platforms are optional.
- An admin approves each handle once; it stays approved for good. Only linking a different handle needs a new approval. Unapproved handles are not tracked.
- One handle per platform per student. A handle can't be linked by two students.

## Out of scope

Duels, an in-app problem set, an upsolve tracker, iOS app, Play Store listing, chat, comments, email notifications, and automatic cheating detection.

## Constraints

- ₹0 running cost, no credit card on any service.
- Version 1 built in 1–2 days by one developer.
- Must survive a platform changing its website: one broken adapter must not break the others.
