# Progress — OOPS.Grind

Last updated: 2026-11-05. `IMPLEMENTATION_PLAN.md` has the full detail of each task, and `SETUP.md` has the steps to go live.

**Where it stands:** the redesign, one-page sign-up, per-minute fetch, meal-time pushes and daily health check are built. Website, API and app updates are deployed from `main`; the APK download link serves the newest release. Still to check on a real phone: push arrival, RSVP buttons with the app closed, and sign-up.

## Add-ons

Docs written (`PRD_ADDONS.md`, `DESIGN_ADDONS.md`, `ARCHITECTURE.md → Add-ons`). Building hasn't started. Two decisions are open: a new APK, and the digest email service.

## Phase 4: redesign + accounts

| Task | Status |
|---|---|
| 22–24. Tokens, shared UI, navigation | Written. Web checked in Chrome; app typechecks and bundles |
| 25. Accounts backend | Written. Usernames, onboarding and privacy tested over HTTP on local D1; migration tested on production-shaped data |
| 26. Sign-in and onboarding UI | Web onboarding and resume tested in Chrome. App untested on a phone. Real Google sign-in on the new build untested |
| 27–31. Home, Leaderboard, Profile, Settings, Contests, Feed | Written. Web checked in Chrome at 375 px and desktop; app untested on a phone |
| 32. Streak reminder, notification switches | Written. Targeting checked on local D1; no real push sent |
| 33. Final check | Not done: needs production and a real phone |

## Still needed from you

- [ ] Approve the production migration
- [ ] Test on your Android phone

## Earlier phases

All written. Still waiting on a real-world check: app Google sign-in, a push reaching a phone, the RSVP buttons with the app closed, CodeChef attendance on a just-finished Starters, and an iPhone test.
