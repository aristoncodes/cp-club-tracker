# DESIGN_SYSTEM — CP Club Tracker

Dark-first, dense and calm, like a good terminal or the Codeforces ratings table. Numbers are the hero. One accent colour. No illustrations, no gradients, no shadows.

## Tokens

Define these once:
- **Web:** CSS variables in `web/src/index.css`, mapped into `tailwind.config` as `bg`, `surface`, etc.
- **App:** a single `app/theme.ts` object.

The app is dark only. The website follows `prefers-color-scheme`.

| Token | Dark | Light | Use |
|---|---|---|---|
| `bg` | `#0B0D10` | `#F7F8FA` | Page background |
| `surface` | `#14171C` | `#FFFFFF` | Cards, table rows, sheets |
| `surface-2` | `#1B1F26` | `#F0F2F5` | Hover, selected tab, input background |
| `border` | `#262B33` | `#E1E4E8` | 1 px dividers and card borders |
| `text` | `#E6E8EB` | `#14171C` | Primary text |
| `muted` | `#8B93A1` | `#5B6472` | Secondary text, labels, timestamps |
| `accent` | `#A3E635` | `#4D7C0F` | Primary buttons, active tab, your own row, points |
| `present` | `#22C55E` | `#15803D` | Present status |
| `absent` | `#EF4444` | `#B91C1C` | Absent without reason, errors |
| `pending` | `#F59E0B` | `#B45309` | Reason pending, warnings |

### Rating colours

Use these only for handles and problem ratings. They follow Codeforces ranks, so students read them instantly.

| Rating | Colour |
|---|---|
| < 1200 | `#9CA3AF` |
| 1200–1399 | `#22C55E` |
| 1400–1599 | `#06B6D4` |
| 1600–1899 | `#3B82F6` |
| 1900–2099 | `#A855F7` |
| 2100–2399 | `#F59E0B` |
| ≥ 2400 | `#EF4444` |

Put the colour mapping in `shared/` (`ratingColor(r)`) and use it on both web and app.

## Typography

| Role | Font | Size / weight |
|---|---|---|
| UI text | Inter (Google Fonts on web, `@expo-google-fonts/inter` in app) | 14 / 400, labels 12 / 500 uppercase with +0.04em tracking |
| Headings | Inter | H1 24 / 700, H2 18 / 600 |
| Numbers, handles, ratings, points | JetBrains Mono | Same size as surrounding text, 500; tabular numerals |
| Big stat | JetBrains Mono | 32 / 700 |

## Spacing, shape, motion

- Spacing scale: 4, 8, 12, 16, 24, 32. Page gutter: 16 on mobile, 24 on desktop. Max content width: 960.
- Radius: 8 for inputs and buttons, 12 for cards, 999 for badges.
- Borders: 1 px `border`. No shadows.
- Motion: 150 ms ease-out for hover and press states only. No page transitions.
- Touch targets ≥ 44 px. Text contrast meets WCAG AA in both themes.

## Components

Build only these. Each is a small function in the file that uses it, unless used by 2+ screens.

- **Button:** primary (accent background, `bg`-coloured text), secondary (`surface-2` background), danger (absent-coloured text). Height 44 web / 48 app.
- **Card:** `surface` background, 1 px border, radius 12, padding 16.
- **Tabs:** segmented control for Today / Week / Month. The active tab has a `surface-2` background and accent text.
- **LeaderboardRow:** rank (mono, muted; ranks 1–3 in `text`), name + batch year, handle in rating colour, solves, hardest problem rating (rating colour), points (mono, accent, right-aligned). Your own row has a 2 px accent left border.
- **StatusBadge:** Present / Absent / Pending as a pill with a 12% tinted background of the status colour and full-colour text.
- **ContestCard:** platform tag, contest name, start time in IST ("Wed 8:00 PM"), countdown, your RSVP state. Used on the home screen.
- **ReasonForm:** reason type chips (single select) and an optional text field (required for `other`). Submit button.
- **Banner:** full-width `pending` tinted strip: "Give a reason for Codeforces Round 1095" → opens ReasonForm.
- **AttendanceGrid (admin, web only):** sticky first column (names) and sticky header (contest short names + dates). Cells hold a 20 px coloured square (present / absent / pending). Hover or tap shows the reason. Horizontal scroll inside the card only.
- **Heatmap (week 2):** 26 weeks × 7 days of 10 px squares, 2 px gap, 5 accent opacity steps (0, 25, 50, 75, 100%).

## Screens

### App (Android)

1. **Sign in:** app name, one-line purpose, "Continue with Google".
2. **Onboarding:** batch year, Codeforces handle, CodeChef handle (required), others optional. Shows "Waiting for admin approval" until approved.
3. **Home:** pending-reason Banner (if any), next ContestCard, your rank and points today and this week as big stats, link to the leaderboard.
4. **Leaderboard:** Tabs + LeaderboardRows, pull to refresh.
5. **Feed (week 2).**
6. **Profile:** your own or another student's; stats, handles, top tags, heatmap (week 2).
7. **Reason:** ReasonForm, opened from a push or the Banner.

Bottom tabs: Home, Leaderboard, Feed, Profile.

### Website

- `/login`
- `/` leaderboard
- `/feed` (week 2)
- `/u/:id` profile
- `/me` handles and pending reasons
- `/download` Android APK link
- `/admin` (admins only), with sub-tabs: Attendance, Students & handles, Admins, Flags

Top nav on desktop, bottom tabs under 640 px.

## Copy

- Plain, short and friendly. Never shaming.
- Times are always IST in the format "Wed, 4 Nov · 8:00 PM". ContestCard alone uses the short "Wed 8:00 PM".
- Empty states say what to do, e.g. "No solves today yet. One problem gets you on the board."
