// ---------------------------------------------------------------------------
// Marking an answer against the back of a card.
//
// Everything in the battle room comes down to one question: how close is what
// somebody typed to what the card says? A human marker answers it in a second
// and is never asked to explain. This has to answer it in a millisecond, the
// same way every time, and be able to show its working — because a player who
// loses a duel by four points will want to know why, and "the computer said
// so" is not an answer anybody accepts twice.
//
// So the mark is built out of parts that can each be justified on their own.
//
// --- what fair means here --------------------------------------------------
//
// Fair is not the same as strict. The back of a card is one person's wording
// of an answer, not the only wording of it, and a marker that only accepts
// that one wording is measuring typing rather than recall. So:
//
//   * **Word order does not decide it.** "Mitochondria make ATP" and "ATP is
//     made by the mitochondria" are the same answer. The mark is built on
//     which words are there, not the order they arrive in.
//   * **Following the card's own phrasing earns a little back, and never
//     costs anything.** Word order is weak evidence of real recall rather
//     than none at all, so it lifts a mark and cannot lower one. See
//     `PHRASE_LIFT` below.
//   * **Padding does not pay.** Answering with every word you can think of
//     would score full marks under a rule that only asked "is it in there?",
//     so the mark weighs what was missed and what was invented together —
//     the F-measure below — and a wall of text sinks on the second of those.
//   * **A typo is not a wrong answer.** "mitochondira" is somebody who knows
//     it, and is marked as somebody who knows it with a small deduction.
//   * **A figure is either right or it is wrong.** 1066 and 1067 are one
//     character apart and not remotely the same answer, so numbers are the
//     one thing here compared exactly, never fuzzily.
//   * **"Not" is not noise.** An answer that negates what the card says has
//     not half-remembered it, it has remembered the opposite, and it is
//     capped accordingly.
//   * **Small words count for little.** "of", "the" and "is" are the mortar
//     rather than the bricks. They are not thrown away — dropping them makes
//     "soluble" and "not soluble" identical — but they are weighed light.
//
// --- what efficient means here ---------------------------------------------
//
// A back is at most `Cards.BACK_MAX` characters and an answer is capped to
// the same order of size, so both sides are a few dozen tokens at the very
// worst. The costly step is matching every answer token against every key
// token, which is that bound squared — a few thousand comparisons of short
// strings, each of them a Levenshtein that bails out early on a length
// difference it cannot make up. That is microseconds, and it is called once
// per player per card. There is nothing here worth making cleverer, and
// several things — a stemmer with a rule book, a synonym table, anything with
// a model behind it — that would cost more than they are worth and would take
// the explanation away with them.
//
// Nothing in this module reads or writes anything. It is given two strings
// and returns a mark, which is what makes it the one piece of the battle room
// that can be tested on its own.
// ---------------------------------------------------------------------------

// --- the dials -------------------------------------------------------------
//
// Every number below moves what an answer is worth, so each one says what it
// is for. Changing any of them changes every mark on the site.

// How much more a miss costs than an invention. The F-measure underneath is
// the harmonic mean of precision (was what you said in the answer?) and
// recall (was what the answer says in yours?), and this tilts it towards
// recall: leaving out half the answer is a worse failure of revision than
// adding a clause the card did not bother with. It is a lean, not a licence
// — at 1.5 a genuine wall of text still collapses.
const RECALL_BIAS = 1.5;

// How much of the gap left over is closed by phrasing the answer the way the
// card phrases it. Applied to what is *missing* from the mark, so it can only
// ever lift: a perfect answer is already at 1 and has nothing to gain, and an
// answer in the player's own words keeps every point its words earned.
const PHRASE_LIFT = 0.35;

// What the mortar is worth against the bricks. Low, because on a short card
// the mortar can otherwise carry a wrong answer: "the battery of the cell"
// against "the powerhouse of the cell" has everything right except the one
// word the card was asking for. Note that this is not what keeps "not"
// alive — a negator is a full-weight token and is checked separately besides.
const STOP_WEIGHT = 0.1;

// What a figure is worth against a word. A date, a count or a formula is
// usually the thing the card is actually asking for.
const NUMBER_WEIGHT = 1.25;

// The most an answer that contradicts the card can score. It is deliberately
// inside the "some of it" band rather than at nought: the player has clearly
// read the card and retained its shape, and a flat zero would not tell them
// apart from somebody who typed nothing.
const NEGATION_CAP = 0.4;

// The most an answer that states a different figure from the card can score.
// Above the negation cap, because naming the wrong year still shows the shape
// of the answer, and well below a pass, because on a card whose point is the
// figure the figure is the whole of the answer. It bites only on a genuine
// contradiction — a figure offered against a figure — and never on an answer
// that simply left the number out, which the recall side has already charged
// for.
const FIGURE_CAP = 0.5;

// A word has to be at least this long before a misspelling of it is
// forgiven. Below it there is not enough word left to tell a typo from a
// different word: "cat" and "cot" are one edit apart and unrelated.
const FUZZY_MIN = 4;

// Nothing legitimate is anywhere near either of these. They are here so that
// a pasted novel is refused the squared step rather than sat through.
export const ANSWER_MAX = 2000;
const TOKENS_MAX = 120;

// The mortar. Kept short on purpose: every word on this list is one the site
// has decided does not carry meaning, and that decision should be defensible
// word by word rather than lifted wholesale from a corpus nobody here has
// read. Anything not on it is a brick.
const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'of', 'to', 'in', 'on', 'at',
  'by', 'for', 'with', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'it', 'its', 'this', 'that', 'these', 'those', 'there', 'here',
  'which', 'who', 'whom', 'what', 'when', 'where', 'how', 'why', 'they',
  'them', 'their', 'he', 'she', 'his', 'her', 'we', 'our', 'you', 'your',
  'i', 'my', 'me', 'do', 'does', 'did', 'has', 'have', 'had', 'will',
  'would', 'can', 'could', 'may', 'might', 'shall', 'should', 'must',
  'so', 'than', 'then', 'also', 'into', 'about', 'over', 'up', 'out',
  // The prepositions and conjunctions that join an answer together. These
  // are the ones that cost a correct answer marks when they are missing from
  // this list: "produced during respiration" and "produce through
  // respiration" are the same answer, and the only thing standing between
  // them is a preposition neither of them was being asked for.
  'through', 'during', 'between', 'within', 'after', 'before', 'across',
  'among', 'along', 'around', 'because', 'while', 'since', 'until', 'upon',
  'onto', 'via', 'per', 'toward', 'towards', 'again', 'once', 'though',
  'although', 'whether', 'either', 'whereas', 'thus', 'hence', 'therefore',
  'however', 'moreover', 'further', 'often', 'usually', 'generally',
]);

// Words that turn an answer inside out. `grade` below counts them on each
// side and caps the mark when the two disagree.
const NEGATORS = new Set([
  'not', 'no', 'none', 'never', 'neither', 'nor', 'without', 'cannot',
  'nothing', 'nobody', 'nowhere', 'unable', 'lacks', 'lacking', 'absent',
  'except', 'unlike', 'opposite', 'false', 'incorrect',
]);

// --- getting the words out -------------------------------------------------

// Contractions are expanded rather than stripped, because the half that
// matters is usually the half an apostrophe would take away with it: "isn't"
// has to survive as a negation, and "won't" has to become "will not" rather
// than "wo" and "nt".
const CONTRACTIONS = [
  [/\bwon't\b/g, 'will not'],
  [/\bcan't\b/g, 'can not'],
  [/\bshan't\b/g, 'shall not'],
  [/n't\b/g, ' not'],
  [/\b(\w+)'ll\b/g, '$1 will'],
  [/\b(\w+)'re\b/g, '$1 are'],
  [/\b(\w+)'ve\b/g, '$1 have'],
  [/\b(\w+)'m\b/g, '$1 am'],
  // A possessive carries no meaning of its own here, so it simply goes.
  [/'s\b/g, ''],
  [/'/g, ''],
];

/**
 * A string, flattened to the letters and figures that carry the meaning.
 *
 * Accents come off through the decomposed form, so "résumé" and "resume" are
 * one word — somebody revising on a phone keyboard should not lose a mark to
 * a diacritic they had no easy way to type.
 */
export function normalise(text) {
  let s = String(text == null ? '' : text)
    .slice(0, ANSWER_MAX)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  for (const [re, to] of CONTRACTIONS) s = s.replace(re, to);
  return s
    // A comma inside a figure is part of the figure; anywhere else it is
    // punctuation. Same for a point or a hyphen, which are kept while they
    // sit inside a word or a number and dropped once they are on the edge of
    // one.
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/[^a-z0-9.\-]+/g, ' ')
    .replace(/(^|\s)[.\-]+/g, '$1')
    .replace(/[.\-]+(\s|$)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cut an English word back to its stem, so that a plural, a tense or an
 * adverb is not a different word from the one on the card.
 *
 * This is a handful of suffix rules rather than a real stemmer, and that is
 * the point: it is short enough to read, it never reaches for a dictionary,
 * and the mistakes it makes are the harmless kind — two related words cut to
 * the same stem, which is what it is for. A word too short to have a suffix
 * worth taking is left alone.
 */
export function stem(word) {
  let w = word;
  if (w.length <= 3) return w;
  // Order matters: the longer ending has to be tried before the shorter one
  // it ends with, or "-ies" is handled as "-s" and "carries" becomes "carrie".
  if (w.endsWith('ies') && w.length > 4) w = w.slice(0, -3) + 'y';
  else if (w.endsWith('sses')) w = w.slice(0, -2);
  else if (w.endsWith('ses') && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith('es') && w.length > 3 && /[cshxz]/.test(w[w.length - 3])) w = w.slice(0, -2);
  else if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && w.length > 3) w = w.slice(0, -1);
  if (w.length > 4 && w.endsWith('ly')) w = w.slice(0, -2);
  if (w.length > 5 && (w.endsWith('ing') || w.endsWith('ion'))) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  // Stripping a suffix off a doubled consonant leaves "stopp" and "runn".
  if (w.length > 3 && /([bdfglmnprt])\1$/.test(w)) w = w.slice(0, -1);
  return w;
}

// A figure written out is the same figure. A card that says "3 sides" and an
// answer that says "three sides" agree, and marking them apart would be
// marking the keyboard rather than the recall. Only the single words are
// here: "twenty-one" is left as a word, which costs nothing because both
// sides of the comparison spell it the same way when they do use it.
const FIGURES = new Map(Object.entries({
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
  seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12',
  thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16',
  seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20',
  thirty: '30', forty: '40', fifty: '50', sixty: '60', seventy: '70',
  eighty: '80', ninety: '90', hundred: '100', thousand: '1000',
  million: '1000000', billion: '1000000000',
}));

// What counts as a figure: something that opens with a digit, or one of the
// words above standing in for one. Null means it is an ordinary word.
const figureOf = (w) => (/^\d/.test(w) ? w : FIGURES.get(w) || null);

function weigh(word, figure) {
  if (figure !== null) return NUMBER_WEIGHT;
  return STOP.has(word) ? STOP_WEIGHT : 1;
}

/**
 * A string as the marker sees it: a list of tokens, each carrying the stem it
 * is matched on and what it is worth.
 */
export function tokenise(text) {
  const words = normalise(text).split(' ').filter(Boolean).slice(0, TOKENS_MAX);
  return words.map((word) => {
    // A figure is matched on the digits it stands for, so "three" and "3"
    // are one token as far as everything below is concerned.
    const figure = figureOf(word);
    return {
      word,
      stem: figure === null ? stem(word) : figure,
      number: figure !== null,
      weight: weigh(word, figure),
    };
  });
}

// --- how close two words are -----------------------------------------------

/**
 * Levenshtein distance, given up on as soon as it passes `cap`.
 *
 * Two rows rather than a full table, because the whole matrix is never wanted
 * — only the last number in it. The early return on the length difference is
 * what makes the squared step above cheap: most pairs of words are nowhere
 * near each other and are refused before a single cell is filled in.
 */
function distance(a, b, cap) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let row = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    row[0] = i;
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      if (row[j] < best) best = row[j];
    }
    // Every distance from here on can only grow, so a row whose best cell is
    // already over the cap cannot come back under it.
    if (best > cap) return cap + 1;
    [prev, row] = [row, prev];
  }
  return prev[b.length];
}

// How many edits a word of this length is allowed before it stops being a
// misspelling of itself. One for an ordinary word, two once there is enough
// word for two slips to still leave it recognisable.
const allowance = (len) => (len < FUZZY_MIN ? 0 : len < 8 ? 1 : 2);

/**
 * What one token is worth against another, from 0 (unrelated) to 1 (the same
 * word). Figures are exact or nothing; everything else may be misspelt.
 */
export function closeness(a, b) {
  if (a.stem === b.stem) return 1;
  // A figure against a word, or a figure against a different figure, is a
  // wrong answer rather than a near one. This is the rule that stops 1066
  // being marked as very nearly 1067.
  if (a.number || b.number) return 0;
  const len = Math.max(a.stem.length, b.stem.length);
  const cap = allowance(len);
  if (!cap) return 0;
  const d = distance(a.stem, b.stem, cap);
  if (d > cap) return 0;
  // A misspelling is worth most of the word, scaled by how much of it
  // survived. It is deliberately never worth all of it.
  return 1 - d / len;
}

// --- putting the two side by side ------------------------------------------

/**
 * Pair the answer's tokens off against the card's.
 *
 * Every pair worth considering is scored, the list is sorted best first, and
 * pairs are taken from the top with each token allowed to be used once. Doing
 * it in that order rather than walking one side and grabbing the best
 * remaining match makes the result independent of which token happened to
 * come first, which matters: a mark that changes when a sentence is
 * rearranged is exactly what this module is supposed to be immune to.
 */
function pairUp(answer, key) {
  const pairs = [];
  for (let i = 0; i < answer.length; i++) {
    for (let j = 0; j < key.length; j++) {
      const score = closeness(answer[i], key[j]);
      if (score > 0) pairs.push({ i, j, score });
    }
  }
  // Ties are broken on position so that two identical words in the answer
  // pair off with the card in a settled order rather than whichever way the
  // sort happened to leave them.
  pairs.sort((x, y) => y.score - x.score || x.i - y.i || x.j - y.j);
  const usedA = new Array(answer.length).fill(false);
  const usedK = new Array(key.length).fill(false);
  const taken = [];
  for (const p of pairs) {
    if (usedA[p.i] || usedK[p.j]) continue;
    usedA[p.i] = true;
    usedK[p.j] = true;
    taken.push(p);
  }
  return { taken, usedA, usedK };
}

// Pairs of neighbouring stems. Two answers built from the same words in the
// same order share all of these; the same words rearranged share none, which
// is precisely the difference this is measuring.
//
// The mortar is dropped first, so that following the card's phrasing means
// following its substance in the card's order rather than happening to have
// written "of the" in the same place. Two answers that share only their
// small words share no phrasing at all, which is the honest reading of it.
function bigrams(tokens) {
  const bricks = tokens.filter((t) => !STOP.has(t.word));
  const out = [];
  for (let i = 1; i < bricks.length; i++) out.push(bricks[i - 1].stem + ' ' + bricks[i].stem);
  return out;
}

/**
 * How much of the card's phrasing the answer follows, 0 to 1.
 *
 * A one-word card has no phrasing to follow and scores 0 here, which costs
 * nothing: this only ever adds.
 */
function phrasing(answer, key) {
  const a = bigrams(answer);
  const k = bigrams(key);
  if (!a.length || !k.length) return 0;
  const pool = new Map();
  for (const g of k) pool.set(g, (pool.get(g) || 0) + 1);
  let shared = 0;
  for (const g of a) {
    const left = pool.get(g) || 0;
    if (left > 0) {
      pool.set(g, left - 1);
      shared += 1;
    }
  }
  // The harmonic mean again, for the same reason as below: repeating one
  // phrase of the card over and over should not look like following all of
  // it.
  const p = shared / a.length;
  const r = shared / k.length;
  return p + r === 0 ? 0 : (2 * p * r) / (p + r);
}

const negations = (tokens) => tokens.filter((t) => NEGATORS.has(t.word)).length;

// --- the mark --------------------------------------------------------------

// What a mark is called, and where the bands fall. A battle is settled on the
// number rather than the band — a duel decided by a rounding is a duel nobody
// can argue with — but a player reading their own answer back wants a word
// for it more than a decimal.
export const BANDS = [
  { at: 0.85, key: 'got', label: 'Got it' },
  { at: 0.65, key: 'close', label: 'Close' },
  { at: 0.4, key: 'some', label: 'Some of it' },
  { at: 0, key: 'missed', label: 'Missed it' },
];

export const bandFor = (score) => BANDS.find((b) => score >= b.at) || BANDS[BANDS.length - 1];

/**
 * Mark `given` against `wanted` — what the player typed against the back of
 * the card.
 *
 * Returns the mark out of 1, the band it falls in, and the working: which of
 * the card's words were found, which were missed, and which of the player's
 * were not on the card. The working is what the reveal screen prints, and it
 * is the reason this returns an object rather than a number.
 */
export function grade(given, wanted) {
  const answer = tokenise(given);
  const key = tokenise(wanted);

  // Nothing typed is nothing earned, and a card with no back to mark against
  // cannot fail anybody — both come back as a nought with the working empty.
  if (!answer.length || !key.length) {
    return {
      score: 0,
      band: bandFor(0),
      found: [],
      missed: key.filter((t) => !STOP.has(t.word)).map((t) => t.word),
      extra: [],
      flipped: false,
    };
  }

  const { taken, usedA, usedK } = pairUp(answer, key);

  // The weight of a match is the lighter of the two tokens it joins, so a
  // stop word in the answer cannot collect the full weight of a real word on
  // the card, or the other way about.
  let matched = 0;
  for (const p of taken) matched += Math.min(answer[p.i].weight, key[p.j].weight) * p.score;

  const answerWeight = answer.reduce((n, t) => n + t.weight, 0);
  const keyWeight = key.reduce((n, t) => n + t.weight, 0);

  // Precision: of what the player wrote, how much of it was asked for.
  // Recall: of what the card wanted, how much of it turned up.
  const precision = matched / answerWeight;
  const recall = matched / keyWeight;

  // The F-measure, leaning on recall by RECALL_BIAS. The harmonic mean is the
  // whole point: an answer can only score well by doing well at both, so
  // neither a one-word guess that happens to be on the card nor a page of
  // everything can get near the top.
  const b2 = RECALL_BIAS * RECALL_BIAS;
  const denom = b2 * precision + recall;
  const f = denom === 0 ? 0 : ((1 + b2) * precision * recall) / denom;

  // Phrasing closes part of whatever is left, and nothing else.
  let score = f + (1 - f) * PHRASE_LIFT * phrasing(answer, key);

  // An answer that negates the card has not half-remembered it. Counted
  // rather than merely noticed, so that "not soluble" against "not soluble"
  // agrees and "soluble" against "not soluble" does not.
  const flipped = negations(answer) % 2 !== negations(key) % 2;
  if (flipped) score = Math.min(score, NEGATION_CAP);

  // The same thought about figures. "Hastings was in 1067" is word-perfect
  // apart from the one thing the card was asking for, and a mark in the sixties
  // would be the marker agreeing that the date is a detail.
  const keyFigures = key.filter((t) => t.number).map((t) => t.stem);
  const saidFigures = answer.filter((t) => t.number).map((t) => t.stem);
  const contradicted =
    keyFigures.length > 0 && saidFigures.length > 0 && !saidFigures.some((n) => keyFigures.includes(n));
  if (contradicted) score = Math.min(score, FIGURE_CAP);

  score = Math.max(0, Math.min(1, score));

  // The working. Only the bricks are listed: telling somebody they left out
  // "the" is noise dressed up as feedback.
  const worthSaying = (t) => !STOP.has(t.word);
  return {
    score,
    band: bandFor(score),
    found: taken.map((p) => key[p.j]).filter(worthSaying).map((t) => t.word),
    missed: key.filter((t, j) => !usedK[j] && worthSaying(t)).map((t) => t.word),
    extra: answer.filter((t, i) => !usedA[i] && worthSaying(t)).map((t) => t.word),
    flipped,
  };
}

/** The mark as a battle counts it: a whole number out of 100. */
export const points = (score) => Math.round(score * 100);
