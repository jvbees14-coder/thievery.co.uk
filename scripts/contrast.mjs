// ---------------------------------------------------------------------------
// The contrast table in docs/DESIGN.md, worked out from public/tokens.css.
//
//   node scripts/contrast.mjs
//
// Prints every pair of text and background the site uses, in the dark and
// light schemes and in each with more contrast asked for, as the markdown
// table the design notes carry. Change a colour, run this, paste the table.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
const css = fs.readFileSync('public/tokens.css', 'utf8');
// A block's colours, found by the text that opens it. A media query holds
// one rule, so for those the braces of the rule inside are the ones read.
function block(startsWith) {
  const i = css.indexOf(startsWith);
  let j = css.indexOf('{', i);
  if (startsWith.startsWith('@media')) { j = css.indexOf('{', j + 1); }
  const end = css.indexOf('}', j);
  const body = css.slice(j + 1, end);
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}
const dark = block(':root {\n  color-scheme: dark;');
const light = { ...dark, ...block('@media (prefers-color-scheme: light)') };
const darkMore = { ...dark, ...block('@media (prefers-contrast: more) {') };
const lightMore = { ...light, ...block('@media (prefers-contrast: more) and (prefers-color-scheme: light)') };
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lum = (h) => { const [r, g, b] = hex(h).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const pairs = [
  ['label', 'bg'], ['label', 'bg-elevated'], ['label-secondary', 'bg'], ['label-secondary', 'bg-elevated'],
  ['label-tertiary', 'bg'], ['label-tertiary', 'bg-elevated'], ['accent', 'bg'], ['accent', 'bg-elevated'],
  ['accent-contrast', 'accent'], ['success', 'bg-elevated'], ['warning', 'bg-elevated'], ['danger', 'bg-elevated'],
  ['danger-contrast', 'danger-strong'], ['focus-ring', 'bg'], ['focus-ring', 'bg-elevated'], ['separator-strong', 'bg-elevated'],
  ['team-a', 'bg-elevated'], ['team-b', 'bg-elevated'], ['watcher', 'bg-elevated'],
  ['r-common', 'bg-elevated'], ['r-uncommon', 'bg-elevated'], ['r-rare', 'bg-elevated'], ['r-epic', 'bg-elevated'], ['r-legendary', 'bg-elevated'], ['r-mythic', 'bg-elevated'],
];
const cell = (t, f, b) => (t[f] && t[b] ? ratio(t[f], t[b]).toFixed(2) : '—');
console.log('| Text | On | Dark | Light | Dark, more contrast | Light, more contrast |');
console.log('|---|---|---:|---:|---:|---:|');
for (const [f, b] of pairs) console.log(`| \`--${f}\` | \`--${b}\` | ${cell(dark, f, b)} | ${cell(light, f, b)} | ${cell(darkMore, f, b)} | ${cell(lightMore, f, b)} |`);
