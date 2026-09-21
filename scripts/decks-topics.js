// ---------------------------------------------------------------------------
// Put a topic on the cards that do not have one.
//
//   npm run decks:topics                          read it, say what it would do
//   npm run decks:topics -- --write               and write the labels in
//   npm run decks:topics -- --among science ...   restrict what it may choose
//
// A subject paper knows its own topic, because the topic is the file it came
// in — `SUBJECT_TOPICS` in `decks.js` maps the fifty-seven of them and no
// guessing is involved. A converted deck knows nothing, and this is what
// guesses for it: naive Bayes over the site's own tokeniser, trained on the
// papers, which are fourteen thousand questions whose answer sheet is free.
//
// --- it would rather say nothing than be wrong -----------------------------
//
// Labelling everything would be about four cards in five, and the fifth is
// not marked as doubtful in any way a reader could see. So the run measures
// itself on held-out papers first, finds the confidence at which it is right
// TARGET of the time, and labels only above it. Everything below stays
// unsorted: still in its own deck, still playable, simply not claimed.
//
// An unsorted card costs somebody nothing. A card filed under Chemistry that
// is really about frogs is a small lie, told every time that topic is picked.
//
// --- the score is measured in the wrong place, and cannot be ---------------
//
// The accuracy printed below is measured on MMLU questions, because they are
// the only ones with a known answer. The cards being labelled are grade-
// school science, which is not the same kind of writing, so the real rate on
// them is somewhat worse than the figure here and there is no honest way to
// find out how much short of reading a sample by hand.
//
// That is what `--among` is for. The classifier can only answer with a topic
// it is allowed to answer with, so pointing it at a science deck with the
// science topics named is worth more than any threshold: it cannot file a
// question about photosynthesis under Law if Law is not on the list.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Decks from '../server/decks.js';
import { tokenise } from '../server/grade.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DECK_DIR = path.join(__dirname, '..', 'server', 'decks');

// How often a label should be right before it is worth writing down.
const TARGET = 0.95;

// A shorthand for the run that matters, so it does not have to be typed out
// and mistyped. Everything the converted decks hold is school science.
const AMONG = {
  science: ['Biology', 'Chemistry', 'Physics', 'Space and earth', 'Medicine', 'Mathematics', 'Computing'],
};

const ok = (s) => console.log(`  ok    ${s}`);
const no = (s) => console.log(`  no    ${s}`);
const hm = (s) => console.log(`  hm    ${s}`);
const note = (s) => console.log(`        ${s}`);

// --- the bag of words ------------------------------------------------------
//
// The site's own tokeniser, so that a word is the same word here as it is to
// the marker. Figures are dropped — every paper is full of them and none of
// them says what the question is about — and each stem counts once however
// often it appears, which stops a word repeated down a list of options from
// outvoting the question itself.

const words = (text) => {
  const seen = new Set();
  for (const t of tokenise(text)) if (!t.number && t.stem.length > 2) seen.add(t.stem);
  return [...seen];
};

const textOf = (card) => card.front + ' ' + (card.options || []).join(' ');

// --- naive Bayes -----------------------------------------------------------

function train(rows) {
  const counts = new Map();
  const totals = new Map();
  const docs = new Map();
  const vocab = new Set();
  for (const { text, topic } of rows) {
    if (!counts.has(topic)) {
      counts.set(topic, new Map());
      totals.set(topic, 0);
      docs.set(topic, 0);
    }
    docs.set(topic, docs.get(topic) + 1);
    const bag = counts.get(topic);
    for (const w of words(text)) {
      bag.set(w, (bag.get(w) || 0) + 1);
      totals.set(topic, totals.get(topic) + 1);
      vocab.add(w);
    }
  }
  return { counts, totals, docs, vocab, n: rows.length };
}

/**
 * The likeliest topic, and how far clear of the runner-up it was.
 *
 * The margin is divided by the number of words, because a long question piles
 * up log-likelihood on whichever topic is winning and would otherwise look
 * confident merely for being long.
 */
function classify(model, text) {
  const bag = words(text);
  const V = model.vocab.size;
  let best = null;
  let first = -Infinity;
  let second = -Infinity;
  for (const [topic, table] of model.counts) {
    let score = Math.log(model.docs.get(topic) / model.n);
    const total = model.totals.get(topic);
    for (const w of bag) score += Math.log(((table.get(w) || 0) + 1) / (total + V));
    if (score > first) {
      second = first;
      first = score;
      best = topic;
    } else if (score > second) second = score;
  }
  return { topic: best, margin: (first - second) / Math.max(1, bag.length) };
}

// --- the answer sheet ------------------------------------------------------

function papers(allowed) {
  const rows = [];
  for (const d of Decks.catalog()) {
    const topic = Decks.TOPIC_OF_DECK.get(d.id);
    if (!topic || (allowed && !allowed.includes(topic))) continue;
    for (const c of Decks.deck(d.id).cards) rows.push({ text: textOf(c), topic });
  }
  return rows;
}

// A fixed shuffle, so that two runs of this script agree with each other and
// a threshold can be compared with the one from last time.
function shuffled(list) {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Measure, then choose where to stop.
 *
 * Every held-out question is classified and kept with its margin and whether
 * it was right. Walking that list from the most confident down, the threshold
 * is the last point at which the run is still right TARGET of the time.
 */
function measure(rows) {
  const all = shuffled(rows);
  const cut = Math.floor(all.length * 0.8);
  const model = train(all.slice(0, cut));
  const test = all.slice(cut);

  const scored = test
    .map((r) => {
      const { topic, margin } = classify(model, r.text);
      return { hit: topic === r.topic, margin };
    })
    .sort((a, b) => b.margin - a.margin);

  const whole = scored.filter((r) => r.hit).length / scored.length;
  let hits = 0;
  let threshold = Infinity;
  let covered = 0;
  let at = 0;
  for (let i = 0; i < scored.length; i++) {
    if (scored[i].hit) hits += 1;
    if (hits / (i + 1) >= TARGET) {
      threshold = scored[i].margin;
      covered = (i + 1) / scored.length;
      at = hits / (i + 1);
    }
  }
  return { model: train(rows), tested: scored.length, whole, threshold, covered, at };
}

// --- the run ---------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  const opts = { write: false, ids: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write') opts.write = true;
    else if (a === '--among') opts.among = argv[++i];
    else if (a.startsWith('--')) {
      no(`I do not know the option ${a}`);
      process.exit(2);
    } else opts.ids.push(a);
  }

  let allowed = null;
  if (opts.among) {
    allowed = AMONG[opts.among] || opts.among.split(',').map((s) => s.trim()).filter(Boolean);
    const unknown = allowed.filter((t) => !Decks.TOPICS.includes(t));
    if (unknown.length) {
      no(`no such topic: ${unknown.join(', ')}`);
      note(`the topics are: ${Decks.TOPICS.join(', ')}`);
      process.exit(2);
    }
  }

  // The decks that need labelling: the ones written as `.deck.json`, since a
  // paper already knows its topic and a topic deck is made of both.
  const ids = opts.ids.length
    ? opts.ids
    : Decks.catalog()
        .filter((d) => !d.topic && !Decks.TOPIC_OF_DECK.has(d.id) && fs.existsSync(path.join(DECK_DIR, `${d.id}.deck.json`)))
        .map((d) => d.id);
  if (!ids.length) {
    no('no converted decks to label');
    process.exit(1);
  }

  const rows = papers(allowed);
  const { model, tested, whole, threshold, covered, at } = measure(rows);
  console.log(`Trained on ${rows.length.toLocaleString('en-GB')} questions from the subject papers.`);
  console.log(`Choosing between: ${[...model.counts.keys()].sort().join(', ')}`);
  console.log('');
  ok(`held out ${tested.toLocaleString('en-GB')}: ${(whole * 100).toFixed(1)}% right if everything is labelled`);
  ok(`at a margin of ${threshold.toFixed(3)}: ${(at * 100).toFixed(1)}% right, over ${(covered * 100).toFixed(0)}% of them`);
  note('measured on the papers, so the real rate on converted cards is somewhat worse.');
  console.log('');

  let labelled = 0;
  let total = 0;
  for (const id of ids) {
    const file = path.join(DECK_DIR, `${id}.deck.json`);
    if (!fs.existsSync(file)) {
      no(`${id}: there is no ${id}.deck.json to write a label into`);
      continue;
    }
    const deck = JSON.parse(fs.readFileSync(file, 'utf8'));
    const tally = new Map();
    let sorted = 0;
    for (const card of deck.cards) {
      const { topic, margin } = classify(model, textOf(card));
      if (margin >= threshold) {
        card.topic = topic;
        sorted += 1;
        tally.set(topic, (tally.get(topic) || 0) + 1);
      } else delete card.topic;
    }
    labelled += sorted;
    total += deck.cards.length;
    const share = ((sorted / deck.cards.length) * 100).toFixed(0);
    const spread = [...tally].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n.toLocaleString('en-GB')}`).join(', ');
    (sorted ? ok : hm)(`${id.padEnd(14)} ${sorted.toLocaleString('en-GB')} of ${deck.cards.length.toLocaleString('en-GB')} sorted (${share}%)`);
    if (spread) note(spread);
    if (opts.write) fs.writeFileSync(file, JSON.stringify(deck, null, 2) + String.fromCharCode(10), 'utf8');
  }

  console.log('');
  const share = ((labelled / total) * 100).toFixed(0);
  if (opts.write) ok(`${labelled.toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')} cards labelled (${share}%). Run npm run decks:check to see the topic decks.`);
  else ok(`${labelled.toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')} cards would be labelled (${share}%). Nothing written — pass --write.`);
}

main();
