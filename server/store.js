// ---------------------------------------------------------------------------
// Where the flashcards live between visits.
//
// The room server keeps nothing: a table is memory and an hour later it is
// gone. Accounts and collections cannot work that way — a card somebody drew
// on Tuesday has to still be theirs on Friday — so this is the one part of
// the site that keeps anything.
//
// It is a single JSON document. That is not a database and is not pretending
// to be one: everything is held in memory, every read is a plain object
// lookup, and a change marks it dirty and is written back a moment later.
//
// Where it is written back to depends on the environment:
//
//   * With the four R2_* variables set, it is one object in a Cloudflare R2
//     bucket. This is how the site runs on Render, whose free tier throws the
//     local filesystem away on every deploy and every spin-down.
//   * With them unset, it is a file under THIEVERY_DATA_DIR (default ./data),
//     written atomically via a temporary file and a rename. This is how it
//     runs on a laptop and in the tests, and needs no credentials.
//
// Both are the same shape — read one blob of text, write one blob of text —
// which is all the rest of the app ever needed from it.
//
// THE DANGEROUS CASE. A missing object means first run: start empty. A read
// that *fails* means the data is probably fine and merely out of reach, and
// starting empty would let the next save write an empty document over every
// account on the site. So open() refuses to start on any error that is not
// unambiguously "not found". A few minutes of downtime is recoverable; this
// is not.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R2 from './r2.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = process.env.THIEVERY_DATA_DIR
  ? path.resolve(process.env.THIEVERY_DATA_DIR)
  : path.join(__dirname, '..', 'data');

// The name the document goes under. Deliberately the same on both backends, so
// a bucket can be seeded by uploading the local file and nothing has to be
// renamed on the way.
export const FILENAME = 'flashcards.json';

// How long a change may sit in memory before it is written back. Long enough
// that a burst of edits is one write, short enough that losing it costs
// nothing anybody would notice.
const FLUSH_MS = 250;

// How long to wait before trying again after a failed write. A spell of 500s
// from Cloudflare should not mean the change is dropped.
const RETRY_MS = 5_000;

export const TRADE_LOG_MAX = 1000;

// An empty shelf. Every top-level key is created here so that nothing later
// has to check whether it exists.
function empty() {
  return {
    version: 1,
    users: {},     // id -> account
    cards: {},     // id -> card
    sessions: {},  // sha256(token) -> { userId, created, seen }
    pool: [],      // card ids offered at the trading post, oldest first
    trades: [],    // the ledger, newest last, trimmed to TRADE_LOG_MAX
    mints: 0,      // how many cards have ever been struck, for serial numbers
    stats: {},     // id -> how that account has fared at the card table
  };
}

let db = empty();
let ready = false;
let backend = null;

let dirty = false;
let timer = null;
let writing = null; // the write in flight, so two never overlap

// --- the local-disk backend ------------------------------------------------

function fileBackend(dir) {
  const file = path.join(dir, FILENAME);
  const tmp = file + '.tmp';
  return {
    describe: () => file,
    async read() {
      try {
        return fs.readFileSync(file, 'utf8');
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
    },
    async write(text) {
      // A temporary file and a rename over the top: a process killed mid-save
      // leaves either the old file or the new one, never half of each.
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(tmp, text, 'utf8');
      fs.renameSync(tmp, file);
    },
    async quarantine() {
      const kept = file + '.corrupt-' + new Date().toISOString().replace(/[:.]/g, '-');
      fs.renameSync(file, kept);
      return kept;
    },
  };
}

// --- opening ---------------------------------------------------------------

/** Which backend the environment asks for. Exported for the boot log. */
export function chooseBackend() {
  if (R2.configured) {
    return R2.blobStore({ client: R2.client, bucket: R2.BUCKET, key: FILENAME });
  }
  return fileBackend(DATA_DIR);
}

/**
 * Read the document in. Must be awaited before anything calls data(), which
 * is why Flashcards.start() does it first and the server does not listen until
 * it has finished.
 *
 * `use` is only for the tests, which pass a backend of their own.
 */
export async function open(use = null) {
  // Down before anything else: if this attempt fails, the store must be shut,
  // not left marked usable by whatever opened it last. Otherwise a failed
  // re-open would leave stale data in memory that touch() would happily save
  // over the real thing.
  ready = false;
  backend = use || chooseBackend();

  let raw;
  try {
    raw = await backend.read();
  } catch (err) {
    // The refusal described at the top of the file. Do not start empty; do not
    // let the next save overwrite what is out there.
    // The original is carried along as the cause, so whoever catches this can
    // tell a refused key from an unreachable host and say which it was.
    throw new Error(
      `Could not read ${backend.describe()} — refusing to start rather than ` +
        `risk saving an empty document over it. (${err.name || 'Error'}: ${err.message})`,
      { cause: err }
    );
  }

  if (raw == null) {
    db = empty(); // first run: there is genuinely nothing there yet
    ready = true;
    return { fresh: true, where: backend.describe() };
  }

  let parsed = null;
  let problem = null;
  try {
    parsed = JSON.parse(raw);
    // A file holding `null`, or a number, or a list, is not this document
    // either, and spreading one of those produces an empty shelf that looks
    // perfectly healthy.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) problem = 'it is not a JSON object';
  } catch (err) {
    problem = err.message;
  }

  if (problem) {
    // It is there and it is not the document. A copy is set aside first, so
    // the damage can be looked at, and then the room closes exactly as it does
    // for a read that failed.
    //
    // Carrying on with an empty shelf would be the same disaster in slower
    // motion. The quarantine copy is safe, but the live key still holds
    // whatever it holds, and the first save of the session would write an
    // empty document straight over it. A room that is shut can be fixed by
    // hand; a document that has been overwritten cannot.
    let kept = '(could not be set aside)';
    try {
      kept = await backend.quarantine(raw);
    } catch { /* the copy is a courtesy; failing it must not change the answer */ }
    throw new Error(
      `${backend.describe()} will not parse (${problem}) — refusing to start rather than ` +
        `risk saving an empty document over it. A copy of it is at ${kept}.`
    );
  }

  db = { ...empty(), ...parsed };
  ready = true;
  return { fresh: false, where: backend.describe() };
}

// --- writing it back -------------------------------------------------------

async function writeNow() {
  timer = null;
  if (!dirty || !backend) return;

  // One write at a time. If a change lands while a write is in flight, the
  // flag stays up and another is scheduled the moment this one lands, so a
  // burst of trades becomes one upload rather than a pile of overlapping ones
  // racing to be last.
  if (writing) return;

  dirty = false;
  const text = JSON.stringify(db);
  writing = (async () => {
    try {
      await backend.write(text);
    } catch (err) {
      // Put the flag back and try again shortly. Dropping the change would
      // lose it for good, and a bad minute at Cloudflare is not a reason to
      // forget somebody's cards.
      dirty = true;
      console.error('flashcards: could not save —', err.message);
      if (!timer) timer = setTimeout(writeNow, RETRY_MS);
    } finally {
      writing = null;
    }
  })();

  await writing;
  // Something changed while that was going out; go round again.
  if (dirty && !timer) timer = setTimeout(writeNow, FLUSH_MS);
}

/** Whether the document was read in and may be used. */
export function available() {
  return ready;
}

/** Note that something changed. The write itself happens a moment later. */
export function touch() {
  // If the document was never read in, there is nothing here worth saving and
  // a great deal out there worth not overwriting. Nothing can reach this in
  // normal running — data() throws first — but a write is the one mistake
  // that cannot be undone, so it is barred here as well.
  if (!ready) return;
  dirty = true;
  // Deliberately not unref'd: a quarter of a second is nothing to wait for on
  // the way out, and a pending save is exactly the thing that must not be
  // skipped because the process had nothing else to do.
  if (!timer && !writing) timer = setTimeout(writeNow, FLUSH_MS);
}

/**
 * Write anything outstanding, now, and wait for it to land. Used on the way
 * out — where, unlike the old local-disk version, it is a network round trip
 * and genuinely has to be awaited.
 */
export async function flush() {
  if (!ready) return;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (writing) await writing;
  if (dirty) await writeNow();
}

// --- the shelf itself ------------------------------------------------------

/** The whole document. Callers mutate it in place and then call touch(). */
export function data() {
  if (!ready) {
    // Getting this wrong would mean serving an empty site and then saving it,
    // so it fails loudly rather than returning something plausible.
    throw new Error('flashcards: store.open() has not finished yet.');
  }
  return db;
}

// --- shutting down ---------------------------------------------------------
//
// Render sends SIGTERM and follows it with SIGKILL, so the last few seconds of
// writes have to be got out before the process goes. A spin-down is most
// evenings on the free tier, which makes this the normal way the server ends
// rather than an unusual one.
//
// There is no 'exit' handler any more: it cannot await anything, and with a
// network write behind it there is nothing useful it could do.

let leaving = false;

async function leave(signal) {
  if (leaving) return;
  leaving = true;
  try {
    await flush();
  } catch (err) {
    console.error('flashcards: the last save did not land —', err.message);
  }
  process.exit(signal === 'SIGINT' ? 130 : 0);
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => leave(signal));
