// ---------------------------------------------------------------------------
// Flashcards in and out of the site, as text.
//
// Two shapes, because they are the two that people actually have:
//
//   - CSV, with a heading row: Front, Back, Hint, Category, Deck, Sub-deck.
//     It is what a spreadsheet opens and saves, and it is what Export writes,
//     so a member's cards can leave and come back whole.
//   - The plain text Anki exports and imports ("Notes in Plain Text"): one
//     card a line, the front, a tab, the back. Its files open with lines
//     that start with a #, which say what the separator is; those are read
//     and otherwise skipped.
//
// Reading (parse) and writing (toCsv, toAnki) are pure: text in, rows out,
// and the other way. Nothing here makes a card. flashcards.js does that, a
// row at a time, through the same door a card typed into the form goes
// through, so an imported card is appraised and limited exactly as any other.
//
// Not read: Anki's .apkg, which is a zipped database rather than text. Anki
// will export any deck as text, and that is the file to bring.
// ---------------------------------------------------------------------------

export const IMPORT_MAX_ROWS = 200;

const HEADINGS = {
  front: 'front', question: 'front', term: 'front',
  back: 'back', answer: 'back', definition: 'back',
  hint: 'hint',
  category: 'category', tags: 'category', tag: 'category',
  deck: 'deck',
  'sub-deck': 'sub', subdeck: 'sub', 'sub deck': 'sub', sub: 'sub',
};
const COLUMNS = ['Front', 'Back', 'Hint', 'Category', 'Deck', 'Sub-deck'];

// --- reading -------------------------------------------------------------------

// Splits delimited text into rows of cells, by the usual rules: a cell in
// double quotes may hold the separator, a line break, and a quote written
// twice. Each row remembers the line it started on, so a card that is
// refused can be pointed at.
function cells(text, sep) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let started = 1;
  const endCell = () => { row.push(cell); cell = ''; };
  const endRow = () => { endCell(); rows.push({ line: started, cells: row }); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === '') { quoted = true; continue; }
    if (ch === sep) { endCell(); continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { endRow(); line++; started = line; continue; }
    cell += ch;
  }
  if (cell !== '' || row.length) endRow();
  return rows.filter((r) => r.cells.some((c) => c.trim() !== ''));
}

// Anki writes its fields as HTML unless told not to. A line break is the one
// piece of that worth keeping; the rest is taken off, and the handful of
// entities it uses are put back as the characters they stand for.
function plain(value) {
  return String(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    // A leading quote put there by toCsv to stop a spreadsheet running a
    // cell as a formula comes off again on the way back in.
    .replace(/^'(?=[=@+-])/, '')
    .trim();
}

/**
 * Text to rows. Each row is `{ line, front, back, hint, category, deck, sub }`
 * with whatever the file did not say left as ''. Throws, with a message fit
 * to show, if the text is not something a card could be read out of.
 */
export function parse(text) {
  let body = String(text || '').replace(/^﻿/, '');
  if (!body.trim()) throw problem('There is nothing in that file.');

  // Anki's opening lines: "#separator:tab" and the like. They say how the
  // rest is laid out, and they are not cards.
  let sep = null;
  let skipped = 0;
  for (;;) {
    const end = body.indexOf('\n');
    const first = (end < 0 ? body : body.slice(0, end)).trim();
    if (!first.startsWith('#')) break;
    const named = /^#separator:\s*(.+)$/i.exec(first);
    if (named) {
      const word = named[1].trim().toLowerCase();
      sep = { tab: '\t', comma: ',', semicolon: ';', pipe: '|' }[word] || (word.length === 1 ? word : sep);
    }
    body = end < 0 ? '' : body.slice(end + 1);
    skipped += 1;
  }
  if (!sep) {
    // No heading to say: whichever of a tab and a comma the first line has
    // more of. A front and a back with neither is one cell, and is refused
    // below for having no back.
    const first = body.split('\n', 1)[0];
    sep = (first.match(/\t/g) || []).length >= (first.match(/,/g) || []).length && first.includes('\t') ? '\t' : ',';
  }

  const rows = cells(body, sep);
  if (!rows.length) throw problem('There is nothing in that file.');

  // A heading row names its columns; without one the first two are the
  // front and the back, which is how Anki lays a note out.
  let map = { front: 0, back: 1 };
  const heads = rows[0].cells.map((c) => HEADINGS[c.trim().toLowerCase()]);
  if (heads.includes('front') && heads.includes('back')) {
    map = {};
    heads.forEach((name, i) => { if (name && map[name] === undefined) map[name] = i; });
    rows.shift();
  }
  if (rows.length > IMPORT_MAX_ROWS) throw problem(`That is ${rows.length} cards. Bring them ${IMPORT_MAX_ROWS} at a time.`);

  const at = (r, name) => (map[name] === undefined ? '' : plain(r.cells[map[name]] ?? ''));
  return rows.map((r) => ({
    line: r.line + skipped,
    front: at(r, 'front'),
    back: at(r, 'back'),
    hint: at(r, 'hint'),
    category: at(r, 'category'),
    deck: at(r, 'deck'),
    sub: at(r, 'sub'),
  }));
}

const problem = (message) => Object.assign(new Error(message), { status: 400 });

// --- writing -------------------------------------------------------------------

// A cell a spreadsheet would run as a formula is given a leading quote, which
// a spreadsheet shows as text and parse() takes off again. Cards are traded,
// so a member's export can hold a front somebody else wrote.
const inert = (value) => (/^[=@]/.test(value) || /^[+-](?!\d)/.test(value) ? "'" + value : value);
const quote = (value) => {
  const s = inert(String(value ?? ''));
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/** Rows of `{ front, back, hint, category, deck, sub }` as a CSV file. */
export function toCsv(rows) {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) lines.push([r.front, r.back, r.hint, r.category, r.deck, r.sub].map(quote).join(','));
  return lines.join('\r\n') + '\r\n';
}

/**
 * The same rows as the text Anki imports: a front, a tab and a back to a
 * line. A tab or a line break inside a card would end the cell or the card,
 * so each is written as a space.
 */
export function toAnki(rows) {
  const flat = (value) => String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  const lines = ['#separator:tab', '#html:false'];
  for (const r of rows) lines.push(flat(r.front) + '\t' + flat(r.back));
  return lines.join('\n') + '\n';
}
