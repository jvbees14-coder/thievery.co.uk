// ---------------------------------------------------------------------------
// The cards themselves, and what they are worth.
//
// A flashcard here is two things at once. It is a thing you made to learn
// from — a question on the front, an answer on the back — and it is a thing
// you own, with a rarity, a mint number and a price the trading post will
// honour. The second only works if the first is honest, so the appraisal is
// built around one idea:
//
//     a card is worth what it took to make, not what it took to type.
//
// Length alone buys very little. A long front costs marks rather than earning
// them, because a question that will not fit on a card is not a flashcard. An
// answer that only repeats the question earns nothing at all. What pays is a
// real question, an answer that adds something the question did not already
// say, and the small courtesies — a hint, a category, punctuation.
//
// Rarity is then rolled rather than bought. A well-made card has better odds
// and no guarantee; a lazy one can still get lucky, just rarely. The roll is
// drawn from a hash of the card's own text plus a random mint seed, so the
// same wording does not always produce the same card, and no amount of
// resubmitting the same text walks the odds upwards.
//
// Mythic is not on the table. It is struck by the house, in cards.js's own
// mint, and handed out — see mintMythic.
// ---------------------------------------------------------------------------

import crypto from 'node:crypto';
import { data, touch } from './store.js';

// --- the shape of a card ---------------------------------------------------

export const FRONT_MAX = 120;
export const BACK_MAX = 400;
export const HINT_MAX = 120;
export const CATEGORY_MAX = 24;
export const TAGS_MAX = 4;
export const TAG_MAX = 16;
// Only a mythic carries these two, and only the house writes them.
export const TITLE_MAX = 48;
export const FLAVOUR_MAX = 140;

// How many cards one account may hold. High enough that nobody sensible meets
// it, low enough that the data file cannot be made enormous by one person.
export const CARDS_PER_USER = 500;

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

export const RARITY = {
  common: { label: 'Common', multiplier: 1.0, ink: '#a49d8c' },
  uncommon: { label: 'Uncommon', multiplier: 1.5, ink: '#5f9a84' },
  rare: { label: 'Rare', multiplier: 2.4, ink: '#7fd3cc' },
  epic: { label: 'Epic', multiplier: 4.0, ink: '#b79ae0' },
  legendary: { label: 'Legendary', multiplier: 7.0, ink: '#d4af5a' },
  mythic: { label: 'Mythic', multiplier: 13.0, ink: '#e9a2b8' },
};

// --- a fair coin, from a string --------------------------------------------

/** A number in [0, 1) drawn from a seed. The same seed always gives the same
 *  number, which is what makes an appraisal checkable after the fact. */
function hash01(seed, salt = '') {
  const h = crypto.createHash('sha256').update(salt + '\u0000' + seed).digest();
  // 48 bits is far more than the thresholds below can tell apart, and stays
  // inside what a double can hold exactly.
  return h.readUIntBE(0, 6) / 2 ** 48;
}

// --- reading the text ------------------------------------------------------

const words = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** A score that rises to 1 at `best` and falls away past `tooMuch`. Used for
 *  the lengths, where more is better only up to a point. */
function sweetSpot(n, floor, best, tooMuch) {
  if (n <= floor) return 0;
  if (n <= best) return (n - floor) / (best - floor);
  if (n >= tooMuch) return 0.25; // never nothing: a long card is still a card
  return 1 - 0.75 * ((n - best) / (tooMuch - best));
}

/** Whether two lists of words hold the same things in the same order. */
function sameList(a, b) {
  const other = b || [];
  return a.length === other.length && a.every((item, i) => item === other[i]);
}

/**
 * How much of the answer is already in the question. A back that restates its
 * front is the cheapest card there is, and this is what catches it.
 */
function echo(frontWords, backWords) {
  if (!backWords.length) return 1;
  const inFront = new Set(frontWords);
  let shared = 0;
  for (const w of backWords) if (w.length > 3 && inFront.has(w)) shared += 1;
  const meaningful = backWords.filter((w) => w.length > 3).length;
  return meaningful ? shared / meaningful : 0;
}

/**
 * How many characters of *distinct* writing a list of words amounts to.
 *
 * Every measure of length here goes through this rather than counting raw
 * characters, because the cheapest way to fake a substantial card is to say
 * the same thing eleven times. Repeats are free to write and earn nothing.
 */
function distinctLength(list) {
  const seen = new Set();
  let n = 0;
  for (const w of list) {
    if (seen.has(w)) continue;
    seen.add(w);
    n += w.length + 1; // the space that followed it
  }
  return n;
}

/**
 * Appraise a card's craft, out of 100. Pure: the same text always scores the
 * same, which is what lets the panel show the breakdown and lets the tests
 * pin it down.
 */
export function craftScore({ front, back, hint, category, tags }) {
  const f = String(front || '').trim();
  const b = String(back || '').trim();
  const fw = words(f);
  const bw = words(b);

  // Several of the marks below are ratios — what fraction of the words are
  // different, how little of the answer echoes the question — and a ratio is
  // flattering to a card with almost nothing on it. A two-word card has
  // perfect variety and no echo, and deserves neither mark. So the ratios are
  // scaled by how much there is to have an opinion about in the first place;
  // about eighteen distinct words earns the full say.
  const distinctWords = new Set(fw.concat(bw)).size;
  const substance = Math.min(1, distinctWords / 18);

  // Depth: enough on each side to be worth carrying about. 40 characters is a
  // good question; 150 is a good answer. Past 90 and 320 it starts to read as
  // padding and the marks drain away again.
  const fLen = Math.min(f.length, distinctLength(fw));
  const bLen = Math.min(b.length, distinctLength(bw));
  const depth = 14 * sweetSpot(fLen, 4, 40, 90) + 22 * sweetSpot(bLen, 2, 150, 320);

  // Variety: how much of the card is different words. Repeating yourself for
  // length is the easiest way to cheat an appraisal, so it is also the first
  // thing checked.
  const all = fw.concat(bw);
  const variety = all.length ? 16 * (distinctWords / all.length) * substance : 0;

  // The extras. Small, but they are what turn a scribble into something
  // somebody else could actually use. Gently scaled too, so that a hint and a
  // category cannot dress up a card with three words on it.
  const tagList = Array.isArray(tags) ? tags.filter(Boolean) : [];
  const extras =
    ((String(hint || '').trim().length >= 8 ? 6 : 0) +
      (String(category || '').trim().length >= 2 ? 4 : 0) +
      Math.min(tagList.length, 3) * 2) *
    Math.sqrt(substance);

  // Craftsmanship: is this a question, and does the answer answer it?
  const asks = /[?]\s*$/.test(f) || /^(what|who|when|where|why|how|which|name|define|list|explain)\b/i.test(f);
  const overlap = echo(fw, bw);
  const craftsmanship = ((asks ? 8 : 0) + 12 * (1 - Math.min(overlap, 1))) * substance;

  // Polish: written like prose rather than shouted. All-caps, no punctuation
  // at all, or a held-down key are each worth a little.
  const letters = (f + b).replace(/[^\p{L}]/gu, '');
  const shouting = letters.length > 12 && letters === letters.toUpperCase();
  const punctuated = /[.!?,;:]/.test(b) || bw.length <= 3;
  const mashed = /(.)\1{4,}/.test(f + b);
  const polish = ((shouting ? 0 : 5) + (punctuated ? 4 : 0) + (mashed ? 0 : 3)) * substance;

  const total = depth + variety + extras + craftsmanship + polish;
  return {
    total: Math.max(0, Math.min(100, Math.round(total))),
    parts: {
      depth: Math.round(depth),
      variety: Math.round(variety),
      extras: Math.round(extras),
      craftsmanship: Math.round(craftsmanship),
      polish: Math.round(polish),
    },
  };
}

// --- the roll --------------------------------------------------------------

/**
 * The odds, at a given craft. Craft tilts them and never settles them: at 0
 * the table is almost all common, at 100 a legendary is about one card in
 * nine. Mythic is absent by design — the house strikes those.
 */
function rarityWeights(craft) {
  const lift = Math.max(0, Math.min(100, craft)) / 100;
  return [
    ['common', 62 - 40 * lift],
    ['uncommon', 24 + 2 * lift],
    ['rare', 9 + 16 * lift],
    ['epic', 4 + 12 * lift],
    ['legendary', 1 + 10 * lift],
  ];
}

/** Those weights as percentages, for the form to show while you type. */
export function rarityOdds(craft) {
  const weights = rarityWeights(craft);
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  return Object.fromEntries(weights.map(([name, w]) => [name, Math.round((w / total) * 1000) / 10]));
}

/** Roll one, from a seed the submitter has never seen. */
export function rollRarity(craft, seed) {
  const weights = rarityWeights(craft);
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let roll = hash01(seed, 'rarity') * total;
  for (const [name, w] of weights) {
    roll -= w;
    if (roll < 0) return name;
  }
  return 'common';
}

/**
 * What the trading post will give for a card. Craft sets the floor, rarity
 * multiplies it, and a few per cent of jitter stops every common card of the
 * same quality being interchangeable.
 */
export function valueFor(craft, rarity, seed) {
  const base = 12 + craft * 1.1;
  const jitter = 0.94 + 0.12 * hash01(seed, 'jitter'); // ±6%
  return Math.max(1, Math.round(base * RARITY[rarity].multiplier * jitter));
}

/** The whole appraisal in one call: craft, the roll, and the price. */
export function appraise(content, seed) {
  const craft = craftScore(content);
  const rarity = rollRarity(craft.total, seed);
  return { craft: craft.total, parts: craft.parts, rarity, value: valueFor(craft.total, rarity, seed) };
}

// --- making one ------------------------------------------------------------

function clean(s, max) {
  // Control characters have no business on a card, and a run of blank lines
  // is somebody trying to make their card taller than everyone else's.
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

function cleanContent(input) {
  const tags = (Array.isArray(input.tags) ? input.tags : String(input.tags || '').split(','))
    .map((t) => clean(t, TAG_MAX).toLowerCase())
    .filter(Boolean)
    .slice(0, TAGS_MAX);
  return {
    front: clean(input.front, FRONT_MAX),
    back: clean(input.back, BACK_MAX),
    hint: clean(input.hint, HINT_MAX),
    category: clean(input.category, CATEGORY_MAX),
    tags: [...new Set(tags)],
  };
}

/** What is wrong with a submitted card, or null. */
export function contentProblem(content) {
  if (!content.front) return 'A card needs a front.';
  if (content.front.length < 3) return 'That front is too short to be a question.';
  if (!content.back) return 'A card needs a back.';
  if (content.back.length < 1) return 'That back is too short to be an answer.';
  return null;
}

function newId() {
  return crypto.randomBytes(9).toString('base64url');
}

/**
 * Strike a new card for an owner. The seed is fresh random bytes, so the roll
 * cannot be predicted from the text and resubmitting the same wording is a
 * new roll rather than the same one.
 */
export function createCard(owner, input) {
  const content = cleanContent(input);
  const problem = contentProblem(content);
  if (problem) throw Object.assign(new Error(problem), { status: 400 });

  if (cardsOf(owner.id).length >= CARDS_PER_USER) {
    throw Object.assign(new Error(`A collection holds ${CARDS_PER_USER} cards. Trade some away first.`), { status: 400 });
  }

  const seed = crypto.randomBytes(16).toString('hex');
  const verdict = appraise(content, seed);
  const db = data();
  db.mints += 1;

  const card = {
    id: newId(),
    ...content,
    seed,
    craft: verdict.craft,
    rarity: verdict.rarity,
    value: verdict.value,
    mint: db.mints, // the serial number stamped on the printed card
    authorId: owner.id,
    authorName: owner.displayName,
    ownerId: owner.id,
    created: Date.now(),
    pooled: false, // sitting at the trading post
    title: '', // mythics are named; ordinary cards are not
    flavour: '',
    history: [], // every time it changed hands
  };
  db.cards[card.id] = card;
  touch();
  return card;
}

/**
 * Re-cut an existing card's text. The mint number, the owner and the history
 * stay; the rarity is deliberately *not* re-rolled, because editing a card
 * until it comes up legendary is the one thing the seed exists to prevent.
 * Craft and value do move, since the card really has changed.
 *
 * `naming` lets the title and the flavour line be written too. It is off by
 * default and the members' route never turns it on: a name is what marks a
 * card as the house's own work, and a card anybody can name is not marked at
 * all. The panel passes it, because the house may fix its own typing.
 */
export function editCard(card, input, { naming = false } = {}) {
  const content = cleanContent({ ...card, ...input });
  const problem = contentProblem(content);
  if (problem) throw Object.assign(new Error(problem), { status: 400 });
  const named = naming
    ? {
        title: input.title != null ? clean(input.title, TITLE_MAX) : card.title,
        flavour: input.flavour != null ? clean(input.flavour, FLAVOUR_MAX) : card.flavour,
      }
    : null;

  // A save that changes nothing is not a re-cut, and is left well alone. It
  // would otherwise stamp the card as rewritten when nobody had rewritten it,
  // and — because the panel may have set a price by hand — quietly undo that
  // price by appraising the card all over again.
  const same =
    content.front === card.front &&
    content.back === card.back &&
    content.hint === card.hint &&
    content.category === card.category &&
    sameList(content.tags, card.tags) &&
    (!named || (named.title === card.title && named.flavour === card.flavour));
  if (same) return card;

  Object.assign(card, content);
  if (named) Object.assign(card, named);
  card.craft = craftScore(content).total;
  card.value = valueFor(card.craft, card.rarity, card.seed);
  card.edited = Date.now();
  touch();
  return card;
}

// --- the house's own mint --------------------------------------------------

/**
 * A mythic. These cannot be made by playing well or by trading well: the
 * house strikes them and gives them away. They carry a name and a line of
 * flavour text, and their value is the mythic multiplier unless the house
 * writes its own number on it.
 */
export function mintMythic(recipient, input, { value = null, mintedBy = 'The House' } = {}) {
  const content = cleanContent(input);
  const problem = contentProblem(content);
  if (problem) throw Object.assign(new Error(problem), { status: 400 });

  const seed = crypto.randomBytes(16).toString('hex');
  const craft = craftScore(content).total;
  const db = data();
  db.mints += 1;

  const card = {
    id: newId(),
    ...content,
    seed,
    craft,
    rarity: 'mythic',
    value: value != null ? Math.max(1, Math.round(value)) : valueFor(craft, 'mythic', seed),
    mint: db.mints,
    authorId: null,
    authorName: mintedBy,
    ownerId: recipient.id,
    created: Date.now(),
    pooled: false,
    title: clean(input.title, TITLE_MAX),
    flavour: clean(input.flavour, FLAVOUR_MAX),
    mythic: true,
    history: [{ at: Date.now(), event: 'struck', to: recipient.id }],
  };
  db.cards[card.id] = card;
  touch();
  return card;
}

// --- looking them up -------------------------------------------------------

export function byId(id) {
  return data().cards[id] || null;
}

export function cardsOf(userId) {
  return Object.values(data().cards).filter((c) => c.ownerId === userId);
}

export function deleteCard(card) {
  const db = data();
  delete db.cards[card.id];
  const at = db.pool.indexOf(card.id);
  if (at >= 0) db.pool.splice(at, 1);
  touch();
}

/**
 * A card as the browser sees it, back and all. Nothing here is fit for a
 * stranger: every caller is either somebody's own collection or the panel,
 * and the table's own view of a card is `publicPool` in trading.js, which
 * sends the front and never the answer. `mine` says whose it is.
 */
export function publicCard(card, viewerId) {
  const mine = card.ownerId === viewerId;
  return {
    id: card.id,
    front: card.front,
    back: card.back,
    hint: card.hint,
    category: card.category,
    tags: card.tags,
    title: card.title,
    flavour: card.flavour,
    rarity: card.rarity,
    rarityLabel: RARITY[card.rarity].label,
    value: card.value,
    craft: card.craft,
    mint: card.mint,
    authorName: card.authorName,
    created: card.created,
    edited: card.edited || null,
    pooled: !!card.pooled,
    mine,
    traded: (card.history || []).filter((h) => h.event === 'traded').length,
  };
}

// --- a hand to start with --------------------------------------------------

// Nobody wants to arrive at a trading post with nothing to trade, and a new
// account with an empty collection cannot take part at all. These three are
// dealt on the first visit. They are about the site itself, so they are worth
// having, and they go through the same appraisal as everything else — the
// welcome is three cards, not three favours.
const WELCOME = [
  {
    front: 'In Thievery, how many people can share a single hand?',
    back: 'Two. The first three or four players get a hand each; everybody after that pairs up with someone already seated, sees exactly the same cards, and either of them may play it when its turn comes round.',
    hint: 'A hand is not the same thing as a player.',
    category: 'Thievery',
    tags: ['rules', 'hands'],
  },
  {
    front: 'A hidden black card sits between a face-up 4 and a face-up 7. What can it be?',
    back: 'A black 4, 5, 6 or 7. Hands are lined up in ascending order, so a hidden card is fenced in by whatever is showing either side of it — and ties are possible, so the neighbours are included.',
    hint: 'Ascending order, and the ends count.',
    category: 'Thievery',
    tags: ['deduction', 'strategy'],
  },
  {
    front: 'Why can a partnership game only be played with four hands?',
    back: 'Because the Show step depends on each hand having exactly one partner. Hands 1 and 3 are one team and hands 2 and 4 the other; with three hands somebody is left without a partner to show to.',
    hint: 'Count the partners.',
    category: 'Thievery',
    tags: ['rules', 'teams'],
  },
];

export function dealWelcome(user) {
  if (cardsOf(user.id).length) return [];
  return WELCOME.map((content) => {
    const card = createCard(user, content);
    // Struck by the house on the account's behalf, so the author line reads
    // honestly rather than claiming they wrote it.
    card.authorId = null;
    card.authorName = 'The House';

    // And struck common, whatever the roll said. These three are written well
    // enough to come up legendary about one time in nine, and they are printed
    // for every account that opens — which would put more legendaries into the
    // world than every card anybody actually wrote. A reprint everybody has
    // cannot be rare; that is what the word means. They are still worth
    // something, so a new account has something to trade on its first visit.
    card.rarity = 'common';
    card.value = valueFor(card.craft, 'common', card.seed);
    card.history.push({ at: Date.now(), event: 'welcomed', to: user.id });
    touch();
    return card;
  });
}
