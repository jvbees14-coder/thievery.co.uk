// ---------------------------------------------------------------------------
// The pages, as they leave the building.
//
// Every page behind a room is a file in server/views/, and every one of them
// used to carry its own copy of the bar along the top. They drifted: each room
// linked to a different handful of the others, and each had its own wordmark.
// So the shared pieces are written once, here, and a view asks for them by
// name:
//
//   {{head:flashcards,menu}}  the shared <head>: icons, the one webfont, the
//                             tokens, the base stylesheets, then the room's
//                             own sheets named after the colon, then prefs.js
//   {{bar:flashcards}}        the bar, with that room marked as the one you
//                             are in. On a phone its links become the tab bar
//                             along the bottom of the screen.
//   {{bar:public}}            the bar without an account menu, for pages
//                             anybody sees; {{bar:public:cards}} marks a room
//   {{foot}}                  the links along the bottom of every page
//   {{contact}}               the contact address as a mailto link
//   {{icon:cards}}            one of the room icons, inline
//
// Two other things are done on the way out. The comments are taken out: the
// views are annotated for whoever maintains them, and none of that is for the
// visitor, who can read every word of it with "view source". And every local
// stylesheet, script and image the page names is given a ?v= of its own
// contents, so the static block in index.js can tell a browser to keep it for
// a year: a file that changes gets a new address, and nobody is left holding
// last month's stylesheet.
//
// Nothing here reads the store, so the pages it builds are the same whether
// or not the ledger is within reach.
// ---------------------------------------------------------------------------

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const VIEWS = path.join(__dirname, 'views');
const PUBLIC = path.join(__dirname, '..', 'public');

// --- the icons --------------------------------------------------------------

// One set, drawn on a 24-unit grid with a round 1.75 stroke, so every icon on
// the site has the same weight. They are inline so they take the colour of
// whatever they sit in and cost no request.
export const ICONS = {
  cards: '<rect x="3.5" y="5" width="9.5" height="14" rx="1.5" transform="rotate(-10 8.25 12)"/><rect x="11" y="4.5" width="9.5" height="14" rx="1.5" transform="rotate(8 15.75 11.5)"/><path d="M15.7 9.4l1.8 2.2-1.8 2.2-1.8-2.2z"/>',
  flashcards: '<rect x="3" y="7" width="15" height="11" rx="1.5"/><path d="M6 4.5h13.5A1.5 1.5 0 0 1 21 6v9"/><path d="M6 11h9M6 14h6"/>',
  battle: '<path d="M4.5 4.5l9 9M4.5 4.5h3.5M4.5 4.5V8"/><path d="M19.5 4.5l-9 9M19.5 4.5H16M19.5 4.5V8"/><path d="M8 16l-3 3M16 16l3 3M6.5 14.5l3 3M17.5 14.5l-3 3"/>',
  switchhead: '<path d="M4.5 8.5h14l-3-3M19.5 15.5h-14l3 3"/>',
  mindmaps: '<circle cx="12" cy="12" r="3"/><circle cx="4.5" cy="6" r="2"/><circle cx="19.5" cy="6.5" r="2"/><circle cx="18" cy="18.5" r="2"/><path d="M9.5 10.5L6 7.2M14.7 10.8l3.2-2.8M14.1 14.4l2.6 2.8"/>',
  stats: '<path d="M4.5 19.5h15M7 19.5V12M12 19.5V6.5M17 19.5V10"/>',
  account: '<circle cx="12" cy="9" r="3.75"/><path d="M5.5 19.5c1.1-3.75 3.75-5.25 6.5-5.25s5.4 1.5 6.5 5.25"/>',
  members: '<circle cx="9" cy="9" r="3"/><circle cx="16.5" cy="10" r="2.25"/><path d="M3 19c.75-3 3-4.5 6-4.5s5.25 1.5 6 4.5M15 14.25c2.25 0 4.5 1.1 5.25 3.75"/>',
  tools: '<path d="M14.5 5.5a4 4 0 0 0-5 5L4 16l4 4 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M8 14h8"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.6v.3M12 17h.01"/>',
};

export function icon(name, cls = 'icon') {
  const body = ICONS[name];
  if (!body) return '';
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
}

// --- the rooms --------------------------------------------------------------

// The rooms the bar links to, in the order it lists them. Five, and no more:
// on a phone they are the tab bar, and a sixth would be a "More". The long
// name is for a wide screen and the short one for a tab, which has room for
// one word under its icon.
const ROOMS = [
  { id: 'cards', href: '/cards', name: 'Play Thievery', short: 'Play' },
  { id: 'flashcards', href: '/flashcards', name: 'Flashcards', short: 'Flashcards' },
  { id: 'battle', href: '/battle', name: 'Battle', short: 'Battle' },
  { id: 'switchhead', href: '/switchhead', name: 'Switchhead', short: 'Switchhead' },
  { id: 'mindmaps', href: '/mindmaps', name: 'Mind maps', short: 'Maps' },
];

export function bar(current = '', { signedIn = true } = {}) {
  const links = ROOMS.map((r) => {
    const here = r.id === current ? ' aria-current="page"' : '';
    const label =
      r.name === r.short
        ? `<span>${r.name}</span>`
        : `<span class="when-wide">${r.name}</span><span class="when-narrow">${r.short}</span>`;
    return `<a class="menu-nav-link" id="nav-${r.id}" href="${r.href}"${here}>${icon(r.id)}${label}</a>`;
  }).join('\n      ');
  const skip = '<a class="skip-link" href="#main">Skip to content</a>';
  const mark = '<a class="site-mark wordmark" href="/">Thievery<em>.co.uk</em></a>';
  const nav = `<nav class="menu-nav" aria-label="Rooms">
      ${links}
    </nav>`;
  if (!signedIn) {
    return `${skip}
  <header class="site-bar">
    ${mark}
    ${nav}
  </header>`;
  }
  return `${skip}
  <header class="site-bar">
    ${mark}
    ${nav}
    <div class="site-who">
      <button id="who" class="site-who-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="who-menu" aria-label="Account"></button>
      <div id="who-menu" class="site-menu" role="menu" hidden>
        <a href="/#account" role="menuitem">Account settings</a>
        <a href="/#stats" role="menuitem">Stats</a>
        <a href="/#members" id="who-members" role="menuitem" hidden>Members</a>
        <hr />
        <button data-motion-toggle type="button" role="menuitemcheckbox">Banner animations <span class="motion-state"></span></button>
        <button data-act="signout" type="button" role="menuitem">Sign out</button>
      </div>
    </div>
  </header>`;
}

// The last line changes on every page load, from a short list. It is the one
// joke on a page that is otherwise all business, and it sits where it cannot
// get in the way of anything.
const ASIDES = [
  'No cards were harmed. Several were stolen.',
  'Everything here is free. Taking it is the whole point.',
  'Please return all hands to their owners by the end of the round.',
  'Made in Britain, pocketed everywhere.',
  'Cards, flashcards and nothing else of value.',
];

export function foot() {
  const aside = ASIDES[Math.floor(Math.random() * ASIDES.length)];
  return `<footer class="site-foot">
    <p class="site-foot-line">Free card games, flashcards and small tools. No adverts, no charges.</p>
    <nav aria-label="About this site">
      <a href="/about">About</a>
      <a href="/privacy">Privacy</a>
      <a href="/tools">Tools</a>
      <a href="/about#credits">Credits</a>
      <a href="https://github.com/jvbees14-coder/thievery.co.uk" rel="noopener">GitHub</a>
    </nav>
    <p class="site-foot-aside">${aside}</p>
    <p class="site-foot-small">&copy; ${new Date().getFullYear()} Thievery.co.uk</p>
  </footer>`;
}

// --- the head ------------------------------------------------------------------

// Everything a page needs before its first paint, in the order it needs it.
// The tokens come before every other sheet because every other sheet is
// written in them; the room's own sheets come after the base, so a room can
// override it; prefs.js comes last, without defer, so its attributes are on
// <html> before anything is drawn.
export function head(rooms = []) {
  const sheets = ['fonts', 'tokens', 'style', 'shell', ...rooms];
  return [
    '<meta name="color-scheme" content="dark light" />',
    '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0a0c14" />',
    '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f5efe2" />',
    '<link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />',
    '<link rel="apple-touch-icon" href="/icons/icon-180.png" />',
    '<link rel="manifest" href="/site.webmanifest" />',
    '<link rel="preload" href="/fonts/limelight-400-latin.woff2" as="font" type="font/woff2" crossorigin />',
    ...sheets.map((s) => `<link rel="stylesheet" href="/${s}.css" />`),
    '<script src="/prefs.js"></script>',
    '<script src="/shell.js" defer></script>',
  ].join('\n  ');
}

// --- the address of an asset --------------------------------------------------

// Each file's version is a hash of what is in it, remembered against its
// modification time so a busy page is not re-reading every stylesheet on every
// request, and so a file edited while the server runs still gets a new address.
const versions = new Map();

function versionOf(rel) {
  const abs = path.join(PUBLIC, rel);
  if (!abs.startsWith(PUBLIC)) return null;
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    return null;
  }
  const known = versions.get(abs);
  if (known && known.mtime === stat.mtimeMs) return known.v;
  const v = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex').slice(0, 10);
  versions.set(abs, { mtime: stat.mtimeMs, v });
  return v;
}

const ASSET_RE = /(href|src)="\/([\w./-]+\.(?:css|js|png|svg|woff2|webmanifest))"/g;

export function versioned(html) {
  return html.replace(ASSET_RE, (whole, attr, rel) => {
    const v = versionOf(rel);
    return v ? `${attr}="/${rel}?v=${v}"` : whole;
  });
}

// --- putting a page together ------------------------------------------------------

// Where people are told to write to: the site's own address, unless the
// environment names another.
const CONTACT_EMAIL = 'admin@thievery.co.uk';
function contact() {
  const email = String(process.env.THIEVERY_CONTACT_EMAIL || CONTACT_EMAIL).trim();
  const safe = email.replace(/[<>"&]/g, '');
  return `<a href="mailto:${safe}">${safe}</a>`;
}

/** Comments out, so the page says only what it means to the visitor. */
export function strip(html) {
  return html.replace(/<!--[^]*?-->/g, '').replace(/(?:[ ]*[\r]?[\n]){3,}/g, '\n\n');
}

/** A view with its shared pieces put in and its comments taken out. */
export function render(html) {
  let out = html.split('{{foot}}').join(foot()).split('{{contact}}').join(contact());
  out = out.replace(/\{\{head(?::([\w,-]*))?\}\}/g, (_, list) => head(list ? list.split(',').filter(Boolean) : []));
  out = out.replace(/\{\{icon:(\w+)\}\}/g, (_, name) => icon(name));
  out = out.replace(/\{\{bar:public(?::(\w+))?\}\}/g, (_, current) => bar(current || '', { signedIn: false }));
  for (const current of ['', ...ROOMS.map((r) => r.id), 'home']) {
    out = out.split(`{{bar:${current || 'none'}}}`).join(bar(current));
  }
  return versioned(strip(out));
}

export function readView(name) {
  return render(fs.readFileSync(path.join(VIEWS, name), 'utf8'));
}
