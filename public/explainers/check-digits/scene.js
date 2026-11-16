// ---------------------------------------------------------------------------
// The last digit that catches typos: the scene.
//
// Four check-digit rules, each judged by trying every single-digit mistake
// and every swap of two neighbouring digits on the number shown:
//   plain sum   the digits add to a multiple of 10
//   Luhn        double every second digit from the right (taking 9 off
//               anything over 9), then the total must end in 0
//   ISBN-13     weights 1, 3, 1, 3 …, total a multiple of 10
//   ISBN-10     weights 10 down to 1, total a multiple of 11 (X for 10)
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, box, TOKENS } from '../shared/draw.js';

const RULES = {
  sum: { name: 'Plain sum', ok: (s) => [...s].reduce((a, c) => a + Number(c), 0) % 10 === 0 },
  luhn: {
    name: 'Luhn',
    ok: (s) => {
      let t = 0;
      [...s].reverse().forEach((c, i) => { let d = Number(c); if (i % 2) { d *= 2; if (d > 9) d -= 9; } t += d; });
      return t % 10 === 0;
    },
  },
  isbn13: { name: 'ISBN-13', ok: (s) => [...s].reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0) % 10 === 0 },
  isbn10: { name: 'ISBN-10', ok: (s) => [...s].reduce((a, c, i) => a + (c === 'X' ? 10 : Number(c)) * (10 - i), 0) % 11 === 0, x: true },
};
const EXAMPLES = { sum: '79927398718', luhn: '79927398713', isbn13: '9780306406157', isbn10: '0306406152' };

const st = { rule: 'luhn', num: EXAMPLES.luhn, swapAt: -1, readout: null };

function trials(rule, s) {
  const R = RULES[rule], digits = R.x ? '0123456789X' : '0123456789';
  let single = 0, sc = 0, swaps = 0, swc = 0;
  for (let i = 0; i < s.length; i++) for (const d of digits) {
    if (d === s[i] || (d === 'X' && i !== s.length - 1)) continue;
    single++;
    if (!R.ok(s.slice(0, i) + d + s.slice(i + 1))) sc++;
  }
  for (let i = 0; i + 1 < s.length; i++) {
    if (s[i] === s[i + 1]) continue;
    swaps++;
    if (!R.ok(s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2))) swc++;
  }
  return { single, sc, swaps, swc };
}

function digits(ctx, s, x0, y, cell, col, marks, bg) {
  [...s].forEach((c, i) => {
    const x = x0 + i * cell;
    box(ctx, x + 2, y, cell - 4, cell * 1.2, 5);
    ctx.fillStyle = marks?.[i] ? alpha(marks[i], 0.22) : alpha(col['label-tertiary'], 0.08);
    ctx.fill();
    label(ctx, c, x + cell / 2, y + cell * 0.6, i === s.length - 1 ? col.accent : col.label, null, { size: Math.min(22, cell * 0.6), weight: 700, align: 'center', mono: true });
  });
  label(ctx, 'Check digit', x0 + (s.length - 0.5) * cell, y + cell * 1.2 + 14, col.accent, bg, { size: 11, align: 'center' });
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  const s = st.num;
  const cell = Math.min(46, (w - 40) / Math.max(1, s.length));
  const x0 = (w - cell * s.length) / 2;
  const R = RULES[st.rule];
  const valid = s.length > 1 && R.ok(s);
  if (ch === 'luhn' && st.rule === 'luhn') {
    // The working: each digit, doubled or not, and the total.
    const marks = [];
    let t = 0;
    const rows = [...s].map((c, i) => {
      const fromRight = s.length - 1 - i;
      let d = Number(c);
      const dbl = fromRight % 2 === 1;
      if (dbl) { d *= 2; if (d > 9) d -= 9; }
      t += d;
      marks[i] = dbl ? col['hiw-ink-1'] : null;
      return { d, dbl };
    });
    digits(ctx, s, x0, 80, cell, col, marks, bg);
    rows.forEach(({ d, dbl }, i) => label(ctx, `${d}`, x0 + (i + 0.5) * cell, 80 + cell * 1.2 + 40, dbl ? col['hiw-ink-1'] : col['label-secondary'], bg, { size: 14, weight: 700, align: 'center', mono: true }));
    label(ctx, 'After doubling every second digit from the right (and taking 9 off anything over 9)', w / 2, 80 + cell * 1.2 + 66, col['label-tertiary'], bg, { size: 11, align: 'center' });
    label(ctx, `Total ${t}: ${t % 10 === 0 ? 'ends in 0, so it passes' : `ends in ${t % 10}, so it fails`}`, w / 2, 80 + cell * 1.2 + 100, t % 10 === 0 ? col.success : col.danger, bg, { size: 16, weight: 700, align: 'center' });
    r?.set('ok', valid ? 'Passes' : 'Fails');
  } else {
    digits(ctx, s, x0, 80, cell, col, null, bg);
    label(ctx, valid ? `${R.name}: passes` : `${R.name}: fails`, w / 2, 80 + cell * 1.2 + 44, valid ? col.success : col.danger, bg, { size: 16, weight: 700, align: 'center' });
    if (ch === 'swap' || ch === 'isbn') {
      // Every rule tried on its own example, so they can be compared.
      const keys = ch === 'isbn' ? ['isbn10', 'isbn13', 'luhn', 'sum'] : ['sum', 'luhn'];
      const y = 80 + cell * 1.2 + 84;
      label(ctx, 'Every mistake tried on each rule’s example:', 20, y, col['label-secondary'], bg, { size: 12 });
      label(ctx, 'One digit wrong', w * 0.45, y + 28, col['label-secondary'], bg, { size: 11, align: 'center' });
      label(ctx, 'Neighbours swapped', w * 0.75, y + 28, col['label-secondary'], bg, { size: 11, align: 'center' });
      keys.forEach((k, i) => {
        const tr = trials(k, EXAMPLES[k]);
        const yy = y + 54 + i * 26;
        label(ctx, RULES[k].name, 20, yy, k === st.rule ? col.accent : col.label, bg, { size: 13, weight: 700 });
        label(ctx, `${tr.sc} of ${tr.single} caught`, w * 0.45, yy, tr.sc === tr.single ? col.success : col.danger, bg, { size: 13, align: 'center' });
        label(ctx, `${tr.swc} of ${tr.swaps} caught`, w * 0.75, yy, tr.swc === tr.swaps ? col.success : col.danger, bg, { size: 13, align: 'center' });
      });
    }
    r?.set('ok', valid ? 'Passes' : 'Fails');
  }
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.readout = null;
  st.rule = { typo: 'sum', luhn: 'luhn', swap: 'luhn', isbn: 'isbn10' }[id];
  st.num = EXAMPLES[st.rule];
  api.note({ typo: 'A number whose digits add to a multiple of 10', luhn: 'The rule on bank cards', swap: 'Swapped digits', isbn: 'Book numbers' }[id]);
  const input = ui.text({ label: 'Number', value: st.num, maxLength: 19, onInput(v) { st.num = v.toUpperCase().replace(/[^0-9X]/g, ''); api.invalidate(); } });
  if (id === 'isbn') {
    ui.choice({
      label: 'Rule',
      options: [{ id: 'isbn10', label: 'ISBN-10' }, { id: 'isbn13', label: 'ISBN-13' }],
      value: 'isbn10',
      onChange(v) { st.rule = v; st.num = EXAMPLES[v]; input.value = st.num; api.invalidate(); },
    });
  }
  ui.button({
    label: 'Swap two neighbours',
    onClick() {
      const s = st.num;
      const i = Math.floor(Math.random() * (s.length - 1));
      st.num = s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2);
      input.value = st.num;
      api.status(`Digits ${i + 1} and ${i + 2} swapped.`);
      api.invalidate();
    },
  });
  ui.button({ label: 'Put it back', onClick() { st.num = EXAMPLES[st.rule]; input.value = st.num; api.status(''); api.invalidate(); } });
  st.readout = api.readout([{ key: 'ok', label: 'Check' }]);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
