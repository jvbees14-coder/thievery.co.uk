// The mind maps, over HTTP.
//
// This starts the real server against a throwaway data directory, opens two
// accounts, and makes, saves and deletes maps the way the page does. Most of
// it is about what the server refuses: a tree that is not a tree, a map that
// is too big, a save made from an old copy, and somebody else's map. The
// drawing and the exports are the browser's, and are not tested here.
//
//   npm run test:mindmaps

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'thievery-mindmaps-'));

const ADMIN = { username: 'thehouse', password: 'a-long-enough-password' };

let PORT = 0;
let child = null;

function startServer() {
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
      env: {
        ...process.env,
        PORT: '0',
        THIEVERY_DATA_DIR: DATA_DIR,
        THIEVERY_ADMIN_USERNAME: ADMIN.username,
        THIEVERY_ADMIN_PASSWORD: ADMIN.password,
      },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    child.stdout.on('data', (d) => {
      const at = String(d).match(/running at http:\/\/localhost:(\d+)/);
      if (at) {
        PORT = Number(at[1]);
        resolve();
      }
    });
    child.on('exit', (code) => reject(new Error(`server exited early (${code})`)));
  });
}

// --- a browser, more or less -----------------------------------------------

function visitor() {
  const jar = new Map();
  return {
    async call(url, { method = 'GET', body = null, origin = `http://localhost:${PORT}` } = {}) {
      const headers = {};
      if (body) headers['Content-Type'] = 'application/json';
      if (origin) headers.Origin = origin;
      if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      const res = await fetch(`http://localhost:${PORT}${url}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        redirect: 'manual',
      });
      for (const raw of res.headers.getSetCookie?.() || []) {
        const [pair] = raw.split(';');
        const at = pair.indexOf('=');
        const value = pair.slice(at + 1).trim();
        if (value) jar.set(pair.slice(0, at).trim(), value);
        else jar.delete(pair.slice(0, at).trim());
      }
      const text = await res.text();
      let payload = {};
      try {
        payload = JSON.parse(text);
      } catch {}
      return { status: res.status, body: payload, text, location: res.headers.get('location') };
    },
    maps(route = '', opts) {
      return this.call(`/api/mindmaps/maps${route}`, opts);
    },
  };
}

const ok = (res, what) => {
  assert.equal(res.status, 200, `${what}: expected 200, got ${res.status} — ${res.body.error || ''}`);
  return res.body;
};

let checks = 0;
function check(what, fn) {
  return Promise.resolve(fn()).then(() => {
    checks += 1;
    console.log('  ok  ' + what);
  });
}

const root = (text = 'Holidays') => ({ id: 'root', parentId: null, text, x: 0, y: 0 });

// ---------------------------------------------------------------------------

async function run() {
  await startServer();
  console.log(`mindmaps: server on ${PORT}, data in ${DATA_DIR}\n`);

  const stranger = visitor();
  const alice = visitor();
  const bob = visitor();

  // --- the door ------------------------------------------------------------

  await check('a stranger is shown the door, and the maps are refused', async () => {
    const page = await stranger.call('/mindmaps');
    assert.equal(page.status, 200);
    assert.ok(page.text.includes('Open an account'), 'expected the door');
    assert.ok(!page.text.includes('<!--') && !page.text.includes('{{'), 'the door was served unrendered');
    assert.equal((await stranger.maps()).status, 401);
    assert.equal((await stranger.maps('', { method: 'POST', body: { text: 'Mine now' } })).status, 401);
  });

  await check('anything deeper than /mindmaps goes back to it', async () => {
    const res = await stranger.call('/mindmaps/somewhere');
    assert.equal(res.status, 302);
    assert.match(res.location, /\/mindmaps$/);
  });

  for (const [who, name] of [
    [alice, 'alice'],
    [bob, 'bobby'],
  ]) {
    ok(await who.call('/api/site/register', { method: 'POST', body: { username: name, password: 'a-long-enough-password' } }), 'register');
  }

  await check('a member is shown the app, with this room marked on the bar', async () => {
    const page = await alice.call('/mindmaps');
    assert.equal(page.status, 200);
    assert.ok(page.text.includes('id="sheet"'), 'expected the app');
    assert.ok(page.text.includes('href="/mindmaps" aria-current="page"'), 'the bar does not mark this room');
    assert.ok(!page.text.includes('<!--') && !page.text.includes('{{'), 'the app was served unrendered');
  });

  // --- a map ---------------------------------------------------------------

  let id = '';
  let rev = 0;

  await check('a map is made with its bubble in the middle', async () => {
    const { map } = ok(await alice.maps('', { method: 'POST', body: { text: '  Holidays  ' } }), 'create');
    id = map.id;
    rev = map.rev;
    assert.equal(map.nodes.length, 1);
    assert.equal(map.nodes[0].text, 'Holidays');
    assert.equal(map.nodes[0].parentId, null);
    const list = ok(await alice.maps(), 'list');
    assert.deepEqual(list.maps.map((m) => [m.title, m.count]), [['Holidays', 1]]);
    assert.equal(list.limits.nodes, 250);
  });

  await check('a map with nothing in the middle is refused', async () => {
    assert.equal((await alice.maps('', { method: 'POST', body: { text: '   ' } })).status, 400);
  });

  await check('a save keeps the branches and where they were put', async () => {
    const nodes = [
      root(),
      { id: 'a', parentId: 'root', text: 'Where', x: 180, y: -12.34 },
      { id: 'b', parentId: 'a', text: 'Coast\nor hills', x: 360, y: 40 },
      { id: 'c', parentId: 'root', text: 'When', x: -200, y: 5 },
    ];
    const got = ok(await alice.maps(`/${id}`, { method: 'POST', body: { nodes, rev } }), 'save');
    assert.equal(got.rev, rev + 1);
    rev = got.rev;
    const { map } = ok(await alice.maps(`/${id}`), 'get');
    assert.equal(map.nodes.length, 4);
    const b = map.nodes.find((n) => n.id === 'b');
    assert.equal(b.text, 'Coast\nor hills', 'a line break in a bubble was lost');
    assert.equal(map.nodes.find((n) => n.id === 'a').y, -12.3);
  });

  await check('an empty bubble is dropped, and whatever hangs off it', async () => {
    const nodes = [
      root(),
      { id: 'a', parentId: 'root', text: 'Where', x: 180, y: 0 },
      { id: 'e', parentId: 'root', text: '   ', x: 0, y: 100 },
      { id: 'f', parentId: 'e', text: 'Orphan', x: 0, y: 200 },
    ];
    const got = ok(await alice.maps(`/${id}`, { method: 'POST', body: { nodes, rev } }), 'save');
    rev = got.rev;
    assert.deepEqual(got.nodes.map((n) => n.id).sort(), ['a', 'root']);
  });

  // --- what is refused ----------------------------------------------------

  const refused = async (what, nodes) => {
    const res = await alice.maps(`/${id}`, { method: 'POST', body: { nodes, rev } });
    assert.equal(res.status, 400, `${what} was accepted`);
    assert.ok(res.body.error, `${what} was refused without a reason`);
  };

  await check('a tree that is not a tree is refused', async () => {
    await refused('two bubbles in the middle', [root(), { id: 'x', parentId: null, text: 'Another', x: 0, y: 0 }]);
    await refused('no bubble in the middle', [{ id: 'x', parentId: 'y', text: 'X', x: 0, y: 0 }, { id: 'y', parentId: 'x', text: 'Y', x: 0, y: 0 }]);
    await refused('a missing parent', [root(), { id: 'x', parentId: 'nobody', text: 'X', x: 0, y: 0 }]);
    await refused(
      'a loop',
      [root(), { id: 'x', parentId: 'y', text: 'X', x: 0, y: 0 }, { id: 'y', parentId: 'x', text: 'Y', x: 0, y: 0 }]
    );
    await refused('two bubbles with one id', [root(), { id: 'root', parentId: 'root', text: 'Twin', x: 0, y: 0 }]);
    await refused('a bad id', [root(), { id: 'no spaces', parentId: 'root', text: 'X', x: 0, y: 0 }]);
    await refused('an empty middle', [root('  ')]);
    await refused('no bubbles at all', []);
  });

  await check('a map that is too big or too wordy is refused', async () => {
    const many = [root()];
    for (let i = 0; i < 250; i++) many.push({ id: `n${i}`, parentId: 'root', text: `Idea ${i}`, x: i, y: i });
    await refused('251 bubbles', many);
    await refused('81 characters', [root(), { id: 'x', parentId: 'root', text: 'w'.repeat(81), x: 0, y: 0 }]);
  });

  await check('a position that is not a number is refused, and a far one is pulled in', async () => {
    await refused('a position given as text', [root(), { id: 'x', parentId: 'root', text: 'X', x: '12', y: 0 }]);
    // JSON has no Infinity; it arrives as null, which is not a number either.
    await refused('a position of Infinity', [root(), { id: 'x', parentId: 'root', text: 'X', x: Infinity, y: 0 }]);
    const got = ok(
      await alice.maps(`/${id}`, {
        method: 'POST',
        body: { nodes: [root(), { id: 'x', parentId: 'root', text: 'Far', x: 1e9, y: -1e9 }], rev },
      }),
      'save'
    );
    rev = got.rev;
    const far = got.nodes.find((n) => n.id === 'x');
    assert.equal(far.x, 20000);
    assert.equal(far.y, -20000);
  });

  await check('a save from an old copy is refused rather than laid over the top', async () => {
    const res = await alice.maps(`/${id}`, { method: 'POST', body: { nodes: [root('Stale')], rev: rev - 1 } });
    assert.equal(res.status, 409);
    const { map } = ok(await alice.maps(`/${id}`), 'get');
    assert.equal(map.nodes.find((n) => n.parentId === null).text, 'Holidays', 'the stale save got through');
  });

  await check('a post from another site is refused', async () => {
    const res = await alice.maps(`/${id}`, { method: 'POST', body: { nodes: [root()], rev }, origin: 'https://not-thievery.example' });
    assert.equal(res.status, 403);
  });

  // --- somebody else's ----------------------------------------------------

  await check("another member cannot see, change or delete somebody's map", async () => {
    assert.equal((await bob.maps(`/${id}`)).status, 404);
    assert.equal((await bob.maps(`/${id}`, { method: 'POST', body: { nodes: [root('Mine')], rev } })).status, 404);
    assert.equal((await bob.maps(`/${id}`, { method: 'DELETE' })).status, 404);
    assert.deepEqual(ok(await bob.maps(), 'list').maps, []);
    assert.equal(ok(await alice.maps(`/${id}`), 'get').map.nodes[0].text, 'Holidays');
  });

  await check('the hall counts your maps', async () => {
    assert.equal(ok(await alice.call('/api/site/me'), 'me').mindmaps.count, 1);
    assert.equal(ok(await bob.call('/api/site/me'), 'me').mindmaps.count, 0);
  });

  await check('a malformed address is a 400, not a crash', async () => {
    assert.equal((await alice.call('/api/mindmaps/maps/%E0%A4%A')).status, 400);
    assert.equal((await alice.call('/api/mindmaps/nothing')).status, 404);
    assert.equal((await alice.call('/health')).status, 200, 'the server went down');
  });

  // --- deleting ---------------------------------------------------------------

  await check('a map can be deleted', async () => {
    const other = ok(await alice.maps('', { method: 'POST', body: { text: 'Second' } }), 'create').map;
    const got = ok(await alice.maps(`/${other.id}`, { method: 'DELETE' }), 'delete');
    assert.deepEqual(got.maps.map((m) => m.id), [id]);
    assert.equal((await alice.maps(`/${other.id}`)).status, 404);
  });

  await check('a deleted account takes its maps with it', async () => {
    const admin = visitor();
    ok(await admin.call('/api/site/login', { method: 'POST', body: ADMIN }), 'admin login');
    const overview = ok(await admin.call('/api/site/admin/users'), 'overview');
    const row = overview.users.find((u) => u.username === 'alice');
    ok(await admin.call(`/api/site/admin/users/${row.id}`, { method: 'DELETE' }), 'delete account');
    // The store holds a change for a moment before writing it, and writes it
    // to a temporary file renamed over the real one, so the file is waited
    // for by name and a read that lands mid-rename is simply tried again.
    // Looking the file up in a listing instead once caught the moment when
    // only the temporary one was there.
    const file = path.join(DATA_DIR, 'flashcards.json');
    let doc = null;
    for (let i = 0; i < 60; i++) {
      try {
        doc = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!doc.maps[id]) break;
      } catch {
        // not written yet, or caught mid-rename
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(doc && !doc.maps[id], 'a map outlived its account');
  });

  console.log(`\n${checks} checks passed.`);
}

run()
  .then(() => {
    child?.kill();
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nFAILED:', err.message);
    child?.kill();
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    process.exit(1);
  });
