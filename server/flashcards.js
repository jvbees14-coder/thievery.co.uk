// ---------------------------------------------------------------------------
// /flashcards — the routes.
//
// Everything the browser can ask for lives here: the door, the collection,
// the trading post and the panel behind it. The room server hands this module
// any request whose path begins /flashcards or /api/flashcards, and gets back
// a promise that resolves once the reply has been written.
//
// Three habits run through all of it:
//
//   * Nothing is trusted from the browser except the session cookie, and that
//     is only trusted because the server hashed it.
//   * Every handler that changes something re-reads the card or the account
//     from the store and checks who owns it. An id in a request body is a
//     suggestion, never an authorisation.
//   * The page itself is only assembled for somebody signed in. A logged-out
//     visitor is served the door instead — the app's markup never reaches
//     them, so there is no shell to poke at.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Accounts from './accounts.js';
import * as Cards from './cards.js';
import * as Trading from './trading.js';
import { data, touch } from './store.js';
import * as Store from './store.js';
import * as R2 from './r2.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS = path.join(__dirname, 'views');

// The app's markup is kept out of public/ on purpose: anything in there is
// served to anyone who asks for it by name, and this is the one page on the
// site that has to be earned.
const readView = (name) => fs.readFileSync(path.join(VIEWS, name), 'utf8');
const views = {
  app: readView('flashcards.html'),
  door: readView('flashcards-door.html'),
  closed: readView('flashcards-closed.html'),
};

// --- when the room cannot open ---------------------------------------------
//
// The flashcards keep their ledger somewhere else — a bucket, or a file — and
// that somewhere else can be unreachable or misconfigured. Two things must
// both be true when it is:
//
//   * Nothing is written. An empty document saved over a full one is the one
//     mistake here that cannot be undone.
//   * The rest of the site carries on. The card game keeps nothing and needs
//     none of this; taking the tables down because a bucket is unreachable
//     would be a far bigger outage than the problem deserves.
//
// So a failure closes this room and only this room: every address under
// /flashcards answers 503, and the game is untouched.

let outage = null; // { reason } while the room is shut

export const isOpen = () => !outage;

const BODY_MAX = 64 * 1024; // no legitimate request here is anywhere near this

// --- plumbing --------------------------------------------------------------

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': typeof body === 'string' ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    // A collection is nobody else's business, and the panel least of all.
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(payload);
}

const fail = (res, err) =>
  send(res, err.status || 500, { error: err.status ? err.message : 'Something went wrong.' });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let overflowed = false;
    const chunks = [];
    req.on('data', (chunk) => {
      if (overflowed) return;
      size += chunk.length;
      if (size > BODY_MAX) {
        overflowed = true;
        chunks.length = 0;
        // The rest is read and thrown away rather than the connection being
        // cut. Destroying the socket here would take the 413 with it, and the
        // browser would report a network failure instead of the reason.
        req.resume();
        reject(Object.assign(new Error('That is too much to send at once.'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (overflowed) return; // already refused
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch {
        reject(Object.assign(new Error('That was not JSON.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    const raw = part.slice(at + 1).trim();
    // A cookie is whatever the browser was holding, which need not be anything
    // this server wrote and need not decode at all. A jar that will not open
    // is somebody with no session rather than a reason to stop.
    let value;
    try {
      value = decodeURIComponent(raw);
    } catch {
      value = raw;
    }
    out[part.slice(0, at).trim()] = value;
  }
  return out;
}

// Behind Render and Fly the connection to Node is plain HTTP; whether the
// visitor is on HTTPS is only knowable from the proxy's header. Getting this
// wrong either drops the Secure flag in production or breaks sign-in on
// localhost, so both cases are handled explicitly.
function isSecure(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return proto ? proto === 'https' : !!req.socket.encrypted;
}

function sessionCookie(req, token, maxAge) {
  const bits = [
    `${Accounts.SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (isSecure(req)) bits.push('Secure');
  return bits.join('; ');
}

/**
 * Who is asking, for the purpose of counting what they have been up to.
 *
 * Behind one proxy the entry worth having is the *last* one. The chain is
 * written client-first and every hop appends the address it actually saw, so
 * the rightmost is the address that reached the proxy; the leftmost is
 * whatever the client claimed on the way in. Counting failed logins against
 * the leftmost is counting them against a number anybody can make up afresh
 * on every request, which is a limit that has never stopped anybody.
 */
function clientIp(req) {
  // Fly names the real one outright, which beats reading a chain.
  const direct = String(req.headers['fly-client-ip'] || '').trim();
  if (direct) return direct;
  const chain = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return chain[chain.length - 1] || req.socket.remoteAddress || 'unknown';
}

/**
 * Cross-site request forgery, headed off twice: the cookie is SameSite=Lax,
 * and anything that changes state must either carry no Origin at all (a
 * script or a curl, which has no cookie to ride on) or one that matches the
 * host it arrived at. A form posted from somebody else's site carries theirs.
 */
function originOk(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

// --- who is asking ---------------------------------------------------------

function currentUser(req) {
  return Accounts.userForToken(cookies(req)[Accounts.SESSION_COOKIE]);
}

function requireUser(req) {
  const user = currentUser(req);
  if (!user) throw Object.assign(new Error('Sign in first.'), { status: 401 });
  return user;
}

function requireAdmin(req) {
  const user = requireUser(req);
  // Deliberately the same reply an ordinary member gets for a route that does
  // not exist. The panel does not announce itself.
  if (!Accounts.isAdmin(user)) throw Object.assign(new Error('Not found.'), { status: 404 });
  return user;
}

function ownCard(user, id) {
  const card = Cards.byId(String(id || ''));
  if (!card || card.ownerId !== user.id) throw Object.assign(new Error('No such card.'), { status: 404 });
  return card;
}

// --- what a signed-in browser is told --------------------------------------

function collectionFor(user) {
  const cards = Cards.cardsOf(user.id).sort((a, b) => b.created - a.created);
  const worth = cards.reduce((n, c) => n + c.value, 0);
  const byRarity = {};
  for (const r of Cards.RARITIES) byRarity[r] = 0;
  for (const c of cards) byRarity[c.rarity] += 1;
  return {
    cards: cards.map((c) => Cards.publicCard(c, user.id)),
    stats: { count: cards.length, worth, byRarity, limit: Cards.CARDS_PER_USER },
  };
}

function snapshot(user) {
  return {
    user: Accounts.publicUser(user),
    ...collectionFor(user),
    pool: Trading.publicPool(user.id),
    trades: Trading.tradesFor(user.id),
    rarities: Cards.RARITY,
    limits: {
      front: Cards.FRONT_MAX,
      back: Cards.BACK_MAX,
      hint: Cards.HINT_MAX,
      category: Cards.CATEGORY_MAX,
      tags: Cards.TAGS_MAX,
      tag: Cards.TAG_MAX,
    },
  };
}

// --- the door --------------------------------------------------------------

// How many accounts one address may open in an hour.
//
// Without this, a public sign-up form writing to a file on disk is an
// invitation to fill the disk. It is kept in memory rather than in the store
// for the same reason the failed-login counters are: a restart forgiving it
// costs nothing, and it keeps a log of who visited out of the file that holds
// the accounts.
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

async function handleRegister(req, res) {
  const ip = clientIp(req);
  checkRegistrationLimit(ip);
  const body = await readBody(req);
  const user = await Accounts.createAccount({
    username: body.username,
    password: body.password,
    displayName: body.displayName,
  });
  noteRegistration(ip);
  // Three cards to start with, so a new account can take part at the trading
  // post on its first visit rather than its third.
  Cards.dealWelcome(user);
  const token = Accounts.startSession(user);
  send(res, 200, snapshot(user), { 'Set-Cookie': sessionCookie(req, token, 30 * 24 * 60 * 60) });
}

async function handleLogin(req, res) {
  const body = await readBody(req);
  const user = await Accounts.authenticate({
    username: body.username,
    password: body.password,
    ip: clientIp(req),
  });
  const token = Accounts.startSession(user);
  send(res, 200, snapshot(user), { 'Set-Cookie': sessionCookie(req, token, 30 * 24 * 60 * 60) });
}

function handleLogout(req, res) {
  Accounts.endSession(cookies(req)[Accounts.SESSION_COOKIE]);
  send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
}

async function handleAccount(req, res) {
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
  send(res, 200, snapshot(user));
}

// --- cards -----------------------------------------------------------------

async function handleAppraise(req, res) {
  requireUser(req);
  const body = await readBody(req);
  const craft = Cards.craftScore(body);
  // The craft mark is shown while typing, because it is earned and knowable.
  // The rarity is not: it is rolled against a seed that does not exist until
  // the card is struck, so all the form can honestly show is the odds.
  send(res, 200, {
    craft: craft.total,
    parts: craft.parts,
    odds: Cards.rarityOdds(craft.total),
    range: {
      low: Cards.valueFor(craft.total, 'common', 'floor'),
      high: Cards.valueFor(craft.total, 'legendary', 'ceiling'),
    },
  });
}

async function handleCreateCard(req, res) {
  const user = requireUser(req);
  const body = await readBody(req);
  const card = Cards.createCard(user, body);
  send(res, 200, { card: Cards.publicCard(card, user.id), ...snapshot(user) });
}

async function handleEditCard(req, res, id) {
  const user = requireUser(req);
  const card = ownCard(user, id);
  if (card.pooled) throw Object.assign(new Error('Take it off the table before you re-cut it.'), { status: 400 });
  const body = await readBody(req);
  Cards.editCard(card, body);
  send(res, 200, { card: Cards.publicCard(card, user.id), ...snapshot(user) });
}

function handleDeleteCard(req, res, id) {
  const user = requireUser(req);
  const card = ownCard(user, id);
  if (card.pooled) throw Object.assign(new Error('Take it off the table first.'), { status: 400 });
  Cards.deleteCard(card);
  send(res, 200, snapshot(user));
}

// --- the trading post ------------------------------------------------------

async function handleOffer(req, res) {
  const user = requireUser(req);
  const body = await readBody(req);
  const card = ownCard(user, body.id);
  const settled = Trading.offer(user, card);
  // Only the trades this person was part of are worth reporting back; the
  // offer may well have settled two other people's cards on its way through.
  const mine = settled.filter((t) => t.a.userId === user.id || t.b.userId === user.id);
  send(res, 200, { settled: mine.length, ...snapshot(user) });
}

async function handleWithdraw(req, res) {
  const user = requireUser(req);
  const body = await readBody(req);
  const card = ownCard(user, body.id);
  Trading.withdraw(user, card);
  send(res, 200, snapshot(user));
}

// --- the panel -------------------------------------------------------------

function adminOverview(req, res) {
  requireAdmin(req);
  const db = data();
  const cards = Object.values(db.cards);
  const byRarity = {};
  for (const r of Cards.RARITIES) byRarity[r] = 0;
  for (const c of cards) byRarity[c.rarity] += 1;
  send(res, 200, {
    users: Accounts.allUsers()
      .map((u) => {
        const theirs = Cards.cardsOf(u.id);
        return {
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          created: u.created,
          lastSeen: u.lastSeen,
          disabled: !!u.disabled,
          note: u.note || '',
          admin: Accounts.isAdmin(u),
          cards: theirs.length,
          worth: theirs.reduce((n, c) => n + c.value, 0),
          pooled: theirs.filter((c) => c.pooled).length,
          mythics: theirs.filter((c) => c.rarity === 'mythic').length,
        };
      })
      .sort((a, b) => b.created - a.created),
    stats: {
      accounts: Accounts.allUsers().length,
      cards: cards.length,
      minted: db.mints,
      pooled: db.pool.length,
      trades: db.trades.length,
      worth: cards.reduce((n, c) => n + c.value, 0),
      byRarity,
    },
    trades: Trading.allTrades(60),
  });
}

function adminUser(req, res, id) {
  requireAdmin(req);
  const user = Accounts.byId(id);
  if (!user) throw Object.assign(new Error('No such account.'), { status: 404 });
  const theirs = Cards.cardsOf(user.id).sort((a, b) => b.created - a.created);
  send(res, 200, {
    account: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      created: user.created,
      lastSeen: user.lastSeen,
      disabled: !!user.disabled,
      note: user.note || '',
      admin: Accounts.isAdmin(user),
      sessions: Object.values(data().sessions).filter((s) => s.userId === user.id).length,
    },
    // The admin sees the whole card, backs included — that is the point of a
    // panel that can put things right.
    cards: theirs.map((c) => ({ ...Cards.publicCard(c, user.id), back: c.back, ownerId: c.ownerId })),
    trades: Trading.tradesFor(user.id, 30),
  });
}

async function adminPatchUser(req, res, id) {
  const admin = requireAdmin(req);
  const user = Accounts.byId(id);
  if (!user) throw Object.assign(new Error('No such account.'), { status: 404 });
  const body = await readBody(req);

  if (body.displayName != null) {
    const name = String(body.displayName).trim().slice(0, 24);
    if (!name) throw Object.assign(new Error('A display name cannot be empty.'), { status: 400 });
    user.displayName = name;
  }
  if (body.username != null && String(body.username).toLowerCase() !== user.username) {
    // The admin may hand out reserved names; nobody else may take one.
    const problem = Accounts.usernameProblem(body.username, { allowReserved: true, except: user.id });
    if (problem) throw Object.assign(new Error(problem), { status: 400 });
    if (Accounts.isAdmin(user)) {
      throw Object.assign(new Error('Renaming the admin account would lock you out; change THIEVERY_ADMIN_USERNAME instead.'), { status: 400 });
    }
    user.username = String(body.username).trim().toLowerCase();
  }
  if (body.note != null) user.note = String(body.note).slice(0, 500);
  if (body.disabled != null) {
    if (Accounts.isAdmin(user) && body.disabled) {
      throw Object.assign(new Error('The admin account cannot suspend itself.'), { status: 400 });
    }
    user.disabled = !!body.disabled;
    if (user.disabled) Accounts.endAllSessions(user.id);
  }
  if (body.password) {
    await Accounts.setPassword(user, body.password);
    // A password the admin set is a password the account holder has not
    // chosen, so every existing key to it is thrown away.
    Accounts.endAllSessions(user.id, user.id === admin.id ? cookies(req)[Accounts.SESSION_COOKIE] : null);
  }
  if (body.signOut) Accounts.endAllSessions(user.id, user.id === admin.id ? cookies(req)[Accounts.SESSION_COOKIE] : null);
  touch();
  adminUser(req, res, id);
}

function adminDeleteUser(req, res, id) {
  requireAdmin(req);
  const user = Accounts.byId(id);
  if (!user) throw Object.assign(new Error('No such account.'), { status: 404 });
  if (Accounts.isAdmin(user)) throw Object.assign(new Error('The admin account cannot delete itself.'), { status: 400 });

  // The cards go with it. Leaving them ownerless would break the trading post
  // and leaving them in the pool would offer cards nobody can be paid for.
  for (const card of Cards.cardsOf(user.id)) Cards.deleteCard(card);
  Accounts.endAllSessions(user.id);
  delete data().users[user.id];
  touch();
  adminOverview(req, res);
}

async function adminMythic(req, res) {
  const admin = requireAdmin(req);
  const body = await readBody(req);

  // "to" is either a username or the word random. Random means a random
  // account that is not the admin's own — a mythic the house keeps is not a
  // mythic anybody will ever see.
  let recipient;
  if (!body.to || String(body.to) === 'random') {
    const candidates = Accounts.allUsers().filter((u) => !u.disabled && u.id !== admin.id);
    if (!candidates.length) throw Object.assign(new Error('There is nobody to give it to.'), { status: 400 });
    recipient = candidates[Math.floor(Math.random() * candidates.length)];
  } else {
    recipient = Accounts.findByUsername(body.to) || Accounts.byId(String(body.to));
    if (!recipient) throw Object.assign(new Error(`No account called "${body.to}".`), { status: 404 });
  }

  const card = Cards.mintMythic(recipient, body, {
    value: body.value === '' || body.value == null ? null : Number(body.value),
    mintedBy: String(body.mintedBy || 'The House').slice(0, 24),
  });
  send(res, 200, {
    card: { ...Cards.publicCard(card, recipient.id), back: card.back },
    to: { id: recipient.id, username: recipient.username, displayName: recipient.displayName },
  });
}

// The text of a card, as the panel may rewrite it. Anything outside this list
// is either the card's identity (its mint number, its seed) or settled further
// down by hand.
const CARD_TEXT = ['front', 'back', 'hint', 'category', 'tags', 'title', 'flavour'];

/**
 * Put a card right. The house may rewrite it, overrule the roll, name its own
 * price and move it between collections, in that order: each step is allowed
 * to undo the worth the step above it worked out, so the last number the admin
 * actually typed is the one that sticks.
 */
async function adminPatchCard(req, res, id) {
  requireAdmin(req);
  const card = Cards.byId(id);
  if (!card) throw Object.assign(new Error('No such card.'), { status: 404 });
  const body = await readBody(req);
  const worthBefore = card.value;

  // The text first. This goes through the same re-cut the author's own form
  // uses, so it is cleaned and checked the same way, the craft is scored
  // again, and the seed stays where it is — the house can rewrite a card but
  // cannot roll it a better rarity by rewriting it, any more than its author
  // can. `naming` is the one thing the author's route does not get.
  const text = {};
  for (const key of CARD_TEXT) if (body[key] != null) text[key] = body[key];
  if (Object.keys(text).length) Cards.editCard(card, text, { naming: true });

  // Then the rarity, which the roll decided and only the house may overrule.
  // Its worth follows the new rarity, unless a price is named below.
  if (body.rarity != null) {
    if (!Cards.RARITIES.includes(body.rarity)) {
      throw Object.assign(new Error('That is not a rarity.'), { status: 400 });
    }
    if (body.rarity !== card.rarity) {
      card.rarity = body.rarity;
      card.value = Cards.valueFor(card.craft, card.rarity, card.seed);
    }
  }

  // And last a price set by hand, which overrules everything above it.
  if (body.value != null) {
    const v = Number(body.value);
    if (!Number.isFinite(v) || v < 1) throw Object.assign(new Error('A value is a number of at least 1.'), { status: 400 });
    card.value = Math.round(v);
  }

  if (body.ownerId != null) {
    const to = Accounts.byId(String(body.ownerId)) || Accounts.findByUsername(String(body.ownerId));
    if (!to) throw Object.assign(new Error('No such account.'), { status: 404 });
    if (to.id !== card.ownerId) {
      Trading.unpool(card);
      (card.history ||= []).push({ at: Date.now(), event: 'moved', from: card.ownerId, to: to.id });
      card.ownerId = to.id;
    }
  }

  // A card on the table is an offer of a particular worth, and the post
  // settles against that number while both parties are asleep. Change it and
  // the offer is no longer the one anybody made, so it comes off the table
  // rather than trading at a price nobody agreed to.
  const unpooled = card.pooled && card.value !== worthBefore;
  if (unpooled) Trading.unpool(card);

  touch();
  const owner = Accounts.byId(card.ownerId);
  send(res, 200, {
    card: { ...Cards.publicCard(card, card.ownerId), ownerId: card.ownerId },
    owner: owner ? { id: owner.id, username: owner.username, displayName: owner.displayName } : null,
    unpooled,
  });
}

function adminDeleteCard(req, res, id) {
  requireAdmin(req);
  const card = Cards.byId(id);
  if (!card) throw Object.assign(new Error('No such card.'), { status: 404 });
  Cards.deleteCard(card);
  send(res, 200, { ok: true });
}

// --- the page itself -------------------------------------------------------

function servePage(req, res) {
  const user = currentUser(req);
  const html = user ? views.app : views.door;
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
    // The door is worth having in an index; a collection is not.
    'X-Robots-Tag': user ? 'noindex, nofollow' : 'index, follow',
  });
  res.end(html);
}

// --- the switchboard -------------------------------------------------------

/**
 * Handle a /flashcards request. Returns true if it took the request, so the
 * room server knows to stop looking for a file to serve.
 */
export function handle(req, res, url) {
  const pathname = url.pathname;
  const isApi = pathname === '/api/flashcards' || pathname.startsWith('/api/flashcards/');
  const isPage = pathname === '/flashcards' || pathname.startsWith('/flashcards/');
  if (!isApi && !isPage) return false;

  // The room is shut. Everything under /flashcards says so and nothing below
  // this line runs, which is what keeps a closed room from writing anything.
  // The request is still taken, so it cannot fall through to the game page.
  if (outage) {
    if (isApi) {
      send(res, 503, { error: 'The flashcards room is closed for a moment. Nothing has been lost.' });
    } else {
      res.writeHead(503, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': '120',
        'X-Robots-Tag': 'noindex, nofollow',
      });
      res.end(views.closed);
    }
    return true;
  }

  const done = (promise) => {
    Promise.resolve(promise).catch((err) => {
      if (!res.headersSent) fail(res, err);
    });
  };

  if (isPage) {
    // One page, one address. Anything deeper is somebody guessing.
    if (pathname !== '/flashcards' && pathname !== '/flashcards/') {
      res.writeHead(302, { Location: '/flashcards', 'Cache-Control': 'no-store' });
      res.end();
      return true;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, { error: 'Method not allowed.' });
      return true;
    }
    servePage(req, res);
    return true;
  }

  if (req.method !== 'GET' && !originOk(req)) {
    send(res, 403, { error: 'That request came from somewhere else.' });
    return true;
  }

  const route = pathname.replace(/^\/api\/flashcards\/?/, '');
  // Percent-encoding off the wire can be malformed, and decoding it then
  // throws. This runs before the promise below catches anything, so an
  // unguarded decode here is an exception with nothing underneath it to land
  // on — which takes the whole process, card game and all.
  let head, a, b;
  try {
    [head, a, b] = route.split('/').map((s) => decodeURIComponent(s || ''));
  } catch {
    send(res, 400, { error: 'That address will not decode.' });
    return true;
  }
  const method = req.method;

  done(
    (async () => {
      // --- the door
      if (head === 'register' && method === 'POST') return handleRegister(req, res);
      if (head === 'login' && method === 'POST') return handleLogin(req, res);
      if (head === 'logout' && method === 'POST') return handleLogout(req, res);
      if (head === 'account' && method === 'POST') return handleAccount(req, res);
      if (head === 'me' && method === 'GET') return send(res, 200, snapshot(requireUser(req)));

      // --- cards
      if (head === 'appraise' && method === 'POST') return handleAppraise(req, res);
      if (head === 'cards' && !a && method === 'POST') return handleCreateCard(req, res);
      if (head === 'cards' && a && method === 'POST') return handleEditCard(req, res, a);
      if (head === 'cards' && a && method === 'DELETE') return handleDeleteCard(req, res, a);

      // --- the trading post
      if (head === 'trade' && a === 'offer' && method === 'POST') return handleOffer(req, res);
      if (head === 'trade' && a === 'withdraw' && method === 'POST') return handleWithdraw(req, res);

      // --- the panel
      if (head === 'admin') {
        if (a === 'overview' && method === 'GET') return adminOverview(req, res);
        if (a === 'users' && b && method === 'GET') return adminUser(req, res, b);
        if (a === 'users' && b && method === 'POST') return adminPatchUser(req, res, b);
        if (a === 'users' && b && method === 'DELETE') return adminDeleteUser(req, res, b);
        if (a === 'mythic' && method === 'POST') return adminMythic(req, res);
        if (a === 'cards' && b && method === 'POST') return adminPatchCard(req, res, b);
        if (a === 'cards' && b && method === 'DELETE') return adminDeleteCard(req, res, b);
      }

      send(res, 404, { error: 'No such thing.' });
    })()
  );
  return true;
}

// --- housekeeping ----------------------------------------------------------

export async function start() {
  // Production on an ephemeral disk is the quietest way to lose everything:
  // the site comes up, the room works, and every account disappears at the
  // next spin-down with nothing in the log to say so. Better to shut the room
  // and be obvious about why. THIEVERY_ALLOW_EPHEMERAL=1 is the way out for
  // anyone who genuinely means it.
  if (process.env.NODE_ENV === 'production' && !R2.configured && process.env.THIEVERY_ALLOW_EPHEMERAL !== '1') {
    outage = { reason: 'no durable storage is configured' };
    const absent = R2.missing();
    const here = R2.present();
    console.error(
      'flashcards: NO DURABLE STORAGE. The room is closed.\n' +
        `  Missing: ${absent.join(', ')}\n` +
        `  Already set: ${here.length ? here.join(', ') : 'none of the four'}\n` +
        '  This is production, so the only place left to keep accounts would be a\n' +
        '  disk that is wiped on the next deploy or spin-down. Set the missing\n' +
        '  variables above — or set THIEVERY_ALLOW_EPHEMERAL=1 if losing\n' +
        '  everything really is fine.\n' +
        '  The card game is unaffected and is running normally.'
    );
    return;
  }

  // Awaited before anything else: nothing below may touch the store until the
  // document has been read in.
  try {
    const { fresh, where } = await Store.open();
    console.log(`flashcards: ${fresh ? 'starting a new document at' : 'loaded'} ${where}`);
  } catch (err) {
    // Unreachable bucket, wrong key, expired token. The data is almost
    // certainly fine and merely out of reach, so the room shuts and writes
    // nothing rather than starting empty and saving that over the top.
    outage = { reason: 'the ledger could not be read' };
    console.error(
      `flashcards: THE ROOM IS CLOSED. ${err.message}\n` +
        `  ${R2.hintFor(err.cause || err)}\n` +
        '  Nothing will be written while it is closed, so the stored data is safe.\n' +
        '  The card game is unaffected and is running normally.'
    );
    return;
  }

  await Accounts.ensureAdmin();
  // Sessions nobody has used for a month are swept once an hour, on the same
  // rhythm the room server forgets an empty table.
  setInterval(() => Accounts.sweepSessions(), 60 * 60_000).unref?.();
}
