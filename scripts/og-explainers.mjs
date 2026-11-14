// ---------------------------------------------------------------------------
// The share pictures for How it works, drawn from scripts/og/explainer.html.
//
//   npx -y -p playwright node scripts/og-explainers.mjs
//
// The same arrangement as og-images.mjs (one 1200x630 JPEG per page into
// public/og/, committed, Playwright asked for on the command line rather
// than added to package.json), with one difference: the picture is the
// explainer's own scene, drawn by its own module. A browser will not import
// a module from a file:// page, so the repository is served to the page
// from an address that never leaves this process (page.route), rather than
// starting the site.
//
// The pages are every explainer in server/explainers.js, as
// how-it-works-<slug>, plus the index as how-it-works. Name some on the
// command line to draw only those.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'og');
const { EXPLAINERS } = await import('../server/explainers.js');
const ALL = [
  { name: 'how-it-works', kicker: 'Interactive explainers', title: 'How it works', line: 'Learn how things work by playing with them.', thumb: '/explainers/gps/thumb.js' },
  ...EXPLAINERS.map((x) => ({ name: `how-it-works-${x.slug}`, kicker: 'How it works', title: x.name, line: x.hook, thumb: x.thumb })),
];
const asked = process.argv.slice(2);
const PAGES = asked.length ? ALL.filter((p) => asked.includes(p.name)) : ALL;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.css': 'text/css' };

// An import from this folder cannot see the copy npx fetched, so failing
// that, it is looked for beside the node_modules/.bin npx put on the PATH.
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir.endsWith(path.join('node_modules', '.bin'))) continue;
    try {
      ({ chromium } = createRequire(path.join(dir, '..', 'here.js'))('playwright'));
      break;
    } catch {
      /* not this one */
    }
  }
}
if (!chromium) {
  console.error('\nog-explainers: needs Playwright. Run it as: npx -y -p playwright node scripts/og-explainers.mjs\n');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.route('http://og.local/**', (route) => {
  const rel = decodeURIComponent(new URL(route.request().url()).pathname);
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) return route.fulfill({ status: 404 });
  route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
});
for (const { name, kicker, title, line, thumb } of PAGES) {
  const q = new URLSearchParams({ kicker, title, line, thumb });
  await page.goto(`http://og.local/scripts/og/explainer.html?${q}`);
  await page.waitForSelector('body[data-ready]', { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  const file = path.join(OUT, `${name}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 86 });
  console.log(`  ${name.padEnd(18)} ${fs.statSync(file).size} bytes`);
}
await browser.close();
