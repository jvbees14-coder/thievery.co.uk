// ---------------------------------------------------------------------------
// /polls — the questions, and the one rule about who may ask them.
//
// A poll is a question and two to six answers. Anybody signed in may answer
// one. Not anybody may ask one:
//
//   **You have to have answered somebody else's question before you may ask
//   one of your own.**
//
// That is the whole design, and it is worth saying why. A board where asking
// is free fills up with questions nobody answers, because asking is the fun
// part and answering is the work. Making the work the entry fee means every
// question on the board was posted by somebody who had already done it, and
// a newcomer's first act is to answer rather than to add. Answering your own
// question does not count, for the obvious reason.
//
// It leaves one hole: with an empty board there is nothing to answer, so
// nobody could ever ask the first question. The admin is therefore exempt —
// the house puts the first question on the table, exactly as it mints the
// mythics — and from then on the rule runs on its own.
//
// Two more things are deliberate:
//
//   * A ballot is secret. Who voted for what is stored, because a second
//     vote from the same account has to be refused, but it is never sent
//     anywhere — not to the asker, not to the panel, not to the admin. What
//     leaves this module is a tally and your own answer.
//   * The split is not shown until you have answered. Seeing which way the
//     room is going before you choose is how a poll stops measuring anything.
//     How *many* have answered is shown from the start; that gives nothing
//     away and it is the thing that makes a question look worth answering.
//
// This module holds both the rules and the routes, unlike the flashcards
// half, where the appraisal is big enough to want a file to itself. There is
// not enough here to be worth splitting; the dividers below mark the seam.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as Accounts from './accounts.js';
import { data, touch, available } from './store.js';
import { send, fail, readBody, originOk, currentUser, requireUser } from './plumbing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS = path.join(__dirname, 'views');

// Behind a login, so out of public/ — anything in there is served to anybody
// who asks for it by name.
const readView = (name) => fs.readFileSync(path.join(VIEWS, name), 'utf8');
const views = {
  app: readView('polls.html'),
  door: readView('polls-door.html'),
  closed: readView('polls-closed.html'),
};

export const isOpen = () => available();

// --- what a question may be ------------------------------------------------

export const QUESTION_MAX = 140;
export const OPTION_MAX = 60;
export const OPTIONS_MIN = 2;
export const OPTIONS_MAX = 6;
// Enough for anybody with something to ask, few enough that one member cannot
// be the whole board.
export const POLLS_PER_USER = 20;

// A question is one line. Control characters have no business in it, and
// neither has a newline: a poll that is three paragraphs tall is an essay
// with buttons underneath.
function clean(s, max) {
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanOptions(input) {
  const raw = Array.isArray(input) ? input : String(input || '').split('\n');
  const out = [];
  const seen = new Set();
  for (const one of raw) {
    const text = clean(one, OPTION_MAX);
    if (!text) continue;
    // Two answers that differ only in capitals are one answer as far as
    // anybody reading the list is concerned.
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= OPTIONS_MAX) break;
  }
  return out;
}

const newId = () => crypto.randomBytes(9).toString('base64url');

// --- looking them up -------------------------------------------------------

export const byId = (id) => data().polls[String(id || '')] || null;

export const all = () => Object.values(data().polls);

export const pollsOf = (userId) => all().filter((p) => p.askedBy === userId);

/** How many of somebody else's questions this account has answered. */
export function answeredCount(userId) {
  return all().filter((p) => p.askedBy !== userId && p.votes[userId]).length;
}

/**
 * Whether this account may ask a question. The admin always may — otherwise
 * an empty board is a room nobody can ever unlock.
 */
export function mayAsk(user) {
  if (Accounts.isAdmin(user)) return true;
  return answeredCount(user.id) > 0;
}

function requireMayAsk(user) {
  if (mayAsk(user)) return;
  throw Object.assign(
    new Error("Answer somebody else's question before you ask one of your own."),
    { status: 403 }
  );
}

// --- asking one ------------------------------------------------------------

export function createPoll(user, input) {
  requireMayAsk(user);

  const question = clean(input.question, QUESTION_MAX);
  if (!question) throw Object.assign(new Error('A poll needs a question.'), { status: 400 });
  if (question.length < 5) throw Object.assign(new Error('That question is too short to answer.'), { status: 400 });

  const options = cleanOptions(input.options);
  if (options.length < OPTIONS_MIN) {
    throw Object.assign(new Error(`A poll needs at least ${OPTIONS_MIN} answers to choose between.`), { status: 400 });
  }

  if (pollsOf(user.id).length >= POLLS_PER_USER) {
    throw Object.assign(
      new Error(`You have ${POLLS_PER_USER} questions on the board already. Take one down first.`),
      { status: 400 }
    );
  }

  const poll = {
    id: newId(),
    askedBy: user.id,
    question,
    // An option carries its own id, so a tally cannot be knocked sideways by
    // the order of the list changing underneath it.
    options: options.map((text) => ({ id: newId(), text })),
    votes: {}, // account id -> option id. Never leaves this module.
    created: Date.now(),
  };
  data().polls[poll.id] = poll;
  touch();
  return poll;
}

// --- answering one ---------------------------------------------------------

/**
 * Lay an answer down. It is final: a poll whose numbers can go down as well
 * as up is a poll where the last person to change their mind decides it, and
 * the form says as much before it is sent.
 */
export function answer(user, pollId, optionId) {
  const poll = byId(pollId);
  if (!poll) throw Object.assign(new Error('No such poll.'), { status: 404 });
  if (poll.votes[user.id]) throw Object.assign(new Error('You have already answered that one.'), { status: 400 });
  if (!poll.options.some((o) => o.id === optionId)) {
    throw Object.assign(new Error('That is not one of the answers.'), { status: 400 });
  }
  poll.votes[user.id] = optionId;
  touch();
  return poll;
}

// --- taking one down -------------------------------------------------------

export function deletePoll(user, pollId) {
  const poll = byId(pollId);
  // The same answer for a poll that is not there and one that is not yours:
  // whose question is whose is not worth confirming to somebody guessing.
  if (!poll || (poll.askedBy !== user.id && !Accounts.isAdmin(user))) {
    throw Object.assign(new Error('No such poll.'), { status: 404 });
  }
  delete data().polls[poll.id];
  touch();
}

/**
 * An account has gone. Its questions go with it, and so do its answers to
 * everybody else's — a tally should count the people who are still here.
 * Called from the panel when an account is deleted.
 */
export function forgetUser(userId) {
  if (!available()) return;
  const db = data();
  let touched = false;
  for (const poll of Object.values(db.polls)) {
    if (poll.askedBy === userId) {
      delete db.polls[poll.id];
      touched = true;
    } else if (poll.votes[userId]) {
      delete poll.votes[userId];
      touched = true;
    }
  }
  if (touched) touch();
}

// --- what a member is told -------------------------------------------------

// Who asked it. Looked up live rather than copied onto the poll, so somebody
// changing their display name changes it everywhere they have ever asked.
function askerName(poll) {
  return Accounts.byId(poll.askedBy)?.displayName || 'A departed member';
}

/**
 * A poll as a signed-in browser sees it.
 *
 * The counts are the whole of the care here. `total` is always sent — how
 * many have answered gives nothing away and is what makes a question look
 * worth answering. The per-option numbers are sent only to somebody who has
 * answered it, because the split is the thing that would sway them.
 */
export function publicPoll(poll, viewerId) {
  const yours = poll.votes[viewerId] || null;
  const total = Object.keys(poll.votes).length;
  const tally = {};
  if (yours) {
    for (const o of poll.options) tally[o.id] = 0;
    for (const chosen of Object.values(poll.votes)) if (chosen in tally) tally[chosen] += 1;
  }
  return {
    id: poll.id,
    question: poll.question,
    asked: askerName(poll),
    mine: poll.askedBy === viewerId,
    created: poll.created,
    total,
    yours,
    options: poll.options.map((o) => ({
      id: o.id,
      text: o.text,
      // Null rather than nought, so a page that has not been told cannot
      // draw a bar at zero and pass it off as a result.
      votes: yours ? tally[o.id] : null,
    })),
  };
}

/** Everything on the board, newest first, as this account sees it. */
export function boardFor(user) {
  return all()
    .sort((a, b) => b.created - a.created)
    .map((p) => publicPoll(p, user.id));
}

export function snapshot(user) {
  const answered = answeredCount(user.id);
  return {
    user: Accounts.publicUser(user),
    polls: boardFor(user),
    you: {
      answered,
      asked: pollsOf(user.id).length,
      mayAsk: mayAsk(user),
      // The panel is exempt, and a page that says "answer one first" to the
      // one account that need not would be lying to it.
      exempt: Accounts.isAdmin(user),
    },
    limits: {
      question: QUESTION_MAX,
      option: OPTION_MAX,
      min: OPTIONS_MIN,
      max: OPTIONS_MAX,
      perUser: POLLS_PER_USER,
    },
  };
}

// --- the page --------------------------------------------------------------

function servePage(req, res) {
  const user = currentUser(req);
  const html = user ? views.app : views.door;
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "frame-ancestors 'none'",
    // The door describes the room and is worth having in an index. The board
    // is members' business.
    'X-Robots-Tag': user ? 'noindex, nofollow' : 'index, follow',
  });
  res.end(html);
}

// --- the switchboard -------------------------------------------------------

/**
 * Handle a /polls request. Returns true if it took the request, so the room
 * server knows to stop looking for a file to serve.
 */
export function handle(req, res, url) {
  const pathname = url.pathname;
  const isApi = pathname === '/api/polls' || pathname.startsWith('/api/polls/');
  const isPage = pathname === '/polls' || pathname.startsWith('/polls/');
  if (!isApi && !isPage) return false;

  // Every question and every answer is in the same document the accounts are,
  // so a store that cannot be read closes this room too. Nothing below this
  // line runs while it is shut, which is what keeps it from writing anything.
  if (!available()) {
    if (isApi) {
      send(res, 503, { error: 'The polls room is closed for a moment. Nothing has been lost.' });
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

  if (isPage) {
    // One page, one address. Anything deeper is somebody guessing.
    if (pathname !== '/polls' && pathname !== '/polls/') {
      res.writeHead(302, { Location: '/polls', 'Cache-Control': 'no-store' });
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

  // Percent-encoding off the wire can be malformed, and decoding it then
  // throws. This runs before the promise below catches anything, so an
  // unguarded decode here is an exception with nothing underneath it to land
  // on — which takes the whole process, card game and all.
  let head, a;
  try {
    [head, a] = pathname
      .replace(/^\/api\/polls\/?/, '')
      .split('/')
      .map((s) => decodeURIComponent(s || ''));
  } catch {
    send(res, 400, { error: 'That address will not decode.' });
    return true;
  }
  const method = req.method;

  const done = (promise) => {
    Promise.resolve(promise).catch((err) => {
      if (!res.headersSent) fail(res, err);
    });
  };

  done(
    (async () => {
      const user = requireUser(req);

      if (!head && method === 'GET') return send(res, 200, snapshot(user));
      if (head === 'ask' && method === 'POST') {
        const body = await readBody(req);
        createPoll(user, body);
        return send(res, 200, snapshot(user));
      }
      if (head === 'answer' && a && method === 'POST') {
        const body = await readBody(req);
        answer(user, a, String(body.option || ''));
        return send(res, 200, snapshot(user));
      }
      if (head && a === undefined && method === 'DELETE') {
        deletePoll(user, head);
        return send(res, 200, snapshot(user));
      }

      send(res, 404, { error: 'No such thing.' });
    })()
  );
  return true;
}
