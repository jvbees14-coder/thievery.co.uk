// The R2 backend, without R2.
//
// Every awkward path an object store has — the object is not there yet, the
// object is there but will not parse, the read fails for a reason that is not
// "missing", a burst of writes arrives while one is already in the air — is
// driven here through a stub client that implements send() and nothing else.
// No credentials, no network, no bucket.
//
// The last check is the one that matters most. If a read fails for any reason
// other than the object being absent, the server must refuse to start, because
// starting with an empty document would let the next save write it over every
// account on the site.
//
//   npm run test:r2

import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import * as R2 from '../server/r2.js';
import * as Store from '../server/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let checks = 0;
async function check(what, fn) {
  await fn();
  checks += 1;
  console.log('  ok  ' + what);
}

// --- a bucket that is really a Map -----------------------------------------

function stubS3({ objects = new Map(), onSend = null } = {}) {
  const calls = [];
  return {
    objects,
    calls,
    /** Every command the store sent, by kind. */
    countOf(kind) {
      return calls.filter((c) => c.kind === kind).length;
    },
    async send(command) {
      const input = command.input;
      const kind =
        command instanceof PutObjectCommand ? 'put'
        : command instanceof GetObjectCommand ? 'get'
        : command instanceof DeleteObjectCommand ? 'delete'
        : 'unknown';
      calls.push({ kind, ...input });

      // A hook so a test can make one particular call fail or hang.
      if (onSend) await onSend(kind, input);

      if (kind === 'get') {
        if (!objects.has(input.Key)) {
          throw Object.assign(new Error('The specified key does not exist.'), {
            name: 'NoSuchKey',
            $metadata: { httpStatusCode: 404 },
          });
        }
        const body = objects.get(input.Key);
        return { Body: { transformToString: async () => body } };
      }
      if (kind === 'put') {
        objects.set(input.Key, String(input.Body));
        return {};
      }
      if (kind === 'delete') {
        objects.delete(input.Key);
        return {};
      }
      throw new Error('unexpected command: ' + command.constructor.name);
    },
  };
}

const store = (s3, key = 'flashcards.json') =>
  R2.blobStore({ client: s3, bucket: 'a-bucket', key });

/**
 * Start a real server with the given environment and wait until it is
 * listening. Used for the checks that care about what the rest of the site
 * does while the flashcards room is shut.
 */
function bootServer(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
      env: { ...process.env, PORT: '0', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let text = '';
    const watch = (d) => {
      text += d;
      const at = text.match(/running at http:\/\/localhost:(\d+)/);
      if (at) resolve({ child, port: Number(at[1]), out: () => text });
    };
    child.stdout.on('data', watch);
    child.stderr.on('data', watch);
    child.on('exit', (code) => reject(new Error(`the server exited (${code}) instead of listening:\n${text}`)));
    setTimeout(() => reject(new Error(`the server never listened:\n${text}`)), 20_000).unref?.();
  });
}

const deferred = () => {
  let release;
  const promise = new Promise((r) => { release = r; });
  return { promise, release };
};

// ---------------------------------------------------------------------------

async function run() {
  // --- the blob store on its own -------------------------------------------

  await check('a write sends PutObject with the bucket, key and body', async () => {
    const s3 = stubS3();
    await store(s3).write('{"hello":"world"}');
    const put = s3.calls.find((c) => c.kind === 'put');
    assert.equal(put.Bucket, 'a-bucket');
    assert.equal(put.Key, 'flashcards.json');
    assert.equal(put.Body, '{"hello":"world"}');
    assert.equal(put.ContentType, 'application/json');
  });

  await check('a read sends GetObject and returns the body', async () => {
    const s3 = stubS3({ objects: new Map([['flashcards.json', '{"a":1}']]) });
    assert.equal(await store(s3).read(), '{"a":1}');
    assert.equal(s3.countOf('get'), 1);
  });

  await check('a missing object reads as null, not as an error', async () => {
    assert.equal(await store(stubS3()).read(), null);
  });

  await check('any other read failure is thrown, not swallowed', async () => {
    const s3 = stubS3({
      onSend: (kind) => {
        if (kind === 'get') {
          throw Object.assign(new Error('We encountered an internal error.'), {
            name: 'InternalError',
            $metadata: { httpStatusCode: 500 },
          });
        }
      },
    });
    await assert.rejects(() => store(s3).read(), /internal error/i);
  });

  await check('a 403 is not mistaken for a missing object', async () => {
    // The dangerous confusion: an expired or wrong key must never read as
    // "there is nothing here yet".
    const s3 = stubS3({
      onSend: (kind) => {
        if (kind === 'get') {
          throw Object.assign(new Error('Access Denied'), {
            name: 'AccessDenied',
            $metadata: { httpStatusCode: 403 },
          });
        }
      },
    });
    assert.equal(R2.isNotFound({ name: 'AccessDenied', $metadata: { httpStatusCode: 403 } }), false);
    await assert.rejects(() => store(s3).read(), /Access Denied/);
  });

  await check('a delete sends DeleteObject', async () => {
    const s3 = stubS3({ objects: new Map([['flashcards.json', '{}']]) });
    await store(s3).remove();
    assert.equal(s3.countOf('delete'), 1);
    assert.equal(s3.objects.size, 0);
  });

  // --- the store on top of it ----------------------------------------------

  await check('a first run starts empty and does not read twice', async () => {
    const s3 = stubS3();
    const result = await Store.open(store(s3));
    assert.equal(result.fresh, true);
    assert.equal(result.where, 'r2://a-bucket/flashcards.json');
    assert.deepEqual(Store.data().users, {});
    assert.equal(s3.countOf('get'), 1);
    assert.equal(s3.countOf('put'), 0, 'opening must not write anything');
  });

  await check('an existing document is read back whole', async () => {
    const saved = JSON.stringify({ users: { u1: { id: 'u1', username: 'alice' } }, mints: 7 });
    const s3 = stubS3({ objects: new Map([['flashcards.json', saved]]) });
    await Store.open(store(s3));
    assert.equal(Store.data().users.u1.username, 'alice');
    assert.equal(Store.data().mints, 7);
    assert.deepEqual(Store.data().pool, [], 'missing keys should be filled in');
  });

  await check('a change is written back as one PutObject', async () => {
    const s3 = stubS3();
    await Store.open(store(s3));
    Store.data().mints = 3;
    Store.touch();
    await Store.flush();
    assert.equal(s3.countOf('put'), 1);
    assert.equal(JSON.parse(s3.objects.get('flashcards.json')).mints, 3);
  });

  await check('a burst of changes coalesces into a single write', async () => {
    const s3 = stubS3();
    await Store.open(store(s3));
    for (let i = 0; i < 50; i++) {
      Store.data().mints = i;
      Store.touch();
    }
    await Store.flush();
    assert.equal(s3.countOf('put'), 1, 'fifty changes should be one upload');
    assert.equal(JSON.parse(s3.objects.get('flashcards.json')).mints, 49);
  });

  await check('changes made during a write are not lost', async () => {
    // The race that matters: an upload is in the air when somebody trades.
    const gate = deferred();
    let held = false;
    const s3 = stubS3({
      onSend: async (kind) => {
        if (kind === 'put' && !held) {
          held = true;
          await gate.promise;
        }
      },
    });
    await Store.open(store(s3));

    Store.data().mints = 1;
    Store.touch();
    const first = Store.flush();
    await new Promise((r) => setImmediate(r)); // let the upload start and block

    Store.data().mints = 2; // lands mid-flight
    Store.touch();
    gate.release();
    await first;
    await Store.flush();

    assert.equal(JSON.parse(s3.objects.get('flashcards.json')).mints, 2, 'the later change was dropped');
    assert.ok(s3.countOf('put') >= 2, 'the second change needed its own upload');
  });

  await check('a failed write is retried rather than dropped', async () => {
    let failNext = true;
    const s3 = stubS3({
      onSend: (kind) => {
        if (kind === 'put' && failNext) {
          failNext = false;
          throw Object.assign(new Error('Service Unavailable'), { name: 'ServiceUnavailable' });
        }
      },
    });
    await Store.open(store(s3));
    Store.data().mints = 42;
    Store.touch();
    await Store.flush(); // this one fails
    assert.equal(s3.objects.has('flashcards.json'), false, 'nothing should have landed yet');
    await Store.flush(); // and this one gets it out
    assert.equal(JSON.parse(s3.objects.get('flashcards.json')).mints, 42);
  });

  await check('a document that will not parse is kept, not overwritten', async () => {
    const s3 = stubS3({ objects: new Map([['flashcards.json', 'this is not json {{{']]) });
    await Store.open(store(s3));
    const kept = [...s3.objects.keys()].find((k) => k.includes('.corrupt-'));
    assert.ok(kept, 'the damaged document should have been copied aside');
    assert.equal(s3.objects.get(kept), 'this is not json {{{');
    assert.deepEqual(Store.data().users, {}, 'and the server carries on with an empty shelf');
  });

  await check('open() refuses to start when the read fails', async () => {
    const s3 = stubS3({
      onSend: (kind) => {
        if (kind === 'get') {
          throw Object.assign(new Error('socket hang up'), { name: 'TimeoutError' });
        }
      },
    });
    await assert.rejects(() => Store.open(store(s3)), /refusing to start/);
    assert.equal(s3.countOf('put'), 0, 'a failed open must never write anything');
  });

  // --- and the same thing, end to end --------------------------------------

  await check('a closed store cannot be written to', async () => {
    // Belt and braces on the rule that matters: with nothing read in, touch()
    // must not schedule anything and flush() must not send anything.
    const s3 = stubS3({
      onSend: (kind) => {
        if (kind === 'get') throw Object.assign(new Error('nope'), { name: 'TimeoutError' });
      },
    });
    await assert.rejects(() => Store.open(store(s3)));
    Store.touch();
    await Store.flush();
    assert.equal(s3.countOf('put'), 0, 'a closed store wrote something');
  });

  // --- and the same thing, end to end --------------------------------------

  await check('an unreachable bucket closes the room but not the site', async () => {
    const { child, port, out } = await bootServer({
      // Deliberately unroutable, and deliberately not anybody's real bucket.
      R2_ENDPOINT: 'http://127.0.0.1:1',
      R2_ACCESS_KEY_ID: 'not-a-real-key',
      R2_SECRET_ACCESS_KEY: 'not-a-real-secret',
      R2_BUCKET_NAME: 'not-a-real-bucket',
    });
    try {
      assert.match(out(), /THE ROOM IS CLOSED/, `expected the room to close, got:\n${out()}`);

      // The game, which keeps nothing and needs none of this, is untouched.
      const home = await fetch(`http://localhost:${port}/`);
      assert.equal(home.status, 200, 'the card game went down with the flashcards');
      assert.ok((await home.text()).includes('Create game'));
      assert.equal((await fetch(`http://localhost:${port}/health`)).status, 200);
      assert.equal((await fetch(`http://localhost:${port}/ABCD`)).status, 200, 'room codes should still work');

      // The room says so plainly, and its API refuses rather than pretending.
      const page = await fetch(`http://localhost:${port}/flashcards`);
      assert.equal(page.status, 503);
      assert.match(await page.text(), /closed for now/i);

      const api = await fetch(`http://localhost:${port}/api/flashcards/me`);
      assert.equal(api.status, 503);

      const register = await fetch(`http://localhost:${port}/api/flashcards/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: `http://localhost:${port}` },
        body: JSON.stringify({ username: 'someone', password: 'a-long-enough-password' }),
      });
      assert.equal(register.status, 503, 'a closed room must not open accounts');
    } finally {
      child.kill();
    }
  });

  await check('production without durable storage closes the room too', async () => {
    const { child, port, out } = await bootServer({ NODE_ENV: 'production' });
    try {
      assert.match(out(), /NO DURABLE STORAGE/, `expected the warning, got:\n${out()}`);
      assert.equal((await fetch(`http://localhost:${port}/`)).status, 200, 'the game should still run');
      assert.equal((await fetch(`http://localhost:${port}/flashcards`)).status, 503);
    } finally {
      child.kill();
    }
  });

  await check('and opens again when that is deliberate', async () => {
    const { child, port } = await bootServer({
      NODE_ENV: 'production',
      THIEVERY_ALLOW_EPHEMERAL: '1',
      THIEVERY_DATA_DIR: path.join(__dirname, '..', 'data-ephemeral-test'),
    });
    try {
      assert.equal((await fetch(`http://localhost:${port}/flashcards`)).status, 200);
    } finally {
      child.kill();
    }
  });

  await check('with no R2 variables it falls back to the local disk', async () => {
    const where = Store.chooseBackend().describe();
    assert.ok(!where.startsWith('r2://'), `expected a local path, got ${where}`);
    assert.ok(where.endsWith('flashcards.json'));
  });

  console.log(`\n${checks} checks passed.`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nFAILED:', err.message);
    process.exit(1);
  });
