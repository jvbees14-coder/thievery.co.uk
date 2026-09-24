// ---------------------------------------------------------------------------
// A member's own decks, and the sub-decks inside them.
//
// Called "sections" in the code because "deck" is already taken twice over:
// decks.js is the battle room's house decks, and a deck of cards is what the
// card table deals. On the page they are Deck and Sub-deck.
//
// The shape is two levels and no more. A section with no parent is a deck;
// one with a parent is a sub-deck, and its parent must be a deck. A card is
// filed in at most one section (`card.section`), which may be either kind:
// a card in a deck but no sub-deck is fine, and "a deck" always means the
// deck and every sub-deck in it.
//
// Sections belong to an account and cards change hands, so a card's filing
// is only honoured while the section is its owner's. Trading clears it
// (`unfile`) and every read checks it anyway, so a card that arrived by some
// route that forgot to clear it simply reads as unfiled rather than as being
// in a stranger's deck.
//
// Deleting a section never deletes a card. The cards in it, and in its
// sub-decks, go back to being unfiled.
// ---------------------------------------------------------------------------

import crypto from 'node:crypto';
import { data, touch } from './store.js';
import * as Cards from './cards.js';

export const NAME_MAX = 40;
export const PER_USER = 200;

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

const all = () => data().sections;

function cleanName(name) {
  const s = String(name || '').replace(/[\s]+/g, ' ').trim().slice(0, NAME_MAX);
  if (!s) throw fail('Give it a name.');
  return s;
}

export function byId(id) {
  return all()[String(id || '')] || null;
}

export function ofUser(userId) {
  return Object.values(all()).filter((s) => s.ownerId === userId);
}

/** The section if it is this account's, or an error saying there is none. */
export function own(userId, id) {
  const s = byId(id);
  if (!s || s.ownerId !== userId) throw fail('No such deck.', 404);
  return s;
}

/** A card's section, if it is still filed somewhere its owner owns. */
export function sectionOf(card) {
  const s = card.section ? byId(card.section) : null;
  return s && s.ownerId === card.ownerId ? s : null;
}

export function create(user, { name, parentId = null } = {}) {
  if (ofUser(user.id).length >= PER_USER) throw fail(`You can have up to ${PER_USER} decks and sub-decks.`);
  let parent = null;
  if (parentId) {
    parent = own(user.id, parentId);
    if (parent.parentId) throw fail('A sub-deck can only go inside a deck, not inside another sub-deck.');
  }
  const clean = cleanName(name);
  const siblings = ofUser(user.id).filter((s) => (s.parentId || null) === (parent ? parent.id : null));
  if (siblings.some((s) => s.name.toLowerCase() === clean.toLowerCase())) {
    throw fail(parent ? `${parent.name} already has a sub-deck called that.` : 'You already have a deck called that.');
  }
  const section = {
    id: crypto.randomBytes(8).toString('base64url'),
    ownerId: user.id,
    name: clean,
    parentId: parent ? parent.id : null,
    created: Date.now(),
  };
  all()[section.id] = section;
  touch();
  return section;
}

export function rename(user, id, name) {
  const s = own(user.id, id);
  const clean = cleanName(name);
  const clash = ofUser(user.id).some(
    (o) => o.id !== s.id && (o.parentId || null) === (s.parentId || null) && o.name.toLowerCase() === clean.toLowerCase()
  );
  if (clash) throw fail('There is already one called that here.');
  s.name = clean;
  touch();
  return s;
}

/** A deck goes with its sub-decks; the cards in any of them are unfiled. */
export function remove(user, id) {
  const s = own(user.id, id);
  const going = new Set([s.id, ...ofUser(user.id).filter((o) => o.parentId === s.id).map((o) => o.id)]);
  for (const card of Cards.cardsOf(user.id)) {
    if (going.has(card.section)) delete card.section;
  }
  for (const gone of going) delete all()[gone];
  touch();
}

/**
 * File a card, or unfile it with an empty id. Called from the card routes,
 * which have already established that the card is this account's.
 */
export function file(user, card, id) {
  if (!id) {
    if (card.section) {
      delete card.section;
      touch();
    }
    return;
  }
  const s = own(user.id, id);
  if (card.section !== s.id) {
    card.section = s.id;
    touch();
  }
}

/** For trading and the panel's "move to": a card that changes hands is unfiled. */
export function unfile(card) {
  if (card.section) delete card.section;
}

/** Everything an account has filed and how many cards each holds, decks first. */
export function listFor(userId) {
  const mine = ofUser(userId);
  const counts = new Map();
  for (const card of Cards.cardsOf(userId)) {
    const s = sectionOf(card);
    if (!s) continue;
    counts.set(s.id, (counts.get(s.id) || 0) + 1);
    if (s.parentId) counts.set(s.parentId, (counts.get(s.parentId) || 0) + 1);
  }
  const byName = (a, b) => a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' });
  const decks = mine.filter((s) => !s.parentId).sort(byName);
  return decks.map((d) => ({
    id: d.id,
    name: d.name,
    count: counts.get(d.id) || 0,
    subs: mine
      .filter((s) => s.parentId === d.id)
      .sort(byName)
      .map((s) => ({ id: s.id, name: s.name, count: counts.get(s.id) || 0 })),
  }));
}

/**
 * The cards in a deck, or in one sub-deck of it. No deck is the whole
 * collection. The ids are checked against the account, so a stale setting
 * cannot reach into somebody else's.
 */
export function cardsIn(userId, deckId = '', subId = '') {
  const cards = Cards.cardsOf(userId);
  if (!deckId) return cards;
  const deck = own(userId, deckId);
  if (deck.parentId) throw fail('That is a sub-deck, not a deck.');
  if (subId) {
    const sub = own(userId, subId);
    if (sub.parentId !== deck.id) throw fail('That sub-deck is not in that deck.');
    return cards.filter((c) => sectionOf(c)?.id === sub.id);
  }
  return cards.filter((c) => {
    const s = sectionOf(c);
    return !!s && (s.id === deck.id || s.parentId === deck.id);
  });
}

/** An account that is closed takes its sections with it. */
export function removeAllFor(userId) {
  for (const s of ofUser(userId)) delete all()[s.id];
  touch();
}
