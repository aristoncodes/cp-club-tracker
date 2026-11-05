# DESIGN — OOPS.Grind

The reference mockups are the five artboards on the "CP Club Tracker redesign" canvas (Web · Leaderboard, Web · Admin attendance, Web · Sign in, App · Home, App · Leaderboard). When this file and the canvas disagree, this file wins.

## Direction

**Arcade scoreboard.** Dark and dense like a ratings table, but fun: big colour-filled cards, chunky pill buttons, huge monospace numbers, small playful touches (a tilted logo, a tilted highlight word, rank arrows, a streak flame).

The colour split follows the 60-30-10 rule: 60% neutral (charcoal backgrounds and cards), 30% structure (violet, for brand and contest cards), 10% accents (lime, pink and yellow, for actions, points and highlights).

Rules:

- Fun comes from colour blocks, type scale and rounded shapes. No gradients, no drop shadows, no emoji, no illustrations.
- Every number (points, ranks, ratings, countdowns, percentages) is in monospace.
- Copy is short, friendly and never shaming ("Can't make it", not "Absent").
- Dark only, on both app and web. There is no light theme.

## Tokens

Define these once: CSS variables in `web/src/index.css` (mapped through Tailwind's `@theme`) and one `app/theme.ts` object. Use the token names in code, never raw hex.

### Colours

| Token | Hex | Use |
|---|---|---|
| `ink` | `#0E0E14` | Page background; text on bright fills |
| `card` | `#17171F` | Cards, table, inputs, segmented control track |
| `card-2` | `#20202B` | Progress bar tracks, rating chips, inactive cells |
| `card-3` | `#262633` | Empty activity cells |
| `line` | `#2C2C3A` | 1 px card borders and dividers |
| `text` | `#F4F4F7` | Primary text |
| `muted` | `#9A9AAE` | Secondary text, labels, inactive tabs |
| `violet` | `#8B5CF6` | Logo tile, next-contest card |
| `violet-deep` | `#4C1D95` | Countdown tiles inside violet cards |
| `violet-tint` | `#2A1F4D` | Eyebrow chips, admin sub-tab active |
| `violet-soft` | `#C4B5FD` | Text and outlines on violet surfaces |
| `violet-pale` | `#EDE9FE` | Secondary text on violet |
| `lime` | `#C6F432` | Primary buttons, active tab, points, #1, present, your progress |
| `lime-tint` | `#232B12` (border `lime-line` `#4D6B10`) | Your own row |
| `pink` | `#FF5FA2` | #2, absent with reason, rank drops, challenge bar |
| `pink-tint` | `#3A1427` (text `pink-text` `#FF8FBF`) | "Can't make it" pill |
| `sun` | `#FFD23F` | #3, streak, "no reason yet", warnings |
| `sun-tint` | `#2A2111` (border `sun-line` `#5C4613`, text `sun-text` `#FFE58A`) | Pending-reason banner |
| `sky` | `#4CC9F0` | Avatars and chart series only |
| `orange` | `#FB923C` | Avatars; CodeChef tag |
| `lilac` | `#A78BFA` | Avatars only |
| `cf-blue` | `#60A5FA` | Codeforces tag |

Text on `lime`, `pink`, `sun` and `sky` is always `ink`. Text on `violet` is white, with `violet-soft` or `violet-pale` for secondary text.

### Rating colours

Brightened Codeforces ranks, for handles and problem ratings only, via `ratingColor(r)` in `shared/rating-color.ts`.

| Rating | Hex |
|---|---|
| < 1200 | `#B4B4C2` |
| 1200–1399 | `#4ADE80` |
| 1400–1599 | `#22D3EE` |
| 1600–1899 | `#60A5FA` |
| 1900–2099 | `#C084FC` |
| 2100–2399 | `#FBBF24` |
| ≥ 2400 | `#F87171` |

Platform colours: Codeforces `cf-blue` (or a white pill with `#5B21B6` text on violet), CodeChef `orange`, AtCoder `text`, LeetCode `sun`.

### Avatars

No profile photos. Avatars are initials on a solid colour, picked by `userId % 6` from [lime, pink, sun, sky, lilac, orange], with `ink` text.

## Typography

| Role | Font | Size / weight / tracking |
|---|---|---|
| Display (page titles, card titles, brand) | Space Grotesk | Web H1 52 / 700 / −0.035em; app title 26–30 / 700 / −0.03em; card title 17–22 / 700 / −0.02em |
| Body and UI | Inter | 14 / 400–700; small 12–13 |
| Labels | Inter | 11–12 / 700, uppercase, +0.06–0.08em |
| Numbers, handles, ratings, countdowns | JetBrains Mono | 800 for values, 700 for handles |
| Big stat | JetBrains Mono | 32–40 / 800 / −0.03em |

Web uses one Google Fonts request: `Inter:wght@400;500;600;700`, `Space+Grotesk:wght@500;700`, `JetBrains+Mono:wght@500;700;800`. The app uses `@expo-google-fonts/inter`, `/space-grotesk` and `/jetbrains-mono`.

## Shape, spacing, motion

- **Radius:** 999 for buttons, tabs, chips and badges. 22 for main cards. 20 for stat and sidebar cards. 16 for rows and banners. 14 for countdown tiles. 7–10 for grid cells and the logo tile.
- **Spacing:** scale 4, 6, 8, 10, 12, 14, 16, 20, 24, 28. Page gutter 24 on web, 18 on app. Web max width 1200.
- **Borders:** 1 px `line` on neutral cards. Coloured cards have no border.
- **Motion:** buttons get `translateY(-1px)` and `brightness(1.08)` on hover, over 150 ms ease-out. No page transitions and no looping animation.
- **Touch and contrast:** touch targets ≥ 44 px, text contrast ≥ 4.5:1. Status is never shown by colour alone; it always has a symbol or letter too.

## Components

Build only these. Each lives in the file that uses it unless 2+ screens need it.

- **Button.** Primary: `lime` fill, `ink` text, 800 weight, pill; height 40–44 on web, 48 on app. Secondary: transparent with a 2 px outline (`violet-soft` on violet cards, `line` elsewhere). Warning: `sun` fill, `ink` text.
- **Segmented tabs** (Today / Week / Month): a pill track (`card` with a `line` border, 4–5 px padding). The active segment has a `lime` fill and `ink` text; inactive segments use `muted` text.
- **Nav (web):** logo tile (the app icon at 34 px, radius 10, rotated −6°) + wordmark "OOPS" + lime "." + "Grind" in Space Grotesk. Links, in order: **Home · Leaderboard · Contests · Feed · Admin** (admins only). Links are pills; the active one has a `text` fill and `ink` text. Right side: streak pill (`sun`, flame icon + mono number) and the **avatar, which links to your Profile**; on the Profile page it gets a 2 px `lime` outline. There is no "Me" or "Settings" link in the nav.
- **Bottom tabs (app):** **Home · Board · Contests · Feed**. No "Me" tab. Stroke icons at 22 px; the active tab is `lime`, inactive ones `muted`. 1 px top border. Profile and Settings are pushed screens: none of the four tabs is active on them.
- **Avatar button (app):** a 44 px avatar at the top right of Home and Board that opens Profile.
- **Screen header (app, pushed screens):** a 44 px back chevron on the left and the title. On Profile, the title is centred with a 44 px settings gear on the right; on Settings, the title is in display 24 next to the back chevron.
- **Pending-reason banner:** `sun-tint` card with a `sun` "!" tile, a bold line naming the contest, one helper line, and an "Add reason" warning button. On the app the whole banner is the button.
- **Podium cards (web):** three cards, solid `lime` / `pink` / `sun` with `ink` text. Contents: avatar (ink circle), "1st/2nd/3rd" in display 44, name, `@username · rating`, points in mono 40, and a "N solves · max R" chip. Heights step down 250 / 226 / 210.
- **Podium (app):** columns ordered 2-1-3, each with an avatar ringed in its colour and a coloured block of height 84 / 112 / 68 showing rank and points.
- **Leaderboard row:** rank (mono 800) + movement (▲ `lime`, ▼ `pink`, — `muted`), avatar, name + year (`muted`), `@username` in rating colour, solves, max rating as a chip in rating colour, points in `lime` mono, right-aligned. Radius 14 with no divider lines. Your own row uses the `lime-tint` fill and border.
- **Chase bar:** "You're #6 · 22.3 pts behind Meera" + a 10 px `lime` progress bar, plus a hint chip ("One 1500 problem ≈ +N", computed with the real scoring formula). On the app, a pinned `lime` "You" bar above the tabs replaces it.
- **Next-contest card:** `violet` fill, platform pill, contest name in display font, IST time, and a three-tile countdown (days / hrs / min in `violet-deep` tiles). Before answering: "Participating" (primary) and "Can't attend" (outline). After Yes: a `lime` strip "You're participating. Good luck!" + "Change". After No: "What's the reason?" with reason chips (Exams, Travel, Unwell, Clash, Other) + "I can participate after all". Footer: stacked dots that identify nobody + "31 of 47 are going".
- **Stat card (app):** `card` with label, big mono value, and a one-line context ("#5 in club · 2 solves").
- **Streak card:** a 7-day strip (M–S) of radius-10 tiles: done = `sun` fill with ✓, today = dashed `sun` outline, future or missed = `card-2`. Helper: "Solve one problem today to make it 13."
- **Weekly challenge card:** title, mono "31/50" in `pink`, one-line goal, 12 px `pink` progress bar, and your own contribution.
- **Feed item:** avatar, "**Name** solved 1700 C on Codeforces", tags · time ago in `muted`, rating chip on the right.
- **Admin KPI cards:** four in a row. The first (club attendance) is a `lime` fill; the others are `card` with a coloured mono value (`pink` for "said yes, didn't show", `sun` for pending).
- **Attendance grid (admin):** a `<table>` inside a card with horizontal scroll, sticky first column (avatar + name + year) and a rate column (`lime` ≥ 70%, `sun` ≥ 50%, `pink` below). Column headers: platform (CF blue / CC orange), short name, date. Cells are 24 px squares: Present is `lime` with ✓; absent with reason is `pink` with a reason letter (E exams, T travel, U unwell, C clash, F forgot, O other); no reason yet is a 2 px dashed `sun` outline with ?. A legend sits above the grid, and a tooltip shows the full reason.
- **Reason breakdown:** label + count + a 10 px bar per reason type, each in its own accent.
- **Year filter chips (leaderboard):** All / 1st year / 2nd year / 3rd year / 4th year pills. The active one has a `text` fill and `ink` text; the others are outlined in `line`. Filtering re-ranks the podium and table within the year; the chase bar always uses the whole club. Next to them sits a divider and an "All platforms" select pill.
- **Year vs year card:** total points per year of study for the selected period, as a 12 px bar each (1st `sky`, 2nd `pink`, 3rd `sun`, 4th `lilac`), scaled to the leader.
- **Biggest climbers card:** the top 3 rank gains vs the previous period: avatar, name, "now #N", and a `lime-tint` pill showing "▲4".
- **Hardest solves card:** the 3 highest-rated solves this period: avatar, name, problem + platform, rating chip.
- **"Upcoming" list (home):** the next 4 counted contests. Each row: a date tile (weekday + day number on `card-2`), name, platform (coloured) · time, and an RSVP status pill: "Going" (`lime-tint`), "No response" (`card-2` / `muted`), "Can't make it" (`pink-tint`, `pink-text`).
- **Profile header:** Web: a 96 px avatar, the name in display 44, the **@username** right under it (mono 17 / 700, `lime`), then chips for year and each linked handle (`CF your_handle · 1287`, with the platform colour on the prefix and the rating colour on the rest; unapproved handles show "pending" in `muted`; only you and admins see unapproved ones). A "Settings" outline pill with a gear icon sits on the right. App: the same, centred, with an 80 px avatar and the @username in mono 15.
- **Username field (settings, one-time change):** Normal: label "Username" + `@username` in `lime` mono 18, a "1 change left" chip and a "Change" outline button. Editing: a field with an "@" prefix and a live availability check; a `sun-tint` warning "You can change your username only once. This can't be undone."; **Cancel** + a `sun` "Confirm username" button. Used: the name, a lock icon + "Locked" chip, and the helper "You've already changed your username. Contact a coordinator if you need another change." On the app, the same states sit in a compact row with a "Change (1 left)" button.
- **Profile stat tiles:** points this month (a `lime`-filled tile), total solves, attendance (your own profile, or for admins), current streak (`sun` value), CF rating (rating-coloured value, "max 1312" below).
- **Rating chart:** a CF rating line in `lime` (3 px, round joins) with a dot on the latest value. Behind it, faint rank bands (6% opacity of each rating colour) and the band edges labelled in mono 11. It has an `aria-label` summarising the trend.
- **Recent solves list:** platform code (coloured), problem name, tags · time ago, rating chip, and the points earned (`+31.5` in `lime` mono). Only solves that scored.
- **Top topics:** the 6 most-solved tags as 8 px bars in rotating accents, then one `muted` line naming the 2 least-solved of your tags as a suggestion.
- **Contest history (profile, your own or for admins):** the last 6 counted contests, with the same ✓ / letter / ? cell as the admin grid, the name, and "date · result" (rating change for CF, problems solved live for CC, or the absence reason). The header shows "8/9" in `lime` mono.
- **Handle row (settings):** a 40 px platform tile (radius 12, platform colour, two-letter code in mono), the platform name and "Required" / "Optional". Linked: `@handle` in mono, a status pill ("Approved" `lime-tint`, or "Waiting for approval" `sun-tint`) and an "Edit" text button. Not linked: a pill text input + a "Link" primary button. App: a compact row with the status pill or a "Link" button.
- **Toggle switch:** a real `<button aria-pressed>` (app: `accessibilityRole="switch"`): a 52 × 30 track with a 24 px knob. On: `lime` track with an `ink` knob on the right. Off: `line` track with a `muted` knob on the left. Each sits in a row with a bold title and a one-line `muted` description.
- **"Low attendance":** a `violet-tint` card listing students below 50%.
- **Activity card:** one card, two parts side by side, wrapping to stacked under 900 px. Left: 26 weeks × 7 days of 14 px squares, 4 px gap, radius 4; weeks left to right, days top to bottom (Mon first); today is the last square; future days aren't drawn. Month labels above the first week of each month and Mon / Wed / Fri on the left, 11 px `muted`. Levels: 0 solves = `card-3`; 1, 2–3, 4–5 and 6+ solves = `lime` at 25 / 50 / 75 / 100%. Tooltip: "3 solves · Tue, 4 Nov". Legend row: "N solves in 6 months" and "Less ▢▢▢▢▢ More". Right: a 2×2 stat grid: total solves, active days, longest streak (`sun`), best day. Empty state: the grid dimmed with a centred line: "No activity yet. Your first accepted solution will appear here." (just "Nothing here yet." on someone else's profile). It scrolls inside the card on phones and opens at the latest weeks.

## Screens

### Page structure (web and app)

- **Home:** your day. What to do next and how you're doing.
- **Leaderboard / Board:** the club. Rankings and comparisons only; no contest card and no feed.
- **Contests:** the full schedule with your RSVP status, and past contests.
- **Feed:** every recent solve across the club.
- **Profile:** opened from your avatar. The same page opens (without the Settings button or attendance) when you tap another student's row.
- **Settings:** opened from the Settings button on Profile. Handles, notifications, name and year, sign out.
- **Admin:** web only, admins only.
- **Sign in / Sign up:** Google only; the same button does both. New members then see one page: name, username, year and handles. **Continue** goes straight to Home. Coming back with that page unfinished returns to it. Admins may leave handles empty. **Approval never blocks anything:** until a coordinator approves their handles, the user can use the whole app; Home shows a "Waiting for approval" banner and they don't appear on the leaderboard.
- **Username:** every member picks a unique `@username` on the sign-up page. 3–20 characters: letters, numbers, `_` and `.`; case-insensitive; checked live with "✓ available". It can be changed **exactly once**, from Settings; after that only an admin can change it.

### Web

| Route | Layout |
|---|---|
| `/login` | Two columns. Left (max width 460): logo; display headline 56 "Welcome back. **Let's grind.**" (line 2 in `lime`) and a sub-line saying new members use the same button; a white "Continue with Google" pill; the Android / iPhone hint. Right: a tilted `lime` "This week" example card, a `violet` T−5 notification preview, a feed item, all clearly marked as examples. Under 900 px it stacks into one column with the preview cards hidden |
| Any unknown URL | Logo; display H1 48 "Page not found"; one `muted` line; `lime` "Back to home" link. No nav |
| `/signup` | One page after the first Google sign-in, max width 640: logo; display H1 48 "Welcome to the club"; display name; Username with a `muted` "@" prefix, mono value, live "✓ available" (`lime`, with a `lime-tint` border) or "taken" (`pink`), helper "3–20 characters… You can change it **once** later"; year chips (1st–4th year; selected is a `lime` fill); Codeforces and CodeChef inputs (required; label in platform colour) and LeetCode and AtCoder (optional); **Continue** (primary) goes to Home |
| `/` Home | Date line; H1 "Evening, {name}." (display 48); one line with your rank (`lime`) and streak status; pending banner. Main column: a large violet next-contest card (name in display 30, time · length · "31 of 47 going", inline RSVP with all three states, and a three-tile countdown on the right); four stat tiles (points this week in `lime`, solves this week, attendance, CF rating); the "Upcoming" list. Sidebar: chase card (linking to the leaderboard), streak card, weekly challenge, a short live feed (3 items + "See all") |
| `/leaderboard` | Eyebrow "Leaderboard"; H1 This week / Today / This month; sub-line; segmented tabs. Year filter chips + platform filter. Podium. Two-column layout: leaderboard card (chase bar, rows, scoring footnote) and a sidebar (year vs year, biggest climbers, toughest solves). Clicking a row opens that student's profile |
| `/contests` | Upcoming contests (as in "Upcoming") followed by past contests with your result |
| `/feed` | The full feed, paginated |
| `/profile` (your own), `/u/:id` (others) | Profile header; five stat tiles (four for others: no attendance); Activity card; then two columns: rating chart + recent solves, and a sidebar with top topics + contest history (your own, or for admins). The Settings button shows only on your own profile |
| `/settings` | Max width 880. "← Back to profile" + H1 "Settings"; account card (avatar, name, @username · email, chips, Sign out); Coding handles; Notifications (switches: 1 hour before, 5 min RSVP, after contest, streak about to break at 9 PM, off by default); About you (username with one-time change, display name, year select, Save); violet "Get the app" card |
| `/reason/:contestId` | Reason chips + optional text field, opened from the banner |
| `/download` | Logo; two cards: Android (APK button) and iPhone (Add to Home Screen steps); link back to sign in |
| `/admin` | Sub-tab pills (Attendance, Students & handles with a pink count badge, Admins, Flags), H1 + filter pills + Export CSV, four KPI cards, then the attendance grid with a sidebar (reasons, needs a nudge) |

The web is a fluid page: max width 1200 (880 for Settings), the sidebar wraps under the main column below about 900 px, and the nav links wrap. Under 640 px, use app-style bottom tabs.

### App (Android)

- **Sign in:** logo top left. In the middle, the display headline (44) "Welcome back. Let's grind.", a sub-line, and a white "Continue with Google" pill.
- **Update banner:** when an over-the-air update has downloaded, every screen shows a `lime` pill above the tab bar, "Update available. Tap to restart."; tapping restarts into the update.
- **Onboarding:** one screen with the same fields as web `/signup`. Username: "@" prefix and "✓ available". Year: a 4-column grid of 48 px tiles. **Continue** goes to Home, which asks for notification permission.
- **Home (tab):** date + greeting with streak pill and avatar button; pending banner; next-contest card with inline RSVP; two stat cards; streak card; chase card linking to Board.
- **Board (tab):** title + avatar button, full-width segmented tabs, 2-1-3 podium, rows, pinned `lime` "You" bar. Tapping a row opens that student's Profile.
- **Contests (tab):** the "Upcoming" list, then past contests.
- **Feed (tab):** the full feed.
- **Profile (pushed):** screen header with back and settings gear; centred header; 2×2 stat tiles (this month in `lime`, streak, solves, attendance); Activity card (21-week heatmap at 11 px squares with M/W/F labels and a legend); CF rating chart; top 4 topics as inline bars; recent 4 contests.
- **Settings (pushed):** back + "Settings"; grouped sections with uppercase labels: Coding handles, Notifications (switches), About you (username with one-time change, name, year); then a full-width Sign out outline button in `pink`.
- **Reason:** the reason chips + optional text field, opened from a push or the banner.

## Copy

- Times are in IST, written as "Fri, 6 Nov · 8:05 PM".
- Buttons: "Participating", "Can't attend", "Add reason", "Export CSV".
- Empty leaderboard: "No solves today yet. Solve one problem to join the leaderboard."
- All names and numbers on the mockups are sample data; never ship them.
