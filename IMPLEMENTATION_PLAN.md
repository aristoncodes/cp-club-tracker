# IMPLEMENTATION_PLAN — OOPS.Grind

Build in this order. Each task ends with its "Done when" verified (see `TESTING.md`) and a commit. Tick boxes as you go.

## Phase 0 — Setup (done by the human)

- [ ] Cloudflare account; `wrangler login`; `wrangler d1 create cp-tracker`
- [ ] Google Cloud project: OAuth client IDs for Web and Android (SHA-1 from the EAS keystore, package `com.cpclub.tracker`, custom URI scheme enabled under the Android client's advanced settings)
- [ ] Expo account; `eas init` in `app/`
- [ ] Firebase project with an Android app; FCM credentials uploaded to Expo (needed for Android push)
- [ ] Public GitHub repo; fine-grained token with Actions write on that repo
- [ ] Generate `SESSION_SECRET` and `INGEST_SECRET` (`openssl rand -hex 32`)

## Phase 1 — Day 1: backend and attendance

1. [x] **Repo skeleton.** pnpm workspace with `shared`, `api`, `web`, `app`, `jobs`; a strict `tsconfig` in each; root scripts `typecheck` and `test`.
   - Done when: `pnpm -r typecheck` passes on empty packages.
2. [x] **`shared/`.** `time.ts`, `scoring.ts`, `contests.ts`, `rating-color.ts`, `types.ts`, with unit tests.
   - Done when: the tests in `TESTING.md → shared` pass.
3. [x] **Schema + Worker shell.** `schema.sql`, `wrangler.toml` (D1 binding, cron `* * * * *`), Hono app, CORS, error handler.
   - Done when: `GET /api/health` returns `{ ok: true }` locally with the schema applied.
4. [ ] **Auth.** `/auth/google`, session JWT, `requireUser` / `requireAdmin`, `ADMIN_EMAILS` bootstrap.
   - Done when: a real Google ID token signs in, and an admin email gets `role: 'admin'`.
5. [x] **Profile + handles.** `/me`, `PUT /me`, `PUT /me/handles/:platform`, `/me/push-token`, admin approve endpoint.
6. [x] **Ingest.** `/ingest/contests`, `/ingest/solves`, `/ingest/participation`, `/ingest/handles`, protected by the secret.
7. [x] **Contest sync job.** `jobs/lib.ts`, `adapters/cf.ts` (contest list), `adapters/cc.ts` (contest list), `sync-contests.ts`, and the workflow.
   - Done when: running it locally against `wrangler dev` fills `contests` with the correct `counts` and merged parallel rounds.
8. [x] **RSVP + reason endpoints and `push.ts`.**
9. [ ] **Cron steps 1–2** (reminder, RSVP push).
   - Done when: with `seed.dev.sql` (a contest starting in 6 min) and `--test-scheduled`, the pushes go to your own token.
10. [ ] **App: login → onboarding → home.** Google sign-in, handle form, approval-waiting state, upcoming ContestCard, push registration, `rsvp` category, Reason screen.
    - Done when: on a real Android device, Yes and No + text from the notification are stored.

## Phase 2 — Day 2: verification, leaderboard, website

11. [ ] **Cron step 3 and Codeforces verification** (`participation.ts`, its workflow, the Worker dispatch call, result pushes).
    - Done when: verified against a finished real CF contest with one handle that took part and one that didn't.
12. [ ] **CodeChef participation** in `participation.ts`.
13. [x] **Codeforces solves.** Cron step 4 and step 5 (ratings).
    - Done when: a new AC appears in `solves` with correct points.
14. [ ] **CodeChef and LeetCode solves and the Codeforces backstop** in `sync-solves.ts` + workflow.
15. [ ] **Leaderboard endpoint + app Leaderboard tab + Profile (basic).**
16. [x] **Website.** Login, leaderboard, profile, `/me`, `/download`; admin pages Attendance (grid + CSV), Students & handles, Admins, Flags.
17. [ ] **Ship.**
    - Deploy the Worker and set its secrets.
    - Deploy the website.
    - Build the APK with EAS, link it on `/download`.
    - Onboard 3 test students, then the whole club.

## Phase 3 — Week 2

18. [ ] AtCoder adapter in `sync-solves.ts`
19. [ ] Feed (endpoint, app tab, web page)
20. [ ] Streaks, heatmap, top tags on profiles
21. [ ] Web push for the installed website (iPhone users)

## Phase 4 — Redesign + accounts

22. [ ] **Design tokens and fonts.** Done when: web and app use the `DESIGN.md` tokens and old ones are gone.
23. [ ] **Shared UI pieces** used by 2+ screens. Done when: toggle, pills, avatar button and screen header exist and are used.
24. [ ] **Navigation.** Done when: web has Home, Leaderboard, Contests, Feed, Admin; the app has Home, Board, Contests, Feed; the avatar opens Profile; no "Me" anywhere.
25. [ ] **Accounts backend.** Done when: migrations apply cleanly on a copy of production's shape, usernames and onboarding work locally, and the `TESTING.md` accounts tests pass.
26. [ ] **Sign-in and onboarding UI.** Done when: Google sign-in and onboarding work on web and on a real Android phone, and onboarding resumes where it stopped.
27. [ ] **Home** (web + app). Done when: every `DESIGN.md` Home element shows real data.
28. [ ] **Leaderboard** (web + app). Done when: filters re-rank, and extras match a hand-written query.
29. [ ] **Profile** (web + app) and `/u/:id`. Done when: another student's profile shows no attendance.
30. [ ] **Settings** (web + app). Done when: all three username states and all switches work.
31. [ ] **Contests and Feed** (web + app). Done when: past contests show your own result.
32. [ ] **Streak reminder and preference checks.** Done when: each notification respects its switch.
33. [ ] **Final check.** Done when: `TESTING.md` passes, every web page works at 375 px and desktop, one sign-up works on a real phone, and `wrangler tail` shows no `exceededCpu`.

## Add-ons

Rules are in `PRD_ADDONS.md`, looks in `DESIGN_ADDONS.md` and the design in `ARCHITECTURE.md → Add-ons`. One task at a time: state its "Done when" and files, build, run `pnpm -r typecheck` and `pnpm -r test`, give the manual check, tick and commit, then wait. Ask before every deploy, production migration, over-the-air update or APK build.

### Phase A — Quick wins

34. [ ] **In-app updates.** Update card, foreground check, `/app-version`, optional sheet and required screen, web toast. The APK step depends on the open decision in `PRD_ADDONS.md`.
    - Done when: publishing an update makes the card appear on a running phone within one foreground cycle, and tapping it restarts into the new version.
35. [ ] **Announcements.** Admin composer, scheduled send, push, app inbox, web bell dropdown, pin on Home, seen counts.
    - Done when: a scheduled announcement to one year of study reaches only that year's members at the right time, shows as unread, and the seen count goes up when they open the inbox.
36. [ ] **Codeforces call queue.** `cf-queue.ts`, approval stops calling Codeforces, `sync-solves` reads Codeforces hourly.
    - Done when: the Worker has one Codeforces caller, solve sync behaves as before, and approving a handle syncs it on the next run.
37. [ ] **Upsolve tracker.** `upsolveTarget`, `contestType`, list generation on verify, Practice list, Home tile, reminders. CodeChef stays a follow-up until its adapter returns per-problem results.
    - Done when: for a verified Codeforces round, each member's list matches the table for their rating, excludes problems they solved during the contest, and an item solved later in practice is marked done within one sync.
38. [ ] **Problem of the day.** `sync-problemset`, history import, picks, reveal, bonus, streak, Practice and Home cards, "Your band today", 08:00 push.
    - Done when: at 00:00 IST each band gets a fresh unsolved problem. Solving without revealing adds normal points + 5; revealing first and then solving adds normal points + 2.
39. [ ] **Navigation.** App tabs, Feed under Board, web nav and bell, phone-width bottom tabs, push routing.
    - Done when: both clients match `DESIGN_ADDONS.md → Navigation changes`, and the Feed tab file is gone.

### Phase B — Habits

40. [ ] **Weekly goal.** Editor, suggestion, ring, Thursday lock.
    - Done when: qualifying solves fill the ring, and the goal locks on Thursday.
41. [ ] **Rivals.** Set from a profile, Home card, pushes.
    - Done when: the card updates as both people solve, and the "passed you" push fires at most once a day.
42. [ ] **Badges.** Rules, event hooks, nightly sweep, silent first sweep, page, celebration, profile section.
    - Done when: each badge is awarded exactly once when its rule is met, including by the nightly sweep for missed events.

### Phase C — Duels

43. [ ] **`decideDuel`, `duelRange`, `elo`** in `shared/`, with every duel test passing before any endpoint exists.
    - Done when: the `TESTING.md → decideDuel` cases all pass.
44. [ ] **Duel backend.** Challenge, invite expiry, problem selection, queue checks, judging wait, result, Elo, feed items.
    - Done when: a full duel between two test accounts can be played over the API, and all three decision cases come out right.
45. [ ] **Duel UI.** Hub, new duel, live view with all status states, result, Accept/Decline push, duel board.
    - Done when: two test accounts can play a full duel on a real problem; the winner is decided correctly in all three cases (no click, the slower player clicks, an earlier pending verdict); and ratings update correctly.

### Phase D — Wrap-ups

46. [ ] **Sunday recap.** Query, 21:00 push, 3-page story on app and web.
    - Done when: every active member gets a recap built from that week's data.
47. [ ] **Club virtual contests.** Scheduler, Contests integration, RSVP and reminders, live standings, optional attendance.
    - Done when: virtual participants appear in club standings within 2 minutes of a submission, and non-participants don't.
48. [ ] **Coordinator digest.** Admin → Digest, then the Monday email once a service is chosen.
    - Done when: admins can read it at Admin → Digest with figures that match the admin pages, and receive it by email on Monday once a service is chosen.
49. [ ] **Final check.**
    - Done when: everything in `TESTING.md` passes, every add-on page works at 375 px and desktop, duels on two real phones cover both decision scenarios, and `wrangler tail` shows no `exceededCpu` and no Codeforces "Call limit exceeded" over a full day.

## Later (don't build until asked)

Weekly club problem set, admin-editable challenge, best-of-three duels, admin-editable badge rules.
