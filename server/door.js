// ---------------------------------------------------------------------------
// The door.
//
// Opening an account, signing in, signing out and changing what is on the
// account afterwards. One copy, because there are now two doors onto the same
// membership — the front hall at "/" and the flashcards room's own page — and
// two implementations of "is this password right" is one too many.
//
// What comes back after a successful sign-in differs by door: the front hall
// wants the menu's figures, the flashcards room wants a shelf of cards. So
// every handler here takes a `reply` — given the account, hand back whatever
// that door's page needs — and knows nothing else about either of them.
// ---------------------------------------------------------------------------

import * as Accounts from './accounts.js';
import { touch } from './store.js';
import { readBody, sessionCookie, clientIp, send, requireUser, cookies, SESSION_MAX_AGE } from './plumbing.js';

// --- how many accounts one address may open in an hour ---------------------
//
// Without this, a public sign-up form writing to a file on disk is an
// invitation to fill the disk. It is kept in memory rather than in the store
// for the same reason the failed-login counters are: a restart forgiving it
// costs nothing, and it keeps a log of who visited out of the file that holds
// the accounts.
//
// Only accounts that actually opened are counted. A rejected attempt — a
// short password, a name already taken — is somebody getting the form wrong,
// and spending their allowance on it would lock out the person least likely
// to be the problem.
const REGISTRATIONS_PER_HOUR = 10;
const registrations = new Map(); // ip -> timestamps within the last hour

function recentRegistrations(ip) {
  const now = Date.now();
  const recent = (registrations.get(ip) || []).filter((at) => now - at < 60 * 60_000);
  registrations.set(ip, recent);
  return recent;
}

function checkRegistrationLimit(ip) {
  if (recentRegistrations(ip).length >= REGISTRATIONS_PER_HOUR) {
    throw Object.assign(new Error('That is enough new accounts from here for one hour.'), { status: 429 });
  }
}

function noteRegistration(ip) {
  recentRegistrations(ip).push(Date.now());
}

setInterval(() => {
  const cutoff = Date.now() - 60 * 60_000;
  for (const [ip, times] of registrations) {
    const recent = times.filter((at) => at > cutoff);
    if (recent.length) registrations.set(ip, recent);
    else registrations.delete(ip);
  }
}, 15 * 60_000).unref?.();

// --- in and out ------------------------------------------------------------

export async function register(req, res, reply) {
  const ip = clientIp(req);
  checkRegistrationLimit(ip);
  const body = await readBody(req);
  const user = await Accounts.createAccount({
    username: body.username,
    password: body.password,
    displayName: body.displayName,
  });
  noteRegistration(ip);
  const token = Accounts.startSession(user);
  send(res, 200, reply(user), { 'Set-Cookie': sessionCookie(req, token, SESSION_MAX_AGE) });
}

export async function login(req, res, reply) {
  const body = await readBody(req);
  const user = await Accounts.authenticate({
    username: body.username,
    password: body.password,
    ip: clientIp(req),
  });
  const token = Accounts.startSession(user);
  send(res, 200, reply(user), { 'Set-Cookie': sessionCookie(req, token, SESSION_MAX_AGE) });
}

export function logout(req, res) {
  Accounts.endSession(cookies(req)[Accounts.SESSION_COOKIE]);
  send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
}

// --- changing what is on the account ---------------------------------------

export async function account(req, res, reply) {
  const user = requireUser(req);
  const body = await readBody(req);

  // Changing anything that matters means proving you are still the person who
  // signed in, not just the person holding the laptop.
  //
  // A 401 would be the wrong word for it. The browser reads that as a session
  // that has died underneath it and takes itself back to the door, losing
  // whatever was in the form; this is somebody very much signed in who has
  // mistyped a password, and they should be told so without being moved.
  if (body.password || body.username) {
    try {
      await Accounts.authenticate({ username: user.username, password: body.currentPassword, ip: clientIp(req) });
    } catch (err) {
      if (err.status === 401) throw Object.assign(new Error('That is not your current password.'), { status: 403 });
      throw err;
    }
  }
  if (body.displayName != null) {
    const name = String(body.displayName).trim().slice(0, 24);
    if (!name) throw Object.assign(new Error('A display name cannot be empty.'), { status: 400 });
    user.displayName = name;
    touch();
  }
  if (body.username) {
    const problem = Accounts.usernameProblem(body.username, { except: user.id });
    if (problem) throw Object.assign(new Error(problem), { status: 400 });
    user.username = String(body.username).trim().toLowerCase();
    touch();
  }
  if (body.password) {
    await Accounts.setPassword(user, body.password);
    // Every other device is signed out; the one asking keeps its key.
    Accounts.endAllSessions(user.id, cookies(req)[Accounts.SESSION_COOKIE]);
  }
  send(res, 200, reply(user));
}
