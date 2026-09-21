// ---------------------------------------------------------------------------
// Ask Claude what a question is about.
//
//   npm run decks:topics:claude -- --measure      what would it cost, and how
//                                                 often would it be right?
//   npm run decks:topics:claude -- --write        label the unsorted cards
//
// `decks-topics.js` is the classifier that costs nothing: naive Bayes trained
// on the subject papers, which sorts about two cards in five and leaves the
// rest alone. This is the other half of that — the cards it would not claim,
// handed to a model that can actually read them.
//
// Both write the same `topic` field, and the room cannot tell which put it
// there. That is deliberate: the shelf should not depend on an API key, and a
// checkout with no key still has every topic the papers gave away for free.
//
// --- it is a desk tool, and it stays one -----------------------------------
//
// The server never calls Claude. This runs by hand, the labels are committed
// as data, and `server/` gains nothing — no key, no dependency, no network
// call at boot. If this script is deleted tomorrow the decks still work.
//
// It talks to the API over plain `fetch`, which Node has had since 20, rather
// than through the Anthropic SDK. That is not a preference: the house rule is
// that `ws` and `@aws-sdk/client-s3` are the only dependencies and are meant
// to stay that way. The SDK is the better tool in a project that can take
// one; the call here is one POST and does not miss it.
//
// --- measure before paying -------------------------------------------------
//
// `--measure` runs the whole thing over a sample of subject-paper questions,
// whose topics are known, and reports how often the answers agree with the
// paper they came from. It costs a few pence and it is the only way to know
// what the real run buys. The Bayes classifier scores 82.7% labelling
// everything, 95% over the confident 40%; if this cannot beat that, it is not
// worth the money.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Decks from '../server/decks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DECK_DIR = path.join(__dirname, '..', 'server', 'decks');
const API = 'https://api.anthropic.com/v1';
const VERSION = '2023-06-01';

// Claude Opus 5, because choosing a cheaper model to save money on somebody
// else's key is not this script's decision to make. `--model` is right there,
// and `--measure` will say what the cheaper one is worth.
const DEFAULT_MODEL = 'claude-opus-5';

// Questions per request. Large enough that the instructions are not resent
// for every card, small enough that one malformed reply costs forty answers
// rather than four hundred.
const PER_REQUEST = 40;

const ok = (s) => console.log(`  ok    ${s}`);
const no = (s) => console.log(`  no    ${s}`);
const hm = (s) => console.log(`  hm    ${s}`);
const note = (s) => console.log(`        ${s}`);

// --- what it is allowed to answer ------------------------------------------
//
// The same list the Bayes classifier chooses from, and for the same reason:
// a model given an open field will invent "Earth science" on one card and
// "Geology" on the next, and a topic that exists on one card is not a topic.
// UNSURE is on the list on purpose — a model that cannot decline will guess.

const UNSURE = 'UNSURE';

function promptFor(topics) {
  return [
    'You are sorting quiz questions into topics for a revision site.',
    '',
    'Each question is numbered. Reply with one line per question, in the form',
    '"<number> <topic>", and nothing else — no preamble, no explanation, no',
    'blank lines, no markdown.',
    '',
    'The topic must be exactly one of:',
    ...topics.map((t) => `  ${t}`),
    `  ${UNSURE}`,
    '',
    `Answer ${UNSURE} whenever a question fits two of these equally well, fits`,
    'none of them, or cannot be placed without knowing something the question',
    'does not say. A question filed under the wrong topic is worse than one',
    `left unsorted, so ${UNSURE} is the right answer more often than it feels.`,
    '',
    'Sort by what the question is testing, not by a word that happens to',
    'appear in it: "How does a lens focus light in the eye?" is Physics if it',
    'is about refraction and Biology if it is about the eye — decide which the',
    'question is actually asking, and answer UNSURE if it is genuinely both.',
  ].join('\n');
}

const askFor = (cards) =>
  cards.map((c, i) => `${i + 1}. ${c.front} [${(c.options || []).join(' | ')}]`).join('\n');

// --- reading the reply -----------------------------------------------------
//
// Strictly, and never generously. A line that does not parse, a number that
// was not asked about, a topic that is not on the list, an answer given twice
// — each is dropped rather than repaired. The cost of dropping one is that a
// card stays unsorted, which is where it already was.

export function readReply(text, cards, topics) {
  const out = new Map();
  // Matched without case and written back in the spelling the shelf uses, so
  // that "space and earth" is the topic it obviously is rather than a made-up
  // one. The set it must be in is still exact — this forgives the shift key,
  // not the answer.
  const allowed = new Map([...topics, UNSURE].map((t) => [t.toLowerCase(), t]));
  let refused = 0;
  for (const line of String(text).split('\n')) {
    const m = /^\s*([0-9]+)[.):\s]\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const at = Number(m[1]) - 1;
    const topic = allowed.get(m[2].trim().replace(/[.,;]+$/, '').toLowerCase());
    if (at < 0 || at >= cards.length) continue;
    if (!topic) {
      refused += 1;
      continue;
    }
    if (out.has(at)) continue;
    if (topic !== UNSURE) out.set(at, topic);
  }
  return { answers: out, refused };
}

// --- the API ---------------------------------------------------------------

function key() {
  const k = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!k) {
    no('ANTHROPIC_API_KEY is not set.');
    note('Set it in this terminal only — it does not belong in the repo:');
    note('  export ANTHROPIC_API_KEY=sk-ant-...');
    note('If you sign in with the Anthropic CLI instead, run `ant auth status`');
    note('and use `ant auth print-credentials --access-token` in place of it.');
    process.exit(2);
  }
  return k;
}

async function call(route, { method = 'GET', body = null } = {}) {
  const res = await fetch(`${API}${route}`, {
    method,
    headers: {
      'x-api-key': key(),
      'anthropic-version': VERSION,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${route} answered ${res.status}: ${text.slice(0, 400)}`);
  }
  return res;
}

const request = (id, model, system, ask) => ({
  custom_id: id,
  params: {
    model,
    max_tokens: 2000,
    system,
    messages: [{ role: 'user', content: ask }],
  },
});

/**
 * Send a pile of requests through the Batches API and hand back the replies.
 *
 * Batches are half the price and take up to a day; this work waits happily.
 * Results come back in whatever order they finished in, so everything is
 * keyed by `custom_id` and never by position.
 */
async function runBatch(requests, { quiet = false } = {}) {
  const made = await (await call('/messages/batches', { method: 'POST', body: { requests } })).json();
  if (!quiet) ok(`batch ${made.id} sent — ${requests.length.toLocaleString('en-GB')} requests`);

  let batch = made;
  while (batch.processing_status !== 'ended') {
    await new Promise((r) => setTimeout(r, 20_000));
    batch = await (await call(`/messages/batches/${made.id}`)).json();
    if (!quiet) {
      const c = batch.request_counts || {};
      note(`${batch.processing_status}: ${c.succeeded || 0} done, ${c.processing || 0} to go`);
    }
  }

  const replies = new Map();
  const usage = { input: 0, output: 0 };
  let errored = 0;
  const body = await (await call(`/messages/batches/${made.id}/results`)).text();
  for (const line of body.split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (row.result?.type !== 'succeeded') {
      errored += 1;
      continue;
    }
    const msg = row.result.message;
    // A refusal is not an answer. It arrives as a 200 like anything else, so
    // it has to be looked for rather than caught.
    if (msg.stop_reason === 'refusal') {
      errored += 1;
      continue;
    }
    usage.input += msg.usage?.input_tokens || 0;
    usage.output += msg.usage?.output_tokens || 0;
    replies.set(row.custom_id, msg.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
  }
  return { replies, usage, errored };
}

// --- what it costs ---------------------------------------------------------

const PRICES = {
  'claude-opus-5': [5, 25],
  'claude-sonnet-5': [2, 10],
  'claude-haiku-4-5': [1, 5],
};

function spent(model, usage) {
  const rate = PRICES[model];
  if (!rate) return null;
  // Halved, because everything here goes through the Batches API.
  return ((usage.input / 1e6) * rate[0] + (usage.output / 1e6) * rate[1]) / 2;
}

// --- measuring against the papers ------------------------------------------

async function measure(model, topics, size) {
  const known = [];
  for (const d of Decks.catalog()) {
    const topic = Decks.TOPIC_OF_DECK.get(d.id);
    if (!topic || !topics.includes(topic)) continue;
    for (const c of Decks.deck(d.id).cards) known.push({ card: c, topic });
  }
  if (!known.length) {
    no('no subject papers carry any of those topics, so there is nothing to measure against');
    process.exit(2);
  }

  // Spread across the papers rather than taken from the front, so the sample
  // is not one subject's worth of questions.
  const step = known.length / size;
  const sample = [];
  for (let i = 0; i < size && Math.floor(i * step) < known.length; i++) sample.push(known[Math.floor(i * step)]);

  const system = promptFor(topics);
  const requests = [];
  for (let i = 0; i < sample.length; i += PER_REQUEST) {
    const chunk = sample.slice(i, i + PER_REQUEST);
    requests.push(request(`m-${i}`, model, system, askFor(chunk.map((s) => s.card))));
  }

  ok(`measuring on ${sample.length} questions whose topic is already known`);
  const { replies, usage, errored } = await runBatch(requests);

  let right = 0;
  let wrong = 0;
  let declined = 0;
  const confusion = new Map();
  for (let i = 0; i < sample.length; i += PER_REQUEST) {
    const chunk = sample.slice(i, i + PER_REQUEST);
    const reply = replies.get(`m-${i}`);
    if (reply === undefined) {
      declined += chunk.length;
      continue;
    }
    const { answers } = readReply(reply, chunk.map((s) => s.card), topics);
    chunk.forEach((s, at) => {
      const said = answers.get(at);
      if (!said) declined += 1;
      else if (said === s.topic) right += 1;
      else {
        wrong += 1;
        const k = `${s.topic} -> ${said}`;
        confusion.set(k, (confusion.get(k) || 0) + 1);
      }
    });
  }

  const answered = right + wrong;
  console.log('');
  ok(`answered ${answered} of ${sample.length}, and left ${declined} unsorted`);
  ok(`of the answers, ${answered ? ((right / answered) * 100).toFixed(1) : '0'}% agree with the paper the question came from`);
  if (errored) hm(`${errored} request(s) came back unusable`);
  if (confusion.size) {
    note('where it disagreed:');
    for (const [pair, n] of [...confusion].sort((a, b) => b[1] - a[1]).slice(0, 6)) note(`  ${String(n).padStart(3)}  ${pair}`);
    note('some of these are the paper being arguable, not the model being wrong.');
  }

  const cost = spent(model, usage);
  console.log('');
  ok(`this measurement used ${usage.input.toLocaleString('en-GB')} in / ${usage.output.toLocaleString('en-GB')} out${cost === null ? '' : `, about $${cost.toFixed(3)}`}`);
  if (cost !== null) {
    const per = cost / sample.length;
    note(`at that rate the unsorted cards would come to roughly $${(per * countUnsorted()).toFixed(2)}.`);
  }
}

// --- the real run ----------------------------------------------------------

function deckFiles() {
  return fs
    .readdirSync(DECK_DIR)
    .filter((f) => f.endsWith('.deck.json'))
    .map((f) => ({ file: path.join(DECK_DIR, f), deck: JSON.parse(fs.readFileSync(path.join(DECK_DIR, f), 'utf8')) }));
}

function countUnsorted() {
  let n = 0;
  for (const { deck } of deckFiles()) for (const c of deck.cards) if (!c.topic) n += 1;
  return n;
}

async function label(model, topics, { write, all }) {
  const files = deckFiles();
  const jobs = [];
  for (const entry of files) {
    entry.wanted = entry.deck.cards.filter((c) => all || !c.topic);
    for (let i = 0; i < entry.wanted.length; i += PER_REQUEST) {
      jobs.push({ entry, at: i, chunk: entry.wanted.slice(i, i + PER_REQUEST) });
    }
  }
  const cards = jobs.reduce((n, j) => n + j.chunk.length, 0);
  if (!cards) {
    ok('every card already has a topic. Pass --all to do them again.');
    return;
  }

  const system = promptFor(topics);
  const requests = jobs.map((j, i) => request(`j-${i}`, model, system, askFor(j.chunk)));
  ok(`${cards.toLocaleString('en-GB')} cards to sort, in ${requests.length.toLocaleString('en-GB')} requests`);

  const { replies, usage, errored } = await runBatch(requests);

  let sorted = 0;
  let declined = 0;
  let refused = 0;
  const tally = new Map();
  jobs.forEach((j, i) => {
    const reply = replies.get(`j-${i}`);
    if (reply === undefined) {
      declined += j.chunk.length;
      return;
    }
    const read = readReply(reply, j.chunk, topics);
    refused += read.refused;
    j.chunk.forEach((card, at) => {
      const said = read.answers.get(at);
      if (!said) {
        declined += 1;
        return;
      }
      card.topic = said;
      sorted += 1;
      tally.set(said, (tally.get(said) || 0) + 1);
    });
  });

  console.log('');
  for (const [topic, n] of [...tally].sort((a, b) => b[1] - a[1])) note(`${String(n).toLocaleString('en-GB').padStart(7)}  ${topic}`);
  console.log('');
  ok(`${sorted.toLocaleString('en-GB')} sorted, ${declined.toLocaleString('en-GB')} left unsorted`);
  if (refused) hm(`${refused} answer(s) named something that is not a topic, and were dropped`);
  if (errored) hm(`${errored} request(s) came back unusable`);
  const cost = spent(model, usage);
  ok(`${usage.input.toLocaleString('en-GB')} in / ${usage.output.toLocaleString('en-GB')} out${cost === null ? '' : `, about $${cost.toFixed(2)}`}`);

  if (!write) {
    console.log('');
    ok('Nothing written — pass --write to keep these.');
    return;
  }
  for (const { file, deck } of files) fs.writeFileSync(file, JSON.stringify(deck, null, 2) + String.fromCharCode(10), 'utf8');
  console.log('');
  ok('written. Run npm run decks:check to see the topic decks.');
}

// --- the run ---------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const opts = { model: DEFAULT_MODEL, sample: 200 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write') opts.write = true;
    else if (a === '--measure') opts.measure = true;
    else if (a === '--all') opts.all = true;
    else if (a === '--model') opts.model = argv[++i];
    else if (a === '--among') opts.among = argv[++i];
    else if (a === '--sample') opts.sample = Number(argv[++i]);
    else {
      no(`I do not know the option ${a}`);
      process.exit(2);
    }
  }

  const topics = opts.among
    ? opts.among.split(',').map((s) => s.trim()).filter(Boolean)
    : ['Biology', 'Chemistry', 'Physics', 'Space and earth', 'Medicine', 'Mathematics', 'Computing'];
  const unknown = topics.filter((t) => !Decks.TOPICS.includes(t));
  if (unknown.length) {
    no(`no such topic: ${unknown.join(', ')}`);
    note(`the topics are: ${Decks.TOPICS.join(', ')}`);
    process.exit(2);
  }

  if (!PRICES[opts.model]) hm(`${opts.model} is not in the price list, so no cost will be worked out.`);
  console.log(`Model: ${opts.model}, through the Batches API.`);
  console.log(`Topics: ${topics.join(', ')}`);
  console.log('');

  if (opts.measure) await measure(opts.model, topics, opts.sample);
  else await label(opts.model, topics, opts);
}

// Run only when this file is what was run. `readReply` is exported so that
// the strict half of this script — the half that decides what gets written
// onto a card — can be checked without an API key and without spending
// anything.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.log('');
    no(err.message);
    process.exit(1);
  });
}
