// ---------------------------------------------------------------------------
// Web Push, written out by hand.
//
// The usual way is the `web-push` package, and it was left out on purpose:
// the site keeps to two dependencies, and everything that package does is
// two standards and Node's own crypto.
//
//   RFC 8291 (with RFC 8188): the message is encrypted to the phone's own key,
//     so the push service in the middle (Google's, Apple's, Mozilla's) carries
//     it without being able to read it.
//   RFC 8292 (VAPID): the request is signed with the site's key, so the push
//     service knows the message came from whoever the phone subscribed to.
//
// `encrypt` is checked in test/missions.test.js against the worked example in
// RFC 8291's appendix, byte for byte, and `vapidHeader` by verifying its
// signature. Change either with the same care as grade.js.
//
// Nothing here knows about missions. It takes a subscription and some bytes
// and reports what the push service said.
// ---------------------------------------------------------------------------

import crypto from 'node:crypto';

// No string here carries an escape: the zero bytes the standards ask for are
// made as bytes, because an escape is what the tools that write this file
// tend to eat (see CLAUDE.md, House style).
const NUL = Buffer.from([0]);
const ONE = Buffer.from([1]);
const LAST_RECORD = Buffer.from([2]);

export const b64u = (buf) => Buffer.from(buf).toString('base64url');
export const unb64u = (s) => Buffer.from(String(s || ''), 'base64url');

// --- the site's key -----------------------------------------------------------

/** A fresh VAPID key pair, both halves base64url. Run once, kept in the environment. */
export function generateKeys() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}

/**
 * The key pair from the environment, or null if it is missing or does not
 * hang together. The public half is worked out from the private half and
 * compared, because a pair pasted from two different runs of the generator
 * signs requests that every push service refuses, and says nothing about why.
 */
export function keysFromEnv(env = process.env) {
  const publicKey = String(env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = String(env.VAPID_PRIVATE_KEY || '').trim();
  if (!publicKey || !privateKey) return null;
  try {
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.setPrivateKey(unb64u(privateKey));
    if (b64u(ecdh.getPublicKey()) !== publicKey) return { problem: 'VAPID_PUBLIC_KEY is not the pair of VAPID_PRIVATE_KEY.' };
  } catch {
    return { problem: 'VAPID_PRIVATE_KEY is not a P-256 key.' };
  }
  return { publicKey, privateKey };
}

function signingKey({ publicKey, privateKey }) {
  const pub = unb64u(publicKey);
  return crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: 'jwk',
  });
}

/**
 * The Authorization header for one push service. `aud` is the service's
 * origin; `sub` is how its operators can reach whoever runs this site, and
 * Apple refuses a request without a real one.
 */
export function vapidHeader(endpoint, keys, subject, now = Date.now()) {
  const aud = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  // Twelve hours is half the most the standard allows, which leaves room for
  // a clock that is somewhat wrong in either direction.
  const claims = b64u(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }));
  const unsigned = `${header}.${claims}`;
  const signature = crypto.sign('sha256', Buffer.from(unsigned), { key: signingKey(keys), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${unsigned}.${b64u(signature)}, k=${keys.publicKey}`;
}

// --- the message --------------------------------------------------------------

/**
 * Encrypt `payload` for one subscription (RFC 8291, aes128gcm, one record).
 * `fixed` exists for the test only: it pins the server's one-off key and the
 * salt so the output can be compared with the RFC's example. Left out, both
 * are fresh for every message, as they must be.
 */
export function encrypt(payload, { p256dh, auth }, fixed = {}) {
  const uaPublic = unb64u(p256dh);
  const authSecret = unb64u(auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('That subscription key is not a P-256 point.');
  if (authSecret.length !== 16) throw new Error('That subscription secret is the wrong length.');

  const ecdh = crypto.createECDH('prime256v1');
  if (fixed.privateKey) ecdh.setPrivateKey(unb64u(fixed.privateKey));
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const salt = fixed.salt ? unb64u(fixed.salt) : crypto.randomBytes(16);

  // RFC 8291 section 3.4: the phone's auth secret and both public keys go
  // into the key, so a message cannot be replayed to a different phone.
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info'), NUL, uaPublic, asPublic]);
  const ikm = hkdf(authSecret, shared, keyInfo, 32);
  // RFC 8188 section 2.2 and 2.3.
  const cek = hkdf(salt, ikm, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm'), NUL]), 16);
  const nonce = hkdf(salt, ikm, Buffer.concat([Buffer.from('Content-Encoding: nonce'), NUL]), 12);

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const sealed = Buffer.concat([
    cipher.update(Buffer.concat([Buffer.from(payload), LAST_RECORD])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const head = Buffer.alloc(21);
  salt.copy(head, 0);
  head.writeUInt32BE(4096, 16);
  head[20] = asPublic.length;
  return Buffer.concat([head, asPublic, sealed]);
}

// HKDF written out rather than hkdfSync, because the steps are what the RFC
// prints and the test compares against.
function hkdf(salt, ikm, info, length) {
  const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
  return crypto.createHmac('sha256', prk).update(Buffer.concat([info, ONE])).digest().subarray(0, length);
}

// --- where a message may be sent ---------------------------------------------

// A subscription's endpoint comes from a stranger's browser, and the server
// will make a request to it. Left open, that is a way to make this server
// knock on any address at all. So only the push services browsers use are
// allowed, by the end of the host name, over https.
const PUSH_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
];

export function endpointOk(endpoint, { allowLocal = false } = {}) {
  let url;
  try {
    url = new URL(String(endpoint));
  } catch {
    return false;
  }
  if (allowLocal && url.protocol === 'http:' && url.hostname === '127.0.0.1') return true;
  if (url.protocol !== 'https:' || url.port) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((h) => host === h || host.endsWith('.' + h));
}

// --- sending ------------------------------------------------------------------

/**
 * Send one message. Resolves to { ok, gone, status }: `gone` means the push
 * service says the subscription no longer exists (404 or 410) and it should
 * be forgotten. Never rejects, so one bad phone cannot stop a round of sends.
 */
export async function send(subscription, payload, { keys, subject, ttl = 6 * 3600, timeoutMs = 15000 } = {}) {
  try {
    const body = encrypt(payload, subscription.keys);
    const res = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: vapidHeader(subscription.endpoint, keys, subject),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        // How long the push service may hold it for a phone that is off.
        // A dare from six hours ago is still worth seeing.
        TTL: String(ttl),
        Urgency: 'high',
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    // The body is not wanted, but must be read or the connection is held.
    await res.arrayBuffer().catch(() => {});
    return { ok: res.ok, gone: res.status === 404 || res.status === 410, status: res.status };
  } catch (err) {
    return { ok: false, gone: false, status: 0, error: err.message };
  }
}
