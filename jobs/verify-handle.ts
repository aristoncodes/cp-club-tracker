import * as cc from './adapters/cc';
import { postIngest } from './lib';

const { HANDLE: handle } = process.env;
if (!handle) throw new Error('HANDLE is required');

const now = Math.floor(Date.now() / 1000);
const wrongAnswers = cc
  .parseRecent(await cc.fetchRecent(handle), now)
  .filter((s) => s.wrongAnswer)
  .map((s) => ({ problemCode: s.problemCode, at: s.solvedAt }));
await postIngest('/verify', { handle, wrongAnswers });
console.log(`cc ${handle}: ${wrongAnswers.length} recent wrong answers sent`);
