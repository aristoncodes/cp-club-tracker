# DESIGN — Add-ons

This file covers only the add-ons. Everything else (tokens, typography, base components, main screens) stays in `DESIGN.md`, which this file builds on. Rules come from `PRD_ADDONS.md`.

## Navigation changes

- **App bottom tabs:** **Home · Board · Practice · Duels · Contests**. There is still no "Me" tab.
  - Feed moves inside Board behind a "Rankings / Feed" segmented switch.
  - Icons: house, bar chart, target (three rings), crossed swords, calendar.
- **Web nav links:** **Home · Leaderboard · Practice · Duels · Contests · Feed · Admin** (Admin for admins only).
  - A **bell** button (40 px, `card` fill, pink unread dot) sits before the streak pill and opens the announcements dropdown.
  - **Under 640 px:** the same five bottom tabs as the app. Feed is reached from Leaderboard, and Admin from Profile (admins only).
- **App Home** gets a 44 px bell button next to the streak pill. It opens the Announcements screen.

## Mockups and tokens

The reference mockups are on the canvas page **"Add-ons"**:
- **App screens:** Home with add-ons, Practice, Duels, New duel, Live duel → result, Badges, Sunday recap, Contests, Club virtual standings, Announcements inbox, All new notifications, Update ready, New APK version.
- **Coordinator tools:** Admin announcements + club virtuals, and the digest email.
- **Website:** Home, Practice, Duels, Live duel, Contests, Club virtual standings, Badges, Sunday recap.

Rules come from `PRD_ADDONS.md`. Everything uses the existing tokens; the add-ons introduce only these new ones:

| Token | Hex | Use |
|---|---|---|
| `pink-tint` | `#3A1427` (border `#6B2546`, text `#FFB3D4` / `#FF8FBF`) | Duel invites, losses, wrong answers, "Can't make it" |
| `lock` | `#20202B` with `#5A5A6E` glyph | Locked badges |

### New components

- **Bell + inbox.**
  - **App:** a 44 px round bell on Home, which opens the Announcements screen.
  - **Web:** the nav bell opens a 380 px dropdown card listing announcements. Unread items get a `#1F1F29` row and a pink dot.
  - **Pinned announcement:** a `violet-tint` strip on Home with a pin icon, a bold title and one line of text, linking to its target.
  - **Inbox item:** author · time, bold title, body, and an audience chip ("Everyone", "2nd year").
- **Problem of the day card.**
  - A `lime` card with `ink` text and the eyebrow "PROBLEM OF THE DAY" + band.
  - The problem in display 20 (app) or 30–36 (web), and a rating chip on an `ink` pill in the rating colour.
  - "Solved by N of M in your band · +5 bonus".
  - A dashed "Reveal tags · bonus +5 → +2" chip. Tapping it opens a small confirm dialog: "Reveal tags? Your bonus drops from +5 to +2." with **Keep hidden** (primary) and **Reveal** (outline).
  - Once revealed, it shows tag chips (`rgba(14,14,20,.12)`), and the bonus line reads "+2 bonus · tags revealed" with the "+2" in `ink` at 70% opacity.
  - An `ink` button with `lime` text: "Solve it" / "Open on Codeforces".
  - **Practice** adds "next in 8h 12m" in mono, avatars of members who solved it, and a 7-day POTD strip (✓ = ink tile with lime check; today = dashed outline).
  - **Web Practice** adds a "Your band today" side card: avatar, @username, and a status — "solved · time" (`lime`), "trying · 2 WA" (`sun`) or "not yet" (`muted`).
- **Weekly goal ring.** A 52–72 px SVG ring with an 8 px `lime` arc on a `card-2` track and "6/7" in mono in the centre, next to "7 at 1300+ · 1 to go".
  - **Editor:** two rows of 4 mono chips (count, then minimum rating; the selected one is `lime`), the suggestion line, and Save.
  - The ring locks (editor hidden) from Thursday.
- **Rival card.** "You vs your rival", plus a pink "X leads by N" (or lime "You lead by N").
  - Two avatars with @usernames and "VS" between them.
  - Four mono rows (Points, Solves, Contests, Duels): the leader's number is `lime`, the trailer's `muted`, and the rival's lead `#FF8FBF`.
- **Upsolve row.**
  - A 28–32 px tile with the problem letter, the name, "Round · note", a rating chip, and Open.
  - **Done:** a `lime` ✓ tile, struck-through name, 65% opacity.
  - **Web:** rows grouped under uppercase contest headers.
  - **Home nudge:** a pink count tile + "Upsolves left from Round N".
- **Duel components.**
  - **Rating hero:** a `violet` card with the mono 40–56 duel rating, a lime "▲32 this week" chip, and W/L/D tiles on `violet-deep`, plus "Challenge someone" (primary) and "Random" (outline).
  - **Invite card:** `pink-tint` with the challenger's avatar, "@x challenged you", "range · minutes · expires in 8:42", Decline (outline) and Accept (pink fill).
  - **New duel form:**
    - an opponent search plus selectable rows (avatar, @username, CF rating in rating colour, duel rating, and a radio that turns `lime` ✓);
    - a difficulty choice of 3 cards (Easy / Even / Hard with the mono range);
    - a time choice of 3 mono chips;
    - a `violet-tint` explainer;
    - a full-width CTA naming everything: "Challenge @riyacodes · 1400–1600 · 45 min".
    - **App:** this is its own screen. **Web:** it's a side card on Duels.
  - **Live duel:** avatars of both players (yours with a 3 px lime outline), a mono 64–72 timer with "LIVE", a `violet` problem card with a rating chip and "Open on Codeforces", one status row per player (WA shown in `pink-tint`), "I submitted, check now" (primary), and "Give up" (pink text).
    - **Status row states:** "No submissions yet" (`muted`), "Testing… · submitted 8:30:05" (`sun` with a small pulsing dot, the only motion here), "WA on test 4 · 4 min ago" (`pink-tint`), "Accepted · 18:52" (`lime`).
    - **Whole-duel states:**
      - "Judging…": a `sun-tint` strip above the actions reading "Waiting for @x's earlier submission to be judged". Shown while a decision is blocked by a pending verdict.
      - "Checking…": same strip, shown while Codeforces doesn't answer.
    - After "check now", the button reads "Checked a moment ago" for the 20 s cooldown. Below it: "Checked automatically every minute · last check 0:34 ago".
    - The result screen always shows the winning time from the submission timestamp ("Accepted 18:52 after the start"), never the time of the check.
    - **Spectators** see the players, timer and status rows, but not the problem card until the duel ends.
  - **Result:** a tilted 120–140 px lime "W" tile (pink "L", `card-2` "D"), display 40–52 "You won!", the time, both rating changes (+ `lime`, − `#FF8FBF`), and Rematch + Back.
  - **Recent duels:** a W/L/D tile, "vs @x", "rating · how it ended", and a mono delta.
  - **Duel board:** rank, @username, W–L, and the mono rating in `lime`; your row is `lime-tint`.
- **Badge tile.** A card with a 54–68 px tile rotated −6° and a mono glyph (AC, 7d, 30d, 5×, 10×, UP, PD, GO, ↑, VS, GS, #1).
  - **Earned:** the tile's accent fill, plus an "Earned 29 Oct" chip (web) or the date (app).
  - **Locked:** `lock` fill, a 5–6 px progress bar and "8 of 10".
  - **Celebration:** a bottom sheet (app) or centred modal (web) with confetti — small rotated rectangles and dots in the accents, static, no animation loop. It shows "NEW BADGE", a 110–120 px tile, the name in display 32–36, the next goal, and a "Nice!" primary button.
- **Sunday recap story.**
  - A full-screen `violet` card (app), or a 460 × 860 card centred on `#08080C` with round prev/next buttons (web).
  - At the top: 3 progress segments (white for done and current, 30% white for upcoming) and a close ×.
  - Eyebrow "Your week · dates", then a display headline per page: "Big week, {name}." / "Your highlights." / "Around the club.".
  - **Page 1:** a tilted `lime` points card (mono 64–72) with rank + change, and Solves / Contests tiles on `violet-deep`.
  - **Page 2:** four highlight rows (streak, top topic, duels, goal), each with a coloured glyph tile.
  - **Page 3:** a tilted `ink` shoutout card (avatar, @username, reason) and a "Next week" note.
  - Buttons: Next (white pill, violet text), then Replay + Done (`lime`).
- **Club virtual.**
  - **Tag:** a white pill with violet text, "CLUB VIRTUAL".
  - **Feature card:** a `violet` card with the date, the round name in display, a note with "N going", I'm in (primary), and Standings / Preview standings (outline).
  - **In lists:** the date tile is violet, and the row is tinted `#1D1730` on web.
- **Club virtual standings.** A `violet` header with tag, LIVE, the round, "Started · N members in", a mono countdown and "Open on Codeforces".
  - **Table:** rank, avatar + @username, then one 24–30 px cell per problem: solved = `lime` with "+" or "+N" and, on web, the minute below; wrong = `pink-tint` "−N"; untried = `card-2`. Then solved count (`lime`) and penalty (`muted`). Your row is `lime-tint`.
  - **Web sidebar:** per-problem solve bars ("13 of 14") and a legend.
- **Update ready card (over-the-air).**
  - A `card` panel pinned above the tab bar: a `lime` refresh-icon tile, "Update ready", "Restarting takes 2 seconds.", and **Later** (1/3 width, outline) + **Restart to update** (2/3 width, primary).
  - Later turns it into a `lime` "Update" pill in the header.
  - Restarting shows a `violet` splash with the logo tile, a lime progress bar and "Updating to version X…".
  - Afterwards: a `lime-tint` "✓ Updated to version X" note with one line of what's new and a dismiss ×.
- **New APK sheet.**
  - **Optional:** a bottom sheet over dimmed Home with the app icon tile, "New app version", "Version 1.5 · 18 MB · you have 1.4", a "What's new" box, an install hint, "Download update" (primary) and "Not now".
  - **Required:** a full screen with a tilted `sun` download tile, "Please update the app", the reason, 3 numbered steps, "Download version 1.5" (primary) and "Or open the website meanwhile".
- **Web refresh toast.** After a deploy: a small `card` toast at the bottom right — "New version available" + a "Refresh" primary button.
- **Lock-screen notifications.** Each push uses the app icon (violet tile, lime `>_`) and "OOPS · time" with a category chip (Duel, Practice, Streak, Rival, Badge, Club, Recap), then a bold title and one line. Duel invites add ACCEPT (lime) and DECLINE (muted) actions.

### Admin additions (web)

- **Sub-tabs:** Attendance · Students & handles · Admins · **Announcements** · **Club virtuals** · **Digest** · Flags.
- **Announcements page:**
  - **Composer card:** title input; message textarea with a mono "142 / 280" counter; audience pills; optional link; Send now / Schedule pills (Schedule reveals a date-time field); a "Pin to Home" switch; and a primary CTA with the count ("Send to 47 members").
  - **Side:** a phone notification preview on `#1B2233`, and a "Sent" list with "seen by N of M" bars.
- **Club virtual scheduler:** Codeforces contest id (mono), start (IST), a `lime-tint` "✓ Round name · length · N problems" confirmation, a "Counts for attendance" switch (off), and "Schedule virtual".
- **Digest email:** a light email (600 px wide, white card on `#E9E9EF`) with an `ink` header, three KPI tiles (attendance in `lime`), a contest table, a pink "Needs a nudge" box with name chips, top climbers, handles waiting + new sign-ups tiles, and an `ink` "Open Admin" button. Light theme because email clients render dark mail poorly.

### Screens

- **App Home:** header (date, name, bell, streak pill, avatar) → pinned announcement → next contest row → problem of the day → goal ring + upsolve tile (2-up) → rival card.
- **App Practice:** title → problem of the day (large) → weekly goal (with editor) → Upsolve list → "Train a weak topic" chips.
- **App Duels:** title → rating hero → invite (if any) → Live now → recent duels → duel board. New duel and Live duel are pushed screens with a back chevron.
- **App Contests:** title → Upcoming / Club virtuals / Past segmented control → lists.
- **Web Home:** greeting + pinned announcement on one line. Main column: problem of the day banner (with a big tilted rating tile on the right), then a 3-up row (next contest `violet`, goal ring, upsolve count tile). Sidebar: rival card and duels (invite + rating).
- **Web Practice:** problem of the day + "Your band today" side by side, then Upsolve (main) next to the goal editor and weak topics (sidebar).
- **Web Duels:** main column with the rating hero, invite, recent duels + duel board (2-up) and "Live now"; the New duel form is the sidebar.
- **Web Live duel:** centred 900 px column with the face-off row, problem card, 2-up status, and actions.
- **Web Contests:** title + segmented tabs on one row → upcoming list (main) + club virtual feature card (sidebar).
- **Web Badges:** back link, title + "5 of 12 earned · closest next", auto-fill grid of badge cards (min 170 px).

### Copy

- Duel results in the feed: "@a beat @b on a 1500 in 18 min".
- Problem of the day push: "Problem of the day is up. A 1600 for your band."
- Never shame: "2 upsolves left" (not "you failed 2 problems"); a draw is "nobody solved it".
