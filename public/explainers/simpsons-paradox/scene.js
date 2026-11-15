// ---------------------------------------------------------------------------
// Simpson's paradox: the scene.
//
// The kidney-stone figures from Charig and colleagues (1986): treatment A
// (open surgery) and treatment B (a keyhole method), each tried on 350
// patients. Chapter 1 compares them overall, chapter 2 by stone size,
// chapter 3 draws each group as a block as wide as its number of patients,
// and chapter 4 lets the reader change how A's patients are made up.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, box, TOKENS } from '../shared/draw.js';

// [successes, patients]
const DATA = {
  A: { small: [81, 87], large: [192, 263] },
  B: { small: [234, 270], large: [55, 80] },
};
const st = { largeA: 263, readout: null };
const rate = ([s, n]) => s / n;
const overall = (t) => (t.small[0] + t.large[0]) / (t.small[1] + t.large[1]);

function bars(ctx, x0, y0, w, h, col, bg, groups) {
  // groups: [{ name, a, b }] as rates.
  const slot = w / groups.length, Y = (v) => y0 + h - v * h;
  for (const v of [0, 0.5, 1]) label(ctx, `${v * 100}%`, x0 - 6, Y(v), col['label-tertiary'], bg, { size: 11, align: 'right' });
  groups.forEach((g, i) => {
    const x = x0 + i * slot;
    [[g.a, col['hiw-ink-1'], 'A'], [g.b, col['hiw-ink-2'], 'B']].forEach(([v, c, name], k) => {
      const bx = x + slot * (0.15 + k * 0.37), bw = slot * 0.32;
      box(ctx, bx, Y(v), bw, y0 + h - Y(v), 4);
      ctx.fillStyle = c;
      ctx.fill();
      label(ctx, `${fmt(v * 100, 0)}%`, bx + bw / 2, Y(v) - 10, c, bg, { size: 12, weight: 700, align: 'center' });
      label(ctx, name, bx + bw / 2, y0 + h + 12, c, bg, { size: 12, weight: 700, align: 'center' });
    });
    label(ctx, g.name, x + slot / 2, y0 + h + 30, col['label-secondary'], bg, { size: 12, align: 'center' });
  });
}

function blocks(ctx, w, h, col, bg, A) {
  // Each treatment as a row of two blocks, as wide as their patients and
  // as tall as their success rate.
  const x0 = 60, x1 = w - 20, scale = (x1 - x0) / 350;
  [['A', A, col['hiw-ink-1']], ['B', DATA.B, col['hiw-ink-2']]].forEach(([name, t, c], row) => {
    const y = 90 + row * ((h - 140) / 2), H = (h - 180) / 2;
    label(ctx, name, x0 - 14, y + H / 2, c, bg, { size: 14, weight: 800, align: 'right' });
    let x = x0;
    for (const size of ['small', 'large']) {
      const [s, n] = t[size], bw = n * scale;
      box(ctx, x, y, bw - 3, H, 4);
      ctx.fillStyle = alpha(c, 0.18);
      ctx.fill();
      box(ctx, x, y + H * (1 - s / n), bw - 3, H * (s / n), 4);
      ctx.fillStyle = alpha(c, size === 'small' ? 0.85 : 0.55);
      ctx.fill();
      if (bw > 50) label(ctx, `${size === 'small' ? 'Small' : 'Large'}: ${n}`, x + 6, y - 9, col['label-secondary'], bg, { size: 11 });
      x += bw;
    }
  });
  label(ctx, 'Width: patients. Filled height: share treated successfully.', w / 2, h - 18, col['label-tertiary'], bg, { size: 11, align: 'center' });
}

function treatmentA() {
  // Keep A's success rate within each size; change how many had large stones.
  const large = st.largeA, small = 350 - large;
  return { small: [rate(DATA.A.small) * small, small], large: [rate(DATA.A.large) * large, large] };
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  const x0 = 50, y0 = 90, bw = w - 70, bh = h - 170;
  if (ch === 'overall') {
    bars(ctx, x0, y0, bw, bh, col, bg, [{ name: 'All 350 patients each', a: overall(DATA.A), b: overall(DATA.B) }]);
  } else if (ch === 'split') {
    bars(ctx, x0, y0, bw, bh, col, bg, [
      { name: 'Small stones', a: rate(DATA.A.small), b: rate(DATA.B.small) },
      { name: 'Large stones', a: rate(DATA.A.large), b: rate(DATA.B.large) },
      { name: 'All together', a: overall(DATA.A), b: overall(DATA.B) },
    ]);
  } else if (ch === 'why') {
    blocks(ctx, w, h, col, bg, DATA.A);
  } else if (ch === 'mix') {
    const A = treatmentA();
    blocks(ctx, w, h, col, bg, A);
    r?.set('a', `${fmt(overall(A) * 100, 1)}%`);
    r?.set('b', `${fmt(overall(DATA.B) * 100, 1)}%`);
  }
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ overall: 'Kidney stone treatments, 350 patients each', split: 'The same patients, by stone size', why: 'Who got which treatment', mix: 'Change who A was given to' }[id]);
  if (id === 'mix') {
    st.largeA = 263;
    ui.slider({ label: 'A’s patients with large stones', min: 20, max: 330, value: st.largeA, onInput(v) { st.largeA = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'a', label: 'A overall' }, { key: 'b', label: 'B overall' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
