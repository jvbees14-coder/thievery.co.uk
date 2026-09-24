// ---------------------------------------------------------------------------
// The house decks.
//
// A battle can be fought on the players' own flashcards or on a set the house
// keeps. This is the second of those: fixed decks, the same for everybody and
// never edited from the site.
//
// --- two kinds of card -----------------------------------------------------
//
// A deck says which kind it deals, and every card in it is that kind:
//
//   * **`text`** — a front and a back. You type what you think the back says
//     and `grade.js` marks how close you got, out of 100. This is what a
//     member's own flashcards always are.
//   * **`choice`** — a front and a handful of options, one of them right. You
//     pick one. There is no "close" about it: a choice is 100 or nought.
//     Usually four, because that is what the papers deal, but see
//     `MAX_OPTIONS` below: nothing in the room counts on it.
//
// The site's own decks are all this second kind; a `text` house deck is
// only ever a test fixture (see EXTRA_DIR). It exists because of what is in `decks/`: the MMLU sets, which
// are multiple-choice by construction. Flattening them into `text` cards was
// the obvious move and it is the wrong one — half those questions are "which
// of the following…", and a question that cannot be read without its options
// is not a flashcard, it is a broken flashcard. So the room learnt to deal
// both kinds rather than the data being bent into one.
//
// A `choice` card's options are shuffled when the match is dealt, not here,
// so that the right answer is not always in the same place — see `dealFrom`
// in `battle.js`. What is stored here is the option list and which index is
// correct.
//
// --- where they live -------------------------------------------------------
//
// In the source, not in the stored document, so a house deck cannot be
// traded, renamed, lost with an account, or put out of reach by a bucket. A
// battle on a house deck is the one thing in this room that would still work
// if the ledger did not — which is academic, since the room needs the ledger
// to know who you are, but it is the right way round.
//
// The CSVs live under `server/` rather than beside the tests because the
// Dockerfile copies `server/` and `public/` and nothing else: a deck the
// image does not carry is a deck nobody can play.
//
// --- adding a deck ---------------------------------------------------------
//
// There are two ways in, and they exist for two different reasons:
//
//   * a CSV in `decks/` in the MMLU shape (`question,A,B,C,D,letter`, no
//     header, named `*_test.csv`) — the published papers, kept exactly as
//     they were published so each can be checked against its source;
//   * a `*.deck.json` in `decks/` — anything converted from somewhere else,
//     written by `scripts/decks-import.js`. It carries its own id, name and
//     blurb, because a converted deck has no filename convention worth
//     trusting and nothing should have to guess what it is called.
//
// The shape is the whole contract, and the JSON file is exactly it:
//
//   id       a short slug, never reused and never changed — a room that is
//            being set up holds this string, so renaming one mid-match would
//            point it at nothing
//   name     what the lobby calls it
//   blurb    one line, said in the lobby under the name
//   kind     'text' or 'choice'
//   cards    text:   [{ front, back, hint }]
//            choice: [{ front, options: [two to eight strings], answer: index }]
//
// Four options is what the MMLU papers deal and what most people picture, but
// nothing in the room requires it: `asChoiceCard` shuffles however many there
// are and the page lists them down the card. A true/false deck is a choice
// deck with two.
//
// The only rule about a `text` back is the one `grade.js` cares about: it
// should be the answer and not a sentence about the answer. "Mitochondria
// produce ATP" marks well; "This one is about the mitochondria, which produce
// ATP" spends half its words on mortar and drags every honest answer down
// with it.
//
// `check()` is run by the battle room at start-up, so a malformed deck stops
// the process rather than turning up as a card nobody can score a point on.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_DIR = path.join(__dirname, 'decks');

// A second folder of `*.deck.json`, named by the environment and read after
// the first. It exists for the tests: the battle suite plays against two short
// `text` decks in `test/fixtures/decks/`, because typed answers are what the
// one-rule audit reads for, and the site itself carries no house deck of that
// kind. Nothing in production sets it.
const EXTRA_DIR = process.env.THIEVERY_EXTRA_DECKS ? path.resolve(process.env.THIEVERY_EXTRA_DECKS) : null;

// --- the MMLU sets ---------------------------------------------------------
//
// Fifty-seven subjects of four-option questions, from the Measuring Massive
// Multitask Language Understanding set of Hendrycks et al. (MIT licensed).
// They are read from the CSVs as they were published rather than converted
// into anything, so a deck can be checked against its source with `diff`.

// A CSV reader, because there is no dependency here that could do it and this
// is the whole of what the format needs: quoted fields, doubled quotes inside
// them, and newlines inside quotes — which these files do use, since several
// subjects ask about a passage.
//
// The separator is an argument only so that `scripts/decks-import.js` can
// read a tab-separated export with this same reader rather than keeping a
// second one of its own. The papers here are commas and always will be.
export function parseCsv(text, sep = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  // A file that does not end in a newline still has a last row in hand.
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const LETTERS = { A: 0, B: 1, C: 2, D: 3 };

// How many options a choice card may carry. Two is a true/false card, which
// is a real kind of question. The ceiling is not a technical limit — the page
// lists them down the card and would take twenty — but a card nobody can hold
// in their head while they read it is not being answered, it is being
// searched. Eight is where it sits because that is what the published
// eight-option sets deal, and refusing those outright would be a rule about
// tidiness rather than about the game.
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 8;

// "high_school_european_history" -> "High school European history". The two
// special cases are the ones that read wrong in sentence case.
const FIXES = { us: 'US', ai: 'AI' };
function titleOf(slug) {
  const words = slug.split('_').map((w) => FIXES[w] || w);
  const first = words[0];
  return [first.charAt(0).toUpperCase() + first.slice(1), ...words.slice(1)].join(' ');
}

function deckFromCsv(file) {
  const slug = path.basename(file, '_test.csv');
  const rows = parseCsv(fs.readFileSync(path.join(CSV_DIR, file), 'utf8'));
  const cards = [];
  for (const row of rows) {
    // Six fields exactly: the question, four options, and the letter. A row
    // that is not that shape is a blank line or something this reader has
    // misunderstood, and either way it is not a question.
    if (row.length < 6) continue;
    const front = row[0].trim();
    const options = row.slice(1, 5).map((o) => o.trim());
    const answer = LETTERS[row[5].trim().toUpperCase()];
    if (!front || answer === undefined) continue;
    if (options.some((o) => !o)) continue;
    cards.push({ front, options, answer });
  }
  return {
    id: 'mmlu-' + slug.replace(/_/g, '-'),
    name: titleOf(slug),
    blurb: `${cards.length.toLocaleString('en-GB')} four-option questions, from the MMLU set.`,
    kind: 'choice',
    house: false, // written by somebody else, and said so in the lobby
    cards,
  };
}

function loadCsvDecks() {
  let files;
  try {
    files = fs.readdirSync(CSV_DIR).filter((f) => f.endsWith('_test.csv'));
  } catch {
    // No CSVs is not an error: a checkout without them should still boot.
    return [];
  }
  return files
    .sort()
    .map(deckFromCsv)
    .filter((d) => d.cards.length >= 2);
}

// --- the converted decks ---------------------------------------------------
//
// A deck that came from somewhere else arrives here already in the shape the
// room deals, because `scripts/decks-import.js` did the guessing once, at a
// desk, where a bad guess can be looked at. Nothing is inferred at boot.
//
// A file that will not parse stops the process, which is the opposite of how
// the CSVs are read and deliberately so: a missing CSV directory means a
// checkout without the papers, but a `.deck.json` that is broken is a deck
// somebody meant to put in the room. Dropping it quietly would leave a lobby
// that is simply missing something, with nothing anywhere saying why.

function loadJsonDecks(dir) {
  if (!dir) return [];
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.deck.json'));
  } catch {
    return [];
  }
  return files.sort().map((file) => {
    const where = path.join(dir, file);
    let deck;
    try {
      deck = JSON.parse(fs.readFileSync(where, 'utf8'));
    } catch (err) {
      throw new Error(`Deck file ${file} will not parse: ${err.message}`);
    }
    if (!deck || typeof deck !== 'object' || Array.isArray(deck)) {
      throw new Error(`Deck file ${file} is not a deck object`);
    }
    // `house` says which of the lobby's two lists it goes in, so it is a
    // judgement about the deck and not something to infer from the format.
    return { ...deck, house: deck.house === true };
  });
}

// --- the topics -------------------------------------------------------------
//
// A subject paper already knows what it is about — it is the file it arrived
// in — so grouping the fifty-seven of them into topics is bookkeeping, not
// guesswork, and this map is the whole of it. "High school biology" and
// "college biology" are one topic to somebody choosing what to revise.
//
// A converted deck has no such luck, and carries a `topic` on each card put
// there by `scripts/decks-topics.js` at a desk. A card it was not confident
// about carries none, deliberately: an unsorted card is a card somebody can
// still find in its own deck, and a wrongly sorted one is a small lie told
// every time the topic is picked.

const SUBJECT_TOPICS = {
  Biology: ['anatomy', 'college-biology', 'high-school-biology', 'medical-genetics', 'virology', 'human-aging', 'nutrition'],
  Medicine: ['clinical-knowledge', 'college-medicine', 'professional-medicine', 'human-sexuality'],
  Chemistry: ['college-chemistry', 'high-school-chemistry'],
  Physics: ['college-physics', 'high-school-physics', 'conceptual-physics'],
  'Space and earth': ['astronomy', 'high-school-geography', 'global-facts'],
  Mathematics: ['abstract-algebra', 'college-mathematics', 'elementary-mathematics', 'high-school-mathematics', 'high-school-statistics'],
  Computing: ['college-computer-science', 'high-school-computer-science', 'computer-security', 'machine-learning', 'electrical-engineering'],
  Economics: ['econometrics', 'high-school-macroeconomics', 'high-school-microeconomics'],
  Business: ['business-ethics', 'management', 'marketing', 'professional-accounting', 'public-relations'],
  Law: ['international-law', 'jurisprudence', 'professional-law'],
  History: ['high-school-european-history', 'high-school-us-history', 'high-school-world-history', 'prehistory'],
  Politics: ['high-school-government-and-politics', 'us-foreign-policy', 'security-studies'],
  Philosophy: ['philosophy', 'formal-logic', 'logical-fallacies', 'moral-disputes', 'moral-scenarios', 'world-religions'],
  Psychology: ['high-school-psychology', 'professional-psychology', 'sociology'],
  Miscellany: ['miscellaneous'],
};

/** The topic a whole deck belongs to, where its name settles the question. */
export const TOPIC_OF_DECK = new Map();
for (const [topic, subjects] of Object.entries(SUBJECT_TOPICS)) {
  for (const s of subjects) TOPIC_OF_DECK.set('mmlu-' + s, topic);
}

// The converted decks are all grade-school science, which is a topic in its
// own right. A card from one of them that the topic pass left untagged is
// filed here by the deck it came from, which is bookkeeping rather than a
// guess: it is certainly science, and nothing more specific was claimed.
// Without this, six in ten of those cards would be in no topic at all, and
// since the lobby lists topics rather than sources, in no list either.
const GENERAL_SCIENCE = 'General science';
const CATCH_ALL = new Map(
  ['arc-challenge', 'arc-easy', 'openbookqa', 'qasc', 'sciq'].map((id) => [id, GENERAL_SCIENCE])
);

export const TOPICS = [...Object.keys(SUBJECT_TOPICS), GENERAL_SCIENCE];

// A topic needs this many cards before it is worth being its own deck. Below
// it the lobby gains a line and nobody gains a match.
const TOPIC_MIN = 40;

const slug = (topic) => 'topic-' + topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * The decks assembled by topic, drawn from every other deck on the shelf.
 *
 * The cards are the same objects, not copies: a topic deck is another way in
 * to a card, not a second card. Nothing writes to a card after load, so the
 * sharing is safe and the memory is not spent twice.
 *
 * Only `choice` cards are gathered, and the reason is `dealFrom`: it picks
 * one builder for the whole deck off `deck.kind`, so a deck holding both
 * kinds would deal a text card as a choice and fall over on its missing
 * options. A mixed topic deck is a bug waiting on the day somebody writes a
 * `text` deck about biology.
 */
function topicDecks(decks) {
  const piles = new Map();
  const seen = new Map();
  for (const d of decks) {
    if (d.kind !== 'choice') continue;
    const whole = TOPIC_OF_DECK.get(d.id) || null;
    for (const c of d.cards) {
      const topic = whole || c.topic || CATCH_ALL.get(d.id) || null;
      if (!topic) continue;
      if (!piles.has(topic)) {
        piles.set(topic, []);
        seen.set(topic, new Set());
      }
      // The same question can be in two papers — a hundred-odd of them are in
      // both the clinical and the professional medicine sets — and a topic
      // gathers both. Asking it twice in one match looks like a fault, so the
      // second copy is dropped here.
      //
      // The whole card is the key, not its front: "Which of the following
      // statements is correct?" is the opening of a hundred unrelated
      // questions, and telling them apart is exactly what the options are for.
      const key = c.front + String.fromCharCode(31) + c.options.join(String.fromCharCode(31));
      if (seen.get(topic).has(key)) continue;
      seen.get(topic).add(key);
      piles.get(topic).push(c);
    }
  }
  return [...piles]
    .filter(([, cards]) => cards.length >= TOPIC_MIN)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([topic, cards]) => ({
      id: slug(topic),
      name: topic,
      blurb: `${cards.length.toLocaleString('en-GB')} multiple-choice questions.`,
      kind: 'choice',
      house: false,
      topic: true,
      cards,
    }));
}

// --- the shelf --------------------------------------------------------------

const SOURCES = [...loadCsvDecks(), ...loadJsonDecks(CSV_DIR), ...loadJsonDecks(EXTRA_DIR)];
const DECKS = [...SOURCES, ...topicDecks(SOURCES)];
const byId = new Map(DECKS.map((d) => [d.id, d]));

/**
 * Every house deck, as the lobby lists them. The cards are not sent — a deck
 * the browser already holds is a deck the browser can answer from — and with
 * fifty-nine of them that would be several megabytes besides.
 */
export const catalog = () =>
  DECKS.map((d) => ({
    id: d.id,
    name: d.name,
    blurb: d.blurb,
    kind: d.kind,
    house: d.house,
    topic: d.topic === true,
    // What the lobby offers: the topics, and the decks written here. The
    // source decks the topics are gathered from stay in the catalog, because
    // their ids are held by rooms and by the record, but a source is a
    // detail nobody choosing what to revise should have to know.
    listed: d.topic === true || d.house === true,
    count: d.cards.length,
  }));

export const deck = (id) => byId.get(String(id || '')) || null;

export const has = (id) => byId.has(String(id || ''));

/** The id the lobby starts on, so a room is always set to something real. */
export const DEFAULT_DECK = (DECKS.find((d) => d.house) || DECKS.find((d) => d.topic) || DECKS[0] || {}).id || null;

/**
 * Every deck is well formed. Called once at start-up rather than trusted:
 * a card with no answer fails a long way from here — as a card in a live
 * round that nobody can score against, which reads as the marker being
 * broken.
 */
export function check() {
  const seen = new Set();
  for (const d of DECKS) {
    if (!d.id || seen.has(d.id)) throw new Error(`Deck id missing or repeated: ${d.id}`);
    seen.add(d.id);
    if (!d.name) throw new Error(`Deck ${d.id} has no name`);
    if (d.kind !== 'text' && d.kind !== 'choice') throw new Error(`Deck ${d.id} has no kind`);
    if (!Array.isArray(d.cards) || d.cards.length < 2) throw new Error(`Deck ${d.id} needs at least two cards`);
    for (const [i, c] of d.cards.entries()) {
      const where = `Deck ${d.id}, card ${i + 1}`;
      if (!c.front || !String(c.front).trim()) throw new Error(`${where}: no front`);
      if (d.kind === 'text') {
        if (!c.back || !String(c.back).trim()) throw new Error(`${where}: no back`);
      } else {
        if (!Array.isArray(c.options) || c.options.length < MIN_OPTIONS || c.options.length > MAX_OPTIONS) {
          throw new Error(`${where}: needs between ${MIN_OPTIONS} and ${MAX_OPTIONS} options, and has ${Array.isArray(c.options) ? c.options.length : 'none'}`);
        }
        if (c.options.some((o) => !String(o).trim())) throw new Error(`${where}: has a blank option`);
        if (!Number.isInteger(c.answer) || c.answer < 0 || c.answer >= c.options.length) {
          throw new Error(`${where}: no answer`);
        }
      }
    }
  }
  return { decks: DECKS.length, cards: DECKS.reduce((n, d) => n + d.cards.length, 0) };
}
