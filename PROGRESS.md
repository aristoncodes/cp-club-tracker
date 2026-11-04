# Progress — CP Club Tracker

Last updated: 2026-11-04, after task 10. `IMPLEMENTATION_PLAN.md` has the full detail of each task.

**Overall:** 10 of 21 tasks built. 7 are fully checked; tasks 4, 9 and 10 still need your Google client ID and an Android phone. Version 1 is tasks 1–17.

## Code written

| Area | Code lines | Test lines | Status |
|---|---|---|---|
| `shared/` | 77 | 112 | Done, 26 tests passing |
| `api/` | 682 | 51 | Tasks 3–9 built, 8 tests passing; tasks 11–13, 15 and 16 still add to it |
| `jobs/` | 111 | 54 | Contest sync built, 7 tests passing; solve sync not started |
| `app/` | 626 | 0 | Login, onboarding, home and reason built; not yet run on a device |
| `web/` | 0 | 0 | Not started |
| **Total** | **1,496** | **217** | |

Lines of TypeScript only. Config files, SQL, fixtures and docs aren't counted.

## Done and checked

- [x] 1. Repo skeleton
- [x] 2. `shared/`: time, scoring, contest rules, rating colours, types
- [x] 3. Schema and Worker shell
- [x] 5. Profile and handles
- [x] 6. Ingest
- [x] 7. Contest sync job (the GitHub workflow itself hasn't run yet; there's no repo on GitHub)
- [x] 8. RSVP and reason endpoints, push sender

## Built, waiting for your check

- [ ] 4. Auth: rejected tokens and role guards work; a real Google sign-in hasn't been tried
- [ ] 9. Cron steps 1–2: stages and messages work with fake tokens; no push has reached a phone
- [ ] 10. App: typechecks and bundles for Android; never run on a device

## Left

### Phase 0: setup (yours)

Unticked in the plan. Some of it may already be done outside this repo.

- [ ] Cloudflare account and D1 database
- [ ] Google OAuth client IDs for web and Android
- [ ] Expo account and `eas init`
- [ ] Firebase project and FCM credentials
- [ ] Public GitHub repo and Actions token
- [ ] `SESSION_SECRET` and `INGEST_SECRET`

### Phase 2: verification, leaderboard, website

- [ ] 11. Codeforces verification and result pushes
- [ ] 12. CodeChef participation
- [ ] 13. Codeforces solves and ratings
- [ ] 14. CodeChef and LeetCode solves, Codeforces backstop
- [ ] 15. Leaderboard and basic profile
- [ ] 16. Website and admin pages
- [ ] 17. Ship

### Phase 3: week 2

- [ ] 18. AtCoder adapter
- [ ] 19. Feed
- [ ] 20. Streaks, heatmap, top tags
- [ ] 21. Web push for iPhone users
