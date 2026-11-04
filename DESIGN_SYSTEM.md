# DESIGN — CP Club Tracker ("grind.club")

The reference mockups are the five artboards on the "CP Club Tracker redesign" canvas (Web · Leaderboard, Web · Admin attendance, Web · Sign in, App · Home, App · Leaderboard). When this file and the canvas disagree, this file wins.

## Direction

Arcade scoreboard. Dark and dense like a ratings table, but fun: big colour-filled cards, chunky pill buttons, huge monospace numbers, small playful touches (a tilted logo, a tilted highlight word, rank arrows, a streak flame).

The colour split follows the 60-30-10 rule:

- 60% neutral: charcoal backgrounds and cards.
- 30% structure: violet, for brand and contest cards.
- 10% accents: lime, pink and yellow, for actions, points and highlights.

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
| `lime` | `#C6F432` | Primary buttons, active tab, points, #1, present, your progress |
| `lime-tint` | `#232B12` (border `#4D6B10`) | Your own row |
| `pink` | `#FF5FA2` | #2, absent with reason, rank drops, challenge bar |
| `sun` | `#FFD23F` | #3, streak, "no reason yet", warnings |
| `sun-tint` | `#2A2111` (border `#5C4613`, text `#FFE58A`) | Pending-reason banner |
| `sky` | `#4CC9F0` | Avatars and chart series only |
| `orange` | `#FB923C` | Avatars; CodeChef tag |
| `lilac` | `#A78BFA` | Avatars only |

- Text on lime, pink, sun and sky is always ink.
- Text on violet is white, with violet-soft or `#EDE9FE` for secondary text.

### Rating colours

These are brightened Codeforces ranks so they stay readable on dark backgrounds. Use them only for handles and problem ratings, via `ratingColor(r)` in `shared/rating-color.ts`.

| Rating | Hex |
|---|---|
| < 1200 | `#B4B4C2` |
| 1200–1399 | `#4ADE80` |
| 1400–1599 | `#22D3EE` |
| 1600–1899 | `#60A5FA` |
| 1900–2099 | `#C084FC` |
| 2100–2399 | `#FBBF24` |
| ≥ 2400 | `#F87171` |

Platform tags:

- Codeforces: `#60A5FA` text, or a white pill with `#5B21B6` text on violet.
- CodeChef: `#FB923C`.

### Avatars

There are no profile photos. Avatars are initials on a solid colour, picked by `userId % 6` from [lime, pink, sun, sky, lilac, orange], with ink text.

## Typography

| Role | Font | Size / weight / tracking |
|---|---|---|
| Display (page titles, card titles, brand) | Space Grotesk | Web H1 52 / 700 / −0.035em; app title 26–30 / 700 / −0.03em; card title 17–22 / 700 / −0.02em |
| Body and UI | Inter | 14 / 400–700; small 12–13 |
| Labels | Inter | 11–12 / 700, uppercase, +0.06–0.08em |
| Numbers, handles, ratings, countdowns | JetBrains Mono | 800 for values, 700 for handles |
| Big stat | JetBrains Mono | 32–40 / 800 / −0.03em |

Loading the fonts:

- **Web:** one Google Fonts request: `Inter:wght@400;500;600;700`, `Space+Grotesk:wght@500;700`, `JetBrains+Mono:wght@500;700;800`.
- **App:** `@expo-google-fonts/inter`, `@expo-google-fonts/space-grotesk`, `@expo-google-fonts/jetbrains-mono`.

## Shape, spacing, motion

- **Radius:** 999 for buttons, tabs, chips and badges. 22 for main cards. 20 for stat and sidebar cards. 16 for rows and banners. 14 for countdown tiles. 7–10 for grid cells and the logo tile.
- **Spacing:** scale 4, 6, 8, 10, 12, 14, 16, 20, 24, 28. Page gutter 24 on web, 18 on app. Web max width 1200.
- **Borders:** 1 px line on neutral cards. Coloured cards have no border.
- **Motion:** buttons get `translateY(-1px)` and `brightness(1.08)` on hover, over 150 ms ease-out. No page transitions and no looping animation.
- **Touch and contrast:** touch targets ≥ 44 px, text contrast ≥ 4.5:1. Status is never shown by colour alone; it always has a symbol or letter too.

## Components

Build only these. Each lives in the file that uses it unless 2+ screens need it.

- **Button.** Primary: lime fill, ink text, 800 weight, pill; height 40–44 on web, 48 on app. Secondary: transparent with a 2 px outline (violet-soft on violet cards, line elsewhere). Warning: sun fill, ink text.
- **Segmented tabs** (Today / Week / Month): a pill track (card with a line border, 4–5 px padding). The active segment has a lime fill and ink text; inactive segments use muted text.
- **Nav (web):** logo tile (34 px violet square, radius 10, rotated −6°, `>_` in mono) + wordmark "grind" + lime "." + "club" in Space Grotesk. Links are pills; the active one has a text fill and ink text. Right side: streak pill (sun, flame icon + mono number) and avatar.
- **Bottom tabs (app):** Home, Board, Feed, Me. Stroke icons at 22 px; the active tab is lime, inactive ones muted. 1 px top border.
- **Pending-reason banner:** sun-tint card with a sun "!" tile, a bold line naming the contest, one helper line, and an "Add reason" warning button. On the app the whole banner is the button.
- **Podium cards (web):** three cards, solid lime / pink / sun with ink text. Contents: avatar (ink circle), "1st/2nd/3rd" in display 44, name, @handle · rating, points in mono 40, and a "N solves · max R" chip. Heights step down 250 / 226 / 210 so the podium reads as steps.
- **Podium (app):** columns ordered 2-1-3, each with an avatar ringed in its colour and a coloured block of height 84 / 112 / 68 showing rank and points.
- **Leaderboard row:** rank (mono 800) + movement (▲ lime, ▼ pink, — muted), avatar, name + year (muted), @handle in rating colour, solves, max rating as a chip in rating colour, points in lime mono, right-aligned. The row has radius 14 with no divider lines. Your own row uses the lime-tint fill and border. Movement compares your rank now with your rank 24 hours ago in the same period.
- **Chase bar:** "You're #6 · 22.3 pts behind Meera" + a 10 px lime progress bar, plus a hint chip ("One 1500 problem ≈ +N"). Compute N with the real scoring formula. On the app, a pinned lime "You" bar above the tabs replaces it.
- **Next-contest card:** violet fill, platform pill, contest name in display font, IST time, and a three-tile countdown (days / hrs / min in violet-deep tiles). Before answering: "I'm in" (primary) and "Can't" (outline) buttons. After Yes: the buttons become a lime strip: "You're in. Good luck!" + "Change". After No: shows "What's stopping you?" with reason chips (Exams, Travel, Unwell, Clash, Other) + "Actually, I'm in". Footer: stacked dots that identify nobody + "31 of 47 are going".
- **Stat card (app):** card with label, big mono value, and a one-line context ("#5 in club · 2 solves").
- **Streak card:** a 7-day strip (M–S) of radius-10 tiles: done = sun fill with ✓, today = dashed sun outline, future or missed = card-2. Helper: "Solve one problem today to make it 13."
- **Weekly challenge card:** title, mono "31/50" in pink, one-line goal, 12 px pink progress bar. The goal is fixed: the club solves 50 problems rated 1400+ this week.
- **Feed item:** avatar, "Name solved 1700 C on Codeforces", tags · time ago in muted, rating chip on the right.
- **Admin KPI cards:** four in a row. The first (club attendance) is a lime fill; the others are card with a coloured mono value (pink for "said yes, didn't show", sun for pending).
- **Attendance grid (admin):** a `<table>` inside a card with horizontal scroll, sticky first column (avatar + name + year) and a rate column (lime ≥ 70%, sun ≥ 50%, pink below). Column headers: platform (CF blue / CC orange), short name, date. Cells are 24 px squares: Present is lime with ✓; absent with reason is pink with a reason letter (E exams, T travel, U unwell, C clash, F forgot, O other); no reason yet is a 2 px dashed sun outline with ?. A legend sits above the grid, and a tooltip shows the full reason.
- **Reason breakdown:** label + count + a 10 px bar per reason type, each in its own accent.
- **"Needs a nudge":** a violet-tint card listing students below 50%.
- **Activity panel (web profile):** 26 × 7 squares of 14 px, 4 px gap, month and weekday labels, in card-3, then lime at 25 / 50 / 75 / 100% opacity for 1, 2–3, 4–5 and 6+ solves. A Less–More legend, the 6-month total and four stats: solves, active days, longest streak, best day. With no solves the grid dims behind "Nothing here yet. Your first AC lights this up." on your own profile. It scrolls inside its card on phones.
- **Heatmap (app):** the same levels and opacities at 10 px, 2 px gap, radius 3.

## Screens

### Web

| Route | Layout |
|---|---|
| `/login` | Two columns. Left: logo, eyebrow chip, display headline "Show up. Solve more. Climb the board." (lime on line 2; "board." on a tilted pink block), one-line subtext, "Continue with Google" (white pill) + "Get the Android app" (outline), iPhone hint at the bottom. Right: a tilted lime "This week" card, a violet T−5 notification preview, a feed item, all clearly marked as examples. Under 900 px it stacks into one column, with the preview cards below |
| `/` | Nav, pending banner, eyebrow "Who's grinding", H1 (This week / Today / This month), sub-line, segmented tabs; podium; then a two-column layout: leaderboard card (chase bar, rows, scoring footnote) and a sidebar (next contest, weekly challenge, live feed) |
| `/download` | Logo; two cards: Android (APK button) and iPhone (Add to Home Screen steps); link back to sign in |
| `/u/:id`, `/me` | Same building blocks: header with avatar + handles, stat cards, streak, heatmap, top tags |
| `/admin` | Sub-tab pills (Attendance, Students & handles with a pink count badge, Admins, Flags), H1 + filter pills + Export CSV, four KPI cards, then the attendance grid with a sidebar (reasons, needs a nudge) |

The web is a fluid page: max width 1200, the sidebar wraps under the main column below about 900 px, and the nav links wrap. Under 640 px, use app-style bottom tabs. Every page opens before setup is finished; a banner links to `/me` until the profile is complete and handles are approved.

### App (Android)

- **Home:** greeting (date + name) with streak pill and avatar; pending banner; next-contest card with inline RSVP; two stat cards; streak card; chase card linking to the Board.
- **Board:** title, full-width segmented tabs, 2-1-3 podium, rows, pinned "You" bar.
- **Feed and Me:** same cards as the web.
- **Reason:** the reason chips + optional text field, opened from a push or the banner.

## Copy

- Times are in IST, written as "Fri, 6 Nov · 8:05 PM".
- Buttons: "I'm in", "Can't make it" (or "Can't" on the app), "Add reason", "Export CSV".
- Empty leaderboard: "No solves today yet. One problem gets you on the board."
- All names and numbers on the mockups are sample data; never ship them.
