import { formatIST } from 'shared/time';
import { sendPushes, type PushMessage } from './push';

const REMINDER_LEAD = 3600;
const RSVP_LEAD = 300;

type ContestRow = {
  id: number;
  platform: string;
  name: string;
  url: string;
  start_at: number;
  counts: number;
  stage: number;
};

export function contestAction(contest: ContestRow, now: number): 'reminder' | 'rsvp' | 'catchup' | null {
  if (!contest.counts || contest.stage >= 2) return null;
  if (now >= contest.start_at) return 'catchup';
  if (now >= contest.start_at - RSVP_LEAD) return 'rsvp';
  if (contest.stage === 0 && now >= contest.start_at - REMINDER_LEAD) return 'reminder';
  return null;
}

async function participantTokens(db: D1Database, platform: string): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT p.token FROM push_tokens p
       JOIN users u ON u.id = p.user_id
       JOIN handles h ON h.user_id = u.id
       WHERE p.kind = 'expo' AND u.active = 1 AND h.platform = ? AND h.approved_at IS NOT NULL`,
    )
    .bind(platform)
    .all<{ token: string }>();
  return results.map((r) => r.token);
}

function createAttendanceRows(db: D1Database, contest: ContestRow): Promise<D1Result> {
  return db
    .prepare(
      `INSERT OR IGNORE INTO attendance (contest_id, user_id)
       SELECT ?, u.id FROM users u JOIN handles h ON h.user_id = u.id
       WHERE u.active = 1 AND h.platform = ? AND h.approved_at IS NOT NULL`,
    )
    .bind(contest.id, contest.platform)
    .run();
}

function setStage(db: D1Database, contest: ContestRow, stage: number): Promise<D1Result> {
  return db.prepare('UPDATE contests SET stage = ? WHERE id = ?').bind(stage, contest.id).run();
}

async function advanceContest(db: D1Database, contest: ContestRow, now: number): Promise<void> {
  const action = contestAction(contest, now);
  if (!action) return;

  if (action === 'reminder') {
    const startsAt = formatIST(contest.start_at).split(' · ')[1];
    const tokens = await participantTokens(db, contest.platform);
    const messages: PushMessage[] = tokens.map((to) => ({
      to,
      body: `${contest.name} starts at ${startsAt} — in 1 hour.`,
      data: { url: contest.url },
    }));
    await sendPushes(db, messages);
    await setStage(db, contest, 1);
    return;
  }

  await createAttendanceRows(db, contest);
  if (action === 'rsvp') {
    const tokens = await participantTokens(db, contest.platform);
    const messages: PushMessage[] = tokens.map((to) => ({
      to,
      body: `${contest.name} starts in 5 min. Giving it?`,
      categoryId: 'rsvp',
      data: { contestId: contest.id },
    }));
    await sendPushes(db, messages);
  }
  await setStage(db, contest, 2);
}

export async function runCron(db: D1Database, now: number): Promise<void> {
  const { results } = await db
    .prepare('SELECT id, platform, name, url, start_at, counts, stage FROM contests WHERE counts = 1 AND stage < 2 AND start_at <= ?')
    .bind(now + REMINDER_LEAD)
    .all<ContestRow>();
  for (const contest of results) {
    try {
      await advanceContest(db, contest, now);
    } catch (err) {
      console.error(`Cron failed for contest ${contest.id}:`, err);
    }
  }
}
