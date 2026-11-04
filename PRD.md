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

- The first admin comes from the `ADMIN_EMAILS` secret; other admins are added from the admin page.
- Attendance data (RSVPs, statuses, reasons) is **visible only to admins**. Students see only their own, plus an anonymous count of how many said they're going. Another student's profile never shows attendance; admins see it on any profile. Leaderboard, feed and profiles are visible to every signed-in student.

## Accounts

- **Sign in:** Google only. The same button signs up new members, who then fill in one page (name, username, year, handles) and go straight to Home.
- **Approval never blocks the app.** Until a coordinator approves their handles, members can use everything; they just aren't tracked or on the leaderboard. Admins may leave handles empty.
- **Username:** required on that page. Lowercase letters, numbers, `_` and `.`, 3–20 characters, unique, with a short reserved list. Changeable once by the user; after that only an admin can change it.
- **Year:** chosen as 1st to 4th year; the joining year is stored, so everyone moves up on 1 August.
- **Onboarding is resumable:** the API says whether it's finished and clients route there until it is. Existing users see that page once, to pick a username.

## Platforms

- **Android app** (Expo, branded grind.club): the main way students use it, because of notifications. Distributed as an APK from the website, not the Play Store.
- **Website:** leaderboard, profiles, and the admin dashboard. iPhone users use the website, installable as a PWA. Web push for iPhone comes in week 2.
- No iOS app and no desktop app.

## Feature 1 — Contest attendance

### Contests that count

- **Codeforces:** only Div. 2, Div. 3, Div. 4, Educational and Div. 1 + Div. 2 rounds. Everything else doesn't count, including Global Rounds, pure Div. 1 rounds and special rounds such as Kotlin Heroes, April Fools, testing rounds and Q#. A pure Div. 1 round that runs in parallel with a counted Div. 2 round is merged into the Div. 2 entry, so a student in either one is present.
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

- Grid of students (rows) × contests (columns), filtered by date range, platform and year. Cells show Present / Absent + reason / Absent, no reason.
- Per-student attendance % and count of "said Yes, didn't show".
- Reasons grouped by type.
- CSV export of the current grid.

**Done when:** a contest inserted locally 6 minutes in the future produces the T−5 push on a real device. Answering No + reason from the notification stores it. After the end, a handle with a live submission is marked present and one without is marked absent with the stored reason.

## Feature 2 — Leaderboard

- Counts every first accepted submission per problem on Codeforces, CodeChef, AtCoder and LeetCode, made after that handle was approved. Solves from before approval show on the profile as history and earn no points. Version 1 covers Codeforces, CodeChef and LeetCode; AtCoder comes in week 2. LeetCode contests don't count for attendance.
- Each solve earns points (formula in `ARCHITECTURE.md → Scoring`). Harder problems are worth much more, and problems above your own rating get a bonus.
- Tabs: **Today**, **This week** (Monday to Sunday, IST), **This month**, with filters by year and platform. Each row shows rank, movement against the previous period, name, year (1st, 2nd, 3rd or 4th), points, number of solves, and the hardest problem solved in the period, by Codeforces-equivalent rating. Only students with at least one solve in the period are listed. Equal points share a rank.
- **Feed (week 2):** latest solves across the club, e.g. "Aman solved 1700 · dp, greedy · 12 min ago".
- **Sidebar:** points per year of study, biggest climbers against the previous period, and the toughest solves.
- **Weekly challenge:** the club solves 50 problems rated 1400+ this week, showing club progress and your contribution.
- **Profile:** linked handles, CF rating and its history, stat tiles, solve streak, 6-month activity, recent solves, top topics with a weak-topic hint. Your own also shows attendance and contest history.
- **Streak reminder:** an opt-in push at 21:00 IST if you haven't solved today and have a streak of at least 1.
- **Notification preferences:** a switch for each type: 1 hour before, 5 min RSVP, after contest, streak.
- Admin page lists students with more than 30 solves in one day, for manual review. There is no automatic penalty.

**Done when:** a Codeforces AC appears on the leaderboard within about 2 minutes (other platforms within about 5–10 minutes; 30 minutes at most if a run is skipped), with points matching the formula.

## Handles

- Each student must link a Codeforces and a CodeChef handle to finish onboarding; admins may skip this. Other platforms are optional.
- An admin approves each handle once; it stays approved for good. Only linking a different handle needs a new approval. Unapproved handles are not tracked.
- One handle per platform per student. A handle can't be linked by two students.

## Out of scope

Duels, an in-app problem set, an upsolve tracker, iOS app, Play Store listing, chat, comments, email notifications, password sign-in, and automatic cheating detection.

## Constraints

- ₹0 running cost, no credit card on any service.
- Version 1 built in 1–2 days by one developer.
- Must survive a platform changing its website: one broken adapter must not break the others.
