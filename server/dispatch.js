// ---------------------------------------------------------------------------
// Missions: the sets, the crews, the riders, and which dare goes to whom.
//
// Pure rules over `missions` in the stored document, the way maps.js is to
// mindmaps.js. Nothing here sends anything or keeps a timer: `fire` decides
// what goes out and writes it down, and missions.js does the posting. Every
// function that depends on the clock or on chance takes `now` and `rand`, so
// test/missions.test.js can play a whole afternoon in a few milliseconds.
//
// The shape:
//
//   missions.sets[id]   = { id, name, challenges: [{ id, text }], minGap, maxGap,
//                           noRepeat, audience: { mode, crews, riders }, pickOne,
//                           state, nextAt, used, last, sent, created }
//   missions.crews[id]  = { id, name, slug }
//   missions.riders[id] = { id, tokenHash, name, crews, sub, joined, seen, inbox }
//
// Three things that are easy to break:
//
// - **A rider's token is the rider.** Nobody on the join page has an account,
//   so the token in their browser is the only proof of who they are. Only its
//   SHA-256 is kept, as with sessions, and the public `id` the admin sees is
//   a different random string, so the admin's page never holds a key to
//   anybody's inbox.
// - **A late set sends one, not a backlog.** If the server slept through
//   three sends, waking sends one and draws a fresh gap from then. A pile of
//   five notifications at once is not a game anybody wants to be in.
// - **`used` is the no-repeat memory, by challenge id.** Editing a set keeps
//   it, minus anything deleted, so reordering or fixing a typo does not put
//   a dare back in the hat; a new one is in the hat at once.
// ---------------------------------------------------------------------------

import crypto from 'node:crypto';

export const LIMITS = {
  sets: 20,
  challenges: 200,
  text: 240,
  setName: 40,
  crews: 30,
  crewName: 30,
  riders: 500,
  riderName: 24,
  inbox: 10,
  // Minutes. A day is the longest gap, which is longer than any ride.
  gapMin: 1,
  gapMax: 24 * 60,
};

export const STATES = ['stopped', 'running', 'paused'];
export const MODES = ['all', 'crews', 'riders'];

const MINUTE = 60 * 1000;

const bad = (message) => Object.assign(new Error(message), { status: 400 });
const missing = (what) => Object.assign(new Error(`That ${what} is not there any more.`), { status: 404 });

export const newId = (bytes = 6) => crypto.randomBytes(bytes).toString('base64url');
export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

/** The missions block of the document, made on first use. */
export function state(db) {
  if (!db.missions || typeof db.missions !== 'object') db.missions = {};
  const m = db.missions;
  for (const k of ['sets', 'crews', 'riders']) if (!m[k] || typeof m[k] !== 'object') m[k] = {};
  return m;
}

// Text in: trimmed, single-spaced, cut to length. A line break in a dare is
// kept out, because a notification would show it as nothing anyway.
// Control characters are found by number rather than by a pattern, so the
// source carries no escape to be eaten. The cut is by character, not by
// UTF-16 unit, so an emoji at the end is kept whole or not at all.
function line(value, max) {
  let out = '';
  for (const ch of String(value ?? '')) {
    const c = ch.codePointAt(0);
    out += c < 32 || (c >= 127 && c < 160) ? ' ' : ch;
  }
  return Array.from(out.replace(/ +/g, ' ').trim()).slice(0, max).join('').trim();
}

function wholeMinutes(value, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(LIMITS.gapMax, Math.max(LIMITS.gapMin, n));
}

// --- crews --------------------------------------------------------------------

function slugOf(m, name, except = null) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'crew';
  let slug = base;
  for (let n = 2; Object.values(m.crews).some((c) => c.slug === slug && c.id !== except); n++) slug = `${base}-${n}`;
  return slug;
}

export function addCrew(m, body) {
  const name = line(body?.name, LIMITS.crewName);
  if (!name) throw bad('Give the crew a name.');
  if (Object.keys(m.crews).length >= LIMITS.crews) throw bad(`That is the most crews there can be (${LIMITS.crews}).`);
  const crew = { id: newId(), name, slug: slugOf(m, name) };
  m.crews[crew.id] = crew;
  return crew;
}

export function renameCrew(m, id, body) {
  const crew = m.crews[id];
  if (!crew) throw missing('crew');
  const name = line(body?.name, LIMITS.crewName);
  if (!name) throw bad('Give the crew a name.');
  crew.name = name;
  // The slug stays: it is in join links that have already been sent round.
  return crew;
}

export function removeCrew(m, id) {
  if (!m.crews[id]) throw missing('crew');
  delete m.crews[id];
  for (const r of Object.values(m.riders)) r.crews = r.crews.filter((c) => c !== id);
  for (const s of Object.values(m.sets)) s.audience.crews = s.audience.crews.filter((c) => c !== id);
}

export const crewBySlug = (m, slug) => Object.values(m.crews).find((c) => c.slug === String(slug || '')) || null;

// --- riders ---------------------------------------------------------------------

// The subscription exactly as the browser's toJSON gives it, kept to the
// three things a push needs. Whether the endpoint is one we will post to is
// the caller's question (webpush.endpointOk), because it depends on the room.
export function cleanSubscription(sub, endpointOk) {
  if (!sub || typeof sub !== 'object') return null;
  const endpoint = String(sub.endpoint || '');
  const p256dh = String(sub.keys?.p256dh || '');
  const auth = String(sub.keys?.auth || '');
  if (endpoint.length > 1024 || !endpointOk(endpoint)) throw bad('That notification address is not one we can send to.');
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(auth)) throw bad('That notification key is not right.');
  return { endpoint, keys: { p256dh, auth } };
}

export function join(m, body, { now = Date.now(), endpointOk }) {
  if (Object.keys(m.riders).length >= LIMITS.riders) throw bad('This is full. Ask whoever sent the link.');
  const name = line(body?.name, LIMITS.riderName);
  if (!name) throw bad('Put a name in so the organiser knows who you are.');
  const crew = body?.crew ? Object.values(m.crews).find((c) => c.id === body.crew || c.slug === body.crew) : null;
  const sub = cleanSubscription(body?.subscription, endpointOk);
  const token = newId(24);
  const rider = {
    id: newId(),
    tokenHash: hashToken(token),
    name,
    crews: crew ? [crew.id] : [],
    sub: null,
    joined: now,
    seen: now,
    inbox: [],
  };
  m.riders[rider.id] = rider;
  if (sub) claimSubscription(m, rider, sub);
  return { rider, token };
}

// One phone, one rider. If this browser's subscription already belongs to
// somebody (they cleared their storage and joined again), it moves to the
// new rider rather than buzzing the phone twice for every dare.
function claimSubscription(m, rider, sub) {
  for (const other of Object.values(m.riders)) {
    if (other !== rider && other.sub?.endpoint === sub.endpoint) other.sub = null;
  }
  rider.sub = sub;
}

export function riderFor(m, token) {
  if (!token || typeof token !== 'string' || token.length > 64) return null;
  const hash = hashToken(token);
  return Object.values(m.riders).find((r) => r.tokenHash === hash) || null;
}

/** A rider checking in from the page: name and subscription may change. */
export function checkIn(m, rider, body, { now = Date.now(), endpointOk }) {
  rider.seen = now;
  if (body && 'name' in body) {
    const name = line(body.name, LIMITS.riderName);
    if (!name) throw bad('Put a name in so the organiser knows who you are.');
    rider.name = name;
  }
  if (body && 'subscription' in body) {
    if (body.subscription === null) rider.sub = null;
    else {
      const sub = cleanSubscription(body.subscription, endpointOk);
      if (sub && sub.endpoint !== rider.sub?.endpoint) claimSubscription(m, rider, sub);
      else if (sub) rider.sub = sub;
    }
  }
  return rider;
}

/** What a rider's own page is shown. Their own things only. */
export function riderView(m, rider) {
  return {
    name: rider.name,
    crews: rider.crews.map((c) => m.crews[c]?.name).filter(Boolean),
    notifications: !!rider.sub,
    inbox: rider.inbox,
  };
}

export function editRider(m, id, body) {
  const rider = m.riders[id];
  if (!rider) throw missing('rider');
  if (body && 'name' in body) {
    const name = line(body.name, LIMITS.riderName);
    if (!name) throw bad('A rider needs a name.');
    rider.name = name;
  }
  if (body && Array.isArray(body.crews)) rider.crews = [...new Set(body.crews.filter((c) => m.crews[c]))];
  return rider;
}

export function removeRider(m, id) {
  if (!m.riders[id]) throw missing('rider');
  delete m.riders[id];
  for (const s of Object.values(m.sets)) s.audience.riders = s.audience.riders.filter((r) => r !== id);
}

// --- sets -----------------------------------------------------------------------

function cleanChallenges(list, before = []) {
  if (!Array.isArray(list)) throw bad('The challenges did not arrive as a list.');
  if (list.length > LIMITS.challenges) throw bad(`A set can hold ${LIMITS.challenges} challenges.`);
  const known = new Set(before.map((c) => c.id));
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const text = line(typeof item === 'string' ? item : item?.text, LIMITS.text);
    if (!text) continue;
    // An id is kept only if it was already this set's, so the page cannot
    // invent ids that collide; anything else is new.
    let id = typeof item === 'object' && known.has(item?.id) && !seen.has(item.id) ? item.id : newId();
    seen.add(id);
    out.push({ id, text });
  }
  return out;
}

function cleanAudience(m, a) {
  const mode = MODES.includes(a?.mode) ? a.mode : 'all';
  const crews = Array.isArray(a?.crews) ? [...new Set(a.crews.filter((c) => m.crews[c]))] : [];
  const riders = Array.isArray(a?.riders) ? [...new Set(a.riders.filter((r) => m.riders[r]))] : [];
  return { mode, crews, riders };
}

function applySettings(m, set, body) {
  if ('name' in body) {
    const name = line(body.name, LIMITS.setName);
    if (!name) throw bad('Give the set a name.');
    set.name = name;
  }
  if ('challenges' in body) {
    set.challenges = cleanChallenges(body.challenges, set.challenges);
    const ids = new Set(set.challenges.map((c) => c.id));
    set.used = set.used.filter((id) => ids.has(id));
  }
  if ('minGap' in body) set.minGap = wholeMinutes(body.minGap, set.minGap);
  if ('maxGap' in body) set.maxGap = wholeMinutes(body.maxGap, set.maxGap);
  // Typing the ends the wrong way round is not worth refusing a save over.
  if (set.minGap > set.maxGap) [set.minGap, set.maxGap] = [set.maxGap, set.minGap];
  if ('noRepeat' in body) set.noRepeat = !!body.noRepeat;
  if ('pickOne' in body) set.pickOne = !!body.pickOne;
  if ('audience' in body) set.audience = cleanAudience(m, body.audience);
}

export function addSet(m, body = {}, now = Date.now()) {
  if (Object.keys(m.sets).length >= LIMITS.sets) throw bad(`That is the most sets there can be (${LIMITS.sets}).`);
  const set = {
    id: newId(),
    name: 'New set',
    challenges: [],
    minGap: 20,
    maxGap: 60,
    noRepeat: true,
    audience: { mode: 'all', crews: [], riders: [] },
    pickOne: false,
    state: 'stopped',
    nextAt: null,
    used: [],
    last: null,
    sent: 0,
    created: now,
  };
  applySettings(m, set, body);
  m.sets[set.id] = set;
  return set;
}

export function editSet(m, id, body = {}) {
  const set = m.sets[id];
  if (!set) throw missing('set');
  applySettings(m, set, body);
  return set;
}

export function removeSet(m, id) {
  if (!m.sets[id]) throw missing('set');
  delete m.sets[id];
}

/** A gap, in milliseconds, anywhere between the set's two ends. */
export function gap(set, rand = Math.random, minute = MINUTE) {
  return Math.round((set.minGap + rand() * (set.maxGap - set.minGap)) * minute);
}

/**
 * Start, pause or stop. Starting (or carrying on after a pause) waits a
 * fresh gap before the first dare; "Send one now" is for anybody who cannot
 * wait. Stopping forgets which dares have been used, so the next start is a
 * full hat; pausing keeps it.
 */
export function control(m, id, action, { now = Date.now(), rand = Math.random, minute = MINUTE } = {}) {
  const set = m.sets[id];
  if (!set) throw missing('set');
  if (action === 'start') {
    if (!set.challenges.length) throw bad('Add a challenge first.');
    if (set.state !== 'running') {
      set.state = 'running';
      set.nextAt = now + gap(set, rand, minute);
    }
  } else if (action === 'pause') {
    if (set.state === 'running') set.state = 'paused';
    set.nextAt = null;
  } else if (action === 'stop') {
    set.state = 'stopped';
    set.nextAt = null;
    set.used = [];
  } else {
    throw bad('Start, pause or stop.');
  }
  return set;
}

// --- who gets it, and what --------------------------------------------------------

/** Everybody the set is aimed at, before any random pick. */
export function audienceOf(m, set) {
  const riders = Object.values(m.riders);
  const a = set.audience;
  if (a.mode === 'crews') return riders.filter((r) => r.crews.some((c) => a.crews.includes(c)));
  if (a.mode === 'riders') return riders.filter((r) => a.riders.includes(r.id));
  return riders;
}

function recipients(m, set, rand) {
  const all = audienceOf(m, set);
  if (!set.pickOne || all.length <= 1) return all;
  // One person: somebody whose phone will actually buzz, if there is anybody.
  const reachable = all.filter((r) => r.sub);
  const pool = reachable.length ? reachable : all;
  return [pool[Math.floor(rand() * pool.length)]];
}

function draw(set, rand) {
  if (!set.challenges.length) return null;
  if (!set.noRepeat) return set.challenges[Math.floor(rand() * set.challenges.length)];
  let hat = set.challenges.filter((c) => !set.used.includes(c.id));
  if (!hat.length) {
    // Everything has been out once. Empty the hat and refill it, but keep
    // the one just sent out of the first draw so it never comes twice running.
    const lastId = set.used[set.used.length - 1];
    set.used = [];
    hat = set.challenges.length > 1 ? set.challenges.filter((c) => c.id !== lastId) : set.challenges;
  }
  return hat[Math.floor(rand() * hat.length)];
}

/**
 * Pick a dare and who gets it, and write it down: in every recipient's
 * inbox, and as the set's last. Returns what to post, or null if the set has
 * nothing to send. The caller sends; the record does not wait for the post,
 * so the page shows the dare even to somebody whose phone never buzzed.
 */
export function fire(m, set, { now = Date.now(), rand = Math.random } = {}) {
  const challenge = draw(set, rand);
  if (!challenge) return null;
  if (set.noRepeat) set.used.push(challenge.id);
  const to = recipients(m, set, rand);
  const solo = set.pickOne && to.length === 1;
  for (const rider of to) {
    rider.inbox.unshift({ set: set.name, text: challenge.text, at: now, solo });
    rider.inbox.length = Math.min(rider.inbox.length, LIMITS.inbox);
  }
  set.last = { text: challenge.text, at: now, count: to.length, names: solo ? [to[0].name] : null };
  set.sent += 1;
  return {
    set,
    to,
    message: { title: solo ? `${set.name}: just you` : set.name, body: challenge.text, at: now, tag: `${set.id}-${now}` },
  };
}

/** Sets whose time has come. */
export function due(m, now = Date.now()) {
  return Object.values(m.sets).filter((s) => s.state === 'running' && s.nextAt != null && s.nextAt <= now);
}

/** When the next send is, across every set, or null if nothing is running. */
export function earliest(m) {
  let next = null;
  for (const s of Object.values(m.sets)) {
    if (s.state === 'running' && s.nextAt != null && (next === null || s.nextAt < next)) next = s.nextAt;
  }
  return next;
}

// --- the admin's view -------------------------------------------------------------

/**
 * Everything the admin page draws. `reveal` is whether to say when the next
 * dares are due: without it the time is not sent at all, so it stays a
 * surprise even to somebody reading the network tab.
 */
export function adminView(m, { reveal = false, now = Date.now() } = {}) {
  const riders = Object.values(m.riders).sort((a, b) => a.joined - b.joined);
  return {
    now,
    sets: Object.values(m.sets)
      .sort((a, b) => a.created - b.created)
      .map((s) => ({
        id: s.id,
        name: s.name,
        challenges: s.challenges,
        minGap: s.minGap,
        maxGap: s.maxGap,
        noRepeat: s.noRepeat,
        pickOne: s.pickOne,
        audience: s.audience,
        state: s.state,
        last: s.last,
        sent: s.sent,
        left: s.noRepeat ? s.challenges.filter((c) => !s.used.includes(c.id)).length : null,
        reach: audienceOf(m, s).length,
        reachable: audienceOf(m, s).filter((r) => r.sub).length,
        nextAt: reveal ? s.nextAt : undefined,
      })),
    crews: Object.values(m.crews)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ ...c, size: riders.filter((r) => r.crews.includes(c.id)).length })),
    riders: riders.map((r) => ({
      id: r.id,
      name: r.name,
      crews: r.crews,
      notifications: !!r.sub,
      joined: r.joined,
      seen: r.seen,
    })),
    limits: LIMITS,
  };
}
