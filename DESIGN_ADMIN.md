# DESIGN — Admin redesign

This file covers only the admin area. Tokens, fonts and base components come from `DESIGN.md`, and the pink-tint token from `DESIGN_ADDONS.md`. The rules are in `PRD_ADMIN.md`. The mockups are on the canvas page **"Admin redesign"** (14 boards plus the shared sidebar). Where this file differs from `DESIGN.md` (gradients, toggle size, active tab colour), it applies inside admin only.

## Layout

- **Desktop (≥ 1024 px):** a fixed **232 px sidebar** on the left and a main column with 28 px top padding, 32 px side padding and 20 px gaps between sections. Content has no max width, and cards wrap with `flex-wrap`.
- **Below 1024 px:** the sidebar becomes a slide-over drawer opened by a ☰ button in a 56 px top bar. Tables scroll sideways inside their card, never the whole page.
- **Page header:** an H1 (Space Grotesk 38 / 700, −0.035em), one muted line explaining the page, and the primary action on the right.

## Sidebar

- **Top:** the existing logo (the app icon at 32 px, rotated −6°), the wordmark, and an **ADMIN** chip (violet-tint background, violet-soft text).
- **Group labels:** 11 px / 700, uppercase, +0.08em, colour `#6E6E80`.
- **Items:** 8 × 12 padding, 12 px radius, 600 weight, muted colour.
  - The **active** item has a `violet-tint` (#2A1F4D) background, `#EDE9FE` text and a 6 px **lime dot**.
  - **Count badges** sit on the right: 11 px / 800 on pink (urgent) or sun (waiting).
- **Bottom:** "← Back to the app", then the admin's own card (avatar, name, "Admin").

## Shared pieces

| Piece | Spec |
|---|---|
| Card | `card` #17171F, 1 px `line` #2C2C3A, 20 px radius, 20 px padding |
| Primary button | lime pill, 40 px (32 px small), ink text, 800 |
| Secondary button | transparent pill, 1 px line, 700. **Danger** variant uses pink-soft `#FF8FBF` text |
| Chip | 3 × 10 padding, 999 radius, 12 / 700, on `card-2`. Status chips: lime-tint/lime = OK or approved, sun-tint/sun = waiting, pink-tint/pink-soft = problem, `#13263A`/`#7DD3FC` = excused or info, violet-tint/violet-soft = scheduled or admin |
| Toggle | 44 × 26 pill. On: lime with the knob on the right. Off: `line` with the knob on the left. The knob is ink |
| Stepper | − value + pill, 34 px buttons on `card-2`, value in JetBrains Mono. Gets a lime border when changed |
| Segmented tabs | a pill track on `card` holding 32 px pills. The active pill is white with ink text |
| Modal | `rgba(8,8,12,.75)` scrim, card max 560–640 px wide, 24 px padding, 22 px title, × button top right |
| Side panel / drawer | a 300–360 px card to the right of the main content |
| Save bar | sticky at the bottom of the main column, `rgba(14,14,20,.94)` with a top border. The status text is sun when unsaved and lime when saved |
| Avatar | a circle in one of 6 accent colours with ink initials: 28–30 px in tables, 40–44 px on cards |
| Numbers | always JetBrains Mono |
| Platform chips | CF `#13263A`/`#60A5FA` · CC `#2A1A0E`/`#FB923C` · LC sun-tint/sun · AtCoder card-2/white · Club violet-tint/violet-soft |

## Pages

1. **Overview**
   - **KPI row:** 4 cards. The first is solid lime because it's the goal metric.
   - **Action inbox:** type tabs with counts; rows of avatar + type chip + title + sub + two buttons.
   - **Attendance bars:** lime when ≥ 70%, otherwise `#3A3A4A`.
   - **At-risk preview.**
   - **Upcoming contests:** a stacked RSVP bar (lime going / pink not going / line no reply).
2. **Members**
   - **Filter row** and **table**.
   - **Right drawer:** stats grid, an 8-cell contest strip, handles, a notes textarea, and danger buttons.
3. **Students & handles**
   - **Top bar:** a search box and an "Only show handles waiting for approval" checkbox-pill (lime-tint background when on).
   - **Student card:** a header with a 40 px avatar, name, year, a status chip, email · @username (violet-soft), and Change username / Deactivate buttons.
   - **Handle rows:** an 86 px platform chip, the handle in mono, a muted detail, a status chip, and actions (Reject + Approve, or Remove approval). A broken handle also gets a pink "Not found" chip.
   - **States:** a deactivated card drops to 55% opacity and its button becomes a lime "Reactivate". The empty state reads "Nothing waiting. Every handle is reviewed ✓".
   - **Change username modal:** includes an availability line.
4. **At-risk:** 3 signal KPI cards; one member card per person with signal chips, three mini stats, and OK for 2 weeks / Open / Nudge. The **Nudge modal** has template pills, a textarea, and a phone-notification preview on `#1B2233`.
5. **Attendance**
   - **KPI row:** club attendance (solid lime), contests counted, "said yes, didn't show" (pink) and reasons pending (sun).
   - **Grid:** a sticky member column, a rate column, a No-show column ("said yes, didn't show"), contest headers (platform colour, ★ for mandatory), and 26 px cells.
   - **Cell styles:** Present = lime ✓, Excused = info-blue X, reason = pink with a letter, no reason = dashed sun ?.
   - **Selection:** the selected cell gets a white outline and its column a `#1F1F29` tint.
   - **Edit panel** on the right above a "Why people missed" reason breakdown, with a legend row above the grid and an exam-week banner (info blue).
6. **Exam weeks:** a create card (fields, batch pills, 3 toggles, an info-blue preview box) next to a list of exam-week cards (Active gets a blue border).
7. **Contests:** a table with toggles for Counts and Mandatory (rows with Counts off at 55% opacity) and an RSVP progress bar. Below it, the custom contest form (source pills switch the fields) next to a sun-tinted "What mandatory does" card (`#1E1A0E` / `#4A3B12`).
8. **Sessions:** a violet-gradient card of suggested topics, the create form, and the session list (date tile + title + status chip). The check-in panel on the right has a big mono counter and tappable rows with a 26 px check box.
9. **Engagement:** batch tabs, 4 KPIs, a weekly bar chart (exam-week dip in pink, the current week in lime), feature-use bars, and the **topic map** (8 tags × batches, 38 px cells in 4 shades: pink-tint < 30%, sun-tint < 45%, lime-tint < 65%, `#4D6B10` above). A detail strip under the map holds "Plan a session".
10. **Fairness:** rule chips, then flag cards (border pink or sun by severity) with an evidence timeline (left rail, time · chip · text). Actions: Clear / Adjust… / **Void** (pink primary). A reason modal shows a pink-tint warning, and History is below.
11. **Seasons:** a live-season card on a violet gradient with a violet→lime progress bar and the top 3. Member-of-the-month candidates are selectable rows (selected = violet-tint with a violet border, "AUTO PICK" in sun). Then past season cards and a "Start new season" modal.
12. **Reports:** a builder card (range pills, checkbox rows, PDF/CSV segmented control, a download button) and a **white A4 preview** that uses light colours only (`#16161E` text, `#F3F2F8` stat boxes) and is also the print stylesheet.
13. **Admins & audit log:** an "Add an admin" card (email input + lime Add), the admin list (your own row has a "You" chip and no Remove; an `ADMIN_EMAILS` admin has an "Owner" chip and no Remove), and the audit log (mono time, area chip, text, who) with filter tabs.
14. **Rules:** a 2-column grid of setting groups with steppers, the read-only upsolve table (band → target pills), and the sticky save bar.

## What members see

These use existing components on the website and in the app.

- **Must attend:** a sun chip with ★ on the contest row and next-contest card.
- **I took part:** a secondary button on an other-site contest's row, becoming a "Waiting for a coordinator" sun chip.
- **Excused:** the info-blue X cell in contest history. An admin's note appears under the entry as "Note from a coordinator".
- **Rejected handle:** a pink-tint status pill in Settings, "Rejected — contact an admin".
- **Points notice:** a `sun-tint` row on their own profile with the change and reason.
- **Season tab:** a segment on the leaderboard after Month, showing the same rows for the season's dates.

## Copy rules

- Speak to the admin plainly: "Approve", "Remove approval", "OK for 2 weeks", "Looks fine, clear".
- Every destructive action says what happens and that it's reversible: "Removes the points from all leaderboards… Reversible from History".
- Text the member will see is labelled: "Note (shown to the member)", "Reason (the member sees this)".
- Use real-looking but fictional data in the mockups. Never show real student emails.

## Accessibility

- Every icon-only button and grid cell has an `aria-label` (for example "Neil Das, R1094: Absent · no reason").
- Toggles are buttons with `aria-pressed`, and modals have `role="dialog"` with focus trapped and Esc to close.
- Status never relies on colour alone: there's always a letter, symbol or word.
- The keyboard can move across the attendance grid with the arrow keys; Enter opens the edit panel.
