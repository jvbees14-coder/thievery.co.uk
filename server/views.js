// ---------------------------------------------------------------------------
// The pages, as they leave the building.
//
// Every page behind a room is a file in server/views/, and every one of them
// used to carry its own copy of the bar along the top. They drifted: each room
// linked to a different handful of the others, and each had its own wordmark.
// So the bar and the foot are written once, here, and a view asks for them by
// name:
//
//   {{bar:flashcards}}   the bar, with that room marked as the one you are in
//   {{bar:public}}       the bar without an account menu, for pages anybody sees
//   {{foot}}             the links along the bottom of every page
//   {{contact}}          the contact address as a mailto link
//
// The other thing done here is taking the comments out. The views are
// annotated for whoever maintains them, and none of that is for the visitor,
// who can read every word of it with "view source".
//
// Nothing here reads the store, so the pages it builds are the same whether
// or not the ledger is within reach.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const VIEWS = path.join(__dirname, 'views');

// The rooms the bar links to, in the order it lists them. The card table is
// "Play Thievery" rather than "Thievery" because the wordmark beside it is
// already the site's name, and two links reading the same word went to two
// different places.
const ROOMS = [
  { id: 'cards', href: '/cards', name: 'Play Thievery' },
  { id: 'flashcards', href: '/flashcards', name: 'Flashcards' },
  { id: 'battle', href: '/battle', name: 'Battle' },
  { id: 'switchhead', href: '/switchhead', name: 'Switchhead' },
];

export function bar(current = '', { signedIn = true } = {}) {
  const links = ROOMS.map(
    (r) =>
      `<a class="menu-nav-link" id="nav-${r.id}" href="${r.href}"${r.id === current ? ' aria-current="page"' : ''}>${r.name}</a>`
  ).join('\n      ');
  // Settings live in one place, the hall's account panel, whichever room
  // the bar is drawn in.
  const account = '<a href="/#account">Account settings</a>';
  if (!signedIn) {
    return `<header class="fc-bar">
    <a class="fc-mark wordmark" href="/">Thievery<em>.co.uk</em></a>
    <nav class="menu-nav" aria-label="Rooms">
      ${links}
    </nav>
  </header>`;
  }
  return `<header class="fc-bar">
    <a class="fc-mark wordmark" href="/">Thievery<em>.co.uk</em></a>
    <nav class="menu-nav" aria-label="Rooms">
      ${links}
      <a class="menu-nav-link" id="nav-members" href="/#members" hidden>Members</a>
    </nav>
    <div class="fc-who">
      <button id="who" class="fc-who-btn" type="button" aria-haspopup="true" aria-expanded="false"></button>
      <div id="who-menu" class="fc-menu" hidden>
        ${account}
        <a href="/#stats">Your stats</a>
        <a href="/#members" id="who-members" hidden>Members</a>
        <button data-motion-toggle type="button">Banner animations <span class="motion-state"></span></button>
        <button data-act="signout" type="button">Sign out</button>
      </div>
    </div>
  </header>`;
}

export const FOOT = `<footer class="site-foot">
    <nav aria-label="About this site">
      <a href="/about">About</a>
      <a href="/privacy">Privacy</a>
      <a href="/about#credits">Credits</a>
    </nav>
    <p>&copy; ${new Date().getFullYear()} Thievery.co.uk</p>
  </footer>`;

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

/** A view with its bar and foot put in and its comments taken out. */
export function render(html) {
  let out = html.split('{{foot}}').join(FOOT).split('{{contact}}').join(contact());
  out = out.split('{{bar:public}}').join(bar('', { signedIn: false }));
  for (const current of ['', ...ROOMS.map((r) => r.id), 'home']) {
    out = out.split(`{{bar:${current || 'none'}}}`).join(bar(current));
  }
  return strip(out);
}

export function readView(name) {
  return render(fs.readFileSync(path.join(VIEWS, name), 'utf8'));
}
