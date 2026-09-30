// ---------------------------------------------------------------------------
// The share images, drawn from scripts/og/card.html.
//
//   npx -y -p playwright node scripts/og-images.mjs
//
// One 1200x630 picture per page that is worth sharing, written to
// public/og/<page>.jpg, which is what each page's og:image names. Like the
// fonts and the icons, the pictures are committed and this only needs running
// to change one. It needs a browser to draw with, which is why Playwright is
// asked for on the command line rather than added to package.json: the site
// itself has no use for it. (Once: npx playwright install chromium.)
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'public', 'og');
const PAGES = ['home', 'cards', 'flashcards', 'battle', 'switchhead', 'mindmaps', 'tools'];

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('\nog-images: needs Playwright. Run it as: npx -y -p playwright node scripts/og-images.mjs\n');
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
const template = pathToFileURL(path.join(__dirname, 'og', 'card.html')).href;
for (const name of PAGES) {
  await page.goto(`${template}?page=${name}`);
  await page.evaluate(() => document.fonts.ready);
  const file = path.join(OUT, `${name}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 86 });
  console.log(`  ${name.padEnd(12)} ${fs.statSync(file).size} bytes`);
}
await browser.close();
