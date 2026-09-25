// ---------------------------------------------------------------------------
// A member's mind maps.
//
// A map is a tree of bubbles: one in the middle, and branches off it to any
// depth. It is kept under `maps` in the stored document, one entry per map,
// and the page sends the whole tree back every time it saves. That is simpler
// than a message per bubble and cheap at the sizes allowed here, and it means
// there is exactly one place the shape of a map is checked: `clean`.
//
// Every bubble carries its own position. The page places a new branch where
// it finds room and never moves the others, so a bubble somebody dragged
// stays where they left it; all the server does is refuse a position that is
// not a number and pull one that is absurd back inside the sheet.
//
// --- two tabs on one map --------------------------------------------------
//
// Every save names the revision it was made from, and a save made from an
// old one is refused rather than laid over the top. The alternative is the
// second tab quietly throwing away whatever the first one did, which is the
// same loss as the never-overwrite rule on a smaller scale.
//
// --- what else a bubble may carry -----------------------------------------
//
// Two things, both optional, so a map saved before either existed reads
// exactly as it did. `folded` is a bubble whose branches are tucked away on
// the page; it is kept only when it is `true`. `colour` is one of the six
// branch colours, by number, and is kept only on a branch of the middle,
// because everything further out takes its colour from the branch it is on.
// Anything else a page sends is dropped without a word.
// ---------------------------------------------------------------------------

import crypto from 'node:crypto';
import { data, touch } from './store.js';

export const PER_USER = 50;
export const NODES_MAX = 250;
export const TEXT_MAX = 80;
export const REACH = 20_000;
export const COLOURS = 6;
export const PREVIEW_MAX = 60;

const ID_RE = /^[A-Za-z0-9_-]{1,16}$/;

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

const all = () => data().maps;

function cleanText(text) {
  // Line breaks are kept (a bubble may run to a few lines), and every other
  // run of whitespace is one space.
  const s = String(text ?? '')
    .split(/[\r]?[\n]/)
    .map((line) => line.replace(/[\s]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  if (s.length > TEXT_MAX) throw fail(`A bubble can hold up to ${TEXT_MAX} characters.`);
  return s;
}

function cleanCoord(v) {
  const n = Number(v);
  if (typeof v !== 'number' || !Number.isFinite(n)) throw fail('A bubble has a position that is not a number.');
  return Math.max(-REACH, Math.min(REACH, Math.round(n * 10) / 10));
}

/**
 * The tree as it will be stored, or an error saying what is wrong with it.
 * One root; every parent present; no loops; no bubble left empty, except the
 * one in the middle, which is refused instead.
 */
export function clean(nodes) {
  if (!Array.isArray(nodes) || !nodes.length) throw fail('A map needs a bubble in the middle.');
  if (nodes.length > NODES_MAX) throw fail(`A map can have up to ${NODES_MAX} bubbles.`);

  const byId = new Map();
  for (const raw of nodes) {
    if (!raw || typeof raw !== 'object') throw fail('That map will not read.');
    const id = String(raw.id ?? '');
    if (!ID_RE.test(id)) throw fail('That map will not read.');
    if (byId.has(id)) throw fail('Two bubbles have the same id.');
    const parentId = raw.parentId == null || raw.parentId === '' ? null : String(raw.parentId);
    const node = { id, parentId, text: cleanText(raw.text), x: cleanCoord(raw.x), y: cleanCoord(raw.y) };
    if (raw.folded === true) node.folded = true;
    if (Number.isInteger(raw.colour) && raw.colour >= 0 && raw.colour < COLOURS) node.colour = raw.colour;
    byId.set(id, node);
  }

  const roots = [...byId.values()].filter((n) => n.parentId === null);
  if (roots.length !== 1) throw fail('A map has exactly one bubble in the middle.');
  const root = roots[0];
  if (!root.text) throw fail('The bubble in the middle needs some words.');
  for (const n of byId.values()) {
    if (n.colour !== undefined && n.parentId !== root.id) delete n.colour;
  }

  for (const n of byId.values()) {
    if (n.parentId !== null && !byId.has(n.parentId)) throw fail('A branch is joined to a bubble that is not there.');
  }
  // Every bubble has to reach the middle by going up. A loop never does, and
  // the walk is cut off at the number of bubbles so it cannot go round forever.
  for (const n of byId.values()) {
    let at = n;
    for (let steps = 0; at.parentId !== null; steps++) {
      if (steps > byId.size) throw fail('A branch loops back on itself.');
      at = byId.get(at.parentId);
    }
  }

  // A bubble left empty goes, and anything hanging off it goes too: it is
  // what a new branch looks like when somebody changed their mind about it.
  const kept = [];
  const gone = new Set();
  const order = [root];
  const children = new Map();
  for (const n of byId.values()) {
    if (n.parentId === null) continue;
    if (!children.has(n.parentId)) children.set(n.parentId, []);
    children.get(n.parentId).push(n);
  }
  while (order.length) {
    const n = order.shift();
    if (n !== root && (!n.text || gone.has(n.parentId))) {
      gone.add(n.id);
    } else {
      kept.push(n);
    }
    order.push(...(children.get(n.id) || []));
  }
  return kept;
}

// --- the maps ---------------------------------------------------------------

export function ofUser(userId) {
  return Object.values(all()).filter((m) => m.ownerId === userId);
}

/** The map if it is this account's, or an error saying there is none. */
export function own(userId, id) {
  const m = all()[String(id || '')];
  if (!m || m.ownerId !== userId) throw fail('No such map.', 404);
  return m;
}

export const titleOf = (map) => (map.nodes.find((n) => n.parentId === null)?.text || '').replace(/[\n]/g, ' ');

/**
 * Enough of a map to draw a thumbnail of it in the list: the bubbles nearest
 * the middle, each as [x, y, which one it hangs off, which branch colour].
 * The nodes are stored middle-outwards (`clean` walks them that way), so a
 * bubble's parent is always earlier in the list than the bubble is.
 */
export function preview(map) {
  const nodes = map.nodes.slice(0, PREVIEW_MAX);
  const root = nodes[0];
  const at = new Map();
  const rows = [];
  let first = 0;
  for (const n of nodes) {
    const parent = n === root ? -1 : at.get(n.parentId);
    if (parent === undefined) continue;
    let branch = -1;
    if (parent === 0) {
      branch = n.colour ?? first % COLOURS;
      first += 1;
    } else if (parent > 0) {
      branch = rows[parent][3];
    }
    at.set(n.id, rows.length);
    rows.push([Math.round(n.x), Math.round(n.y), parent, branch]);
  }
  return rows;
}

export function summary(map) {
  return { id: map.id, title: titleOf(map), count: map.nodes.length, updated: map.updated, preview: preview(map) };
}

export function listFor(userId) {
  return ofUser(userId)
    .sort((a, b) => b.updated - a.updated)
    .map(summary);
}

export function create(user, text) {
  return keep(user, clean([{ id: 'root', parentId: null, text, x: 0, y: 0 }]));
}

/** A copy of one of this account's maps, as a new map of its own. */
export function duplicate(user, fromId) {
  const from = own(user.id, fromId);
  const nodes = from.nodes.map((n) => ({ ...n }));
  const root = nodes.find((n) => n.parentId === null);
  const tag = ' (copy)';
  root.text = root.text.slice(0, TEXT_MAX - tag.length).trimEnd() + tag;
  return keep(user, clean(nodes));
}

function keep(user, nodes) {
  if (ofUser(user.id).length >= PER_USER) throw fail(`You can have up to ${PER_USER} maps.`);
  const now = Date.now();
  const map = {
    id: crypto.randomBytes(8).toString('base64url'),
    ownerId: user.id,
    nodes,
    rev: 1,
    created: now,
    updated: now,
  };
  all()[map.id] = map;
  touch();
  return map;
}

export function save(user, id, { nodes, rev } = {}) {
  const map = own(user.id, id);
  if (Number(rev) !== map.rev) throw fail('This map was changed in another tab.', 409);
  map.nodes = clean(nodes);
  map.rev += 1;
  map.updated = Date.now();
  touch();
  return map;
}

export function remove(user, id) {
  const map = own(user.id, id);
  delete all()[map.id];
  touch();
}

/** An account that is closed takes its maps with it. */
export function removeAllFor(userId) {
  for (const m of ofUser(userId)) delete all()[m.id];
  touch();
}
