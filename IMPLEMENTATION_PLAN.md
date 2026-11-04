# IMPLEMENTATION_PLAN — CP Club Tracker

Build in this order. Each task ends with its "Done when" verified (see `TESTING.md`) and a commit. Tick boxes as you go.

## Phase 0 — Setup (done by the human)

- [ ] Cloudflare account; `wrangler login`; `wrangler d1 create cp-tracker`
- [ ] Google Cloud project: OAuth client IDs for Web and Android (SHA-1 from the EAS keystore)
- [ ] Expo account; `eas init` in `app/`
- [ ] Firebase project with an Android app; FCM credentials uploaded to Expo (needed for Android push)
- [ ] Public GitHub repo; fine-grained token with Actions write on that repo
- [ ] Generate `SESSION_SECRET` and `INGEST_SECRET` (`openssl rand -hex 32`)

## Phase 1 — Day 1: backend and attendance

1. [x] **Repo skeleton.** pnpm workspace with `shared`, `api`, `web`, `app`, `jobs`; a strict `tsconfig` in each; root scripts `typecheck` and `test`.
   - Done when: `pnpm -r typecheck` passes on empty packages.
2. [ ] **`shared/`.** `time.ts`, `scoring.ts`, `contests.ts`, `rating-color.ts`, `types.ts`, with unit tests.
   - Done when: the tests in `TESTING.md → shared` pass.
3. [ ] **Schema + Worker shell.** `schema.sql`, `wrangler.toml` (D1 binding, cron `* * * * *`), Hono app, CORS, error handler.
   - Done when: `GET /api/health` returns `{ ok: true }` locally with the schema applied.
4. [ ] **Auth.** `/auth/google`, session JWT, `requireUser` / `requireAdmin`, `ADMIN_EMAILS` bootstrap.
   - Done when: a real Google ID token signs in, and an admin email gets `role: 'admin'`.
5. [ ] **Profile + handles.** `/me`, `PUT /me`, `PUT /me/handles/:platform`, `/me/push-token`, admin approve endpoint.
6. [ ] **Ingest.** `/ingest/contests`, `/ingest/solves`, `/ingest/participation`, `/ingest/handles`, protected by the secret.
7. [ ] **Contest sync job.** `jobs/lib.ts`, `adapters/cf.ts` (contest list), `adapters/cc.ts` (contest list), `sync-contests.ts`, and the workflow.
   - Done when: running it locally against `wrangler dev` fills `contests` with the correct `counts` and merged parallel rounds.
8. [ ] **RSVP + reason endpoints and `push.ts`.**
9. [ ] **Cron steps 1–2** (reminder, RSVP push).
   - Done when: with `seed.dev.sql` (a contest starting in 6 min) and `--test-scheduled`, the pushes go to your own token.
10. [ ] **App: login → onboarding → home.** Google sign-in, handle form, approval-waiting state, upcoming ContestCard, push registration, `rsvp` category, Reason screen.
    - Done when: on a real Android device, Yes and No + text from the notification are stored.

## Phase 2 — Day 2: verification, leaderboard, website

11. [ ] **Cron step 3 for Codeforces** (standings check, result pushes).
    - Done when: verified against a finished real CF contest with one handle that took part and one that didn't.
12. [ ] **CodeChef participation.** `cc-participation.ts`, the workflow with `workflow_dispatch`, and the Worker dispatch call.
13. [ ] **Codeforces solves.** Cron step 4 and step 5 (ratings).
    - Done when: a new AC appears in `solves` with correct points.
14. [ ] **CodeChef solves and the Codeforces backstop** in `sync-solves.ts` + workflow.
15. [ ] **Leaderboard endpoint + app Leaderboard tab + Profile (basic).**
16. [ ] **Website.** Login, leaderboard, profile, `/me`, `/download`; admin pages Attendance (grid + CSV), Students & handles, Admins, Flags.
17. [ ] **Ship.**
    - Deploy the Worker and set its secrets.
    - Deploy Pages.
    - Build the APK with EAS, link it on `/download`.
    - Onboard 3 test students, then the whole club.

## Phase 3 — Week 2

18. [ ] AtCoder and LeetCode adapters in `sync-solves.ts`
19. [ ] CSES and SPOJ adapters + `snapshots.ts` and its workflow
20. [ ] Feed (endpoint, app tab, web page)
21. [ ] Streaks, heatmap, top tags on profiles
22. [ ] Web push for the installed website (iPhone users)

## Later (don't build until asked)

Duels, weekly club problem set, upsolve tracker.
