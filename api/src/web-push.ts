import { importJWK, SignJWT } from 'jose';
import type { Bindings } from './auth';

const RECORD_SIZE = 4096;
const VAPID_TTL_SECONDS = 12 * 3600;
const PUSH_TTL_SECONDS = 3600;
const encoder = new TextEncoder();

type Subscription = { endpoint: string; keys: { p256dh: string; auth: string } };

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, bytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

// RFC 8291: the aes128gcm message encryption every browser push service requires.
export async function encryptPayload(subscription: Subscription, payload: string): Promise<Uint8Array<ArrayBuffer>> {
  const clientPublic = fromBase64Url(subscription.keys.p256dh);
  const auth = fromBase64Url(subscription.keys.auth);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const serverKeys = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const serverPublic = new Uint8Array((await crypto.subtle.exportKey('raw', serverKeys.publicKey)) as ArrayBuffer);
  const clientKey = await crypto.subtle.importKey('raw', clientPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, serverKeys.privateKey, 256));

  const ikm = await hkdf(auth, shared, concat(encoder.encode('WebPush: info\0'), clientPublic, serverPublic), 32);
  const contentKey = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']);
  const record = concat(encoder.encode(payload), new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, record));

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, RECORD_SIZE);
  return concat(salt, recordSize, new Uint8Array([serverPublic.length]), serverPublic, cipher);
}

async function vapidHeader(env: Bindings, endpoint: string): Promise<string> {
  const publicBytes = fromBase64Url(env.VAPID_PUBLIC_KEY);
  const key = await importJWK(
    {
      kty: 'EC',
      crv: 'P-256',
      d: env.VAPID_PRIVATE_KEY,
      x: toBase64Url(publicBytes.slice(1, 33)),
      y: toBase64Url(publicBytes.slice(33, 65)),
    },
    'ES256',
  );
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', typ: 'JWT' })
    .setAudience(new URL(endpoint).origin)
    .setSubject(env.WEB_ORIGIN)
    .setExpirationTime(`${VAPID_TTL_SECONDS}s`)
    .sign(key);
  return `vapid t=${token}, k=${env.VAPID_PUBLIC_KEY}`;
}

// Returns true when the browser has dropped the subscription, so it can be deleted.
export async function sendWebPush(env: Bindings, token: string, payload: string): Promise<boolean> {
  const subscription: Subscription = JSON.parse(token);
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(env, subscription.endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(PUSH_TTL_SECONDS),
      Urgency: 'high',
    },
    body: await encryptPayload(subscription, payload),
  });
  if (response.status === 404 || response.status === 410) return true;
  if (!response.ok) throw new Error(`Web push returned ${response.status}`);
  return false;
}
