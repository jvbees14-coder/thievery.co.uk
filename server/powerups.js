// ---------------------------------------------------------------------------
// Power-ups, and how they are dealt out.
//
// Five and six hands share the same twenty-six cards as three and four, which
// makes every row shorter: four or five cards at a six-hand table against six
// or seven at a four-hand one. Two things suffer for it.
//
// The first is fencing. The deduction the game runs on is a face-down card
// boxed in by whatever is showing either side of it, and a short row has
// fewer neighbours to do the boxing — less to reason about, exactly when
// there are more people wanting to reason. The commons here exist to hand
// that depth back: they buy information rather than cards, and both of them
// buy it for the player alone.
//
// The second is the turn cycle. A correct guess already earns another, and at
// six hands one good run can go through half the table before anybody else
// gets a turn. The rarer power-ups interrupt that, and alarm_trip is the
// table's release valve — see the balance rules in game.js.
//
// This module is only the catalog and the draw. Nothing here touches a game;
// what each one *does* lives in game.js, where the rules are.
// ---------------------------------------------------------------------------

import crypto from 'node:crypto';

export const TIERS = ['common', 'uncommon', 'rare', 'veryRare'];

export const TIER_LABEL = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  veryRare: 'Very rare',
};

// How often a tier comes up. Skewed hard towards the commons on purpose: the
// rows are thin and the games are quick, and without this most players would
// reach the three-card cap early and then sit on rares, which flattens the
// deduction game the commons are there to prop up.
export const TIER_WEIGHTS = { common: 55, uncommon: 30, rare: 12, veryRare: 3 };

// How many a hand may hold at once. At the cap the draw stops until one is
// played, so power-ups are something you spend rather than something you save.
export const HAND_LIMIT = 3;

/**
 * The catalog.
 *
 * `targets` says what the player has to nominate before it can be played, and
 * is the whole of what the client needs to know to ask for it:
 *
 *   none    nothing to choose
 *   card    a face-down card belonging to somebody else
 *   rank    a rank, Ace to King
 *   hand    another hand at the table
 *   player  another player, named by their hand
 *
 * A few need two things, which is why `targets` is a list.
 */
export const POWERUPS = [
  {
    id: 'casing_the_joint',
    tier: 'common',
    name: 'Casing the joint',
    blurb: 'Read one face-down card. You learn its rank; nobody is told, and it stays face down.',
    targets: ['card'],
  },
  {
    id: 'loose_lips',
    tier: 'common',
    name: 'Loose lips',
    blurb: 'Name a rank and hear how many of it are still face down across the whole table. A count, never a place.',
    targets: ['rank'],
  },
  {
    id: 'second_story',
    tier: 'uncommon',
    name: 'Second storey',
    blurb: 'Your next wrong guess this turn does not end it. One more go, and then the turn passes as usual.',
    targets: [],
  },
  {
    id: 'pickpocket',
    tier: 'uncommon',
    name: 'Pickpocket',
    blurb: 'An extra guess at a hand of your choosing, before your turn proper. Played at the start of your turn, never part-way through a run.',
    targets: ['hand'],
  },
  {
    id: 'alarm_trip',
    tier: 'rare',
    name: 'Trip the alarm',
    blurb: 'Ends the run of correct guesses going on now and passes the turn. Playable by anybody, at any time, including out of turn.',
    targets: [],
  },
  {
    id: 'stakeout',
    tier: 'rare',
    name: 'Stakeout',
    blurb: 'Nobody may guess against the named hand until that hand next plays. Not your own.',
    targets: ['hand'],
  },
  {
    id: 'misdirection',
    tier: 'rare',
    name: 'Misdirection',
    blurb: "Send another player's next guess at a hand you pick. They still choose the rank.",
    targets: ['player', 'hand'],
  },
  {
    id: 'vault_crack',
    tier: 'veryRare',
    name: 'Crack the vault',
    blurb: 'Turn any face-down card that is not yours face up, no guess and no chance about it. Counts as a correct guess, so you go again.',
    targets: ['card'],
  },
];

export const byId = (id) => POWERUPS.find((p) => p.id === id) || null;

const OF_TIER = Object.fromEntries(TIERS.map((t) => [t, POWERUPS.filter((p) => p.tier === t)]));

// Within its tier, how likely one is against its neighbours. Everything is 1
// but the alarm, which is the one power-up the table cannot do without: it is
// what stops a long run, and a release valve too scarce to be there when a
// run actually gets out of hand is not doing its job. It stays rare — it
// should not be in every other hand — but it is the likeliest of the rares.
const WITHIN_TIER = { alarm_trip: 3 };
const weightOf = (p) => WITHIN_TIER[p.id] || 1;

function pickWeighted(list, weight) {
  const total = list.reduce((n, item) => n + weight(item), 0);
  if (total <= 0) return null;
  // crypto rather than Math.random for the same reason the deck is shuffled
  // with it: a draw people can predict is a draw worth predicting.
  let roll = crypto.randomInt(total);
  for (const item of list) {
    roll -= weight(item);
    if (roll < 0) return item;
  }
  return list[list.length - 1];
}

function pickTier() {
  return pickWeighted(TIERS, (t) => TIER_WEIGHTS[t]);
}

/**
 * Draw one, for a hand already holding `held` (a list of ids).
 *
 * Nobody is dealt a second copy of something they are already holding: the
 * draw is re-rolled once inside the tier it landed on, and if that tier has
 * nothing left to offer it steps down to the tier below. The cap of three is
 * meant to buy variety rather than three copies of the same common.
 *
 * Returns the power-up drawn, or null when the hand is full or there is
 * genuinely nothing left that it does not already hold.
 */
export function draw(held = []) {
  if (held.length >= HAND_LIMIT) return null;
  const has = new Set(held);
  const tier = pickTier();
  if (!tier) return null;

  const fresh = (t) => OF_TIER[t].filter((p) => !has.has(p.id));

  // The tier the roll landed on, then each tier below it in turn. Stepping
  // down rather than up keeps the skew towards the commons honest: a player
  // holding every rare does not get handed a very rare for it.
  const order = TIERS.slice(0, TIERS.indexOf(tier) + 1).reverse();
  for (const t of order) {
    const choice = pickWeighted(fresh(t), weightOf);
    if (choice) return choice;
  }
  // Every tier at or below the roll is exhausted for this hand; try upwards
  // rather than hand back nothing at all.
  for (const t of TIERS.slice(TIERS.indexOf(tier) + 1)) {
    const choice = pickWeighted(fresh(t), weightOf);
    if (choice) return choice;
  }
  return null;
}

/** The catalog as the browser wants it: enough to draw the card and ask for
 *  whatever the power-up needs nominated. */
export function catalog() {
  return POWERUPS.map((p) => ({
    id: p.id,
    tier: p.tier,
    tierLabel: TIER_LABEL[p.tier],
    name: p.name,
    blurb: p.blurb,
    targets: p.targets,
  }));
}
