// ---------------------------------------------------------------------------
// Tools: the small utilities, and the index of them at /tools.
//
// A tool is one page with one job, and the joke, if there is one, lives in
// what it tells you rather than in its buttons. Every tool page is a view in
// server/views/tools/, built on the layout in server/views/tools/_layout.html,
// and is listed here. Nothing that is not listed here is served, so a
// half-made tool in the folder is not a live page by accident.
//
// The rooms that behave like tools (flashcards, the quiz, mind maps) are on
// the index too, with their own addresses; they are not moved under /tools,
// because every link to them ever shared would break.
//
// docs/ADDING_A_TOOL.md is the walk-through.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { VIEWS, render, icon } from './views.js';

// What the index shows, in the order it shows it. `view` is a file in
// server/views/tools/ and makes the tool live at /tools/<slug>; `href` points
// at a room that already has an address of its own. `login` says whether the
// page asks for an account, which the index says on the card rather than
// letting somebody find out at the door.
export const TOOLS = [
  {
    slug: 'flashcards',
    href: '/flashcards',
    icon: 'flashcards',
    name: 'Flashcards',
    blurb: 'Write cards, get a rarity for each one, print them or trade them.',
    login: true,
  },
  {
    slug: 'battle',
    href: '/battle',
    icon: 'battle',
    name: 'Battle',
    blurb: 'Type the back of a card and get a mark out of 100. Alone or against friends.',
    login: true,
  },
  {
    slug: 'mindmaps',
    href: '/mindmaps',
    icon: 'mindmaps',
    name: 'Mind maps',
    blurb: 'One idea in the middle and everything branching off it. Export as a picture.',
    login: true,
  },
];

const TOOL_VIEWS = path.join(VIEWS, 'tools');

function card(t) {
  const href = t.href || `/tools/${t.slug}`;
  const note = t.login ? '<span class="tool-card-note">Needs an account</span>' : '<span class="tool-card-note">No sign-up</span>';
  return `<li>
        <a class="tool-card" href="${href}">
          ${icon(t.icon, 'icon tool-card-icon')}
          <span class="tool-card-name">${t.name}</span>
          <span class="tool-card-blurb">${t.blurb}</span>
          ${note}
        </a>
      </li>`;
}

/** The index page, built from the list above. */
export function indexPage() {
  const html = fs.readFileSync(path.join(VIEWS, 'tools.html'), 'utf8');
  return render(html.split('{{tools}}').join(TOOLS.map(card).join('\n      ')));
}

/** One tool's page, or null if there is no such live tool. */
const pages = new Map();
export function toolPage(slug) {
  const t = TOOLS.find((x) => x.slug === slug && x.view);
  if (!t) return null;
  if (!pages.has(slug)) pages.set(slug, render(fs.readFileSync(path.join(TOOL_VIEWS, t.view), 'utf8')));
  return pages.get(slug);
}
