import * as cc from './adapters/cc';
import { postIngest } from './lib';

const { HANDLE: handle } = process.env;
if (!handle) throw new Error('HANDLE is required');

const name = await cc.fetchName(handle);
await postIngest('/verify', { handle, name });
console.log(`cc ${handle}: profile name read`);
