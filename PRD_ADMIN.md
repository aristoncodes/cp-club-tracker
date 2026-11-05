# PRD — Admin redesign

The admin area moves from one tabbed page to a **sidebar workspace** with 16 pages. The goal is for 3–5 admins to run a 40–50 member club in a few minutes a day. They should see what needs action and act on it in one click, without anything happening behind their back.

Builds on `PRD.md` and `PRD_ADDONS.md`. Design: `DESIGN_ADMIN.md`. Mockups: canvas page **"Admin redesign"**.

## Scope and principles

- **Web only.** Admin lives at `/admin/*` on the website. The Android app has no admin screens, but admins still get pushes there.
- **Everyone listed on the Admins page is a full admin.** There are no other roles and no batch coordinators.
- **No join code or access gate.** Anyone can sign up as before. Admins control what counts by approving each **handle**.
- **Every write is logged** in `audit_log` with who, when, what, and before → after.
- **Nothing is punished automatically.** Fairness checks and at-risk checks only *flag*; an admin decides.
- **Rules are data, not code.** Every threshold sits in the `settings` table, editable on the Rules page. Changing one never needs an APK.
- **Out of scope:** join codes, a new-academic-year wizard, batch coordinator roles, QR check-in (needs a camera, so it waits for the next APK), calendar sync, streak freeze, any email.

## Decisions

| Question | Decision |
|---|---|
| Copied code check | Codeforces' API doesn't return source code, and scraping it isn't allowed. Replaced by a weak signal: the same problem solved by two members within minutes with identical language, time and memory |
| Topic map | Shows the share of a batch's members with 3+ solves on that tag. True attempt rates would need every failed submission stored |
| Report email | None. PDF and CSV only |
| Duel check | Flags another club member solving a duel's problem during that duel. Solves from accounts we don't track can't be seen |
| Feature use | Leaderboard is left out, because page views aren't tracked. The other five come from existing data |
| Remove approval | Past points stay; only new solves stop counting. Fairness Void is how points are removed |
| Mandatory "double weight" | Counts twice in Reports and the at-risk check. The attendance rate stays present ÷ (contests − excused) |
| Season and member-of-the-month badges | Extra badges on the same page, on top of the 12 |
| Rule changes to points | Apply to new solves only; points are never recomputed |
| `ADMIN_EMAILS` admins | Can't be removed from the page, because sign-in would restore them. The list says why |

## Mapping from the current admin tabs

| Old tab | New page |
|---|---|
| Attendance | Attendance (+ Exam weeks, Contests) |
| Students & handles | **Students & handles** (same behaviour, new look) + Members |
| Admins | **Admins & audit log** (same behaviour, adds the log) |
| Announcements, Club virtuals | Announcements (the existing add-on page, unchanged) |
| Digest | Unchanged, linked from the sidebar under Communicate |
| Flags | Fairness. Broken handles become a "Not found" chip on Students & handles |

## Sidebar

- **Run the club:** Overview · Members · Students & handles · At-risk · Attendance · Exam weeks · Contests · Sessions
- **Engagement:** Engagement · Fairness · Seasons
- **Communicate:** Announcements (incl. club virtuals) · Digest · Reports
- **Settings:** Admins & audit log · Rules

Badges show live counts: Overview = open inbox items, Students & handles = handles waiting, At-risk = flagged members, Fairness = open flags.

---

## A. Run the club

### A1. Overview
- **KPI row:** attendance over the last 4 weeks vs a 70% goal; active this week (solved ≥ 1); POTD solve rate; duels this week.
- **Action inbox** with three types: **Handle** (waiting approval → Approve / Reject), **Reason** (absent with no reason for 2+ days → Remind / Excuse), **Flag** (fairness flag → Review / Clear). There are tabs per type with counts. Resolving an item removes it, and there's an "Approve all handles" button.
- **Attendance trend:** the last 10 contests as bars, with bars ≥ 70% in lime.
- **At-risk preview:** the top 3 members, linking to At-risk.
- **Upcoming contests:** RSVP split (going / not going / no reply), with a ★ chip on mandatory ones.
- *Done when:* every inbox action writes to the DB and the audit log, and the counts update without a reload.

### A2. Members
- A table with name, batch, @username, CF rating, attendance %, last solve, and status (active / deactivated / alumni). Filter by batch and status, plus search.
- **Member drawer:** clicking a row opens it on the right, showing stats, a strip of the last 8 contests, their handles, private **admin notes** (never shown to the member), and danger actions (deactivate, make admin).
- *Done when:* notes save, are visible only to admins, and are logged.

### A3. Students & handles (approval)
This keeps the behaviour of the current page.
- **One card per student:** name, year, email, @username, plus **Change username** and **Deactivate / Reactivate**.
- **One row per linked handle:** platform, handle, and a short detail (rating or solved count), with a status of **Waiting / Approved / Rejected**, plus a **Not found** chip if the platform says the handle doesn't exist.
  - Waiting → **Approve** / **Reject**.
  - Approved → **Remove approval**, which sets it back to Waiting.
- The **"Only show handles waiting for approval"** checkbox, a search box, and **Approve all N**.
- **Only approved handles** count for leaderboards, attendance and duels. A rejected handle's solves are ignored, and the member sees "Rejected — contact an admin".
- An admin can change a username at any time, even after the member has used their one self-change. The new username is checked for being unique.
- **Deactivate:** the member can't sign in, and is hidden from boards and attendance. All history is kept, and reactivating restores everything.
- *Done when:* approving a handle makes its solves count from the next sync, removing approval stops them counting, and every action is logged.

### A4. At-risk
- **Built nightly at 01:00 IST.** A member is flagged by any of these:
  - no solves in **7** days;
  - **2** absences in a row (no reason, not excused);
  - attendance down **20%** vs their previous month.
  - All three thresholds come from Rules. A missed mandatory contest counts as two absences.
- **Cards** show signal chips, last solve, attendance, and when they were last nudged.
- **Nudge:** a modal with templates ("Miss you at contests", "Quick POTD", "Custom"), `{name}` filled in, and a phone preview. It sends a push. Limit: one nudge per person every 3 days. "Nudge all" applies the same limit.
- **OK for 2 weeks:** hides the member until the date (for example medical leave), and is logged.
- *Done when:* the flags match the rules, the nudge limit holds, and a snoozed member stays hidden until the date.

### A5. Attendance
- **Grid:** members × contests. Each cell is one of:
  - **Present ✓**;
  - **Excused X**, which doesn't count against them;
  - **Absent with reason**, showing the reason's letter;
  - **No reason ?**.
  - Mandatory contests have a ★ in the header.
- **Edit entry:** click a cell to open the side panel and set Present / Excused / Absent, with an optional note that is shown to the member. The change is logged as "Anushka changed X on R1094".
- **Rate per member** = present ÷ (contests − excused).
- **Exam-week banner** when one is active. Filter by date range and batch, plus **Export CSV**.
- *Done when:* overrides survive the next automatic attendance run. A manual entry always wins over the automatic one.

### A6. Exam weeks
- **Create:** name, from and to dates, and one or more batches. A preview shows "Affects N contests × M members = K entries excused".
- **Toggles** (all on by default except the last):
  - excuse contests automatically;
  - mute POTD and upsolve reminders;
  - hide from at-risk during the exam week and for 3 days after.
- **List** with status (Active / Scheduled / Done) and actions to Edit, End early, or Delete. Deleting un-excuses entries that weren't edited by hand.
- *Done when:* during an exam week those members get no T−60 / T−5 / T+15 pushes, and their entries show as X.

### A7. Contests
- **Tabs for Upcoming and Past.** Each contest has two toggles:
  - **Counts:** off means the contest is shown but ignored for attendance. Div 1 is off by default.
  - **★ Mandatory:** adds a "Must attend" tag for members, an extra reminder at T−3h, double weight in reports and the at-risk check, and an admin alert when someone is absent with no reason.
- **Upcoming** shows RSVP counts; **Past** shows attended / total.
- **Add custom contest:**
  - **CF gym/group:** attendance is read automatically from each member's submissions, as for normal rounds. A private group Codeforces won't let us read needs manual entry.
  - **Other site:** the member taps "I took part" and an admin confirms on Attendance.
  - **In person:** attendance comes from Sessions check-in.
  - Every type gets the same reminders as normal contests.
- *Done when:* the toggles change attendance and reminders from the next cron run.

### A8. Sessions
- **Suggested topics:** the three weakest tags from Engagement's topic map. "Use this" fills in the title.
- **Create:** title, date, time, room, target batches, an optional practice set, and "Announce now + remind 1 hour before" (sent as an Announcement plus a push).
- **List** of upcoming and recent sessions with a status.
- **Check-in:** a live counter ("N / M here") and a searchable name list where tapping toggles present. QR check-in comes later, with the next APK.
- *Done when:* check-ins are saved per session and counted in Reports.

## B. Engagement

### B1. Engagement
- **Batch filter.**
- **KPIs:** active this week, solves this week, POTD solve rate, duels.
- **Weekly active members** over 10 weeks.
- **Feature use** in the last 30 days: members who used each of POTD, upsolve, duels, virtuals and rivals.
- **Club topic map:** tags × batches showing the share of members with 3+ solves on that tag, in 4 shades. Clicking a cell shows details, with "Plan a session" → Sessions.
- **Precomputed nightly** into a `stats_daily` table, so the page is a cheap read.

### B2. Fairness
- **Nightly checks (thresholds from Rules):**
  - more than 30 solves in a day;
  - 3 or more solves rated ≥ 400 above the member's rating within 20 minutes;
  - the same problem solved by two members within 10 minutes with identical language, time and memory (a weak signal, not proof);
  - another club member solving a duel's problem during that duel.
- **Flag card:** an evidence timeline, then one of:
  - **Clear;**
  - **Adjust points:** ± points, with a reason the member sees;
  - **Void solves:** removed from every board and the season, but kept on the CF profile. Requires a reason.
- **History** of every decision, each one reversible.
- *Done when:* voiding or adjusting changes every board immediately, the member gets a notice with the reason, and an undo restores the points.

### B3. Seasons
- **A season** is a separate leaderboard for a date range. All-time points never reset.
- **Live season card:** name, dates, a progress bar, the top 3, and totals.
- **Member of the month:** picked automatically on the 1st, by the biggest % gain in points vs the member's previous month (minimum 10 solves). An admin can override the pick, then **Announce**, which sends an announcement and gives a badge.
- **Past seasons:** the frozen final board and a recap card.
- **Start new season:** name and dates. When the current season ends, the board freezes, the top 3 get a season badge, everyone gets a season recap, and season points go to 0.

## C. Communicate

### C1. Announcements
The existing add-on page (`PRD_ADDONS.md` A1 + D2), moved under the sidebar. No changes.

### C2. Reports
- **Period:** this month, last month, this semester, or custom.
- **Sections:** summary numbers, attendance by batch, top performers, rating growth, a per-member table, and sessions held.
- **Format:**
  - **PDF:** a print-styled page, saved with the browser's own "Save as PDF", so nothing runs on the server.
  - **CSV:** generated by the Worker.
- **Live A4 preview.**

## D. Settings

### D1. Admins & audit log
This keeps the behaviour of the current page.
- **Add an admin by email.** The email must belong to an existing account, otherwise show the error "No account with this email". The new admin gets a push.
- **Admin list** with **Remove**. You can't remove yourself, the last remaining admin, or anyone in the `ADMIN_EMAILS` secret.
- **Audit log** of every admin write, filterable by All / Attendance / Handles / Fairness / Admins / Rules, and paginated (50 per page).

### D2. Rules
Every number lives here. Changes apply from 00:00 IST the next day.

| Group | Setting | Default |
|---|---|---|
| Points | POTD bonus | +5 |
| | POTD bonus if tags were revealed first | +2 |
| | Live contest multiplier | ×1.5 |
| Fairness | Max solves per day | 30 |
| | Fast hard solves (≥400 above own rating) | 3 in 20 min |
| | Matching solves window | 10 min |
| At-risk | No solves for | 7 days |
| | Absences in a row | 2 |
| | Attendance drop vs previous month | 20% |
| | Nudge limit | 1 per 3 days |
| | "OK for" snooze | 14 days |
| Attendance | Goal | 70% |
| | Reason inbox after | 2 days |
| | Exam-week at-risk grace | 3 days |
| Seasons | Member of the month minimum | 10 solves |
| Reminders | POTD posted | 08:00 |
| | Mandatory contest reminder | 3 hours before |
| | Streak reminder | 21:00 |
| | Weekly recap | Sun 21:00 |

- The **upsolve target table** from `PRD_ADDONS.md` A2 is shown here **read-only** in v1.
- A **save bar** shows "N unsaved changes" with Discard and Save. Saving is logged with before → after for each setting.

## E. What members see

The admin pages are web only, but these reach members on the website and, over the air, in the app.

- **Handles:** "Rejected — contact an admin" in Settings.
- **Nudges and sessions:** pushes, and session announcements in the inbox.
- **Attendance:** Excused entries (shown as X, not counted against them) and an admin's note on their contest history.
- **Exam weeks:** no contest, POTD or upsolve reminders during theirs.
- **Contests:** a "Must attend" tag and T−3h reminder on mandatory contests; custom contests in their list; an "I took part" button on other-site contests.
- **Fairness:** a push and an entry on their profile giving the reason when points are adjusted or voided.
- **Seasons:** a "Season" tab on the leaderboard, season and member-of-the-month badges, and a season recap.

---

## Data changes (summary)

New tables:
- `settings` (key, value, pending_value, pending_from, updated_by, updated_at). A saved change takes effect once `pending_from` has passed
- `audit_log` (id, admin_id, area, action, target, before, after, at)
- `admin_notes` (user_id, admin_id, text, at)
- `exam_weeks` (+ `exam_week_batches`)
- `sessions` (+ `session_batches`) and `session_checkins`
- `fairness_flags` and `point_adjustments`
- `seasons` and `member_of_month`
- `nudges` and `at_risk` (user_id, signals, snoozed_until)
- `stats_daily`

New columns:
- `handles.status` (waiting / approved / rejected) plus reviewed_by / reviewed_at. `approved_at` stays the one test for "counts"
- `users.deactivated_at` alongside `active`
- `attendance.status` gains `excused`, plus `manual`, `note`, `exam_week_id` and `claimed_at`. The stored words stay `present` / `absent` / `excused`; P, X, A and ? are how they're shown
- `contests.mandatory`, `contests.source` (cf / cc / gym / other / offline) and `contests.mandatory_reminded`; `contests.platform` also allows `other`. `contests.counts` already exists
- `solves.voided_points`

## Jobs (cron)

| When (IST) | Job |
|---|---|
| 01:00 nightly | At-risk check |
| 01:01 nightly | Fairness check |
| 01:02 nightly | `stats_daily` |
| 1st of the month, 02:00 | Member of the month draft |
| Season end date, 00:00 | Freeze the season |
| Every contest-reminder run | Skips members in an exam week; adds T−3h for mandatory contests |

All jobs stay inside the 10 ms CPU limit by doing the heavy SQL in D1 and processing in batches.

## Done when (whole feature)
- Every page on the canvas exists and works with real data.
- Every admin write appears in the audit log.
- Changing a Rules value changes behaviour the next day without a deploy.
- A handle that isn't approved never counts anywhere.
- Running cost stays at ₹0.
