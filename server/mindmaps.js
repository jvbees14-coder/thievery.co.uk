// ---------------------------------------------------------------------------
// /mindmaps — a member's mind maps.
//
// The flashcards room's shape rather than the battle room's: behind the
// login, a JSON API and no socket, because nothing here is happening to
// several people at once. The maps themselves are `maps.js`; this is the page,
// the door and the switchboard.
//
// Everything is drawn and exported in the browser. The server never renders
// a map, so it has nothing to do with PNGs or printing and needs nothing new
// in package.json to stay that way.
//
// The room needs the ledger for the login and for the maps, so it shuts with
// it: while the store is out of reach the page and every route answer 503 and
// nothing below that check can write.
// ---------------------------------------------------------------------------

import * as Accounts from './accounts.js';
import * as Maps from './maps.js';
import { available } from './store.js';
import { send, fail, readBody, originOk, currentUser, requireUser } from './plumbing.js';
import { readView } from './views.js';

// Behind a login, so out of public/.
const views = {
  app: readView('mindmaps.html'),
  door: readView('mindmaps-door.html'),
  closed: readView('mindmaps-closed.html'),
};

export const isOpen = () => available();

const limits = { maps: Maps.PER_USER, nodes: Maps.NODES_MAX, text: Maps.TEXT_MAX, colours: Maps.COLOURS };

// --- the routes -----------------------------------------------------------------

function list(req, res) {
  const user = requireUser(req);
  const you = Accounts.publicUser(user);
  send(res, 200, {
    you: { name: you.displayName || you.username, admin: you.admin },
    maps: Maps.listFor(user.id),
    limits,
  });
}

async function create(req, res) {
  const user = requireUser(req);
  const body = await readBody(req);
  // A map named in `from` is copied rather than a new one started.
  const map = body.from ? Maps.duplicate(user, body.from) : Maps.create(user, body.text);
  send(res, 200, { map });
}

function one(req, res, id) {
  const user = requireUser(req);
  send(res, 200, { map: Maps.own(user.id, id), limits });
}

async function save(req, res, id) {
  const user = requireUser(req);
  const body = await readBody(req);
  const map = Maps.save(user, id, body);
  // The tree comes back as stored, because `clean` may have dropped an empty
  // bubble the page was still holding.
  send(res, 200, { rev: map.rev, updated: map.updated, nodes: map.nodes });
}

function remove(req, res, id) {
  const user = requireUser(req);
  Maps.remove(user, id);
  send(res, 200, { maps: Maps.listFor(user.id) });
}

// --- the page -------------------------------------------------------------------

function servePage(req, res) {
  const user = currentUser(req);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "frame-ancestors 'none'",
    // The door is worth having in an index; somebody's maps are not.
    'X-Robots-Tag': user ? 'noindex, nofollow' : 'index, follow',
  });
  res.end(user ? views.app : views.door);
}

// --- the switchboard ------------------------------------------------------------

/** Handle a /mindmaps request. Returns true if it took it. */
export function handle(req, res, url) {
  const pathname = url.pathname;
  const isApi = pathname === '/api/mindmaps' || pathname.startsWith('/api/mindmaps/');
  const isPage = pathname === '/mindmaps' || pathname.startsWith('/mindmaps/');
  if (!isApi && !isPage) return false;

  if (!available()) {
    if (isApi) {
      send(res, 503, { error: 'Mind maps are closed for a moment. Nothing has been lost.' });
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
    // One page, one address; which map is open is the hash, which never
    // reaches the server.
    if (pathname !== '/mindmaps' && pathname !== '/mindmaps/') {
      res.writeHead(302, { Location: '/mindmaps', 'Cache-Control': 'no-store' });
      res.end();
      return true;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
      res.end('Method not allowed');
      return true;
    }
    servePage(req, res);
    return true;
  }

  if (req.method !== 'GET' && !originOk(req)) {
    send(res, 403, { error: 'That request came from somewhere else.' });
    return true;
  }

  const route = pathname.replace(/^[/]api[/]mindmaps[/]?/, '');
  // A malformed escape throws, and this runs before anything below can catch
  // it; unguarded, it would take the whole process down with it.
  let head, a, rest;
  try {
    [head, a, ...rest] = route.split('/').map((s) => decodeURIComponent(s || ''));
  } catch {
    send(res, 400, { error: 'That address will not decode.' });
    return true;
  }
  const method = req.method;

  Promise.resolve()
    .then(() => {
      if (head === 'maps' && !a && method === 'GET') return list(req, res);
      if (head === 'maps' && !a && method === 'POST') return create(req, res);
      if (head === 'maps' && a && !rest.length && method === 'GET') return one(req, res, a);
      if (head === 'maps' && a && !rest.length && method === 'POST') return save(req, res, a);
      if (head === 'maps' && a && !rest.length && method === 'DELETE') return remove(req, res, a);
      send(res, 404, { error: 'Not found.' });
    })
    .catch((err) => {
      if (!res.headersSent) fail(res, err);
    });
  return true;
}
