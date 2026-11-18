// ---------------------------------------------------------------------------
// /missions — dares sent to people's phones at random times.
//
// Two pages and a clock. The join page is public, like the card table: a
// rider types a name and allows notifications, and nothing about them is an
// account. The admin page is behind the site's own admin login (the account
// named by THIEVERY_ADMIN_USERNAME), so there is no second password to keep.
// The rules are dispatch.js; the posting is webpush.js; this is the pages,
// the switchboard and the clock.
//
// The clock has to survive a host that sleeps. Render's free plan stops the
// process after a quarter of an hour without a visitor, and a setTimeout dies
// with it. So the time each set is next due is written in the stored
// document, and two things look at it:
//
//   - a timer, while the process is awake, aimed at the earliest due time;
//   - /missions/tick, which an outside cron service visits every few minutes.
//     Each visit also keeps the process awake, and the first one after a
//     sleep sends whatever fell due while it slept (one per set, never a pile).
//
// Both go through `tick`, which runs one round at a time. A set's next time
// is moved on before its dare is posted, so a second tick arriving in the
// middle cannot send the same set twice.
//
// The room needs the stored document for all of it, so, like the flashcards,
// it shuts with it: every route answers 503 and the clock does nothing.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as D from './dispatch.js';
import * as Push from './webpush.js';
import { available, data, touch } from './store.js';
import { send, fail, readBody, originOk, currentUser, clientIp } from './plumbing.js';
import { readView } from './views.js';
import { isAdmin } from './accounts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public', 'missions');

// The site's own manifest opens the card table; a Home Screen icon made from
// these pages must open Missions, so they name their own.
const ownManifest = (html) =>
  html.replace(/href="[/]site[.]webmanifest[^"]*"/, 'href="/missions/manifest.webmanifest"');

const views = {
  join: ownManifest(readView('missions.html')),
  admin: ownManifest(readView('missions-admin.html')),
  door: readView('missions-door.html'),
  closed: readView('missions-closed.html'),
  missing: readView('404.html'),
};

// --- the settings from outside ------------------------------------------------

// A minute, in milliseconds. The suite shrinks it so a gap of "one to two
// minutes" passes in a blink; nothing else should ever set it.
const MINUTE = Number(process.env.THIEVERY_MISSIONS_MINUTE_MS) > 0 ? Number(process.env.THIEVERY_MISSIONS_MINUTE_MS) : 60 * 1000;

// The suite runs its own push service on 127.0.0.1, which endpointOk refuses
// to everybody else.
const ALLOW_LOCAL = process.env.THIEVERY_MISSIONS_TEST_PUSH === '1';
const endpointOk = (e) => Push.endpointOk(e, { allowLocal: ALLOW_LOCAL });

const KEYS = Push.keysFromEnv();
const keysReady = () => !!KEYS && !KEYS.problem;
if (!KEYS) console.log('missions: no VAPID keys yet, so dares are shown on the page but not pushed. Run npm run missions:keys.');
else if (KEYS.problem) console.log(`missions: ${KEYS.problem} Dares will not be pushed until it is fixed.`);

const SUBJECT = String(
  process.env.VAPID_SUBJECT || `mailto:${String(process.env.THIEVERY_CONTACT_EMAIL || 'admin@thievery.co.uk').trim()}`
).trim();

export const isOpen = () => available();

// --- the clock ------------------------------------------------------------------

let timer = null;
let round = null;
// When /missions/tick was last visited, so the admin page can say whether
// the outside cron is doing its job. Memory only: it is about this process.
let lastTick = null;

async function deliver(shot) {
  if (!shot || !keysReady()) return { pushed: 0, failed: 0, gone: 0 };
  const payload = JSON.stringify(shot.message);
  const tally = { pushed: 0, failed: 0, gone: 0 };
  const targets = shot.to.filter((r) => r.sub);
  // Twenty at a time: a big group is a few seconds, not a few hundred
  // sockets at once.
  for (let i = 0; i < targets.length; i += 20) {
    const batch = targets.slice(i, i + 20);
    const sub = batch.map((r) => r.sub);
    const results = await Promise.all(sub.map((s) => Push.send(s, payload, { keys: KEYS, subject: SUBJECT })));
    results.forEach((res, n) => {
      if (res.ok) tally.pushed++;
      else if (res.gone) {
        tally.gone++;
        // Only forget it if it is still the one we posted to; the rider may
        // have subscribed afresh in the meantime.
        if (batch[n].sub === sub[n]) batch[n].sub = null;
      } else {
        tally.failed++;
        console.log(`missions: a push was refused (${res.status || res.error}).`);
      }
    });
  }
  if (tally.gone) touch();
  return tally;
}

/** Send every set that is due. One round at a time; a second caller waits for it. */
export function tick(now = Date.now()) {
  if (round) return round;
  round = (async () => {
    let sent = 0;
    if (!available()) return { sent };
    const m = D.state(data());
    const shots = [];
    for (const set of D.due(m, now)) {
      const shot = D.fire(m, set, { now });
      set.nextAt = now + D.gap(set, Math.random, MINUTE);
      if (shot) shots.push(shot);
    }
    if (shots.length) touch();
    for (const shot of shots) {
      await deliver(shot);
      sent++;
    }
    return { sent };
  })()
    .catch((err) => {
      console.error('missions: a round of sends failed:', err);
      return { sent: 0 };
    })
    .finally(() => {
      round = null;
      arm();
    });
  return round;
}

// The timer is aimed at the earliest due time, but never more than ten
// minutes out, so a clock that drifts or a set changed by hand is picked up.
function arm() {
  clearTimeout(timer);
  timer = null;
  if (!available()) return;
  const next = D.earliest(D.state(data()));
  if (next == null) return;
  const wait = Math.min(Math.max(next - Date.now(), 250), 10 * 60 * 1000);
  timer = setTimeout(() => tick(), wait);
  timer.unref();
}

/** Called once the store is open: catch up on anything due while we were down. */
export function start() {
  if (!available()) return;
  tick();
}

// --- the rider's routes -----------------------------------------------------------

// A light limit on joining from one address: a ride is a handful of phones,
// and a script making five hundred riders would fill the room for everybody.
const joins = new Map();
function joinAllowed(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const recent = (joins.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
  if (recent.length >= 30) return false;
  recent.push(now);
  joins.set(ip, recent);
  if (joins.size > 5000) joins.clear();
  return true;
}

function hello(req, res, url) {
  const m = D.state(data());
  const crew = D.crewBySlug(m, url.searchParams.get('crew'));
  send(res, 200, {
    publicKey: keysReady() ? KEYS.publicKey : null,
    crew: crew ? { id: crew.id, name: crew.name } : null,
    crews: Object.values(m.crews)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ id: c.id, name: c.name })),
    limits: { name: D.LIMITS.riderName },
  });
}

async function join(req, res) {
  if (!joinAllowed(req)) return send(res, 429, { error: 'Too many joins from here. Try again in an hour.' });
  const body = await readBody(req);
  const m = D.state(data());
  const { rider, token } = D.join(m, body, { endpointOk });
  touch();
  arm();
  send(res, 200, { token, me: D.riderView(m, rider) });
}

function riderOr401(m, body) {
  const rider = D.riderFor(m, body?.token);
  if (!rider) throw Object.assign(new Error('This phone is not signed up any more. Join again.'), { status: 401 });
  return rider;
}

async function me(req, res) {
  const body = await readBody(req);
  const m = D.state(data());
  const rider = riderOr401(m, body);
  D.checkIn(m, rider, body, { endpointOk });
  touch();
  send(res, 200, { me: D.riderView(m, rider), publicKey: keysReady() ? KEYS.publicKey : null });
}

async function leave(req, res) {
  const body = await readBody(req);
  const m = D.state(data());
  const rider = riderOr401(m, body);
  D.removeRider(m, rider.id);
  touch();
  send(res, 200, { ok: true });
}

// --- the admin's routes -----------------------------------------------------------

// The same 404 for a stranger, a member and a made-up address: the admin's
// routes do not announce themselves, signed in or not.
function requireAdmin(req) {
  const user = currentUser(req);
  if (!user || !isAdmin(user)) throw Object.assign(new Error('Not found.'), { status: 404 });
  return user;
}

function adminState(req, url) {
  const m = D.state(data());
  const reveal = url.searchParams.get('reveal') === '1';
  return {
    ...D.adminView(m, { reveal }),
    push: keysReady() ? 'ready' : KEYS?.problem || 'No VAPID keys are set, so nothing is pushed. Dares still show on the page.',
    lastTick,
  };
}

async function adminAct(req, res, url, act) {
  requireAdmin(req);
  const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req);
  const m = D.state(data());
  const extra = (await act(m, body)) || {};
  touch();
  arm();
  send(res, 200, { ...adminState(req, url), ...extra });
}

async function sendNow(m, id) {
  const set = m.sets[id];
  if (!set) throw Object.assign(new Error('That set is not there any more.'), { status: 404 });
  if (!set.challenges.length) throw Object.assign(new Error('Add a challenge first.'), { status: 400 });
  const shot = D.fire(m, set);
  // A dare sent by hand does not move the next one: the surprise stays a
  // surprise, and a test before the ride does not push the first dare back.
  touch();
  const tally = await deliver(shot);
  return { report: { ...tally, to: shot.to.length } };
}

// --- the pages ------------------------------------------------------------------

function page(res, status, html, { index = false } = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "frame-ancestors 'none'",
    'X-Robots-Tag': index ? 'index, follow' : 'noindex, nofollow',
  });
  res.end(html);
}

// The service worker and the manifest are read on each request rather than
// at boot: they are tiny, and `no-store` matters more for these two than
// anything else on the site. A stale service worker on somebody's phone is
// the one cache nobody can clear for them.
function serveFile(res, name, type, extra = {}) {
  let body;
  try {
    body = fs.readFileSync(path.join(PUBLIC, name));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(body);
}

// --- the switchboard ------------------------------------------------------------

/** Handle a /missions request. Returns true if it took it. */
export function handle(req, res, url) {
  const pathname = url.pathname;
  const isApi = pathname === '/api/missions' || pathname.startsWith('/api/missions/');
  const isPage = pathname === '/missions' || pathname.startsWith('/missions/');
  if (!isApi && !isPage) return false;

  // These three work whether or not the store is open: the service worker
  // must always be fetchable (a 503 here would be cached as a broken worker),
  // and the tick has to answer the cron service even on a bad day.
  if (pathname === '/missions/sw.js') {
    // Its scope is /missions, which is wider than its folder, so it has to
    // be allowed to say so.
    serveFile(res, 'sw.js', 'text/javascript; charset=utf-8', { 'Service-Worker-Allowed': '/missions' });
    return true;
  }
  if (pathname === '/missions/manifest.webmanifest') {
    serveFile(res, 'manifest.webmanifest', 'application/manifest+json');
    return true;
  }
  if (pathname === '/missions/tick') {
    lastTick = Date.now();
    tick().then(
      (r) => send(res, 200, `ok${available() ? '' : ' (missions closed)'}${r.sent ? `, sent ${r.sent}` : ''}`, { 'Content-Type': 'text/plain; charset=utf-8' }),
      () => send(res, 200, 'ok', { 'Content-Type': 'text/plain; charset=utf-8' })
    );
    return true;
  }

  if (!available()) {
    if (isApi) send(res, 503, { error: 'Missions are closed for a moment. Nothing has been lost.' });
    else {
      res.setHeader('Retry-After', '120');
      page(res, 503, views.closed);
    }
    return true;
  }

  if (isPage) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
      res.end('Method not allowed');
      return true;
    }
    if (pathname === '/missions' || pathname === '/missions/') {
      page(res, 200, views.join, { index: true });
      return true;
    }
    if (pathname === '/missions/admin') {
      const user = currentUser(req);
      // Signed out: the sign-in. Signed in as anybody else: the same 404 as
      // an address that does not exist, as the flashcards panel does.
      if (!user) page(res, 200, views.door);
      else if (!isAdmin(user)) page(res, 404, views.missing);
      else page(res, 200, views.admin);
      return true;
    }
    page(res, 404, views.missing);
    return true;
  }

  if (req.method !== 'GET' && !originOk(req)) {
    send(res, 403, { error: 'That request came from somewhere else.' });
    return true;
  }

  const route = pathname.replace(/^[/]api[/]missions[/]?/, '');
  let parts;
  try {
    parts = route.split('/').map((s) => decodeURIComponent(s || ''));
  } catch {
    send(res, 400, { error: 'That address will not decode.' });
    return true;
  }
  const [head, kind, id, verb, ...rest] = parts;
  const method = req.method;
  const A = (act) => adminAct(req, res, url, act);

  Promise.resolve()
    .then(() => {
      if (head === 'hello' && !kind && method === 'GET') return hello(req, res, url);
      if (head === 'join' && !kind && method === 'POST') return join(req, res);
      if (head === 'me' && !kind && method === 'POST') return me(req, res);
      if (head === 'leave' && !kind && method === 'POST') return leave(req, res);

      if (head !== 'admin' || rest.length) return send(res, 404, { error: 'Not found.' });
      if (!kind && method === 'GET') {
        requireAdmin(req);
        return send(res, 200, adminState(req, url));
      }
      if (kind === 'sets' && !id && method === 'POST') return A((m, body) => ({ created: D.addSet(m, body).id }));
      if (kind === 'sets' && id && !verb && method === 'POST') return A((m, body) => void D.editSet(m, id, body));
      if (kind === 'sets' && id && !verb && method === 'DELETE') return A((m) => void D.removeSet(m, id));
      if (kind === 'sets' && id && ['start', 'pause', 'stop'].includes(verb) && method === 'POST') {
        return A((m) => void D.control(m, id, verb, { minute: MINUTE }));
      }
      if (kind === 'sets' && id && verb === 'send' && method === 'POST') return A((m) => sendNow(m, id));
      if (kind === 'crews' && !id && method === 'POST') return A((m, body) => void D.addCrew(m, body));
      if (kind === 'crews' && id && !verb && method === 'POST') return A((m, body) => void D.renameCrew(m, id, body));
      if (kind === 'crews' && id && !verb && method === 'DELETE') return A((m) => void D.removeCrew(m, id));
      if (kind === 'riders' && id && !verb && method === 'POST') return A((m, body) => void D.editRider(m, id, body));
      if (kind === 'riders' && id && !verb && method === 'DELETE') return A((m) => void D.removeRider(m, id));
      // Anybody but the admin gets the same 404 for a real admin route as for
      // a made-up one.
      requireAdmin(req);
      send(res, 404, { error: 'Not found.' });
    })
    .catch((err) => {
      if (!res.headersSent) fail(res, err);
    });
  return true;
}
