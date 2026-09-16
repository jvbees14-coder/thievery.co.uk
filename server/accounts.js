// ---------------------------------------------------------------------------
// The door to the flashcards.
//
// The game itself asks for nothing but a name typed into a box: there is
// nothing behind it worth stealing. A collection is different — cards are
// owned, they are traded away and they do not come back — so /flashcards is
// behind a real login, and this is the whole of it.
//
// Passwords are never stored. What is stored is a scrypt hash with a random
// salt, in a self-describing format, so the cost can be raised later without
// stranding the accounts already on the shelf. Comparison is constant-time.
//
// Sessions are a random 256-bit token in an HttpOnly cookie. The server keeps
// only the SHA-256 of that token, so a copy of the data file is not a drawer
// full of working keys. Signing out, or changing a password, throws the
// tokens away.
//
// Guessing is made slow rather than impossible: failures are counted per
// account and per address, and the wait doubles each time past the fifth.
// ---------------------------------------------------------------------------

import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { data, touch } from './store.js';

const scrypt = promisify(crypto.scrypt);

// 16384 × 8 × 1 needs 16MB and about a tenth of a second. The next step up
// wants 32MB per login, which is a lot to hand a 256MB machine when several
// people sign in at once.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export const SESSION_COOKIE = 'tv_fc';
const SESSION_TTL_MS = 30 * 24 * 60 * 60_000; // a month of not being asked again
const SESSION_TOUCH_MS = 60 * 60_000; // how stale "last seen" may get before it is rewritten

export const USERNAME_RE = /^[a-z0-9](?:[a-z0-9_.-]{1,18})[a-z0-9]$/;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

// Names that must not become somebody's account, because they would read as
// the site itself speaking.
const RESERVED = new Set([
  'admin', 'administrator', 'root', 'system', 'thievery', 'thievery.co.uk',
  'house', 'thehouse', 'moderator', 'mod', 'support', 'help', 'staff',
  'official', 'dealer', 'security', 'null', 'undefined',
]);

// --- the admin -------------------------------------------------------------
//
// One account is the admin, and it is named by the environment rather than by
// anything in the data file. That way the name cannot be claimed by whoever
// registers first. The account is created on the first boot that has a
// password to give it, and is never silently reset afterwards: change it from
// the panel, or set THIEVERY_ADMIN_RESET=1 for one boot if it is ever lost.

export const ADMIN_USERNAME = String(process.env.THIEVERY_ADMIN_USERNAME || 'jvbee').toLowerCase();

export function isAdmin(user) {
  return !!user && user.username === ADMIN_USERNAME;
}

// --- passwords -------------------------------------------------------------

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  if (!expected.length) return false;
  let got;
  try {
    got = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
      // Costs are read from the file rather than from this build, so a hash
      // written under a heavier setting still verifies.
      N: Number(N), r: Number(r), p: Number(p),
      maxmem: 256 * 1024 * 1024,
    });
  } catch {
    return false;
  }
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

// A hash of nothing anybody knows. An unknown username is put through this so
// that the reply takes as long as a real one and cannot be used to sweep for
// accounts that exist.
const DECOY = await hashPassword(crypto.randomBytes(32).toString('hex'));

// --- guess rate ------------------------------------------------------------
//
// Kept in memory on purpose. A restart forgiving the counters costs an
// attacker a restart they cannot cause, and it keeps failed logins out of the
// file that holds the accounts.

const attempts = new Map(); // key -> { n, until }
const ATTEMPT_BASE_MS = 20_000;
const ATTEMPT_MAX_MS = 60 * 60_000;

// The account and the address are counted separately, and not on the same
// terms. Five wrong guesses at one account is somebody working on it, and the
// account is what needs protecting. Five wrong guesses from one address is a
// household, an office or a phone network — behind a single public address
// there may be hundreds of people, and shutting them all out because one of
// them mistyped is a denial of service anybody could trigger on purpose. So
// the address is given a long rope, and it is there to slow down spraying
// across many accounts rather than to guard any one of them.
const ATTEMPT_FREE = { user: 5, ip: 25 };

function lockedFor(key) {
  const a = attempts.get(key);
  if (!a || !a.until) return 0;
  const left = a.until - Date.now();
  if (left <= 0) {
    a.until = 0;
    return 0;
  }
  return left;
}

/** How long, in ms, this address and account must wait. 0 if they may try. */
export function loginLockMs(ip, username) {
  return Math.max(lockedFor('ip:' + ip), lockedFor('user:' + String(username || '').toLowerCase()));
}

function noteFailure(key) {
  const free = ATTEMPT_FREE[key.startsWith('ip:') ? 'ip' : 'user'];
  const a = attempts.get(key) || { n: 0, until: 0 };
  a.n += 1;
  if (a.n > free) {
    a.until = Date.now() + Math.min(ATTEMPT_BASE_MS * 2 ** (a.n - free - 1), ATTEMPT_MAX_MS);
  }
  attempts.set(key, a);
}

function clearFailures(...keys) {
  for (const k of keys) attempts.delete(k);
}

// Nothing here grows without bound, but an address that tried once a year ago
// should not still be remembered.
setInterval(() => {
  const cutoff = Date.now() - ATTEMPT_MAX_MS;
  for (const [k, a] of attempts) if (!a.until || a.until < cutoff) attempts.delete(k);
}, 15 * 60_000).unref?.();

// --- accounts --------------------------------------------------------------

function newId() {
  return crypto.randomBytes(9).toString('base64url');
}

export function findByUsername(username) {
  const want = String(username || '').trim().toLowerCase();
  if (!want) return null;
  for (const u of Object.values(data().users)) if (u.username === want) return u;
  return null;
}

export function byId(id) {
  return data().users[id] || null;
}

export function allUsers() {
  return Object.values(data().users);
}

/**
 * What is wrong with this username, or null if nothing is. Kept apart from
 * registration so the sign-up form can say so before the password is typed.
 */
export function usernameProblem(username, { allowReserved = false, except = null } = {}) {
  const name = String(username || '').trim().toLowerCase();
  if (!name) return 'Pick a username.';
  if (name.length < 3 || name.length > 20) return 'Usernames are 3 to 20 characters.';
  if (!USERNAME_RE.test(name)) {
    return 'Usernames use letters, numbers, dots, dashes and underscores, and start and end with a letter or number.';
  }
  if (!allowReserved && (RESERVED.has(name) || name === ADMIN_USERNAME)) return 'That name is spoken for.';
  const taken = findByUsername(name);
  if (taken && taken.id !== except) return 'That name is already taken.';
  return null;
}

export function passwordProblem(password) {
  const pw = String(password || '');
  if (pw.length < PASSWORD_MIN) return `Passwords are at least ${PASSWORD_MIN} characters.`;
  if (pw.length > PASSWORD_MAX) return `Passwords are at most ${PASSWORD_MAX} characters.`;
  // Length is doing the work here, so the only other rule is that it cannot be
  // one long run of the same key.
  if (/^(.)\1*$/.test(pw)) return 'That is one character held down. Try a few more.';
  return null;
}

export async function createAccount({ username, password, displayName }, opts = {}) {
  const problem = usernameProblem(username, opts) || passwordProblem(password);
  if (problem) throw Object.assign(new Error(problem), { status: 400 });

  const now = Date.now();
  const user = {
    id: newId(),
    username: String(username).trim().toLowerCase(),
    displayName: String(displayName || username).trim().slice(0, 24) || String(username).trim(),
    password: await hashPassword(password),
    created: now,
    lastSeen: now,
    disabled: false,
    note: '', // the admin's own scribble; never shown to the account holder
  };
  data().users[user.id] = user;
  touch();
  return user;
}

/**
 * Check a username and password. Returns the account, or throws with a
 * deliberately vague message: which half was wrong is not the guesser's
 * business.
 */
export async function authenticate({ username, password, ip = 'unknown' }) {
  const name = String(username || '').trim().toLowerCase();
  const wait = loginLockMs(ip, name);
  if (wait > 0) {
    throw Object.assign(new Error(`Too many tries. Wait ${Math.ceil(wait / 1000)}s and try again.`), { status: 429 });
  }

  const user = findByUsername(name);
  const ok = await verifyPassword(String(password || ''), user ? user.password : DECOY);

  if (!user || !ok) {
    noteFailure('ip:' + ip);
    if (user) noteFailure('user:' + name);
    throw Object.assign(new Error('Wrong username or password.'), { status: 401 });
  }
  if (user.disabled) {
    throw Object.assign(new Error('That account has been suspended.'), { status: 403 });
  }

  clearFailures('ip:' + ip, 'user:' + name);
  user.lastSeen = Date.now();
  touch();
  return user;
}

export async function setPassword(user, password) {
  const problem = passwordProblem(password);
  if (problem) throw Object.assign(new Error(problem), { status: 400 });
  user.password = await hashPassword(password);
  touch();
}

// --- sessions --------------------------------------------------------------

const digest = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function startSession(user) {
  const token = crypto.randomBytes(32).toString('base64url');
  data().sessions[digest(token)] = { userId: user.id, created: Date.now(), seen: Date.now() };
  touch();
  return token;
}

export function endSession(token) {
  if (!token) return;
  delete data().sessions[digest(token)];
  touch();
}

/** Throw away every key to an account — used when its password changes. */
export function endAllSessions(userId, keepToken = null) {
  const sessions = data().sessions;
  const keep = keepToken ? digest(keepToken) : null;
  for (const [k, s] of Object.entries(sessions)) if (s.userId === userId && k !== keep) delete sessions[k];
  touch();
}

/** The account this token belongs to, or null. Expired tokens are dropped. */
export function userForToken(token) {
  if (!token) return null;
  const key = digest(token);
  const session = data().sessions[key];
  if (!session) return null;
  if (Date.now() - session.created > SESSION_TTL_MS) {
    delete data().sessions[key];
    touch();
    return null;
  }
  const user = data().users[session.userId];
  if (!user || user.disabled) {
    delete data().sessions[key];
    touch();
    return null;
  }
  // Writing "last seen" on every request would mean saving the file on every
  // request. Once an hour is plenty for what it is used for.
  if (Date.now() - session.seen > SESSION_TOUCH_MS) {
    session.seen = Date.now();
    user.lastSeen = Date.now();
    touch();
  }
  return user;
}

/** Drop sessions nobody has used for a month. Called on a timer from index. */
export function sweepSessions() {
  const sessions = data().sessions;
  const cutoff = Date.now() - SESSION_TTL_MS;
  let dropped = 0;
  for (const [k, s] of Object.entries(sessions)) {
    if (s.created < cutoff || !data().users[s.userId]) {
      delete sessions[k];
      dropped += 1;
    }
  }
  if (dropped) touch();
}

// --- the admin account, on the first boot that can make one ----------------

export async function ensureAdmin() {
  const existing = findByUsername(ADMIN_USERNAME);
  const password = process.env.THIEVERY_ADMIN_PASSWORD;

  if (existing) {
    if (password && process.env.THIEVERY_ADMIN_RESET === '1') {
      await setPassword(existing, password);
      endAllSessions(existing.id);
      console.log(`flashcards: admin password reset for "${ADMIN_USERNAME}" — now unset THIEVERY_ADMIN_RESET.`);
    }
    return existing;
  }
  if (!password) {
    console.log(
      `flashcards: no admin account yet. Set THIEVERY_ADMIN_PASSWORD (and THIEVERY_ADMIN_USERNAME, currently "${ADMIN_USERNAME}") to make one.`
    );
    return null;
  }
  await createAccount({ username: ADMIN_USERNAME, password, displayName: 'The House' }, { allowReserved: true });
  console.log(`flashcards: created the admin account "${ADMIN_USERNAME}".`);
  return findByUsername(ADMIN_USERNAME);
}

/** What the browser is told about whoever is signed in. Never the hash. */
export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    created: user.created,
    admin: isAdmin(user),
  };
}
