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
//     member's own flashcards always are, and what the two hand-written decks
//     below are.
//   * **`choice`** — a front and four options, one of them right. You pick
//     one. There is no "close" about it: a choice is 100 or nought.
//
// The second kind exists because of what is in `decks/`: the MMLU sets, which
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
// Either drop another CSV into `decks/` in the MMLU shape
// (`question,A,B,C,D,letter`, no header), or add an object to `WRITTEN`
// below. The shape is the whole contract:
//
//   id       a short slug, never reused and never changed — a room that is
//            being set up holds this string, so renaming one mid-match would
//            point it at nothing
//   name     what the lobby calls it
//   blurb    one line, said in the lobby under the name
//   kind     'text' or 'choice'
//   cards    text:   [{ front, back, hint }]
//            choice: [{ front, options: [four strings], answer: index }]
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

// --- the hand-written decks ------------------------------------------------
//
// Two of them, so the room has something short and friendly in it beside the
// examination papers, and so the tests have a fixed `text` deck to play
// against.

const WRITTEN = [
  {
    id: 'bones',
    name: 'The human skeleton',
    blurb: 'Twelve bones, and what each of them is for.',
    kind: 'text',
    cards: [
      { front: 'What is the common name for the clavicle?', back: 'The collarbone', hint: 'It joins the arm to the trunk.' },
      { front: 'Which bone protects the brain?', back: 'The cranium, or skull', hint: '' },
      { front: 'What is the longest bone in the human body?', back: 'The femur, the thigh bone', hint: '' },
      { front: 'How many bones are there in an adult human body?', back: '206 bones', hint: 'More at birth, fewer once they fuse.' },
      { front: 'What is the common name for the patella?', back: 'The kneecap', hint: '' },
      { front: 'Which two bones make up the forearm?', back: 'The radius and the ulna', hint: '' },
      { front: 'What is the scientific name for the backbone?', back: 'The vertebral column, or spine', hint: '' },
      { front: 'Which bone is the stirrup, the smallest in the body?', back: 'The stapes, in the middle ear', hint: '' },
      { front: 'What is the sternum?', back: 'The breastbone, at the front of the ribcage', hint: '' },
      { front: 'How many pairs of ribs does a human normally have?', back: '12 pairs', hint: '' },
      { front: 'Which bone is the scapula?', back: 'The shoulder blade', hint: '' },
      { front: 'What tissue makes blood cells inside a bone?', back: 'Bone marrow', hint: '' },
    ],
  },
  {
    id: 'capitals',
    name: 'Capital cities',
    blurb: 'Twelve countries, and the city that runs each one.',
    kind: 'text',
    cards: [
      { front: 'What is the capital of Australia?', back: 'Canberra', hint: 'Not the biggest city in the country.' },
      { front: 'What is the capital of Canada?', back: 'Ottawa', hint: '' },
      { front: 'What is the capital of Brazil?', back: 'Brasilia', hint: 'Purpose-built, and inland.' },
      { front: 'What is the capital of Switzerland?', back: 'Bern', hint: '' },
      { front: 'What is the capital of New Zealand?', back: 'Wellington', hint: '' },
      { front: 'What is the capital of Turkey?', back: 'Ankara', hint: 'Not the city on the Bosphorus.' },
      { front: 'What is the capital of South Africa?', back: 'Pretoria is the administrative capital', hint: 'It has three.' },
      { front: 'What is the capital of Morocco?', back: 'Rabat', hint: '' },
      { front: 'What is the capital of Vietnam?', back: 'Hanoi', hint: '' },
      { front: 'What is the capital of Norway?', back: 'Oslo', hint: '' },
      { front: 'What is the capital of Kazakhstan?', back: 'Astana', hint: '' },
      { front: 'What is the capital of Portugal?', back: 'Lisbon', hint: '' },
    ],
  },
];

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
export function parseCsv(text) {
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
    else if (c === ',') {
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
    // No CSVs is not an error: the two hand-written decks are a working room,
    // and a checkout without them should still boot.
    return [];
  }
  return files
    .sort()
    .map(deckFromCsv)
    .filter((d) => d.cards.length >= 2);
}

// --- the shelf --------------------------------------------------------------

const DECKS = [...WRITTEN.map((d) => ({ ...d, house: true })), ...loadCsvDecks()];
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
    count: d.cards.length,
  }));

export const deck = (id) => byId.get(String(id || '')) || null;

export const has = (id) => byId.has(String(id || ''));

/** The id the lobby starts on, so a room is always set to something real. */
export const DEFAULT_DECK = WRITTEN[0].id;

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
        if (!Array.isArray(c.options) || c.options.length !== 4) throw new Error(`${where}: needs four options`);
        if (c.options.some((o) => !String(o).trim())) throw new Error(`${where}: has a blank option`);
        if (!Number.isInteger(c.answer) || c.answer < 0 || c.answer > 3) throw new Error(`${where}: no answer`);
      }
    }
  }
  return { decks: DECKS.length, cards: DECKS.reduce((n, d) => n + d.cards.length, 0) };
}
