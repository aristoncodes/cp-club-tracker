# CLAUDE.md — How to work on OOPS.Grind

Read `CODEMAP.md` first. It says where the code is and which doc sections a task needs; read those sections, not every doc in full.

- Attendance, scoring or who can see what: read `PRD.md` in full. If the docs don't answer it, stop and ask.
- Add-ons: read `PRD_ADDONS.md → Decisions` before that feature's section.
- Starting a task from the plan: read its entry in `IMPLEMENTATION_PLAN.md` and its checks in `TESTING.md`.

Don't read whole code files when a section will do. When a file, route group or table is added, removed or changes job, update `CODEMAP.md` in the same commit.

## Prime rule: the least code that works

- Write the smallest amount of code that meets the task's "Done when". No features, options, flags or abstractions "for later".
- **No dead code.** No commented-out code, unused exports, unused dependencies, placeholder functions or leftover TODO stubs. When you replace something, delete the old version.
- **No unnecessary files.** Don't create a file for a function used in one place. No barrel `index.ts` re-export files. No per-folder READMEs. No config files the tooling doesn't require. A new file must be a natural unit (a route group, a platform adapter, a screen) or hold code used in 2+ places.
- Duplicate twice before abstracting; abstract on the third use.
- Use only the dependencies listed in `ARCHITECTURE.md → Dependencies`. Ask before adding anything else.
- Not allowed: ORM, global state library, UI component library, logging framework, error-tracking SDK, i18n, feature-flag system, monorepo build tool beyond pnpm workspaces.
- Prefer platform features: D1 prepared statements, `fetch`, React state, Tailwind classes, Expo modules.

## Workflow

- Follow `IMPLEMENTATION_PLAN.md` one task at a time. Before coding, restate the task's "Done when" and list the files you'll touch.
- After each task: `pnpm -r typecheck`, `pnpm -r test`, the task's manual check from `TESTING.md`. Then tick the box in `IMPLEMENTATION_PLAN.md` and commit as `<area>: <what>` (e.g. `api: rsvp endpoint`).
- Docs are the source of truth. If a decision changes, update the doc in the same commit, so code and docs never disagree.
- If the docs don't answer a question about attendance rules, scoring or what users see, stop and ask. Don't guess.
- **Every admin write goes through the audit helper** (`adminWrite`), so there's no write path without a log row.
- **Every threshold is read from `settings`**, with defaults in one place. No magic numbers.
- Never write to production D1 or push to real students while developing. Use local D1 (`wrangler dev`) and your own device token.

## Conventions

- TypeScript `strict` everywhere, ES modules, named exports, `type` over `interface`.
- **Time:** store unix seconds UTC as `INTEGER`. Convert to IST (Asia/Kolkata, UTC+05:30, no DST) only for display and for day/week/month boundaries, using `shared/time.ts`.
- **Platform ids:** `cf`, `cc`, `atcoder`, `leetcode`. Use these strings everywhere.
- **SQL:** the schema lives only in `api/migrations/`, and changes are new migration files. Queries sit next to the code that uses them.
- **Naming:** files kebab-case, React components PascalCase, functions camelCase.
- **Errors:** the API returns `{ error: string }` with a correct HTTP status and never leaks stack traces. A failed external fetch is retried on the next scheduled run, never in a loop.
- **Secrets** go only in `wrangler secret`, GitHub Actions secrets or a gitignored `.env`. Never commit them.
- **Rate limits:** Codeforces at most 1 request per 2 s. Scrapers at most 1 request/s per site, with a descriptive User-Agent.
- **Cloudflare free plan:** 10 ms CPU and 50 subrequests per Worker invocation. Network waits don't count, but JSON parsing does. Keep Worker jobs small; heavy fetching and parsing belongs in `jobs/`, which runs on GitHub Actions.

## Commands

```bash
pnpm i
pnpm -r typecheck
pnpm -r test
pnpm --filter api db:local      # reset local D1 and apply all migrations
pnpm --filter api dev           # wrangler dev with local D1 (+ --test-scheduled)
pnpm --filter api exec wrangler deploy
pnpm --filter web dev
pnpm --filter app start         # Expo dev server
pnpm --filter jobs sync-contests | sync-solves | sync-problemset | backfill | participation
```

## Repo layout

Don't add top-level folders.

```
shared/   scoring, contest rules, time helpers, shared types (pure TS, no deps)
api/      Cloudflare Worker: HTTP API + cron dispatcher, migrations/, wrangler.toml
web/      Vite + React + Tailwind website, deployed as a static-assets Cloudflare Worker
app/      Expo (React Native) Android app
jobs/     Node scripts run by GitHub Actions: platform adapters + ingest
.github/workflows/   schedules for jobs/
```
