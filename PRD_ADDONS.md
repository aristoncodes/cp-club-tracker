# PRD — Add-ons (v2)

This extends `PRD.md`. Everything there still applies unless this file says otherwise; this file adds 10 features plus in-app updates. Screens are specified in `DESIGN_ADDONS.md`.

## Why

Version 1 tracks contests and solves. Members still drift between contests. The add-ons give them:
- a reason to open the app **every day** (problem of the day, weekly goal);
- a next step after each contest (upsolves);
- people to compete with (rivals, duels, badges);
- and they give coordinators tools to run the club (announcements, digest, club virtuals).

**Success after 1 month of add-ons:**
- ≥ 50% of members open the app on 4+ days a week;
- ≥ 40% solve at least one problem of the day a week;
- ≥ 20 duels played in the month.

## Decisions

These are defaults chosen to unblock the build. Change any of them before Phase A starts.

| Question | Decision |
|---|---|
| Problem of the day reward | +5 flat points on top of the normal score, or **+2 if the member revealed the tags** before solving. Also a problem-of-the-day streak |
| Bonus window | Only for a solve on that problem's IST day, by a member with an approved Codeforces handle. The bonus is added to the solve's points at insert, so every leaderboard includes it |
| Navigation | App tabs become Home · Board · Practice · Duels · Contests. Feed moves inside Board as a "Rankings / Feed" switch. The web keeps Feed as its own page |
| Club virtuals and attendance | Off by default; the admin can switch it on per virtual |
| Duel format | One problem; time limit 30, 45 or 60 minutes (default 45) |
| Rival notified when picked | Yes |
| Who can send announcements | Every admin, to any audience |
| Audiences | Everyone, one year of study (1st to 4th), or admins. The docs use years of study, not batches |
| Attendance visible to others | Rival cards and badges may show "present" counts, because Codeforces results are public. RSVPs and reasons stay admin-only |
| Upsolve contests | Counted contests only, so Global rounds only if an admin ticks one on. A parallel Div. 1 round uses the Div. 2 list, and a solve of the same problem in Div. 1 counts |
| Past activity at launch | Badges already earned are awarded silently, with no push or celebration. Upsolve lists start with contests verified after launch |
| Sunday 21:00 IST | The recap replaces the dinner nudge for people who get the recap |
| Duel spectators | See players, timer and status, but not the problem until the duel ends |
| Calendar sync, streak freeze | Removed for now (see Out of scope) |
| **Open:** new APK | Not decided. Recommended: no new APK, because `expo-updates` is already in the current APK and everything can ship over the air. Decide before task 1 ships |
| **Open:** digest email service | Not decided, and no email service exists. Recommended: Brevo's HTTP API through `fetch`, once its free plan is confirmed to work without a domain. Until then the digest shows only at Admin → Digest |

## Features

### Phase A — Quick wins

**A1. Announcements**
- **Admin composer:**
  - title (max 80 characters);
  - message (max 280 characters);
  - audience: everyone, one year of study, or admins;
  - optional link (to a contest, a page in the app, or a URL);
  - send now or schedule;
  - "Pin to Home" (only one pin at a time).
- **Delivery:** a push to the audience, plus an inbox behind the bell icon (app Home, web nav), with an unread dot.
- **Seen counts:** the sent list shows "seen by N of M", based on when each member last opened the inbox.
- *Done when:* a scheduled announcement to one year of study reaches only that year's members at the right time, shows as unread, and the seen count goes up when they open the inbox.

**A2. Upsolve tracker**

After every counted contest, each member gets an upsolve list: the problems in their **upsolve target** that they didn't solve during the contest. The list is the same whether they took part or not, because missing the contest doesn't skip the upsolve.

**Upsolve target.** Problems are taken in order from A. *n* is the number of problems in the round, and sub-problems such as D1/D2 count as separate problems. *R* is the member's Codeforces rating at the time of the contest; unrated members count as under 1200.

| Contest type | R ≥ the round's rated limit (unrated for them) | Just under the limit | Middle | Lower | Lowest |
|---|---|---|---|---|---|
| **Codeforces Div. 4** (rated < 1400) | 1400+: all *n* | 1300–1399: *n* − 1 | 1200–1299: *n* − 2 | under 1200: *n* − 3 | — |
| **Codeforces Div. 3** (rated < 1600) | 1600+: all *n* | 1400–1599: *n* − 1 | 1200–1399: *n* − 2 | under 1200: *n* − 3 | — |
| **Codeforces Div. 2 and Educational** (rated < 2100) | 2100+: all *n* | 1900–2099: *n* − 1 | 1600–1899: *n* − 2 | 1400–1599: *n* − 3 | under 1400: *n* − 4 |
| **Codeforces Div. 1 + Div. 2 and Global** (rated for all) | 2100+: first 7 | 1900–2099: first 6 | 1600–1899: first 5 | 1400–1599: first 4 | 1200–1399: first 3; under 1200: first 2 |
| **CodeChef Starters** (each member sits their own rated division) | — | top 20% of their division by rating: all *n* | everyone else: *n* − 2 | — | — |

**Rules:**
- The target is never fewer than 2 problems and never more than *n*.
- For Div. 1 + 2 and Global rounds, "first k" uses the problem order on the contest page.
- An item is done as soon as the member solves it, any time and any way.
- **Reminders:** a push goes out 2 days and 6 days after the contest while items remain; after that the list stays but goes quiet.
- **Codeforces** upsolves ship first; **CodeChef** follows once the CodeChef adapter returns per-problem results.

*Done when:* for a verified Codeforces round, each member's list matches the table for their rating, excludes problems they solved during the contest, and an item solved later in practice is marked done within one sync.

**A3. Problem of the day**
- One Codeforces problem **per rating band** per day, published at 00:00 IST.
  - Bands: under 1200, 1200–1399, 1400–1599, 1600–1899, 1900+.
  - Difficulty: the band's lower edge + 200 (under 1200 gets an 1000).
- The problem must not have been solved by anyone currently in the band (using full Codeforces histories), and must not be from a round in the last 3 months.
- **Tags are hidden by default.** "Reveal tags" asks first: "Reveal tags? Your bonus drops from +5 to +2." The reveal is saved on the server, so it can't be undone and counts on every device.
- **Reward:** the normal points for the problem, plus **+5**, or **+2** if tags were revealed before the solve. Solving it also extends the problem-of-the-day streak, whether or not tags were revealed.
- **Card:** shows "solved by N of M in your band", the bonus still available ("+5 bonus" or "+2 bonus · tags revealed"), and when the next problem arrives. Practice shows who in the band has solved it.
- **Push:** 08:00 IST ("Problem of the day is up").
- *Done when:* at 00:00 IST each band gets a fresh unsolved problem. Solving without revealing adds normal points + 5; revealing first and then solving adds normal points + 2.

**A4. In-app updates**
- **Over-the-air updates:**
  - The app checks for an update when it opens and each time it comes back to the foreground, and downloads it silently.
  - Once it's downloaded, a card appears: "Update ready · **Restart to update**", which restarts the app straight into the new version.
  - "Later" shrinks the card to a small **Update** pill in the header.
  - After restarting: "Updated to version X · What's new".
- **New APK:** the app compares its version with `GET /api/app-version` (`{ latest, min, url, notes }`).
  - Below `latest` → a dismissible "New app version" sheet, shown at most once a day.
  - Below `min` → a full-screen "Please update the app" that blocks use.
- **Website:** after a new deploy, a "New version · Refresh" toast appears.
- *Done when:* publishing an update makes the card appear on a running phone within one foreground cycle, and tapping it restarts into the new version.

### Phase B — Habits

**B1. Weekly goal**
- **Setting it:** the member picks N problems (3, 5, 7 or 10) rated at least R (1000, 1200, 1300 or 1400). The app suggests their 4-week average + 1.
- **Timing:** each goal runs Monday 00:00 to Sunday 23:59 IST and can be changed until Wednesday 23:59, after which it locks.
- **What counts:** scored solves on any platform whose Codeforces-equivalent rating is at least R.
- Progress shows as a ring on Home and Practice.
- *Done when:* qualifying solves fill the ring, and the goal locks on Thursday.

**B2. Rivals**
- **Picking:** each member picks one rival with "Set as rival" on any profile. It can be changed once every 7 days.
- **Pushes:** the rival is told ("@x picked you as a rival"). The member also gets a push when their rival passes them this week, at most once a day.
- **Home card:** this week's points, solves, contests and duels side by side, plus who's ahead.
- *Done when:* the card updates as both people solve, and the "passed you" push fires at most once a day.

**B3. Badges** (12)

| Badge | How to earn it |
|---|---|
| First AC | First tracked accepted solve |
| On a roll | 7-day solve streak |
| Unbreakable | 30-day solve streak |
| Regular | Present at 5 counted contests in a row |
| Iron attendance | Present at 10 in a row |
| Upsolver | Clear 10 upsolve items |
| Daily driver | Solve the problem of the day 7 days in a row |
| Goal getter | Hit the weekly goal 4 weeks in a row |
| New colour | Reach a new Codeforces rank colour |
| Duelist | Win a first duel |
| Giant slayer | Beat a duel opponent whose duel rating is 200+ higher |
| Top of the board | Finish a week at #1 |

- **When they're checked:** on events (solve synced, contest verified, duel finished), plus a nightly sweep. Each badge can only be earned once.
- **Earning one:** sends a push, and shows a celebration sheet the next time the app opens.
- **Locked badges:** show their progress ("8 of 10").
- *Done when:* each badge is awarded exactly once when its rule is met, including by the nightly sweep for missed events.

### Phase C — Duels

Both players need an approved Codeforces handle. An unrated player counts as 1200.

1. **Challenge:** the member picks an opponent, or "random within ±200 CF rating". They choose a difficulty — Easy (average − 300 to − 100), Even (average ± 100) or Hard (average + 100 to + 300), where the average is the two players' CF ratings rounded to 100 — and a time limit of 30, 45 or 60 minutes.
2. **Invite:** a push with Accept and Decline buttons. It expires after 10 minutes. Each person can have at most 3 open invites, and can be in only 1 live duel.
3. **Start:** on accept, the server picks a random Codeforces problem in the range that neither player has solved and that isn't from a round in the last 3 months. It records the **start time** *S* and **end time** *E* = *S* + the limit. Both players see the problem at the same moment.
4. **Result:** the first Accepted wins. If nobody solves it in time, it's a draw. "Give up" counts as a loss, unless an Accepted by that player made before giving up is found, because the winner comes only from submission data.

**How the result is decided**

The winner comes **only from Codeforces submission data**. Every submission has an exact time (`creationTimeSeconds`) and a unique id. Nobody's button press decides anything, so the order in which players click doesn't matter.

- **What counts:** a submission by either player on the duel problem made at or after *S* and before *E*. Anything before *S* or at/after *E* is ignored. The problem is matched by its contest id and index.
- **Every check reads both players.** A check calls `contest.status` on the problem's contest for both handles (2 s apart) and looks only at the duel problem. This reads only that contest, so unrelated submissions can't push a duel submission out of the result, even after an outage.
- **When checks happen:**
  - automatically every minute;
  - "I submitted, check now" from either player, at most once every 20 seconds per duel (the button stays visible but shows "Checked a moment ago");
  - once more just after *E*.
- **Deciding:**
  1. Among counting submissions with verdict `OK`, the earliest `creationTimeSeconds` wins. On an exact tie, the lower submission id wins.
  2. **Pending verdicts block a decision.** Before declaring a winner, the server checks whether the *other* player has any counting submission made **earlier** than the winning one that is still being judged (verdict missing or `TESTING`). If so, the duel shows "Judging…" for both players and waits for that verdict; an earlier Accepted would win instead.
  3. **After *E*:** if nothing is Accepted and nothing is pending, it's a draw. If any submission made before *E* is still judging, the duel waits (up to 15 minutes after *E*) for the verdict, then decides, treating anything still pending as not Accepted.
  4. **Codeforces down:** the duel stays "Checking…" and is decided from the timestamps as soon as the API answers again. An outage never changes the result.
- **Displayed time:** the winning time shown is `creationTimeSeconds − S` (for example "18:52"), not the time the check ran.
- **Example:** A gets Accepted at 8:30:05 and never clicks. B gets Accepted at 8:31:40 and clicks "check now" at 8:31:50. The check reads both players, finds A's earlier Accepted, and **A wins** by 1 minute 35 seconds.
- **Example with judging:** A submits at 8:30:05 (still "Testing"); B gets Accepted at 8:30:40 and clicks. The duel shows "Judging…". If A's verdict comes back Accepted, A wins; if it's Wrong answer, B wins.

**Duel rating and limits**
- **Duel rating:** Elo, starting at 1200, with K = 32. It's separate from leaderboard points.
- **Where it shows:** a duel leaderboard; results in the feed ("@a beat @b on a 1500 in 18 min"); anyone can see a live duel's status.
- **Limit:** at most 10 live duels at once, because of the Codeforces rate limit. Further accepts wait with "Starting soon".

*Done when:* two test accounts can play a full duel on a real problem; the winner is decided correctly in all three cases above (no click, the slower player clicks, an earlier pending verdict); and ratings update correctly.

### Phase D — Wrap-ups

**D1. Sunday recap**
- A push at Sunday 21:00 IST opens a 3-page story:
  1. points, rank and change, solves and hardest solve, contests attended;
  2. streak, top topic, duel record, weekly goal;
  3. a club shoutout (the biggest climber) and next week's contests.
- Sharing it as an image needs a future APK, so it's out of scope here.
- *Done when:* every active member gets a recap built from that week's data.

**D2. Club virtual contests**
- **Scheduling:** an admin enters a Codeforces contest id and a start time. The app shows the round's name, length and problem count. "Counts for attendance" is off by default.
- **For members:** RSVP, the usual reminders, and a "Club virtual" tag in Contests.
- **Who counts:** members who start the virtual on Codeforces within 15 minutes of the club start. When "Counts for attendance" is on, those members are present and everyone else is absent, as an exception to the live-only rule in `PRD.md`.
- **Standings:** live club-only standings, refreshed every 2 minutes, with solve times and wrong-try counts.
- *Done when:* virtual participants appear in club standings within 2 minutes of a submission, and non-participants don't.

**D3. Coordinator digest**
- An email to all admins every Monday at 09:00 IST, once an email service is chosen (see Decisions). The same content shows at Admin → Digest.
- **Contents:** attendance (with the change from last week), active members, club solves, each contest's turnout, members with no solves in 7 days, pending reasons, handles waiting for approval, top 3 climbers, new sign-ups.
- *Done when:* admins can read it at Admin → Digest with figures that match the admin pages, and receive it by email on Monday once a service is chosen.

## New notifications

| Push | When | Settings switch |
|---|---|---|
| Problem of the day | 08:00 IST | Practice reminders |
| Upsolve reminder | 2 and 6 days after a contest | Practice reminders |
| Duel invite (Accept / Decline), duel start, duel result | Immediately | Always on |
| Rival picked you / passed you | Immediately, at most once a day | Rival alerts |
| New badge | Immediately | Badges |
| Sunday recap | Sunday 21:00 IST | Weekly recap |
| Announcement | When sent | Always on |

The new switches go in Settings → Notifications, all on by default. The existing 9 PM "streak about to break" push is unchanged. A member never gets more than one push of the same type in a minute.

## Out of scope

- **Removed for now:** calendar sync and streak freeze.
- **Needs a new APK:** QR attendance, sharing the recap as an image, the home-screen widget.
- **Later:** best-of-three duels, admin-editable badge rules.

## Constraints

Same as `PRD.md`: ₹0, Cloudflare free plan, Codeforces at most 1 call every 2 seconds. Every feature ships over the air.
