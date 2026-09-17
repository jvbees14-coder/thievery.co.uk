// ---------------------------------------------------------------------------
// Does the R2 credential actually work?
//
//   npm run r2:check
//
// Answered here in a couple of seconds, rather than by a deploy and a squint
// at the logs. It reads the same four R2_* variables the server reads, through
// the same module, and then does what the server does at boot: fetch the
// flashcards document. Then it goes one step further and writes a throwaway
// object beside it, because a key that can read but not write will open the
// room and then lose every change made in it.
//
// It prints which variables are set, and what shape they are. It never prints
// what they are set to. A secret that reaches a terminal has reached the
// scrollback, the screenshot, and whatever the shell keeps its history in.
//
// On a laptop the four are usually unset, and it says so and stops. That is
// the local-disk fallback, not a fault. To test the live credential, run this
// where the live credential is — Render's dashboard has a shell — or export
// the four into a throwaway terminal first.
// ---------------------------------------------------------------------------

import * as R2 from '../server/r2.js';
import { FILENAME } from '../server/store.js';

const ok = (s) => console.log(`  ok    ${s}`);
const no = (s) => console.log(`  no    ${s}`);
const hm = (s) => console.log(`  hm    ${s}`);
const note = (s) => console.log(`        ${s}`);

// Only ever the length. It is the one thing about a secret worth saying out
// loud, and it is what R2's own rejection message says anyway.
const shape = (name) => {
  const v = (process.env[name] || '').trim();
  return { v, len: v.length };
};

let failed = false;

// --- which of the four arrived ---------------------------------------------

console.log('\nR2 credentials\n');

const absent = R2.missing();
const here = R2.present();

for (const name of R2.REQUIRED_VARS) {
  if (here.includes(name)) ok(`${name} is set (${shape(name).len} characters)`);
  else no(`${name} is not set`);
}

if (absent.length === R2.REQUIRED_VARS.length) {
  console.log('\nNone of the four is set, so the server would keep the flashcards in a');
  console.log('file on local disk. That is right for a laptop and for the tests, and');
  console.log('wrong for the live site, whose disk is wiped on the next spin-down.');
  console.log('Export the four and run this again to test them.\n');
  process.exit(0);
}

if (absent.length) {
  console.log(`\n${absent.length} of the four is missing, which is the worst of both: the server`);
  console.log('will not use R2, and in production it will close the room rather than');
  console.log('fall back to a disk it is going to lose. Set the missing ones.\n');
  process.exit(1);
}

// --- and whether they are the right sort of thing ---------------------------
//
// Cloudflare hands out two credentials that look alike and are not. An R2
// access key pair is 32 and 64 hex characters, made under R2 > Manage API
// tokens. An API token value is longer, often prefixed, and belongs to the
// Cloudflare API rather than to the S3 one — it will not authenticate here
// however many times it is pasted in.

console.log('\nShape\n');

const endpoint = shape('R2_ENDPOINT').v;
try {
  const u = new URL(endpoint);
  if (u.protocol !== 'https:') {
    hm('R2_ENDPOINT is not https');
  } else if (!u.hostname.endsWith('.r2.cloudflarestorage.com')) {
    hm('R2_ENDPOINT is not an r2.cloudflarestorage.com host');
    note('It is https://<account id>.r2.cloudflarestorage.com — the account,');
    note('not the bucket, and not a public r2.dev or custom-domain URL.');
  } else if (u.pathname !== '/' && u.pathname !== '') {
    hm('R2_ENDPOINT has a path on the end');
    note('The bucket goes in R2_BUCKET_NAME, not in the endpoint.');
  } else {
    ok('R2_ENDPOINT is an account endpoint');
  }
} catch {
  hm('R2_ENDPOINT will not parse as a URL');
}

const key = shape('R2_ACCESS_KEY_ID');
if (/^[0-9a-f]{32}$/i.test(key.v)) {
  ok('R2_ACCESS_KEY_ID is 32 hex characters, as an access key id is');
} else {
  hm(`R2_ACCESS_KEY_ID is ${key.len} characters, and an access key id is 32 hex`);
  if (key.v.startsWith('cfut_')) {
    note('It begins cfut_, which makes it a Cloudflare API token value. That is');
    note('a different credential for a different API, and R2 will refuse it.');
  }
  note('The pair comes from R2 > Manage API tokens > Create API token: that');
  note('page shows an Access Key ID and a Secret Access Key once, at the end.');
}

const secret = shape('R2_SECRET_ACCESS_KEY');
if (/^[0-9a-f]{64}$/i.test(secret.v)) ok('R2_SECRET_ACCESS_KEY is 64 hex characters, as a secret is');
else hm(`R2_SECRET_ACCESS_KEY is ${secret.len} characters, and a secret is 64 hex`);

const bucket = shape('R2_BUCKET_NAME').v;
if (/[:/]/.test(bucket)) hm('R2_BUCKET_NAME looks like a URL; it is just the name');
else ok('R2_BUCKET_NAME is a plain name');

// --- the only answer that counts -------------------------------------------

console.log('\nReaching the bucket\n');

const shelf = R2.blobStore({ client: R2.client, bucket: R2.BUCKET, key: FILENAME });

try {
  const raw = await shelf.read();
  if (raw === null) {
    ok(`${shelf.describe()} is not there yet`);
    note('That is a first run, and the server would start with an empty shelf.');
    note('If the room has been open before, stop: this is the wrong bucket or');
    note('the wrong key, and opening on it would write an empty document.');
  } else {
    ok(`${shelf.describe()} read back, ${raw.length} characters`);
    try {
      const doc = JSON.parse(raw);
      note(
        `${Object.keys(doc.users || {}).length} accounts, ` +
          `${Object.keys(doc.cards || {}).length} cards, ` +
          `${(doc.trades || []).length} trades in the ledger.`
      );
    } catch {
      hm('It will not parse as JSON. The server would keep a copy and close the room.');
      failed = true;
    }
  }
} catch (err) {
  no(`could not read ${shelf.describe()} — ${err.message}`);
  note(R2.hintFor(err));
  console.log('\nThe room would be closed, and nothing would be written.\n');
  process.exit(1);
}

// Reading is not enough. The room opens on a read and then writes on every
// trade, so a key that can only read fails quietly, hours later.
const probeKey = `r2-check-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
const probe = R2.blobStore({ client: R2.client, bucket: R2.BUCKET, key: probeKey, contentType: 'text/plain' });

try {
  await probe.write('Written by npm run r2:check. Safe to delete.');
  const back = await probe.read();
  if (back === null) {
    no('the probe object was written and then could not be read back');
    failed = true;
  } else {
    ok(`wrote and read back ${probe.describe()}`);
  }
} catch (err) {
  no(`could not write to the bucket — ${err.message}`);
  note(R2.hintFor(err));
  note('A key that reads but cannot write will open the room and lose every');
  note('change made in it. Give the token Object Read & Write on this bucket.');
  process.exit(1);
}

try {
  await probe.remove();
  ok('and tidied it away again');
} catch (err) {
  hm(`left ${probe.describe()} behind — ${err.message}`);
  note('Harmless, but delete it by hand if you like a tidy bucket.');
}

console.log(
  failed
    ? '\nThe credential works, but the document does not. See above.\n'
    : '\nAll four are good: the room would open on this credential.\n'
);
process.exit(failed ? 1 : 0);
