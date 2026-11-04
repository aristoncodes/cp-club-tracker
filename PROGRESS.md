# Progress — CP Club Tracker

Last updated: 2026-11-05. `IMPLEMENTATION_PLAN.md` has the full detail of each task, and `SETUP.md` has the steps to go live.

**Where it stands:** the redesign and accounts (Phase 4) are written and committed, but **not live yet**. They need the production migration, the email sender and a real-device test. The website and API online are still the previous version.

## Phase 4: redesign + accounts

| Task | Status |
|---|---|
| 22–24. Tokens, shared UI, navigation | Written. Web checked in Chrome; app typechecks and bundles |
| 25. Accounts backend | Written. All flows tested over HTTP on local D1; migration tested on production-shaped data. Real emails untested until the email sender is set up |
| 26. Accounts UI | Web sign-up, sign-in and resume tested in Chrome. App untested on a phone. Real Google sign-in untested |
| 27–31. Home, Leaderboard, Profile, Settings, Contests, Feed | Written. Web checked in Chrome at 375 px and desktop; app untested on a phone |
| 32. Streak reminder, notification switches | Written. Targeting checked on local D1; no real push sent |
| 33. Final check | Not done: needs production, the email sender and a real phone |

## Still needed from you

- [ ] Approve the production migration
- [ ] Set up the Apps Script email sender (`SETUP.md`, step 7)
- [ ] Test on your Android phone

## Earlier phases

All written. Still waiting on a real-world check: app Google sign-in, a push reaching a phone, the RSVP buttons with the app closed, CodeChef attendance on a just-finished Starters, and an iPhone test.
