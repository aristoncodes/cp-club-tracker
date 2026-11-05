import * as cf from './adapters/cf';
import { getHistoryMissing, postIngest } from './lib';

const CHUNK = 500;
const HISTORY_CHUNK = 1000;
const HISTORY_ROWS_PER_RUN = 20_000;

function chunks<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}

const data = cf.parsePicksData(await cf.fetchProblemset(), await cf.fetchFinishedContests());
for (const rounds of chunks(data.rounds, CHUNK)) await postIngest('/problemset', { rounds, problems: [] });
for (const problems of chunks(data.problems, CHUNK)) await postIngest('/problemset', { rounds: [], problems });
console.log(`Sent ${data.rounds.length} rounds and ${data.problems.length} problems`);

// D1's free plan allows 100k rows written a day, so a big first import continues over the next days.
let written = 0;
for (const handle of await getHistoryMissing()) {
  if (written >= HISTORY_ROWS_PER_RUN) break;
  try {
    const problemIds = cf.solvedProblemIds(cf.parseSubmissions(await cf.fetchAllSubmissions(handle)));
    const parts = chunks(problemIds, HISTORY_CHUNK);
    for (const part of parts) await postIngest('/cf-history', { handle, problemIds: part });
    await postIngest('/cf-history', { handle, problemIds: [], done: true });
    written += problemIds.length;
  } catch (err) {
    console.error(`History failed for ${handle}:`, err);
    process.exitCode = 1;
  }
}
console.log(`Imported ${written} solved problems`);
