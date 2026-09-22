// ---------------------------------------------------------------------------
// The front hall — "/" and the card table it now points at.
//
// The site used to be a card table with a second room bolted to the side of
// it, reachable only by knowing the address. It is now a hall with doors off
// it: the table is one of them, at /cards, and the flashcards are another.
//
// Two things about the arrangement are deliberate and easy to undo by
// accident:
//
//   * The hall asks for a name. Everything it lists — what you have won, what
//     you have written, what your account says — belongs to somebody, so a
//     stranger is shown the door instead and never the menu.
//   * The table does not. /cards is open to anybody with a room code, exactly
//     as it always was: no account, no cookie, nothing kept. Signing in only
//     means the rounds you play are added up afterwards. Putting a login in
//     front of the table would break every link anybody has ever passed
//     round, and the game was never the thing that needed one.
//
// So this module answers for four shapes of address, and the store being out
// of reach closes only the first:
//
//   /            the menu, or the door, or a note saying the hall is shut
//   /cards…      the card game, whatever the store is doing
//   /logic…      where the game lived for a day; sent on to /cards
//   /api/site/…  the door, the menu's figures, and the members panel
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Accounts from './accounts.js';
import * as Cards from './cards.js';
import * as Door from './door.js';
import * as Stats from './stats.js';
import * as Store from './store.js';
import * as Flashcards from './flashcards.js';
import * as Battle from './battle.js';
import * as Switchhead from './switchhead.js';
import * as Daily from './daily.js';
import * as Decks from './decks.js';
import { send, fail, originOk, currentUser, requireUser } from './plumbing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS = path.join(__dirname, 'views');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// The menu is kept out of public/ for the same reason the flashcards room is:
// anything in there is served to anybody who asks for it by name, and a page
// listing what one member has won is not a page to leave lying in the open.
// The game page is the opposite and lives in public/ where it always has.
const readView = (name) => fs.readFileSync(path.join(VIEWS, name), 'utf8');
const views = {
  menu: readView('menu.html'),
  door: readView('menu-door.html'),
  closed: readView('menu-closed.html'),
};

// --- the card table --------------------------------------------------------

// A room code is four characters from an alphabet that holds nothing anybody
// could misread. The server picks them; this only has to recognise one in an
// address, and it is deliberately case-blind because people type links out by
// hand and rarely hold the shift key while they do it.
export const ROOM_CODE_RE = /^[A-Za-z0-9]{4}$/;

// The one page the game is played on. Read on every request rather than held
// in memory: a room code in the address bar has to reach today's markup, and
// this is exactly what the catch-all it replaces used to do.
function serveGame(req, res, isRoom) {
  fs.readFile(path.join(PUBLIC_DIR, 'cards.html'), (err, html) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Referrer-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "frame-ancestors 'none'",
      // /cards is the page worth indexing. A room code is not: every room is
      // the same markup and the code stops working within the hour.
      ...(isRoom ? { 'X-Robots-Tag': 'noindex, follow' } : {}),
    });
    res.end(html);
  });
}

const redirect = (res, to, status = 302) => {
  res.writeHead(status, { Location: to, 'Cache-Control': 'no-store' });
  res.end();
};

// --- what the menu is told -------------------------------------------------

// The battle record keeps its per-deck rows by id, because an id is what does
// not change. The page wants names, and wants them best first, so they are
// put together here — along with the one figure the rows are for, which deck
// somebody is best at. A deck needs a few cards behind it before it can be
// anybody's best: one lucky answer is not a subject.
const BEST_DECK_MIN_CARDS = 5;

function battleDecks(rows = {}) {
  const names = new Map(Decks.catalog().map((d) => [d.id, d.name]));
  const list = Object.entries(rows)
    .map(([id, r]) => ({
      id,
      name: id === 'mine' ? 'Your own flashcards' : names.get(id) || 'A deck no longer in the house',
      matches: r.matches,
      cards: r.cards,
      average: r.cards ? r.points / r.cards : 0,
    }))
    .sort((a, b) => b.cards - a.cards);
  const ranked = list.filter((d) => d.cards >= BEST_DECK_MIN_CARDS).sort((a, b) => b.average - a.average);
  return { decks: list, bestDeck: ranked[0] || null, bestDeckMin: BEST_DECK_MIN_CARDS };
}

function snapshot(user) {
  const cards = Cards.cardsOf(user.id);
  const play = Stats.forUser(user.id);
  return {
    user: Accounts.publicUser(user),
    play,
    // Enough of the collection for a tile to say something true about it.
    // The cards themselves are the flashcards room's business.
    collection: {
      count: cards.length,
      worth: cards.reduce((n, c) => n + c.value, 0),
      limit: Cards.CARDS_PER_USER,
    },
    // Enough of the battle room for a tile to say something true about it.
    // `owned` is the collection, not the record: it is what decides whether a
    // battle on your own cards is open to you at all, so the menu can say
    // which of the two kinds you are ready for rather than sending you to a
    // lobby to find out. It is deliberately not called `cards` — the record
    // already has a `cards`, meaning how many you have answered, and one
    // field standing for both figures is a tile that lies about one of them.
    battle: {
      ...play.battle,
      ...battleDecks(play.battle.decks),
      owned: cards.length,
      rooms: Battle.openRooms(),
      // Today's ten, and how this account stands on them.
      daily: Daily.forUser(user.id),
    },
    // Switchhead's record, and how many rooms are open, for its tile.
    switchhead: { ...play.switchhead, rooms: Switchhead.openRooms() },
    // A tile that leads somewhere shut should say so before it is pressed.
    rooms: { flashcards: Flashcards.isOpen(), battle: Battle.isOpen(), switchhead: Switchhead.isOpen() },
  };
}

// --- the page --------------------------------------------------------------

function servePage(req, res) {
  const user = currentUser(req);
  const html = user ? views.menu : views.door;
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "frame-ancestors 'none'",
    // The door describes the site and is worth having in an index. A menu
    // with somebody's figures on it is not.
    'X-Robots-Tag': user ? 'noindex, nofollow' : 'index, follow',
  });
  res.end(html);
}

// The hall cannot ask for a name it has no way of checking. Rather than let
// everybody in or nobody, it says what has happened and points at the one
// part of the site that never needed the ledger in the first place.
function serveClosed(req, res) {
  res.writeHead(503, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Retry-After': '120',
    'X-Robots-Tag': 'noindex, nofollow',
  });
  res.end(views.closed);
}

// --- the switchboard -------------------------------------------------------

/**
 * Handle a request for the hall or the table. Returns true if it took the
 * request, so the room server knows to stop looking for a file to serve.
 *
 * Called before the static block, which serves anything in public/ by name —
 * so /cards must be decided here, or the game page would be reachable at two
 * addresses and only one of them would know about room codes.
 */
export function handle(req, res, url) {
  const pathname = url.pathname;
  const isApi = pathname === '/api/site' || pathname.startsWith('/api/site/');
  const isHall = pathname === '/' || pathname === '';
  const isGame = pathname === '/cards' || pathname.startsWith('/cards/');
  // The game answered at /logic for a day before it was named properly, and
  // room links were shared in that day. Whatever shape they were, the tail is
  // the same on both sides, so the whole of it is handed straight over and
  // the block below decides whether it was a room code.
  const wasGame = pathname === '/logic' || pathname.startsWith('/logic/');
  if (!isApi && !isHall && !isGame && !wasGame) return false;

  const method = req.method;

  if (wasGame) {
    redirect(res, `/cards${pathname.slice('/logic'.length)}`, 301);
    return true;
  }

  // --- the table, first, because none of it depends on the ledger
  if (isGame) {
    if (method !== 'GET' && method !== 'HEAD') {
      send(res, 405, { error: 'Method not allowed.' });
      return true;
    }
    const rest = pathname.slice('/cards'.length).replace(/^\/+/, '');
    if (!rest) {
      serveGame(req, res, false);
      return true;
    }
    // One extra segment, and only if it could be a room code. Anything else
    // under here is somebody guessing, and is sent back to the table rather
    // than served a page that will ignore the address it arrived at.
    if (rest.includes('/') || !ROOM_CODE_RE.test(rest)) {
      redirect(res, '/cards');
      return true;
    }
    serveGame(req, res, true);
    return true;
  }

  // --- the hall
  if (!Store.available()) {
    if (isApi) send(res, 503, { error: 'The house cannot reach its ledger. Nothing has been lost.' });
    else serveClosed(req, res);
    return true;
  }

  if (isHall) {
    if (method !== 'GET' && method !== 'HEAD') {
      send(res, 405, { error: 'Method not allowed.' });
      return true;
    }
    // A link shared before the game moved: /?code=ABCD. Sent on rather than
    // dropped, because somebody is holding that link and expects a table.
    const code = url.searchParams.get('code');
    if (code && ROOM_CODE_RE.test(code)) {
      redirect(res, `/cards/${code.toUpperCase()}`, 301);
      return true;
    }
    servePage(req, res);
    return true;
  }

  if (method !== 'GET' && !originOk(req)) {
    send(res, 403, { error: 'That request came from somewhere else.' });
    return true;
  }

  const done = (promise) => {
    Promise.resolve(promise).catch((err) => {
      if (!res.headersSent) fail(res, err);
    });
  };

  // Percent-encoding off the wire can be malformed, and decoding it then
  // throws. This runs before the promise below catches anything, so an
  // unguarded decode here is an exception with nothing underneath it to land
  // on — which takes the whole process, card game and all.
  let head, a, b;
  try {
    [head, a, b] = pathname
      .replace(/^\/api\/site\/?/, '')
      .split('/')
      .map((s) => decodeURIComponent(s || ''));
  } catch {
    send(res, 400, { error: 'That address will not decode.' });
    return true;
  }

  done(
    (async () => {
      if (head === 'register' && method === 'POST') return Door.register(req, res, snapshot);
      if (head === 'login' && method === 'POST') return Door.login(req, res, snapshot);
      if (head === 'logout' && method === 'POST') return Door.logout(req, res);
      if (head === 'account' && method === 'POST') return Door.account(req, res, snapshot);
      if (head === 'me' && method === 'GET') return send(res, 200, snapshot(requireUser(req)));

      // The members panel. Accounts belong to the whole site rather than to
      // the flashcards room, so the admin can reach them from the hall; the
      // handlers are the flashcards panel's own, and answer 404 to anybody
      // who is not the admin, exactly as they do there.
      if (head === 'admin' && a === 'users') {
        if (!b && method === 'GET') return Flashcards.adminOverview(req, res);
        if (b && method === 'GET') return Flashcards.adminUser(req, res, b);
        if (b && method === 'POST') return Flashcards.adminPatchUser(req, res, b);
        if (b && method === 'DELETE') return Flashcards.adminDeleteUser(req, res, b);
      }
      send(res, 404, { error: 'No such thing.' });
    })()
  );
  return true;
}
