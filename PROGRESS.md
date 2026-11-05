# Progress — OOPS.Grind

Last updated: 2026-11-05. `IMPLEMENTATION_PLAN.md` has the full detail of each task, and `SETUP.md` has the steps to go live.

**Where it stands:** the redesign, one-page sign-up, per-minute fetch, meal-time pushes and daily health check are built. Website, API and app updates are deployed from `main`; the APK download link serves the newest release. Still to check on a real phone: push arrival, RSVP buttons with the app closed, and sign-up.

## Add-ons

All tasks are written on the `add-ons` branch. **Nothing is deployed, migrated on production, published over the air or pushed.** Two decisions are open: a new APK (the code assumes none), and the digest email service (no email is sent yet).

| Task | Status |
|---|---|
| 34. In-app updates | Web toast and `/app-version` written; card and APK screens bundle. Needs a real phone and a published update |
| 35. Announcements | Scheduling, audience, unread and seen counts tested on local D1. The push itself is untested on a phone |
| 36. Codeforces queue | Done. Tested with real Codeforces reads |
| 37. Upsolves | Lists tested on local D1 with a made-up round. Needs a real round, checked against the table for two members |
| 38. Problem of the day | Picks, reveal and the +5 / +2 bonus tested on local D1. The first real import hasn't run |
| 39. Navigation | Web checked in Chrome at 375 px and desktop. App bundles; not seen on a phone |
| 40. Weekly goal | Done on the web and API. App not seen on a phone |
| 41. Rivals | Tested on local D1. Pushes not seen on a phone |
| 42. Badges | Rules tested at every threshold, and award-once and silent first check tested on local D1 |
| 43. `decideDuel` | Done |
| 44. Duel backend | One full duel decided from a real Codeforces submission on local D1, including Elo, the feed and the badge. The cap and queue tested |
| 45. Duel UI | Web checked in Chrome. Needs real duels between two accounts on two phones, covering the three decision cases |
| 46. Recap | API and web story checked. The Sunday push hasn't fired |
| 47. Club virtuals | Scheduling, RSVP and standings tested; result parsing has unit tests. Needs a real virtual on Codeforces |
| 48. Digest | Admin → Digest works. Email isn't built |
| 49. Final check | Web pages pass at 375 px and desktop with no console errors. Phones, a full day of `wrangler tail` and real duels are still to do |

## Before the add-ons go live

- [ ] Decide on the APK and the email service
- [ ] Review the migrations (`api/migrations/0004` to `0012`), then approve applying them to production
- [ ] Merge `add-ons` into `main`; the Worker dispatches `sync-problemset.yml` from `main`
- [ ] Follow `SETUP.md → Releasing the add-ons`

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
