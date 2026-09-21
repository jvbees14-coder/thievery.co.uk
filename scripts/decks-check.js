// ---------------------------------------------------------------------------
// Read the shelf back, the way the room does at boot.
//
//   npm run decks:check
//
// `Decks.check()` already runs when the battle room starts, so this adds no
// rule of its own. What it adds is the chance to find out now rather than on
// the next deploy: it loads every deck, validates every card, and then prints
// the shelf so a deck that was just imported can be seen arriving — under the
// name the lobby will call it, in the list the lobby will put it in.
//
// It exits non-zero on a deck that would stop the server, so it can be put in
// front of a commit.
// ---------------------------------------------------------------------------

import * as Decks from '../server/decks.js';

const pad = (s, n) => String(s).padEnd(n);

try {
  const started = Date.now();
  const { decks, cards } = Decks.check();
  const ms = Date.now() - started;
  const catalog = Decks.catalog();

  for (const group of [
    ['Written by the house', catalog.filter((d) => d.house)],
    ['Subject papers', catalog.filter((d) => !d.house && !d.topic)],
    ['By topic', catalog.filter((d) => d.topic)],
  ]) {
    const [label, list] = group;
    if (!list.length) continue;
    console.log('');
    console.log(`${label} (${list.length})`);
    for (const d of list) {
      console.log(`  ${pad(d.id, 34)} ${pad(d.kind, 7)} ${String(d.count).padStart(6)}  ${d.name}`);
    }
  }

  // A topic deck holds the same card objects as the deck the card came from,
  // so adding the decks up counts those cards twice. Both figures are worth
  // printing: the first is what is on the shelf, the second is how many
  // questions there actually are.
  const distinct = new Set();
  for (const d of catalog) for (const c of Decks.deck(d.id).cards) distinct.add(c);
  const sorted = [...distinct].filter((c) => c.topic).length;

  console.log('');
  console.log(`  ok    ${decks} decks, ${distinct.size.toLocaleString('en-GB')} questions (${cards.toLocaleString('en-GB')} counting a card once per deck it is in), read in ${ms}ms.`);
  console.log(`        ${sorted.toLocaleString('en-GB')} of them carry a guessed topic; the rest are either a paper's own or unsorted.`);
} catch (err) {
  console.log('');
  console.log(`  no    ${err.message}`);
  console.log('        The battle room would stop on this at boot. Fix the deck, or take it out of server/decks/.');
  process.exit(1);
}
