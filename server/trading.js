// ---------------------------------------------------------------------------
// The trading post.
//
// The deal is deliberately blunt: you put a card on the table, and sooner or
// later it is gone and something of the same worth is sitting there instead.
// You do not get to choose what, and you do not get to choose who from. That
// is the whole appeal — a trading post where you pick both sides is just a
// shop, and a swap you can see coming is not worth making.
//
// What *is* guaranteed is the value. A card is appraised when it is struck
// (see cards.js) and the post will not move it for less. Since the odds of
// two cards being appraised at the same number are poor, the other side is
// made up of however many cards it takes to reach it — one card for five, or
// five for one, whichever way the numbers fall.
//
// Two rules keep it honest:
//
//   * A swap is always between two people. The bundle you receive comes from
//     one other collection, not assembled out of four strangers', so every
//     trade is a trade somebody else can recognise as theirs.
//   * Nothing leaves a collection that was not offered. Putting a card on the
//     table is the consent; there is nothing else to accept, which is why the
//     post can settle a trade while both people are asleep.
// ---------------------------------------------------------------------------

import crypto from 'node:crypto';
import { data, touch, TRADE_LOG_MAX } from './store.js';
import * as Cards from './cards.js';

// How close the two sides have to come. A flat floor as well as a percentage,
// because 12% of a 14-point common is not a gap anybody could fill.
const TOLERANCE_FLOOR = 8;
const TOLERANCE_RATE = 0.12;

// How many cards may be bundled against a single one. Without a ceiling, a
// legendary would come back as thirty commons and nobody would feel traded
// with.
const BUNDLE_MAX = 8;

// How hard to look for a bundle before giving up on a counterparty. These
// are small sets — a few dozen cards at most — so a few hundred shuffled
// attempts is both quick and thorough.
const SEARCH_ATTEMPTS = 240;

export function toleranceFor(value) {
  return Math.max(TOLERANCE_FLOOR, Math.round(value * TOLERANCE_RATE));
}

// --- the pool --------------------------------------------------------------

/** Every card currently on the table, oldest offer first. */
export function pooled() {
  const db = data();
  return db.pool.map((id) => db.cards[id]).filter(Boolean);
}

function removeFromPool(cardId) {
  const db = data();
  const at = db.pool.indexOf(cardId);
  if (at >= 0) db.pool.splice(at, 1);
}

/**
 * Put a card on the table. Returns the trade it immediately caused, if it
 * found one; otherwise the card waits and will be settled the moment somebody
 * offers something that fits.
 */
export function offer(user, card) {
  if (card.ownerId !== user.id) throw Object.assign(new Error('That is not your card.'), { status: 403 });
  if (card.pooled) throw Object.assign(new Error('That card is already on the table.'), { status: 400 });

  card.pooled = true;
  card.pooledAt = Date.now();
  data().pool.push(card.id);
  touch();
  return settle();
}

/** Take a card back off the table. */
export function withdraw(user, card) {
  if (card.ownerId !== user.id) throw Object.assign(new Error('That is not your card.'), { status: 403 });
  if (!card.pooled) throw Object.assign(new Error('That card is not on the table.'), { status: 400 });
  card.pooled = false;
  removeFromPool(card.id);
  touch();
}

/**
 * Take a card off the table regardless of whose it is. The panel uses this
 * when it moves a card between collections: a card cannot be on offer from
 * somebody who no longer holds it.
 */
export function unpool(card) {
  if (!card.pooled) return;
  card.pooled = false;
  removeFromPool(card.id);
  touch();
}

// --- finding a bundle ------------------------------------------------------

function shuffled(list) {
  // Fisher-Yates from crypto randomness. The room server shuffles its deck
  // the same way, and for the same reason: a trade people cannot predict has
  // to be a trade nobody can predict.
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Look through one collection's offered cards for a set worth about `target`.
 *
 * Exact subset-sum is NP-hard in general and completely beside the point at
 * this size. What this does instead is try a few hundred shuffles, greedily
 * taking whatever still fits under the ceiling, and keep the closest result
 * that landed inside the tolerance. Because each attempt starts from a fresh
 * shuffle, two identical searches rarely return the same bundle — which is
 * the randomness the post promises.
 */
export function findBundle(candidates, target, tolerance) {
  const ceiling = target + tolerance;
  const floor = target - tolerance;
  let best = null;
  let bestGap = Infinity;

  // A single card that already fits is the tidiest possible answer, so those
  // are checked first and in random order.
  for (const card of shuffled(candidates)) {
    if (card.value >= floor && card.value <= ceiling) {
      const gap = Math.abs(card.value - target);
      if (gap < bestGap) {
        best = [card];
        bestGap = gap;
      }
    }
  }
  if (best && bestGap === 0) return best;

  for (let attempt = 0; attempt < SEARCH_ATTEMPTS; attempt++) {
    const order = shuffled(candidates);
    const take = [];
    let sum = 0;
    for (const card of order) {
      if (take.length >= BUNDLE_MAX) break;
      if (sum + card.value > ceiling) continue; // too dear; try the next one
      take.push(card);
      sum += card.value;
      if (sum >= floor) break; // close enough — stop before overshooting
    }
    if (sum >= floor && sum <= ceiling && take.length) {
      const gap = Math.abs(sum - target);
      if (gap < bestGap) {
        best = take;
        bestGap = gap;
        if (gap === 0) break;
      }
    }
  }
  return best;
}

// --- settling --------------------------------------------------------------

function handOver(card, toUserId, tradeId) {
  const from = card.ownerId;
  card.ownerId = toUserId;
  card.pooled = false;
  removeFromPool(card.id);
  (card.history ||= []).push({ at: Date.now(), event: 'traded', from, to: toUserId, trade: tradeId });
}

function sumValue(cards) {
  return cards.reduce((n, c) => n + c.value, 0);
}

/**
 * Try to settle one trade. Every card on the table gets a turn at being the
 * one looking for a match, in random order, so nothing sits there forever
 * just because it was offered late.
 */
function settleOnce() {
  const db = data();
  const table = pooled();
  if (table.length < 2) return null;

  for (const card of shuffled(table)) {
    const owner = db.users[card.ownerId];
    if (!owner || owner.disabled) continue;

    // Group the rest of the table by whose it is: a swap is with one person.
    const byOwner = new Map();
    for (const other of table) {
      if (other.id === card.id || other.ownerId === card.ownerId) continue;
      const them = db.users[other.ownerId];
      if (!them || them.disabled) continue;
      if (!byOwner.has(other.ownerId)) byOwner.set(other.ownerId, []);
      byOwner.get(other.ownerId).push(other);
    }
    if (!byOwner.size) continue;

    const tolerance = toleranceFor(card.value);
    for (const counterpartyId of shuffled([...byOwner.keys()])) {
      const bundle = findBundle(byOwner.get(counterpartyId), card.value, tolerance);
      if (!bundle) continue;

      const counterparty = db.users[counterpartyId];
      const tradeId = crypto.randomBytes(6).toString('base64url');
      const entry = {
        id: tradeId,
        at: Date.now(),
        a: {
          userId: owner.id,
          name: owner.displayName,
          gave: [{ id: card.id, front: card.front, rarity: card.rarity, value: card.value }],
          got: bundle.map((c) => ({ id: c.id, front: c.front, rarity: c.rarity, value: c.value })),
        },
        b: {
          userId: counterparty.id,
          name: counterparty.displayName,
          gave: bundle.map((c) => ({ id: c.id, front: c.front, rarity: c.rarity, value: c.value })),
          got: [{ id: card.id, front: card.front, rarity: card.rarity, value: card.value }],
        },
        value: { offered: card.value, returned: sumValue(bundle) },
      };

      handOver(card, counterparty.id, tradeId);
      for (const c of bundle) handOver(c, owner.id, tradeId);

      db.trades.push(entry);
      if (db.trades.length > TRADE_LOG_MAX) db.trades.splice(0, db.trades.length - TRADE_LOG_MAX);
      touch();
      return entry;
    }
  }
  return null;
}

/**
 * Settle everything the table currently allows. Each pass removes at least
 * two cards from the pool, so this always terminates; the cap is belt and
 * braces against a bug turning into a spin.
 */
export function settle() {
  const done = [];
  for (let i = 0; i < 50; i++) {
    const trade = settleOnce();
    if (!trade) break;
    done.push(trade);
  }
  return done;
}

// --- what people are shown -------------------------------------------------

/** The table, as a stranger sees it: worth and rarity, never the answer. */
export function publicPool(viewerId) {
  const db = data();
  return pooled().map((card) => ({
    id: card.id,
    front: card.front,
    category: card.category,
    rarity: card.rarity,
    rarityLabel: Cards.RARITY[card.rarity].label,
    value: card.value,
    mint: card.mint,
    mine: card.ownerId === viewerId,
    ownerName: db.users[card.ownerId]?.displayName || 'somebody',
    since: card.pooledAt || card.created,
  }));
}

/** This account's trades, newest first. */
export function tradesFor(userId, limit = 40) {
  const mine = [];
  const log = data().trades;
  for (let i = log.length - 1; i >= 0 && mine.length < limit; i--) {
    const t = log[i];
    const side = t.a.userId === userId ? t.a : t.b.userId === userId ? t.b : null;
    if (!side) continue;
    const other = side === t.a ? t.b : t.a;
    mine.push({ id: t.id, at: t.at, gave: side.gave, got: side.got, withName: other.name });
  }
  return mine;
}

/** The whole ledger, newest first. The admin panel only. */
export function allTrades(limit = 100) {
  return data().trades.slice(-limit).reverse();
}
