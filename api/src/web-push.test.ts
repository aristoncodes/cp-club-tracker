import { createDecipheriv, createECDH, hkdfSync, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encryptPayload } from './web-push';

const hkdf = (salt: Uint8Array, ikm: Uint8Array, info: string | Buffer, bytes: number) =>
  Buffer.from(hkdfSync('sha256', ikm, salt, info, bytes));

// Decrypts the way a browser does, using Node's crypto rather than the code under test.
function decrypt(message: Uint8Array, clientKeys: ReturnType<typeof createECDH>, auth: Buffer): string {
  const salt = message.slice(0, 16);
  const keyLength = message[20];
  const serverPublic = message.slice(21, 21 + keyLength);
  const cipher = message.slice(21 + keyLength);
  const shared = clientKeys.computeSecret(serverPublic);
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), clientKeys.getPublicKey(), serverPublic]);
  const ikm = hkdf(auth, shared, info, 32);
  const key = hkdf(salt, ikm, 'Content-Encoding: aes128gcm\0', 16);
  const nonce = hkdf(salt, ikm, 'Content-Encoding: nonce\0', 12);
  const decipher = createDecipheriv('aes-128-gcm', key, nonce);
  decipher.setAuthTag(cipher.slice(-16));
  const plain = Buffer.concat([decipher.update(cipher.slice(0, -16)), decipher.final()]);
  expect(plain[plain.length - 1]).toBe(2);
  return plain.slice(0, -1).toString();
}

describe('encryptPayload', () => {
  it('produces a message the browser side can decrypt', async () => {
    const client = createECDH('prime256v1');
    client.generateKeys();
    const auth = randomBytes(16);
    const subscription = {
      endpoint: 'https://push.example/1',
      keys: { p256dh: client.getPublicKey().toString('base64url'), auth: auth.toString('base64url') },
    };
    const message = await encryptPayload(subscription, 'You missed Starters 264. Why?');
    expect(decrypt(message, client, auth)).toBe('You missed Starters 264. Why?');
  });
});
