# Progress — CP Club Tracker

Last updated: 2026-11-04, after task 2. `IMPLEMENTATION_PLAN.md` has the full detail of each task.

**Overall:** 2 of 21 tasks done. Version 1 is tasks 1–17, so 2 of 17 are done.

## Code written

| Area | Code lines | Test lines | Status |
|---|---|---|---|
| `shared/` | 66 | 112 | Done, 26 tests passing |
| `api/` | 0 | 0 | Not started |
| `jobs/` | 0 | 0 | Not started |
| `app/` | 0 | 0 | Not started |
| `web/` | 0 | 0 | Not started |
| **Total** | **66** | **112** | |

Lines of TypeScript only. Config files and docs aren't counted.

## Done

- [x] 1. Repo skeleton
- [x] 2. `shared/`: time, scoring, contest rules, rating colours, types

## Left

### Phase 0: setup (yours)

Unticked in the plan. Some of it may already be done outside this repo.

- [ ] Cloudflare account and D1 database
- [ ] Google OAuth client IDs for web and Android
- [ ] Expo account and `eas init`
- [ ] Firebase project and FCM credentials
- [ ] Public GitHub repo and Actions token
- [ ] `SESSION_SECRET` and `INGEST_SECRET`

### Phase 1: backend and attendance

- [ ] 3. Schema and Worker shell
- [ ] 4. Auth
- [ ] 5. Profile and handles
- [ ] 6. Ingest
- [ ] 7. Contest sync job
- [ ] 8. RSVP and reason endpoints, push sender
- [ ] 9. Cron steps 1–2: reminder and RSVP push
- [ ] 10. App: login, onboarding, home

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
