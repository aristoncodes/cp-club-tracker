# IMPLEMENTATION_PLAN — CP Club Tracker

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
25. [ ] **Accounts backend.** Done when: migrations apply cleanly on a copy of production's shape, all auth endpoints work locally, and the `TESTING.md` accounts tests pass.
26. [ ] **Accounts UI.** Done when: both sign-up paths and forgot password work on web and on a real Android phone, and onboarding resumes where it stopped.
27. [ ] **Home** (web + app). Done when: every `DESIGN.md` Home element shows real data.
28. [ ] **Leaderboard** (web + app). Done when: filters re-rank, and extras match a hand-written query.
29. [ ] **Profile** (web + app) and `/u/:id`. Done when: another student's profile shows no attendance.
30. [ ] **Settings** (web + app). Done when: all three username states and all switches work.
31. [ ] **Contests and Feed** (web + app). Done when: past contests show your own result.
32. [ ] **Streak reminder and preference checks.** Done when: each notification respects its switch.
33. [ ] **Final check.** Done when: `TESTING.md` passes, every web page works at 375 px and desktop, one sign-up per path works on a real phone, and `wrangler tail` shows no `exceededCpu`.

## Later (don't build until asked)

Duels, weekly club problem set, admin-editable challenge, upsolve tracker.
