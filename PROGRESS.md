# Progress — CP Club Tracker

Last updated: 2026-11-04. `IMPLEMENTATION_PLAN.md` has the full detail of each task, and `SETUP.md` has the steps to go live.

**Overall:** the code is written for 20 of 21 tasks. Task 17 (ship) needs your accounts. 9 tasks are fully checked; the other 11 still need real accounts, a phone or a real contest.

## Code written

| Area | Code lines | Test lines | Status |
|---|---|---|---|
| `shared/` | 165 | 206 | Done, 41 tests passing |
| `api/` | 1,028 | 141 | Done, 15 tests passing |
| `jobs/` | 429 | 203 | Done, 28 tests passing |
| `web/` | 1,134 | 0 | Done, clicked through in real Chrome |
| `app/` | 1,063 | 0 | Done; typechecks and bundles, never run on a device |
| **Total** | **3,819** | **550** | |

Lines of TypeScript only. Config files, SQL, fixtures and docs aren't counted.

## Fully checked

- [x] 1. Repo skeleton
- [x] 2. `shared/`
- [x] 3. Schema and Worker shell
- [x] 5. Profile and handles
- [x] 6. Ingest
- [x] 7. Contest sync job, with real Codeforces and CodeChef data
- [x] 8. RSVP and reason endpoints, push sender
- [x] 13. Codeforces solves and ratings, with real Codeforces data
- [x] 16. Website and admin pages, in real Chrome at phone and desktop widths, light and dark (everything except a real Google sign-in)

## Written, waiting on a real-world check

| Task | What already works | What's left to check |
|---|---|---|
| 4. Auth | Bad tokens rejected, role guards, sign-in SQL | A real Google sign-in |
| 9. Cron steps 1–2 | Stages and messages, with fake tokens | A push reaching a phone |
| 10. App: login, onboarding, home | Typecheck and Android bundle | Running on a phone; RSVP buttons with the app killed |
| 11. Codeforces verification | The job marks attendance correctly from real Codeforces data | The Worker starting it on GitHub Actions |
| 12. CodeChef participation | Tested on saved real data | A Starters that just ended, where CodeChef shows relative times |
| 14. CodeChef and LeetCode solves | Parsers on saved real data; the sync ran with real Codeforces and LeetCode | Real recent CodeChef and LeetCode solves |
| 15. Leaderboard, profile | Endpoint and website | The app screens on a phone |
| 18. AtCoder | Parser on saved real data | A real recent AtCoder solve |
| 19. Feed | Endpoint and website | The app screen on a phone |
| 20. Streaks, heatmap, top tags | Endpoint and website | The app screen on a phone |
| 21. Web push | Sent through Google's real push service and shown in Chrome | A real iPhone |

## Left

- [ ] 17. Ship: follow `SETUP.md`
- [ ] Run the checks in `SETUP.md` part 10
