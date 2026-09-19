// ---------------------------------------------------------------------------
// The plumbing every signed-in half of the site shares.
//
// None of this knows what a card is or what a round is. It is the handful of
// things any handler behind a login needs and must get right the same way
// every time: reading a body without letting somebody send a gigabyte,
// opening the cookie jar, writing the session cookie with the right flags
// behind a proxy, working out who is asking, and refusing a form posted from
// somebody else's site.
//
// It lived inside flashcards.js when the flashcards were the only thing
// behind a door. The front hall needs every line of it, and two copies of a
// cookie flag is exactly how one of them ends up wrong.
// ---------------------------------------------------------------------------

import * as Accounts from './accounts.js';
import * as Store from './store.js';

export const BODY_MAX = 64 * 1024; // no legitimate request here is anywhere near this

// --- answering -------------------------------------------------------------

export function send(res, status, body, headers = {}) {
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

export const fail = (res, err) =>
  send(res, err.status || 500, { error: err.status ? err.message : 'Something went wrong.' });

export function readBody(req) {
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

// --- cookies ---------------------------------------------------------------

export function cookies(req) {
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

export function sessionCookie(req, token, maxAge) {
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

/** How long a new session is remembered for: a month of not being asked again. */
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

// --- who is asking ---------------------------------------------------------

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
export function clientIp(req) {
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
export function originOk(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/**
 * The account behind a request, or null. Everything on the site that needs a
 * name goes through here, including the WebSocket handshake — which is an
 * ordinary HTTP request carrying the same cookie.
 */
export function currentUser(req) {
  // A session is only a session because the document says so, and the
  // document can be out of reach. Nobody is signed in while it is: the pages
  // that matter say so in words before they ever get here, and the ones that
  // do not must fall back to treating the visitor as a stranger rather than
  // throwing out of a cookie check.
  if (!Store.available()) return null;
  return Accounts.userForToken(cookies(req)[Accounts.SESSION_COOKIE]);
}

export function requireUser(req) {
  const user = currentUser(req);
  if (!user) throw Object.assign(new Error('Sign in first.'), { status: 401 });
  return user;
}

export function requireAdmin(req) {
  const user = requireUser(req);
  // Deliberately the same reply an ordinary member gets for a route that does
  // not exist. The panel does not announce itself.
  if (!Accounts.isAdmin(user)) throw Object.assign(new Error('Not found.'), { status: 404 });
  return user;
}
