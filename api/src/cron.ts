import { SETTING_DEFAULTS, type Settings } from 'shared/settings';
import { IST_OFFSET, formatIST, istDay } from 'shared/time';
import { sendDueAnnouncements } from './announcements';
import { inExamWeek, isNightlyJobMinute, istMinute, runAdminJobs } from './admin-jobs';
import { sweepBadges } from './badges';
import { refreshRatings, runCfQueue } from './cf-queue';
import type { Bindings } from './auth';
import { duelHousekeeping } from './duels';
import { mealAt, mealPush, type Meal } from './meal-pushes';
import { pickMissingPotd, pickPotd, sendPotdPush, sendUpsolveReminders } from './practice';
import { sendPushes, type PushMessage } from './push';
import { sendRecapPush } from './recap';
import { checkRivals } from './rivals';
import { finishVirtual } from './virtuals';
import { createAttendanceRows, finishContest, trackedMember } from './records';
import { getSettings } from './settings';

const REMINDER_LEAD = 3600;
const RSVP_LEAD = 300;
const VERIFY_DELAY = 900;
const HOUR = 3600;
const REDISPATCH_FOR = 86400;
const CRON_TICK = 60;
const RATING_REFRESH_SECOND_OF_DAY = 18.5 * HOUR;
const SOLVE_JOB_SECONDS = 5 * 60;
const CONTEST_JOB_SECONDS = 6 * HOUR;
const HEALTH_JOB_SECOND_OF_DAY = 0.5 * HOUR;
const PROBLEMSET_JOB_SECOND_OF_DAY = 16.5 * HOUR;
const DAY = 86400;
const SUNDAY = 6; // Days after Monday.

type ContestRow = {
  id: number;
  platform: string;
  external_id: string;
  alt_external_id: string | null;
  name: string;
  url: string;
  start_at: number;
  end_at: number;
  counts: number;
  stage: number;
  kind?: string;
  source?: string;
};

export function contestAction(contest: ContestRow, now: number): 'reminder' | 'rsvp' | 'catchup' | 'verify' | null {
  if ((!contest.counts && contest.kind !== 'virtual') || contest.stage >= 4) return null;
  const sinceVerify = now - (contest.end_at + VERIFY_DELAY);
  if (contest.stage === 3) {
    const retry = sinceVerify >= HOUR && sinceVerify <= REDISPATCH_FOR && sinceVerify % HOUR < CRON_TICK;
    return retry ? 'verify' : null;
  }
  if (sinceVerify >= 0) return 'verify';
  if (contest.stage === 2) return null;
  if (now >= contest.start_at) return 'catchup';
  if (now >= contest.start_at - RSVP_LEAD) return 'rsvp';
  if (contest.stage === 0 && now >= contest.start_at - REMINDER_LEAD) return 'reminder';
  return null;
}

function isDailyTick(now: number, secondOfDay: number): boolean {
  const second = now % DAY;
  return second >= secondOfDay && second < secondOfDay + CRON_TICK;
}

export const isRatingRefreshTick = (now: number) => isDailyTick(now, RATING_REFRESH_SECOND_OF_DAY);
export const isHealthJobTick = (now: number) => isDailyTick(now, HEALTH_JOB_SECOND_OF_DAY);
export const isStreakReminderTick = (now: number, minute: number = SETTING_DEFAULTS.streak_push_minute) => istMinute(now) === minute;
export const isRecapTick = (now: number, minute: number = SETTING_DEFAULTS.recap_push_minute) => istMinute(now) === minute && (istDay(now) + 3) % 7 === SUNDAY;
export const isPotdPushTick = (now: number, minute: number = SETTING_DEFAULTS.potd_push_minute) => istMinute(now) === minute;
export const isProblemsetJobTick = (now: number) => isDailyTick(now, PROBLEMSET_JOB_SECOND_OF_DAY);
export const isSolveJobTick = (now: number) => now % SOLVE_JOB_SECONDS < CRON_TICK;
export const isContestJobTick = (now: number) => now % CONTEST_JOB_SECONDS < CRON_TICK;

async function participantTokens(db: D1Database, platform: string, preference: 'notify_hour' | 'notify_rsvp', now: number): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT p.token FROM push_tokens p
       JOIN users u ON u.id = p.user_id
       WHERE u.active = 1 AND u.${preference} = 1 AND ${trackedMember('u', now)} AND COALESCE(u.batch_year, 0) NOT IN (${inExamWeek('excuse', now)})
         AND (?1 = 'other' OR EXISTS (SELECT 1 FROM handles h WHERE h.user_id = u.id AND h.platform = ?1 AND h.approved_at IS NOT NULL))`,
    )
    .bind(platform)
    .all<{ token: string }>();
  return results.map((r) => r.token);
}

function setStage(db: D1Database, contest: ContestRow, stage: number): Promise<D1Result> {
  return db.prepare('UPDATE contests SET stage = ? WHERE id = ?').bind(stage, contest.id).run();
}

export async function dispatchWorkflow(env: Bindings, workflow: string, inputs: Record<string, string> = {}): Promise<void> {
  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'User-Agent': 'cp-club-tracker',
    },
    body: JSON.stringify({ ref: 'main', inputs }),
  });
  if (!response.ok) throw new Error(`GitHub dispatch returned ${response.status}: ${await response.text()}`);
}

async function advanceContest(env: Bindings, contest: ContestRow, now: number): Promise<void> {
  const db = env.DB;
  const action = contestAction(contest, now);
  if (!action) return;

  if (action === 'verify' && contest.kind === 'virtual') {
    await finishVirtual(env, contest);
    return;
  }

  if (action === 'verify' && contest.source === 'other') {
    await finishContest(env, contest, []);
    return;
  }

  if (action === 'verify' && contest.source === 'offline') {
    const { results } = await db
      .prepare('SELECT k.user_id AS id FROM session_checkins k JOIN sessions s ON s.id = k.session_id WHERE s.contest_id = ?')
      .bind(contest.id)
      .all<{ id: number }>();
    await finishContest(env, contest, [], results.map((row) => row.id));
    return;
  }

  if (action === 'verify') {
    await dispatchWorkflow(env, 'participation.yml', {
      platform: contest.platform,
      contest: contest.external_id,
      alt: contest.alt_external_id ?? '',
      start: String(contest.start_at),
      end: String(contest.end_at),
    });
    await setStage(db, contest, 3);
    return;
  }

  if (action === 'reminder') {
    const startsAt = formatIST(contest.start_at).split(' · ')[1];
    const tokens = await participantTokens(db, contest.platform, 'notify_hour', now);
    const messages: PushMessage[] = tokens.map((to) => ({
      to,
      body: `${contest.name} starts at ${startsAt} — in 1 hour.`,
      data: { url: contest.url },
    }));
    await sendPushes(env, messages);
    await setStage(db, contest, 1);
    return;
  }

  await createAttendanceRows(db, contest).run();
  if (action === 'rsvp') {
    const tokens = await participantTokens(db, contest.platform, 'notify_rsvp', now);
    const messages: PushMessage[] = tokens.map((to) => ({
      to,
      body: `${contest.name} starts in 5 min. Giving it?`,
      categoryId: 'rsvp',
      data: { contestId: contest.id },
    }));
    await sendPushes(env, messages);
  }
  await setStage(db, contest, 2);
}

export function streakReminderQuery(db: D1Database, now: number): D1PreparedStatement {
  const today = istDay(now);
  const dayOf = `(s.solved_at + ${IST_OFFSET}) / ${DAY}`;
  return db
    .prepare(
      `SELECT p.token FROM push_tokens p JOIN users u ON u.id = p.user_id
       WHERE u.active = 1 AND u.notify_streak = 1
         AND EXISTS (SELECT 1 FROM solves s WHERE s.user_id = u.id AND ${dayOf} = ?1)
         AND NOT EXISTS (SELECT 1 FROM solves s WHERE s.user_id = u.id AND ${dayOf} = ?2)`,
    )
    .bind(today - 1, today);
}

async function sendStreakReminders(env: Bindings, now: number): Promise<void> {
  const { results } = await streakReminderQuery(env.DB, now).all<{ token: string }>();
  await sendPushes(
    env,
    results.map((r) => ({ to: r.token, body: 'One problem today keeps your streak alive.', data: { screen: 'home' } })),
  );
}

export function mealRecipientsQuery(db: D1Database, now: number): D1PreparedStatement {
  return db
    .prepare(
      `SELECT p.token, EXISTS (SELECT 1 FROM solves s WHERE s.user_id = u.id AND (s.solved_at + ${IST_OFFSET}) / ${DAY} = ?1) AS solvedToday
       FROM push_tokens p JOIN users u ON u.id = p.user_id
       WHERE u.active = 1 AND u.notify_meals = 1`,
    )
    .bind(istDay(now));
}

// The 9 PM streak reminder and Sunday's recap replace dinner's line for the people they go to, so nobody gets both.
async function sendMealPushes(env: Bindings, meal: Meal, now: number, settings: Settings): Promise<void> {
  const today = istDay(now);
  const { results } = await mealRecipientsQuery(env.DB, now).all<{ token: string; solvedToday: number }>();
  const peers = await env.DB.prepare(`SELECT COUNT(DISTINCT s.user_id) AS n FROM solves s JOIN users u ON u.id = s.user_id WHERE u.active = 1 AND (s.solved_at + ${IST_OFFSET}) / ${DAY} = ?`)
    .bind(today)
    .first<{ n: number }>();
  const streak = isStreakReminderTick(now, settings.streak_push_minute) ? (await streakReminderQuery(env.DB, now).all<{ token: string }>()).results.map((r) => r.token) : [];
  if (isRecapTick(now, settings.recap_push_minute)) {
    const recap = await env.DB.prepare('SELECT p.token FROM push_tokens p JOIN users u ON u.id = p.user_id WHERE u.active = 1 AND u.notify_recap = 1').all<{ token: string }>();
    streak.push(...recap.results.map((r) => r.token));
  }
  await sendPushes(
    env,
    results
      .filter((r) => !streak.includes(r.token))
      .map((r) => ({ to: r.token, ...mealPush(meal, today, !!r.solvedToday, peers?.n ?? 0), data: { screen: 'home' } })),
  );
}

async function sendMandatoryReminders(env: Bindings, settings: Settings, now: number): Promise<void> {
  const claimed = await env.DB.prepare(
    `UPDATE contests SET mandatory_reminded = 1 WHERE mandatory = 1 AND mandatory_reminded = 0 AND counts = 1 AND start_at > ?1 AND start_at <= ?1 + ?2 * 3600
     RETURNING id, platform, name, url, start_at AS startAt`,
  )
    .bind(now, settings.mandatory_reminder_hours)
    .all<{ id: number; platform: string; name: string; url: string; startAt: number }>();
  for (const contest of claimed.results) {
    const tokens = await participantTokens(env.DB, contest.platform, 'notify_hour', now);
    const at = formatIST(contest.startAt).split(' · ')[1];
    await sendPushes(env, tokens.map((to) => ({ to, title: 'Must attend', body: `${contest.name} starts at ${at}. This one is mandatory.`, data: { url: contest.url } })));
  }
}

async function attempt(label: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (err) {
    console.error(`Cron failed: ${label}:`, err);
  }
}

export async function runCron(env: Bindings, now: number): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT id, platform, external_id, alt_external_id, name, url, start_at, end_at, counts, stage, kind, source
     FROM contests WHERE (counts = 1 OR kind = 'virtual') AND stage < 4 AND start_at <= ?`,
  )
    .bind(now + REMINDER_LEAD)
    .all<ContestRow>();
  for (const contest of results) {
    await attempt(`contest ${contest.id}`, () => advanceContest(env, contest, now));
  }
  const settings = await getSettings(env.DB, now);
  await attempt('mandatory reminders', () => sendMandatoryReminders(env, settings, now));
  await attempt('admin jobs', () => runAdminJobs(env, now));
  await attempt('duel housekeeping', () => duelHousekeeping(env, now));
  await attempt('badge sweep', () => sweepBadges(env, now));
  await attempt('announcements', () => sendDueAnnouncements(env, now));
  if (isRecapTick(now, settings.recap_push_minute)) await attempt('recap', () => sendRecapPush(env));
  if (isStreakReminderTick(now, settings.streak_push_minute)) await attempt('streak reminder', () => sendStreakReminders(env, now));
  const meal = mealAt(now);
  if (meal) await attempt('meal push', () => sendMealPushes(env, meal, now, settings));
  if (isSolveJobTick(now)) {
    await attempt('solve job', () => dispatchWorkflow(env, 'sync-solves.yml'));
    await attempt('rivals', () => checkRivals(env, now));
    await attempt('upsolve reminders', () => sendUpsolveReminders(env, now));
    await attempt('missing problem of the day', () => pickMissingPotd(env.DB, now));
  }
  if (isPotdPushTick(now, settings.potd_push_minute)) await attempt('problem of the day push', () => sendPotdPush(env, now));
  if (isProblemsetJobTick(now)) await attempt('problemset job', () => dispatchWorkflow(env, 'sync-problemset.yml'));
  if (isContestJobTick(now)) await attempt('contest job', () => dispatchWorkflow(env, 'sync-contests.yml'));
  if (isHealthJobTick(now)) await attempt('health job', () => dispatchWorkflow(env, 'health.yml'));
  if (isRatingRefreshTick(now)) {
    await attempt('rating refresh', () => refreshRatings(env.DB));
    await attempt('problem of the day', () => pickPotd(env.DB, istDay(now), now));
  }
  // The nightly admin jobs get these minutes to themselves, so the two costs don't add up. Solve sync catches up next minute.
  if (isNightlyJobMinute(now)) return;
  // Last, because it runs for most of a minute and shouldn't delay anything above.
  await attempt('codeforces queue', () => runCfQueue(env, now));
}
