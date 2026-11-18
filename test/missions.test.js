// Missions: the push sender, the rules, and the room over HTTP.
//
// Three parts. First webpush.js against the worked example in RFC 8291's
// appendix, byte for byte, and its VAPID header against its own signature.
// Then dispatch.js played directly, with the clock and the dice passed in,
// the way powerups.test.js plays game.js: no-repeat, who gets what, and the
// rule that a set the server slept through sends one dare and not a pile.
// Then the real server, with a push service of our own on 127.0.0.1 standing
// in for Google's and Apple's: riders join with real keys, the server posts
// real encrypted messages, and this decrypts them to check what arrived.
//
// THIEVERY_MISSIONS_MINUTE_MS shrinks a minute to 40ms, so a set running
// "every one to one minutes" sends several dares in a second.
//
//   npm run test:missions

import { spawn } from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import * as Push from '../server/webpush.js';
import * as D from '../server/dispatch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'thievery-missions-'));
const ADMIN = { username: 'thehouse', password: 'a-long-enough-password' };
const VAPID = Push.generateKeys();
const MINUTE_MS = 40;

let checks = 0;
async function check(what, fn) {
  await fn();
  checks += 1;
  console.log('  ok  ' + what);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await sleep(20);
  }
  throw new Error(`timed out waiting for ${what}`);
}

// --- a phone, as far as push is concerned -------------------------------------

function phone(name, pushPort) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return {
    name,
    ecdh,
    auth,
    subscription: {
      endpoint: `http://127.0.0.1:${pushPort}/push/${name}`,
      keys: { p256dh: Push.b64u(ecdh.getPublicKey()), auth: Push.b64u(auth) },
    },
  };
}

// The receiving half of RFC 8291, written with hkdfSync rather than by hand,
// so it is a second opinion on webpush.js rather than a copy of it.
function decrypt(body, p) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const sealed = body.subarray(21 + idlen);
  const shared = p.ecdh.computeSecret(asPublic);
  const nul = Buffer.from([0]);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info'), nul, p.ecdh.getPublicKey(), asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, p.auth, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm'), nul]), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.concat([Buffer.from('Content-Encoding: nonce'), nul]), 12));
  const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(sealed.subarray(sealed.length - 16));
  const plain = Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - 16)), decipher.final()]);
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--;
  assert.equal(plain[end], 2, 'the record did not end with the last-record delimiter');
  return JSON.parse(plain.subarray(0, end).toString('utf8'));
}

function verifyVapid(header, endpoint) {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(header);
  assert.ok(m, `not a VAPID header: ${header}`);
  const [h, c, s] = m[1].split('.');
  assert.equal(m[2], VAPID.publicKey);
  const claims = JSON.parse(Buffer.from(c, 'base64url'));
  assert.equal(claims.aud, new URL(endpoint).origin);
  assert.match(claims.sub, /^mailto:/);
  assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 24 * 3600);
  const pub = Buffer.from(VAPID.publicKey, 'base64url');
  const key = crypto.createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: Push.b64u(pub.subarray(1, 33)), y: Push.b64u(pub.subarray(33)) },
    format: 'jwk',
  });
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')), 'bad signature');
}

// --- a push service of our own ---------------------------------------------------

const inbox = []; // { name, message }
const goneNames = new Set();
let pushServer;
let phones = {};

function startPushService() {
  pushServer = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const name = req.url.split('/').pop();
      if (goneNames.has(name)) {
        res.writeHead(410);
        return res.end();
      }
      const p = phones[name];
      verifyVapid(req.headers.authorization, `http://127.0.0.1:${pushServer.address().port}${req.url}`);
      assert.equal(req.headers['content-encoding'], 'aes128gcm');
      inbox.push({ name, message: decrypt(Buffer.concat(chunks), p) });
      res.writeHead(201);
      res.end();
    });
  });
  return new Promise((r) => pushServer.listen(0, '127.0.0.1', r));
}

// --- the site ---------------------------------------------------------------------

let PORT = 0;
let child = null;

function startServer() {
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
      env: {
        ...process.env,
        PORT: '0',
        THIEVERY_DATA_DIR: DATA_DIR,
        THIEVERY_ADMIN_USERNAME: ADMIN.username,
        THIEVERY_ADMIN_PASSWORD: ADMIN.password,
        VAPID_PUBLIC_KEY: VAPID.publicKey,
        VAPID_PRIVATE_KEY: VAPID.privateKey,
        THIEVERY_MISSIONS_TEST_PUSH: '1',
        THIEVERY_MISSIONS_MINUTE_MS: String(MINUTE_MS),
      },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    child.stdout.on('data', (d) => {
      const at = String(d).match(/running at http:[/][/]localhost:([0-9]+)/);
      if (at) {
        PORT = Number(at[1]);
        resolve();
      }
    });
    child.on('exit', (code) => reject(new Error(`server exited early (${code})`)));
  });
}

function visitor() {
  const jar = new Map();
  return {
    async call(url, { method = 'GET', body = null } = {}) {
      const headers = { Origin: `http://localhost:${PORT}` };
      if (body) headers['Content-Type'] = 'application/json';
      if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      const res = await fetch(`http://localhost:${PORT}${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
      for (const raw of res.headers.getSetCookie?.() || []) {
        const [pair] = raw.split(';');
        const at = pair.indexOf('=');
        jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
      }
      const text = await res.text();
      let payload = {};
      try {
        payload = JSON.parse(text);
      } catch {}
      return { status: res.status, body: payload, text, headers: res.headers };
    },
  };
}

const ok = (res, what) => {
  assert.equal(res.status, 200, `${what}: expected 200, got ${res.status} (${res.body.error || ''})`);
  return res.body;
};

// ---------------------------------------------------------------------------

async function unitChecks() {
  console.log('webpush.js');

  await check('encrypt matches RFC 8291 appendix A byte for byte', () => {
    const out = Push.encrypt(
      'When I grow up, I want to be a watermelon',
      { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
      { privateKey: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', salt: 'DGv6ra1nlYgDCS1FRnbzlw' }
    );
    assert.equal(
      Push.b64u(out),
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN'
    );
  });

  await check('a message encrypted to a phone decrypts on it', () => {
    const p = phone('x', 1);
    const out = Push.encrypt(JSON.stringify({ body: 'Wheelie past the café' }), p.subscription.keys);
    assert.equal(decrypt(out, p).body, 'Wheelie past the café');
  });

  await check('the VAPID header is signed with the site key and names the push service', () => {
    verifyVapid(Push.vapidHeader('https://fcm.googleapis.com/fcm/send/abc', VAPID, 'mailto:a@b.c'), 'https://fcm.googleapis.com/fcm/send/abc');
  });

  await check('keys from the environment must be a matching pair', () => {
    assert.equal(Push.keysFromEnv({}), null);
    assert.deepEqual(Push.keysFromEnv({ VAPID_PUBLIC_KEY: VAPID.publicKey, VAPID_PRIVATE_KEY: VAPID.privateKey }), VAPID);
    const other = Push.generateKeys();
    assert.ok(Push.keysFromEnv({ VAPID_PUBLIC_KEY: other.publicKey, VAPID_PRIVATE_KEY: VAPID.privateKey }).problem);
  });

  await check('only real push services are posted to', () => {
    for (const good of [
      'https://fcm.googleapis.com/fcm/send/x',
      'https://updates.push.services.mozilla.com/wpush/v2/x',
      'https://web.push.apple.com/QAbc',
      'https://wns2-db5p.notify.windows.com/w/?token=x',
    ]) assert.ok(Push.endpointOk(good), good);
    for (const bad of [
      'http://fcm.googleapis.com/x',
      'https://fcm.googleapis.com.evil.example/x',
      'https://evilpush.apple.com.example/x',
      'https://169.254.169.254/latest',
      'https://localhost/x',
      'https://fcm.googleapis.com:8443/x',
      'http://127.0.0.1:9/x',
      'nonsense',
    ]) assert.ok(!Push.endpointOk(bad), bad);
    assert.ok(Push.endpointOk('http://127.0.0.1:9/x', { allowLocal: true }));
  });

  console.log('dispatch.js');
  const anyEndpoint = () => true;
  const keys = phone('k', 1).subscription.keys;
  const sub = (n) => ({ endpoint: `https://fcm.googleapis.com/x/${n}`, keys });

  await check('no repeats until the hat is empty, and never twice running across a refill', () => {
    const m = D.state({});
    const set = D.addSet(m, { name: 'Ride', challenges: ['a', 'b', 'c', 'd'] });
    D.join(m, { name: 'Ann' }, { endpointOk: anyEndpoint });
    let prev = null;
    for (let round = 0; round < 25; round++) {
      const seen = [];
      for (let i = 0; i < 4; i++) {
        const shot = D.fire(m, set, { rand: Math.random });
        assert.notEqual(shot.message.body, prev, 'the same dare came twice in a row');
        prev = shot.message.body;
        seen.push(prev);
      }
      assert.deepEqual([...seen].sort(), ['a', 'b', 'c', 'd'], `round ${round} repeated: ${seen}`);
    }
  });

  await check('editing a set keeps what has been used, minus what was deleted', () => {
    const m = D.state({});
    const set = D.addSet(m, { challenges: ['a', 'b', 'c'] });
    const [a, b] = set.challenges;
    set.used = [a.id, b.id];
    D.editSet(m, set.id, { challenges: [{ id: b.id, text: 'B fixed' }, { id: a.id, text: 'a' }, { text: 'new' }] });
    assert.deepEqual([...set.used].sort(), [a.id, b.id].sort());
    assert.equal(set.challenges.length, 3);
    D.editSet(m, set.id, { challenges: [{ id: b.id, text: 'B fixed' }] });
    assert.deepEqual(set.used, [b.id]);
  });

  await check('crews, chosen riders and one-at-random each reach the right people', () => {
    const m = D.state({});
    const fast = D.addCrew(m, { name: 'Fast lot' });
    const slow = D.addCrew(m, { name: 'Cake stop' });
    const ann = D.join(m, { name: 'Ann', crew: fast.slug, subscription: sub(1) }, { endpointOk: anyEndpoint }).rider;
    const bo = D.join(m, { name: 'Bo', crew: slow.id }, { endpointOk: anyEndpoint }).rider;
    const cy = D.join(m, { name: 'Cy', subscription: sub(3) }, { endpointOk: anyEndpoint }).rider;
    const names = (shot) => shot.to.map((r) => r.name).sort();

    const set = D.addSet(m, { challenges: ['x'], noRepeat: false });
    assert.deepEqual(names(D.fire(m, set)), ['Ann', 'Bo', 'Cy']);
    D.editSet(m, set.id, { audience: { mode: 'crews', crews: [fast.id] } });
    assert.deepEqual(names(D.fire(m, set)), ['Ann']);
    D.editSet(m, set.id, { audience: { mode: 'riders', riders: [bo.id, cy.id, 'made-up'] } });
    assert.deepEqual(set.audience.riders, [bo.id, cy.id]);
    assert.deepEqual(names(D.fire(m, set)), ['Bo', 'Cy']);
    // One at random prefers somebody whose phone will buzz: Bo has none.
    D.editSet(m, set.id, { pickOne: true });
    for (let i = 0; i < 20; i++) {
      const shot = D.fire(m, set);
      assert.deepEqual(names(shot), ['Cy']);
      assert.match(shot.message.title, /just you/);
    }
    assert.equal(cy.inbox.length, D.LIMITS.inbox, 'the inbox should be cut to its limit');
    assert.ok(cy.inbox[0].solo);
    D.removeCrew(m, fast.id);
    assert.deepEqual(ann.crews, []);
  });

  await check('a set the server slept through sends one, then waits a fresh gap', () => {
    const m = D.state({});
    const set = D.addSet(m, { challenges: ['a', 'b'], minGap: 20, maxGap: 60 });
    const t0 = 1_000_000;
    D.control(m, set.id, 'start', { now: t0, rand: () => 0.5 });
    assert.equal(set.nextAt, t0 + 40 * 60000);
    // Asleep for three hours: due once, not nine times.
    const woke = t0 + 3 * 3600000;
    assert.deepEqual(D.due(m, woke), [set]);
    // What tick does: fire, then move the time on from now.
    D.fire(m, set, { now: woke });
    set.nextAt = woke + D.gap(set, () => 0);
    assert.deepEqual(D.due(m, woke), []);
    assert.equal(D.earliest(m), woke + 20 * 60000);
    D.control(m, set.id, 'pause');
    assert.equal(D.earliest(m), null);
    D.control(m, set.id, 'stop');
    assert.deepEqual(set.used, []);
  });

  await check('the gap is clamped, and ends typed the wrong way round are swapped', () => {
    const m = D.state({});
    const set = D.addSet(m, { minGap: 90, maxGap: 30 });
    assert.deepEqual([set.minGap, set.maxGap], [30, 90]);
    D.editSet(m, set.id, { minGap: 0, maxGap: 999999 });
    assert.deepEqual([set.minGap, set.maxGap], [1, 24 * 60]);
    assert.throws(() => D.control(m, D.addSet(m).id, 'start'), /Add a challenge/);
  });

  await check('a rider is found by their token, and the token is not what is stored', () => {
    const m = D.state({});
    const { rider, token } = D.join(m, { name: '  Dee   Dee  ' }, { endpointOk: anyEndpoint });
    assert.equal(rider.name, 'Dee Dee');
    assert.equal(D.riderFor(m, token), rider);
    assert.equal(D.riderFor(m, 'nope'), null);
    assert.ok(!JSON.stringify(m).includes(token));
    assert.ok(!JSON.stringify(D.adminView(m)).includes(rider.tokenHash));
  });
}

async function serverChecks() {
  await startPushService();
  const pushPort = pushServer.address().port;
  phones = { ann: phone('ann', pushPort), bo: phone('bo', pushPort), cy: phone('cy', pushPort) };
  await startServer();
  console.log(`\nthe room: server on ${PORT}, push service on ${pushPort}, data in ${DATA_DIR}`);

  const admin = visitor();
  const stranger = visitor();
  const tokens = {};
  const got = (name) => inbox.filter((i) => i.name === name);

  await check('the pages, the service worker and the manifest are served', async () => {
    const page = await stranger.call('/missions');
    assert.equal(page.status, 200);
    assert.ok(page.text.includes('/missions/manifest.webmanifest'), 'the page must name its own manifest');
    assert.ok(!page.text.includes('/site.webmanifest'));
    assert.ok(!page.text.includes('<!--') && !page.text.includes('{{'));
    const sw = await stranger.call('/missions/sw.js');
    assert.equal(sw.status, 200);
    assert.equal(sw.headers.get('service-worker-allowed'), '/missions');
    assert.equal(sw.headers.get('cache-control'), 'no-store');
    assert.match(sw.headers.get('content-type'), /javascript/);
    const manifest = await stranger.call('/missions/manifest.webmanifest');
    assert.equal(manifest.body.display, 'standalone');
    assert.equal(manifest.body.start_url, '/missions');
    assert.equal((await stranger.call('/missions/nothing')).status, 404);
    // What the page keeps in the browser has to be on the privacy page.
    const key = /const KEY = '([^']+)'/.exec(fs.readFileSync(path.join(__dirname, '..', 'public', 'missions.js'), 'utf8'))[1];
    assert.ok((await stranger.call('/privacy')).text.includes('<code>' + key + '</code>'), '/privacy does not list ' + key);
  });

  await check('the control room is a sign-in to strangers and a 404 to members', async () => {
    const door = await stranger.call('/missions/admin');
    assert.equal(door.status, 200);
    assert.ok(door.text.includes('ms-signin'));
    assert.ok(!door.text.includes('missions-admin.js'));
    assert.equal((await stranger.call('/api/missions/admin')).status, 404);
    assert.equal((await stranger.call('/api/missions/admin/sets', { method: 'POST', body: {} })).status, 404);
    const member = visitor();
    ok(await member.call('/api/site/register', { method: 'POST', body: { username: 'rider1', password: 'secret-enough' } }), 'register');
    assert.equal((await member.call('/missions/admin')).status, 404);
    assert.equal((await member.call('/api/missions/admin')).status, 404);
    ok(await admin.call('/api/site/login', { method: 'POST', body: ADMIN }), 'admin login');
    assert.ok((await admin.call('/missions/admin')).text.includes('missions-admin.js'));
    const s = ok(await admin.call('/api/missions/admin'), 'admin state');
    assert.equal(s.push, 'ready');
  });

  let fast;
  await check('riders join, with a crew from its link, and a bad endpoint is refused', async () => {
    fast = ok(await admin.call('/api/missions/admin/crews', { method: 'POST', body: { name: 'Fast lot' } }), 'crew').crews[0];
    assert.equal(fast.slug, 'fast-lot');
    const hi = ok(await stranger.call('/api/missions/hello?crew=fast-lot'), 'hello');
    assert.equal(hi.crew.name, 'Fast lot');
    assert.equal(hi.publicKey, VAPID.publicKey);
    const evil = await stranger.call('/api/missions/join', {
      method: 'POST',
      body: { name: 'Eve', subscription: { ...phones.ann.subscription, endpoint: 'http://169.254.169.254/x' } },
    });
    assert.equal(evil.status, 400);
    const a = ok(await stranger.call('/api/missions/join', { method: 'POST', body: { name: 'Ann', crew: 'fast-lot', subscription: phones.ann.subscription } }), 'ann');
    assert.deepEqual(a.me.crews, ['Fast lot']);
    assert.equal(a.me.notifications, true);
    tokens.ann = a.token;
    tokens.bo = ok(await stranger.call('/api/missions/join', { method: 'POST', body: { name: 'Bo', subscription: phones.bo.subscription } }), 'bo').token;
    tokens.cy = ok(await stranger.call('/api/missions/join', { method: 'POST', body: { name: 'Cy' } }), 'cy').token;
    assert.equal((await stranger.call('/api/missions/join', { method: 'POST', body: { name: '' } })).status, 400);
  });

  let ride, solo;
  await check('Send one now reaches only the set’s crew, encrypted and signed', async () => {
    const s = ok(await admin.call('/api/missions/admin/sets', { method: 'POST', body: {} }), 'new set');
    ride = s.created;
    ok(await admin.call(`/api/missions/admin/sets/${ride}`, {
      method: 'POST',
      body: { name: 'Ride', challenges: ['Ring your bell', 'Wave at a cow', 'Sing a chorus'], minGap: 1, maxGap: 1, audience: { mode: 'crews', crews: [fast.id] } },
    }), 'save');
    const sent = ok(await admin.call(`/api/missions/admin/sets/${ride}/send`, { method: 'POST', body: {} }), 'send');
    assert.deepEqual(sent.report, { pushed: 1, failed: 0, gone: 0, to: 1 });
    assert.equal(got('ann').length, 1);
    assert.equal(got('bo').length, 0);
    assert.equal(got('ann')[0].message.title, 'Ride');
    const ann = ok(await stranger.call('/api/missions/me', { method: 'POST', body: { token: tokens.ann } }), 'me');
    assert.equal(ann.me.inbox[0].text, got('ann')[0].message.body);
    const cy = ok(await stranger.call('/api/missions/me', { method: 'POST', body: { token: tokens.cy } }), 'me');
    assert.deepEqual(cy.me.inbox, []);
  });

  await check('a running set sends on its own, without repeats, and the next time stays hidden', async () => {
    ok(await admin.call(`/api/missions/admin/sets/${ride}/stop`, { method: 'POST', body: {} }), 'stop');
    inbox.length = 0;
    ok(await admin.call(`/api/missions/admin/sets/${ride}/start`, { method: 'POST', body: {} }), 'start');
    const hidden = ok(await admin.call('/api/missions/admin'), 'state').sets.find((s) => s.id === ride);
    assert.equal(hidden.state, 'running');
    assert.ok(!('nextAt' in hidden), 'the next time was sent without reveal');
    const shown = ok(await admin.call('/api/missions/admin?reveal=1'), 'state').sets.find((s) => s.id === ride);
    assert.equal(typeof shown.nextAt, 'number');
    await until(() => got('ann').length >= 3, 'three dares');
    ok(await admin.call(`/api/missions/admin/sets/${ride}/pause`, { method: 'POST', body: {} }), 'pause');
    const three = got('ann').slice(0, 3).map((i) => i.message.body).sort();
    assert.deepEqual(three, ['Ring your bell', 'Sing a chorus', 'Wave at a cow']);
    assert.equal(got('bo').length, 0);
  });

  await check('two sets run at once, each to its own people', async () => {
    const s = ok(await admin.call('/api/missions/admin/sets', { method: 'POST', body: { name: 'Solo', challenges: ['Lead the next hill'], minGap: 1, maxGap: 1, pickOne: true } }), 'set');
    solo = s.created;
    inbox.length = 0;
    ok(await admin.call(`/api/missions/admin/sets/${ride}/start`, { method: 'POST', body: {} }), 'ride');
    ok(await admin.call(`/api/missions/admin/sets/${solo}/start`, { method: 'POST', body: {} }), 'solo');
    await until(() => inbox.some((i) => i.message.title === 'Solo: just you') && got('ann').some((i) => i.message.title === 'Ride'), 'both sets');
    ok(await admin.call(`/api/missions/admin/sets/${solo}/stop`, { method: 'POST', body: {} }), 'stop solo');
    ok(await admin.call(`/api/missions/admin/sets/${ride}/stop`, { method: 'POST', body: {} }), 'stop ride');
    assert.ok(!got('bo').some((i) => i.message.title === 'Ride'), 'Bo is not in the crew');
    const state = ok(await admin.call('/api/missions/admin'), 'state');
    assert.ok(state.sets.every((s) => s.state === 'stopped'));
  });

  await check('a subscription the push service calls gone is forgotten', async () => {
    goneNames.add('bo');
    ok(await admin.call(`/api/missions/admin/sets/${ride}`, { method: 'POST', body: { audience: { mode: 'all' } } }), 'everyone');
    const sent = ok(await admin.call(`/api/missions/admin/sets/${ride}/send`, { method: 'POST', body: {} }), 'send');
    assert.equal(sent.report.gone, 1);
    const bo = sent.riders.find((r) => r.name === 'Bo');
    assert.equal(bo.notifications, false);
    const me = ok(await stranger.call('/api/missions/me', { method: 'POST', body: { token: tokens.bo } }), 'me');
    assert.equal(me.me.notifications, false);
    assert.equal(me.me.inbox[0].set, 'Ride', 'the dare is still on the page');
    // Bo's phone subscribes afresh and is reachable again.
    goneNames.delete('bo');
    const again = ok(await stranger.call('/api/missions/me', { method: 'POST', body: { token: tokens.bo, subscription: phones.bo.subscription } }), 'resubscribe');
    assert.equal(again.me.notifications, true);
  });

  await check('the admin moves riders between crews, and removes them', async () => {
    let s = ok(await admin.call('/api/missions/admin'), 'state');
    const cy = s.riders.find((r) => r.name === 'Cy');
    s = ok(await admin.call(`/api/missions/admin/riders/${cy.id}`, { method: 'POST', body: { crews: [fast.id] } }), 'move');
    assert.equal(s.crews.find((c) => c.id === fast.id).size, 2);
    s = ok(await admin.call(`/api/missions/admin/riders/${cy.id}`, { method: 'DELETE' }), 'remove');
    assert.ok(!s.riders.some((r) => r.name === 'Cy'));
    assert.equal((await stranger.call('/api/missions/me', { method: 'POST', body: { token: tokens.cy } })).status, 401);
  });

  await check('a rider can leave', async () => {
    ok(await stranger.call('/api/missions/leave', { method: 'POST', body: { token: tokens.bo } }), 'leave');
    assert.equal((await stranger.call('/api/missions/me', { method: 'POST', body: { token: tokens.bo } })).status, 401);
  });

  await check('the tick answers the cron service', async () => {
    const t = await stranger.call('/missions/tick');
    assert.equal(t.status, 200);
    assert.match(t.text, /^ok/);
    const s = ok(await admin.call('/api/missions/admin'), 'state');
    assert.ok(s.lastTick > Date.now() - 5000);
  });

  await check('everything survives a restart, and a running set carries on', async () => {
    ok(await admin.call(`/api/missions/admin/sets/${ride}/start`, { method: 'POST', body: {} }), 'start');
    ok(await admin.call(`/api/missions/admin/sets/${ride}/pause`, { method: 'POST', body: {} }), 'pause');
    ok(await admin.call(`/api/missions/admin/sets/${ride}/start`, { method: 'POST', body: {} }), 'start');
    // The store holds a change for 250ms before writing it.
    await sleep(600);
    child.removeAllListeners('exit');
    child.kill();
    await new Promise((r) => child.once('exit', r));
    inbox.length = 0;
    await startServer();
    const again = visitor();
    ok(await again.call('/api/site/login', { method: 'POST', body: ADMIN }), 'login');
    const s = ok(await again.call('/api/missions/admin'), 'state');
    assert.deepEqual(s.sets.map((x) => x.name).sort(), ['Ride', 'Solo']);
    assert.equal(s.sets.find((x) => x.id === ride).state, 'running');
    assert.deepEqual(s.crews.map((c) => c.name), ['Fast lot']);
    assert.deepEqual(s.riders.map((r) => r.name), ['Ann']);
    await until(() => got('ann').length >= 1, 'a dare after the restart');
    ok(await again.call(`/api/missions/admin/sets/${ride}/stop`, { method: 'POST', body: {} }), 'stop');
  });
}

try {
  await unitChecks();
  await serverChecks();
  console.log(`\nmissions: ${checks} checks passed`);
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  if (child) {
    child.removeAllListeners('exit');
    child.kill();
  }
  if (pushServer) pushServer.close();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
}
