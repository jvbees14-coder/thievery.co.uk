// ---------------------------------------------------------------------------
// The four typefaces, fetched once and kept.
//
//   npm run fonts
//
// The pages used to ask fonts.googleapis.com for a stylesheet and then
// fonts.gstatic.com for the files themselves, which costs two DNS lookups and
// two connections before a single letter can be drawn in the right face. Until
// they arrive the page is set in Georgia and then jumps, and on a laptop with
// no internet — which the README explicitly offers as a way to play, everyone
// on the same Wi-Fi — it never stops being Georgia.
//
// So they live here instead. All four are under the SIL Open Font License,
// which permits exactly this; see public/fonts/OFL.txt for the terms and the
// copyright lines.
//
// This writes public/fonts/*.woff2 and public/fonts.css. Both are committed,
// so this only needs running to add a face or take one away.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const FONT_DIR = path.join(ROOT, 'public', 'fonts');

// Exactly the faces the stylesheets ask for, and no others. Google serves a
// variable file for the families that have one, so several weights often come
// back as a single download.
const FAMILIES = [
  'Limelight',
  'Cinzel:wght@400;600;700',
  'EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400',
  'Cutive+Mono',
];

// A browser's user agent, because the answer depends on it: anything else is
// offered ttf rather than the woff2 every browser this site supports can read.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const slug = (family, style, weight, subset) =>
  `${family.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${weight}${style === 'italic' ? '-italic' : ''}-${subset}.woff2`;

async function run() {
  const url = `https://fonts.googleapis.com/css2?family=${FAMILIES.join('&family=')}&display=swap`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Google Fonts answered ${res.status}`);
  const css = await res.text();

  fs.mkdirSync(FONT_DIR, { recursive: true });

  // Each @font-face block, with the comment above it naming the subset.
  const blocks = [...css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*(@font-face\s*\{[^}]+\})/g)];
  if (!blocks.length) throw new Error('no @font-face blocks came back');

  const downloaded = new Map(); // remote url -> local file name
  const out = [];
  let bytes = 0;

  for (const [, subset, block] of blocks) {
    const family = block.match(/font-family:\s*'([^']+)'/)[1];
    const style = block.match(/font-style:\s*(\w+)/)[1];
    const weight = block.match(/font-weight:\s*([\d\s]+)/)[1].trim().replace(/\s+/g, '-');
    const remote = block.match(/url\((https:[^)]+)\)/)[1];
    const range = block.match(/unicode-range:\s*([^;]+);/);

    let name = downloaded.get(remote);
    if (!name) {
      name = slug(family, style, weight, subset);
      const file = await fetch(remote, { headers: { 'User-Agent': UA } });
      if (!file.ok) throw new Error(`${remote} answered ${file.status}`);
      const body = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(path.join(FONT_DIR, name), body);
      downloaded.set(remote, name);
      bytes += body.length;
      console.log(`  ${name.padEnd(38)} ${String(body.length).padStart(7)} bytes`);
    }

    out.push(
      `/* ${subset} */\n@font-face {\n` +
        `  font-family: '${family}';\n` +
        `  font-style: ${style};\n` +
        `  font-weight: ${weight.replace(/-/g, ' ')};\n` +
        `  font-display: swap;\n` +
        `  src: url(/fonts/${name}) format('woff2');\n` +
        (range ? `  unicode-range: ${range[1].trim()};\n` : '') +
        `}`,
    );
  }

  const header =
    '/* The four faces the site is set in, served from here rather than from\n' +
    ' * Google. Written by scripts/fetch-fonts.js — edit that, not this.\n' +
    ' *\n' +
    ' * All four are under the SIL Open Font License; see fonts/OFL.txt.\n' +
    ' */\n\n';
  fs.writeFileSync(path.join(ROOT, 'public', 'fonts.css'), header + out.join('\n\n') + '\n', 'utf8');

  console.log(`\n${downloaded.size} files, ${(bytes / 1024).toFixed(1)}KB, and public/fonts.css written.\n`);
}

run().catch((err) => {
  console.error('\nfonts: ' + err.message + '\n');
  process.exit(1);
});
