// The source itself, read as bytes.
//
// One rule, and it is here because breaking it is silent. A string or a regex
// that wants a control character must spell it as an escape — `\u0000`, six
// characters — and never hold the character itself. A literal one makes git
// call the whole file binary: the diff disappears, review becomes impossible,
// and the change that did it is the one nobody can see any more.
//
// It is easy to introduce by accident, because almost everything that writes
// a file will happily interpret the escape on the way in. So the bytes are
// checked rather than the intention.
//
//   npm run test:source

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOOK_IN = ['server', 'server/views', 'public', 'scripts', 'test', '.'];
const TEXT = new Set(['.js', '.mjs', '.css', '.html', '.json', '.md', '.yaml', '.yml', '.toml', '.txt', '.xml']);
const SKIP = new Set(['node_modules', 'data', '.git', 'package-lock.json']);

// Tab, newline and carriage return are the three that belong in a text file.
const allowed = (b) => b === 9 || b === 10 || b === 13;
const isControl = (b) => (b < 32 && !allowed(b)) || b === 127;

let checked = 0;
const offenders = [];

for (const dir of LOOK_IN) {
  const here = path.join(ROOT, dir);
  if (!fs.existsSync(here)) continue;
  for (const name of fs.readdirSync(here)) {
    if (SKIP.has(name)) continue;
    const file = path.join(here, name);
    if (!fs.statSync(file).isFile()) continue;
    if (!TEXT.has(path.extname(name))) continue;

    const bytes = fs.readFileSync(file);
    checked += 1;
    const at = bytes.findIndex(isControl);
    if (at >= 0) {
      const line = bytes.subarray(0, at).toString('utf8').split('\n').length;
      offenders.push(`${path.relative(ROOT, file)}:${line} holds byte 0x${bytes[at].toString(16).padStart(2, '0')}`);
    }
  }
}

assert.equal(
  offenders.length,
  0,
  'a literal control character makes git treat the file as binary and the diff vanishes. ' +
    'Write it as an escape instead:\n  ' + offenders.join('\n  ')
);

console.log(`  ok  ${checked} source files hold no literal control characters`);
console.log('\n1 check passed.');
