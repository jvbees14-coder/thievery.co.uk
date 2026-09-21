// ---------------------------------------------------------------------------
// Turn a pile of questions into a house deck.
//
//   npm run decks:import -- incoming/            # read it, say what it found
//   npm run decks:import -- --write incoming/    # and write the decks out
//
// Questions arrive in whatever shape whoever wrote them down felt like: a
// spreadsheet exported as CSV, a tab-separated Anki dump, a JSON array from
// some other app, a text file with "Q:" and "A:" down it. This reads all of
// those, works out which of the two kinds of card it is holding, and writes a
// `.deck.json` into `server/decks/` in the shape `decks.js` already deals.
//
// The guessing happens here, once, at a desk — not at boot, where a bad guess
// turns up as a card nobody can score against in the middle of somebody's
// match. That is the whole reason this file exists rather than the loader
// being made cleverer.
//
// --- it says what it threw away -------------------------------------------
//
// The MMLU reader in `decks.js` drops a row it cannot read and says nothing,
// which is right for a published set that is known to be well formed. It is
// quite wrong for a conversion: a file that half-converts still boots clean
// and simply holds half the questions, and nobody finds out until a deck that
// should have four hundred cards deals the same thirty all evening.
//
// So every row that does not become a card is counted, given a reason, and
// three of them are printed with the line they were on. Nothing is written
// until `--write`, so the ordinary way to use this is to run it, read what it
// says, fix the source, and run it again.
//
// --- what it will not do ---------------------------------------------------
//
// It will not guess an answer it cannot see. A multiple-choice row whose
// answer does not name one of its own options is dropped, not repaired: a
// card with the wrong answer marked is worse than a card that is missing,
// because the room will confidently tell somebody they were wrong.
//
// It will not overwrite a deck that is already on the shelf unless told to
// with `--replace`. An id is load-bearing — a room being set up holds that
// string — so taking one over is a decision, not a side effect.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, MIN_OPTIONS, MAX_OPTIONS, has as onTheShelf } from '../server/decks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DECK_DIR = path.join(__dirname, '..', 'server', 'decks');

// Built rather than typed, because a literal tab in a source file is the kind
// of character that survives every review and then goes missing in an edit.
// The byte-order mark is here for the same reason and one worse: spelt as a
// six-character escape it is liable to be turned into the character itself by
// the next tool that touches this file, and unlike a control character
// nothing in `test/source.test.js` would notice it had happened.
const TAB = String.fromCharCode(9);
const BOM = String.fromCharCode(65279);

const ok = (s) => console.log(`  ok    ${s}`);
const no = (s) => console.log(`  no    ${s}`);
const hm = (s) => console.log(`  hm    ${s}`);
const note = (s) => console.log(`        ${s}`);

// --- the arguments ---------------------------------------------------------

function readArgs(argv) {
  const opts = { write: false, replace: false, paths: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write') opts.write = true;
    else if (a === '--replace') opts.replace = true;
    else if (a === '--house') opts.house = true;
    else if (a === '--id') opts.id = argv[++i];
    else if (a === '--name') opts.name = argv[++i];
    else if (a === '--blurb') opts.blurb = argv[++i];
    else if (a === '--kind') opts.kind = argv[++i];
    else if (a.startsWith('--')) throw new Error(`I do not know the option ${a}`);
    else opts.paths.push(a);
  }
  return opts;
}

// --- finding the files -----------------------------------------------------

const READABLE = new Set(['.csv', '.tsv', '.txt', '.text', '.json', '.jsonl', '.ndjson', '.md', '.tab']);

function filesUnder(where) {
  const stat = fs.statSync(where);
  if (!stat.isDirectory()) return [where];
  const found = [];
  for (const entry of fs.readdirSync(where, { withFileTypes: true })) {
    const full = path.join(where, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(full));
    else if (READABLE.has(path.extname(entry.name).toLowerCase())) found.push(full);
  }
  return found.sort();
}

// --- reading whatever it is ------------------------------------------------
//
// Each reader returns a list of { record, line }: a record is either a plain
// object of named fields or an array of cells, and the line is kept so that a
// row this cannot use can be pointed at rather than merely counted.

const lines = (text) => text.split(/\r?\n/);

function readJson(text) {
  const doc = JSON.parse(text);
  const list = Array.isArray(doc)
    ? doc
    : Array.isArray(doc.cards)
      ? doc.cards
      : Array.isArray(doc.questions)
        ? doc.questions
        : Array.isArray(doc.data)
          ? doc.data
          : null;
  if (!list) throw new Error('the JSON is not an array of cards, and has no cards/questions/data array in it');
  return list.map((record, i) => ({ record: namedPlainly(record), line: i + 1 }));
}

// `answerKey`, `answer key` and `Answer_Key` are one field with three spellings,
// and only one of them is worth writing down here. A header row already comes
// through `tidyKey`; this is the same courtesy for a record that arrived with
// its names attached.
function namedPlainly(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
  const out = {};
  for (const [k, v] of Object.entries(record)) {
    const key = tidyKey(k);
    if (key && out[key] === undefined) out[key] = v;
  }
  return out;
}

function readJsonLines(text) {
  const out = [];
  lines(text).forEach((raw, i) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    out.push({ record: namedPlainly(JSON.parse(trimmed)), line: i + 1 });
  });
  return out;
}

// Which separator a delimited file uses, decided on the first few lines
// rather than the extension, because a .txt from a spreadsheet is a CSV and a
// .csv from Anki is often tabs.
function separatorOf(text) {
  const sample = lines(text).filter((l) => l.trim()).slice(0, 20);
  const count = (sep) => sample.reduce((n, l) => n + l.split(sep).length - 1, 0);
  const tabs = count(TAB);
  const commas = count(',');
  const semis = count(';');
  if (tabs >= commas && tabs >= semis && tabs > 0) return TAB;
  if (semis > commas) return ';';
  return ',';
}

// Field names this understands, which is how a header row is recognised in
// the first place: if the top row is mostly words from these lists it is
// naming the columns, and if it is not then it is a question.
const FRONT_KEYS = ['front', 'question', 'question_stem', 'question_text', 'stem', 'q', 'prompt', 'term', 'ask', 'word', 'clue', 'text', 'title'];
const BACK_KEYS = ['back', 'answer', 'a', 'definition', 'def', 'response', 'solution', 'meaning', 'correct'];
const HINT_KEYS = ['hint', 'tip', 'note', 'help'];
const OPTION_LIST_KEYS = ['options', 'choices', 'alternatives', 'answers', 'distractors'];
const ANSWER_KEYS = ['answer', 'correct', 'correct_answer', 'correctanswer', 'key', 'solution', 'label', 'target', 'answer_index', 'answerindex', 'answer_key'];

// The camel case is taken apart before anything is lowercased, so that
// `answerKey` and `answer_key` and `Answer Key` all arrive as the same field.
// A run of capitals is left alone, because `ID` is a word and `i_d` is not.
const tidyKey = (k) =>
  String(k)
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

const KNOWN_KEYS = new Set([...FRONT_KEYS, ...BACK_KEYS, ...HINT_KEYS, ...OPTION_LIST_KEYS, ...ANSWER_KEYS,
  'b', 'c', 'd', 'e', 'f', 'option_a', 'option_b', 'option_c', 'option_d', 'option_1', 'option_2', 'option_3', 'option_4']);

function looksLikeHeader(row) {
  const cells = row.map(tidyKey).filter(Boolean);
  if (cells.length < 2) return false;
  const known = cells.filter((c) => KNOWN_KEYS.has(c) || /^(option|choice)_?[0-9a-f]$/.test(c)).length;
  return known >= Math.max(2, Math.ceil(cells.length / 2));
}

function readDelimited(text) {
  const sep = separatorOf(text);
  const rows = parseCsv(text, sep).filter((r) => r.some((c) => c.trim()));
  if (!rows.length) return [];
  if (looksLikeHeader(rows[0])) {
    const keys = rows[0].map(tidyKey);
    return rows.slice(1).map((row, i) => {
      const record = {};
      keys.forEach((k, j) => {
        if (k) record[k] = row[j] === undefined ? '' : row[j];
      });
      return { record, line: i + 2 };
    });
  }
  return rows.map((row, i) => ({ record: row, line: i + 1 }));
}

// Q:/A: prose. Blocks are separated by a blank line; inside a block a line
// may be marked as the question, the answer, a hint or an option, and a
// two-line block with no marks at all is taken as front then back.
const MARKED = {
  front: /^(q|question|front|term)\s*[:.)-]\s*/i,
  back: /^(a|ans|answer|back|definition)\s*[:.)-]\s*/i,
  hint: /^(h|hint|tip|note)\s*[:.)-]\s*/i,
};
const OPTION_LINE = /^[(\[]?([a-f])[)\].:-]\s+(.*)$/i;
const CORRECT_MARK = /\s*[(\[]?(correct|right|answer|true)[)\]]?\s*$/i;

function readProse(text) {
  const blocks = [];
  let current = [];
  let startedAt = 1;
  lines(text).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) {
      if (current.length) blocks.push({ lines: current, line: startedAt });
      current = [];
      return;
    }
    if (!current.length) startedAt = i + 1;
    current.push(line);
  });
  if (current.length) blocks.push({ lines: current, line: startedAt });

  return blocks.map(({ lines: block, line }) => {
    const record = { options: [] };
    let sawMark = false;
    // "a) The Treaty of Versailles" and "A: 1066" are the same shape and mean
    // opposite things — an option, and the answer. Neither line can say which
    // on its own, so the block decides: a run of two or more of them lettered
    // from a is a list of options, and anything else is somebody answering.
    const lettersRun = block
      .map((l) => OPTION_LINE.exec(l))
      .filter(Boolean)
      .map((m) => m[1].toLowerCase());
    const isChoiceBlock = lettersRun.length >= MIN_OPTIONS && lettersRun.every((l, i) => LETTER_INDEX[l] === i);

    for (const l of block) {
      const opt = isChoiceBlock ? OPTION_LINE.exec(l) : null;
      let matched = false;
      if (!opt) {
        for (const [field, re] of Object.entries(MARKED)) {
          if (re.test(l)) {
            record[field] = l.replace(re, '').trim();
            sawMark = true;
            matched = true;
            break;
          }
        }
      }
      if (matched) continue;
      if (opt) {
        let body = opt[2].trim();
        if (CORRECT_MARK.test(body)) {
          body = body.replace(CORRECT_MARK, '').trim();
          record.answer = body;
        }
        record.options.push(body);
        continue;
      }
      // An unmarked line: the first is the question, the rest pile up as the
      // answer, which is what a plain two-line block means.
      if (record.front === undefined) record.front = l;
      else record.back = record.back ? `${record.back} ${l}` : l;
    }
    if (!record.options.length) delete record.options;
    return { record, line, loose: !sawMark };
  });
}

function readFile(file) {
  const text = fs.readFileSync(file, 'utf8').split(BOM).join('');
  const ext = path.extname(file).toLowerCase();
  if (ext === '.json') return { how: 'JSON', rows: readJson(text) };
  if (ext === '.jsonl' || ext === '.ndjson') return { how: 'JSON lines', rows: readJsonLines(text) };
  if (ext === '.csv' || ext === '.tsv' || ext === '.tab') {
    const sep = separatorOf(text);
    return { how: sep === TAB ? 'tab-separated' : sep === ';' ? 'semicolon-separated' : 'comma-separated', rows: readDelimited(text) };
  }
  // A .txt or .md is whichever it looks more like. A file with separators on
  // most of its lines is a spreadsheet somebody renamed.
  const sample = lines(text).filter((l) => l.trim()).slice(0, 20);
  const sep = separatorOf(text);
  const delimited = sample.filter((l) => l.includes(sep)).length;
  if (sample.length && delimited >= sample.length * 0.8) {
    return { how: sep === TAB ? 'tab-separated' : 'comma-separated', rows: readDelimited(text) };
  }
  return { how: 'prose', rows: readProse(text) };
}

// --- making cards out of records -------------------------------------------

const firstOf = (record, keys) => {
  for (const k of keys) {
    const v = record[k];
    if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
  }
  return '';
};

const tidy = (s) => String(s === undefined || s === null ? '' : s).replace(/\s+/g, ' ').trim();

// The lettered and numbered option columns, gathered in order. `a` only counts
// as an option when `b` and `c` are there too, because on its own it is far
// more likely to be somebody's column for the answer.
function letteredOptions(record) {
  const out = [];
  const letters = ['a', 'b', 'c', 'd', 'e', 'f'];
  const shapes = (l, i) => [l, `option_${l}`, `choice_${l}`, `answer_${l}`, `option_${i + 1}`, `choice_${i + 1}`, String(i + 1)];
  const present = letters.map((l, i) => shapes(l, i).find((k) => record[k] !== undefined && String(record[k]).trim()));
  if (!present[1] || !present[2]) return [];
  for (let i = 0; i < letters.length; i++) {
    if (!present[i]) break;
    out.push(String(record[present[i]]));
  }
  return out;
}

// Whether this record was *trying* to be multiple choice, which is not the
// same as whether it succeeded. A row with an options column that holds one
// option is a broken choice card, and must not be quietly made into a text
// card whose back is the answer's index — which is what happens if the only
// question asked is "did enough options come out of it".
// The key being there is the signal, not what is in it: a spreadsheet gives
// every row all of its columns, so the row that matters here is exactly the
// one whose option columns are empty.
function meantToBeChoice(record) {
  const keys = [...OPTION_LIST_KEYS, 'b', 'option_b', 'choice_b', 'option_2', 'choice_2'];
  return keys.some((k) => Object.prototype.hasOwnProperty.call(record, k));
}

// The options a record is offering, and — where the record says so itself —
// which of them is right. Three different things have to come back from here,
// so it answers with an object rather than a list:
//
//   options   the texts, in the order the file had them
//   labels    what the file calls them, when it keeps its own labels. ARC
//             labels some questions A-D and others 1-4, so reading the answer
//             key against the labels is the only way to be right about both
//   answerAt  set when the shape itself says which is correct, as it does
//             wherever a set keeps the answer in one column and the wrong
//             answers in others
function optionsOf(record) {
  for (const k of OPTION_LIST_KEYS) {
    const v = record[k];
    if (Array.isArray(v)) return { options: v.map(String) };
    if (v && typeof v === 'object' && Array.isArray(v.text)) {
      return {
        options: v.text.map(String),
        labels: Array.isArray(v.label) ? v.label.map(String) : null,
      };
    }
    // A single cell holding "a|b|c|d" or "a; b; c; d", which is what a
    // spreadsheet column of options usually is.
    if (typeof v === 'string' && v.trim()) {
      for (const sep of ['|', ';', String.fromCharCode(10)]) {
        const parts = v.split(sep).map((s) => s.trim()).filter(Boolean);
        if (parts.length >= MIN_OPTIONS) return { options: parts };
      }
    }
  }

  const lettered = letteredOptions(record);
  if (lettered.length) return { options: lettered };
  return distractorOptions(record);
}

// The right answer in one column and the wrong ones in `distractor1`,
// `distractor2` and so on. Nothing needs to be resolved afterwards — the
// shape has already said which is which — and the order does not matter,
// because `asChoiceCard` shuffles every card as the match is dealt.
function distractorOptions(record) {
  const wrong = [];
  for (let i = 1; i <= MAX_OPTIONS; i++) {
    const cell = record[`distractor${i}`] || record[`distractor_${i}`] || record[`wrong${i}`];
    if (cell !== undefined && String(cell).trim()) wrong.push(String(cell));
  }
  if (!wrong.length) return { options: [] };
  const right = firstOf(record, ['correct_answer', 'correct', 'answer', 'back']);
  if (!right) return { options: [] };
  return { options: [right, ...wrong], answerAt: 0 };
}

const LETTER_INDEX = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5 };

// Where the answer points. Returns an index, or -1 with a reason.
function answerIndex(raw, options, oneBased, labels) {
  const value = tidy(raw);
  if (!value) return { index: -1, why: 'no answer given' };

  // What the file calls its own options beats every guess below it: a set
  // that labels one question A-D and the next 1-4 is right either way, and
  // reading the key as a letter would quietly mark half of it wrong.
  if (labels && labels.length === options.length) {
    const at = labels.findIndex((l) => tidy(l).toLowerCase() === value.toLowerCase());
    if (at >= 0) return { index: at };
  }

  // A letter, which is how most of these files say it.
  const letter = value.toLowerCase().replace(/[^a-f]/g, '');
  if (letter.length === 1 && value.length <= 3 && LETTER_INDEX[letter] !== undefined) {
    const i = LETTER_INDEX[letter];
    if (i < options.length) return { index: i };
    return { index: -1, why: `answer "${value}" is past the end of the options` };
  }

  // A number, read as the file as a whole reads numbers.
  if (/^[0-9]+$/.test(value)) {
    const n = Number(value) - (oneBased ? 1 : 0);
    if (n >= 0 && n < options.length) return { index: n };
    return { index: -1, why: `answer "${value}" is past the end of the options` };
  }

  // The answer written out. Compared loosely, because a spreadsheet will have
  // one of the two with a full stop on the end and the other without.
  const flat = (s) => tidy(s).toLowerCase().replace(/[^a-z0-9 ]/g, '');
  const exact = options.findIndex((o) => flat(o) === flat(value));
  if (exact >= 0) return { index: exact };
  return { index: -1, why: 'the answer does not name any of the options' };
}

// Does this file count its answers from one or from zero? Decided per file
// and not per row: a file where some rows are 0-based and others are not is a
// file nobody should be guessing about.
function countsFromOne(rows) {
  const numbers = [];
  for (const { record } of rows) {
    if (Array.isArray(record)) continue;
    const raw = tidy(firstOf(record, ANSWER_KEYS));
    if (/^[0-9]+$/.test(raw)) numbers.push(Number(raw));
  }
  if (!numbers.length) return false;
  return !numbers.includes(0);
}

// A bare row, with no header to say what its cells are. Two or three cells is
// a flashcard; six with a letter on the end is an MMLU-shaped paper.
function fromBareRow(row) {
  const cells = row.map((c) => tidy(c));
  while (cells.length && !cells[cells.length - 1]) cells.pop();
  if (cells.length >= 6) {
    const last = cells[cells.length - 1].toLowerCase();
    if (LETTER_INDEX[last] !== undefined) {
      return { front: cells[0], options: cells.slice(1, cells.length - 1), answer: cells[cells.length - 1] };
    }
  }
  if (cells.length === 2) return { front: cells[0], back: cells[1] };
  if (cells.length === 3) return { front: cells[0], back: cells[1], hint: cells[2] };
  return null;
}

function cardFrom(entry, kindWanted, oneBased) {
  const raw = Array.isArray(entry.record) ? fromBareRow(entry.record) : entry.record;
  if (!raw) return { why: `a row of ${entry.record.length} cells, which is not a shape this reads` };

  const front = tidy(firstOf(raw, FRONT_KEYS));
  if (!front) return { why: 'no question on it' };

  const found = optionsOf(raw) || { options: [] };
  const options = found.options.map(tidy).filter(Boolean);
  const wantsChoice =
    kindWanted === 'choice' ||
    (kindWanted !== 'text' && (options.length >= MIN_OPTIONS || meantToBeChoice(raw)));

  if (wantsChoice) {
    if (options.length < MIN_OPTIONS) return { why: `${options.length} usable option${options.length === 1 ? '' : 's'} on a multiple-choice row` };
    if (options.length > MAX_OPTIONS) return { why: `${options.length} options, which is more than a card can carry` };
    if (found.answerAt !== undefined) return { card: { front, options, answer: found.answerAt }, kind: 'choice' };
    const { index, why } = answerIndex(firstOf(raw, ANSWER_KEYS), options, oneBased, found.labels);
    if (index < 0) return { why };
    return { card: { front, options, answer: index }, kind: 'choice' };
  }

  // A text card. `answer` is only the back when there are no options for it
  // to have been pointing at.
  const back = tidy(firstOf(raw, BACK_KEYS));
  if (!back) return { why: 'no answer on it' };
  return { card: { front, back, hint: tidy(firstOf(raw, HINT_KEYS)) }, kind: 'text' };
}

// --- a name for it ---------------------------------------------------------

const slugOf = (file) =>
  path.basename(file, path.extname(file))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/-(test|deck|cards|questions|export)$/g, '') || 'deck';

const titleOf = (slug) => {
  const words = slug.split('-').filter(Boolean);
  if (!words.length) return 'A deck';
  return words[0].charAt(0).toUpperCase() + words[0].slice(1) + (words.length > 1 ? ' ' + words.slice(1).join(' ') : '');
};

function blurbFor(kind, cards) {
  const n = cards.length.toLocaleString('en-GB');
  if (kind === 'text') return `${n} cards to write the answer to.`;
  const sizes = new Set(cards.map((c) => c.options.length));
  if (sizes.size === 1) {
    const words = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six' }[[...sizes][0]];
    return `${n} ${words}-option questions.`;
  }
  return `${n} multiple-choice questions.`;
}

// --- one file --------------------------------------------------------------

function convert(file, opts, root) {
  // Named relative to what was asked for, not to the working directory: a
  // staging folder somewhere else on the disk otherwise prints as a row of
  // dot-dots that nobody can read a filename out of.
  const rel = root ? path.relative(root, file) || path.basename(file) : path.basename(file);
  let how;
  let rows;
  try {
    ({ how, rows } = readFile(file));
  } catch (err) {
    no(`${rel}: ${err.message}`);
    return null;
  }
  if (!rows.length) {
    no(`${rel}: nothing in it that reads as a question`);
    return null;
  }

  const oneBased = countsFromOne(rows);
  const cards = [];
  const dropped = new Map();
  const seen = new Set();
  let kind = opts.kind || null;

  for (const entry of rows) {
    const out = cardFrom(entry, opts.kind, oneBased);
    if (!out.card) {
      const why = out.why;
      if (!dropped.has(why)) dropped.set(why, []);
      dropped.get(why).push(entry.line);
      continue;
    }
    if (!kind) kind = out.kind;
    if (out.kind !== kind) {
      const why = `a ${out.kind} card in a ${kind} deck`;
      if (!dropped.has(why)) dropped.set(why, []);
      dropped.get(why).push(entry.line);
      continue;
    }
    const key = out.card.front.toLowerCase();
    if (seen.has(key)) {
      if (!dropped.has('the same question twice')) dropped.set('the same question twice', []);
      dropped.get('the same question twice').push(entry.line);
      continue;
    }
    seen.add(key);
    cards.push(out.card);
  }

  const id = opts.id || slugOf(file);
  const deck = {
    id,
    name: opts.name || titleOf(slugOf(file)),
    blurb: opts.blurb || blurbFor(kind || 'text', cards),
    kind: kind || 'text',
    house: opts.house === true,
    cards,
  };

  // The report, which is the point of running this without --write.
  const total = rows.length;
  const kept = cards.length;
  if (kept < 2) {
    no(`${rel}: read as ${how}, and only ${kept} card(s) came out of ${total} rows`);
  } else if (dropped.size) {
    hm(`${rel}: ${kept} of ${total} rows became ${deck.kind} cards, and ${total - kept} did not`);
  } else {
    ok(`${rel}: ${kept} ${deck.kind} cards, read as ${how}`);
  }
  for (const [why, where] of dropped) {
    note(`${String(where.length).padStart(5)} x ${why} (line${where.length > 1 ? 's' : ''} ${where.slice(0, 3).join(', ')}${where.length > 3 ? ', ...' : ''})`);
  }
  if (deck.kind === 'choice' && oneBased) note('answers in this file are counted from one');
  if (kept < 2) return null;
  return deck;
}

// --- writing it out --------------------------------------------------------

function write(deck, opts) {
  const file = path.join(DECK_DIR, `${deck.id}.deck.json`);
  const exists = fs.existsSync(file);
  if ((onTheShelf(deck.id) || exists) && !opts.replace) {
    no(`${deck.id} is already on the shelf. Pass --replace to take the id over, or --id to give this one its own.`);
    return false;
  }
  fs.writeFileSync(file, JSON.stringify(deck, null, 2) + String.fromCharCode(10), 'utf8');
  ok(`wrote ${path.relative(process.cwd(), file)} — ${deck.cards.length} cards as "${deck.name}"`);
  return true;
}

// --- the run ---------------------------------------------------------------

function main() {
  let opts;
  try {
    opts = readArgs(process.argv.slice(2));
  } catch (err) {
    no(err.message);
    process.exit(2);
  }
  if (!opts.paths.length) {
    console.log('Turn a pile of questions into a house deck.');
    console.log('');
    console.log('  npm run decks:import -- <file or folder>           read it, and say what it found');
    console.log('  npm run decks:import -- --write <file or folder>   and write the decks out');
    console.log('');
    console.log('  --replace   take over a deck id that is already on the shelf');
    console.log('  --id        the id to write it under (one file at a time)');
    console.log('  --name      what the lobby calls it');
    console.log('  --blurb     the line under the name');
    console.log('  --kind      force text or choice, rather than reading which it is');
    console.log('  --house     list it under "Written by the house" rather than "Subject papers"');
    process.exit(1);
  }

  const files = [];
  const roots = [];
  for (const p of opts.paths) {
    const full = path.resolve(p);
    try {
      const found = filesUnder(full);
      const root = fs.statSync(full).isDirectory() ? full : path.dirname(full);
      for (const f of found) {
        files.push(f);
        roots.push(root);
      }
    } catch {
      no(`there is nothing at ${p}`);
      process.exit(2);
    }
  }
  if (!files.length) {
    no('no files there that this reads');
    process.exit(2);
  }
  if ((opts.id || opts.name || opts.blurb) && files.length > 1) {
    no('--id, --name and --blurb are about one deck, and there are ' + files.length + ' files here');
    process.exit(2);
  }

  console.log(`Reading ${files.length} file(s).`);
  console.log('');
  const decks = files.map((f, i) => convert(f, opts, roots[i])).filter(Boolean);
  console.log('');

  if (!decks.length) {
    no('nothing to write');
    process.exit(1);
  }
  const cards = decks.reduce((n, d) => n + d.cards.length, 0);
  if (!opts.write) {
    ok(`${decks.length} deck(s), ${cards.toLocaleString('en-GB')} cards. Nothing written — pass --write when the report above reads right.`);
    return;
  }
  let written = 0;
  for (const deck of decks) if (write(deck, opts)) written += 1;
  console.log('');
  if (written === decks.length) ok(`${written} deck(s) written. Run npm run decks:check to have the room read them back.`);
  else hm(`${written} of ${decks.length} deck(s) written.`);
  if (written < decks.length) process.exit(1);
}

main();
