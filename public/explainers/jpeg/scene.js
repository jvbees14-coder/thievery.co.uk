// ---------------------------------------------------------------------------
// How JPEG shrinks a photo: the scene.
//
// The arithmetic is in art.js. Brightness is drawn as a mix of two tokens,
// --back (dark) to --stock (light), so the picture keeps its contrast in
// either scheme. Chapter 1 picks a block and prints its pixels; chapter 2
// draws the 64 cosine patterns, shaded by how much the block uses each;
// chapter 3 shows the rounded amounts at a quality; chapter 4 sets the
// rebuilt picture beside the original.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, TOKENS, mix } from '../shared/draw.js';
import { N, picture, block, dct, idct, table, squeeze } from './art.js';

const IMG = picture();
const st = { bx: 4, by: 1, quality: 50, readout: null, cache: new Map() };

function shades(col) {
  // 32 steps from dark to light, worked out once per palette.
  if (st.paletteFor !== col.back + col.stock) {
    st.ramp = Array.from({ length: 33 }, (_, i) => mix(col.back, col.stock, i / 32));
    st.paletteFor = col.back + col.stock;
  }
  return (v) => st.ramp[Math.max(0, Math.min(32, Math.round((v / 255) * 32)))];
}

function image(ctx, img, x0, y0, size, col, grid, pick) {
  const px = size / N, shade = shades(col);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    ctx.fillStyle = shade(img[y * N + x]);
    ctx.fillRect(x0 + x * px, y0 + y * px, px + 0.5, px + 0.5);
  }
  if (grid) {
    ctx.strokeStyle = alpha(col.accent, 0.35);
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(x0 + i * 8 * px, y0);
      ctx.lineTo(x0 + i * 8 * px, y0 + size);
      ctx.moveTo(x0, y0 + i * 8 * px);
      ctx.lineTo(x0 + size, y0 + i * 8 * px);
      ctx.stroke();
    }
  }
  if (pick) {
    ctx.strokeStyle = col.danger;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x0 + st.bx * 8 * px, y0 + st.by * 8 * px, 8 * px, 8 * px);
  }
}

function numbers(ctx, vals, x0, y0, cell, col, fmtv, tone) {
  for (let i = 0; i < 64; i++) {
    const x = x0 + (i % 8) * cell, y = y0 + Math.floor(i / 8) * cell;
    const v = vals[i];
    if (tone) {
      ctx.fillStyle = tone(v, i);
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    }
    label(ctx, fmtv(v), x + cell / 2, y + cell / 2, col.label, null, { size: Math.max(9, Math.min(12, cell * 0.33)), align: 'center', mono: true });
  }
}

function squeezed(q) {
  if (!st.cache.has(q)) st.cache.set(q, squeeze(IMG, q));
  return st.cache.get(q);
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  const wide = w > 300;
  const size = wide ? Math.min(h - 110, w * 0.42) : Math.min(w - 40, (h - 100) / 2);
  const ix = 20, iy = 70;
  const rx = wide ? ix + size + 30 : ix, ry = wide ? iy : iy + size + 30;
  const rw = wide ? w - rx - 20 : w - 40;
  const cell = Math.min(rw / 8, (wide ? h - 110 : h - ry - 20) / 8);
  const b = block(IMG, st.bx, st.by);
  const c = dct(b);
  if (ch === 'blocks') {
    image(ctx, IMG, ix, iy, size, col, true, true);
    numbers(ctx, b.map((v) => v + 128), rx, ry, cell, col, (v) => fmt(v), (v) => alpha(shades(col)(v), 0.9));
    label(ctx, 'Brightness of each pixel, 0 to 255', rx, ry - 14, col['label-secondary'], bg, { size: 11 });
    r?.set('block', `Column ${st.bx + 1}, row ${st.by + 1}`);
  } else if (ch === 'patterns') {
    image(ctx, IMG, ix, iy, size, col, true, true);
    const shade = shades(col);
    const biggest = Math.max(...c.map(Math.abs).slice(1), 1);
    for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
      const coef = c[v * 8 + u];
      const strength = u + v === 0 ? 1 : Math.min(1, Math.abs(coef) / biggest);
      const x = rx + u * cell, y = ry + v * cell;
      // The pattern itself, faded by how little of it the block needs.
      const k = cell / 8;
      for (let py = 0; py < 8; py++) for (let pxx = 0; pxx < 8; pxx++) {
        const val = Math.cos(((2 * pxx + 1) * u * Math.PI) / 16) * Math.cos(((2 * py + 1) * v * Math.PI) / 16);
        ctx.fillStyle = shade(128 + val * 120);
        ctx.fillRect(x + pxx * k, y + py * k, k + 0.3, k + 0.3);
      }
      ctx.fillStyle = alpha(bg, 0.85 * (1 - strength));
      ctx.fillRect(x, y, cell, cell);
      ctx.strokeStyle = col.separator;
      ctx.strokeRect(x, y, cell, cell);
    }
    label(ctx, 'Bright: patterns this square uses most', rx, ry - 14, col['label-secondary'], bg, { size: 11 });
    const big = c.filter((v) => Math.abs(v) >= 10).length;
    r?.set('big', `${big} of 64`);
  } else if (ch === 'quantise') {
    image(ctx, IMG, ix, iy, size, col, true, true);
    const T = table(st.quality);
    const q = c.map((v, i) => Math.round(v / T[i]));
    numbers(ctx, q, rx, ry, cell, col, (v) => (v === 0 ? '0' : fmt(v)), (v) => (v === 0 ? alpha(col['label-tertiary'], 0.08) : alpha(col.accent, 0.3)));
    label(ctx, 'Each amount ÷ the table, rounded', rx, ry - 14, col['label-secondary'], bg, { size: 11 });
    const all = squeezed(st.quality);
    r?.set('here', `${q.filter((v) => v === 0).length} of 64`);
    r?.set('all', `${fmt((all.zeros / all.total) * 100, 1)}%`);
  } else if (ch === 'artefacts') {
    const all = squeezed(st.quality);
    image(ctx, IMG, ix, iy, size, col, false, false);
    image(ctx, all.img, rx, ry, Math.min(size, rw), col, false, false);
    label(ctx, 'Original', ix, iy - 14, col['label-secondary'], bg, { size: 11 });
    label(ctx, `After JPEG at quality ${st.quality}`, rx, ry - 14, col['label-secondary'], bg, { size: 11 });
    r?.set('all', `${fmt((all.zeros / all.total) * 100, 1)}%`);
    r?.set('err', `${fmt(all.error, 1)} levels`);
  }
  return false;
}

const handles = {
  list(api) {
    if (api.chapter === 'artefacts') return [];
    const c = api.scene.canvas.getBoundingClientRect();
    const wide = c.width > 300;
    const size = wide ? Math.min(c.height - 110, c.width * 0.42) : Math.min(c.width - 40, (c.height - 100) / 2);
    const px = size / 8;
    return [{ id: 'block', x: 20 + (st.bx + 0.5) * px, y: 70 + (st.by + 0.5) * px, r: px, label: 'The chosen square', size, px }];
  },
  drag(id, x, y, api) {
    const c = api.scene.canvas.getBoundingClientRect();
    const wide = c.width > 300;
    const size = wide ? Math.min(c.height - 110, c.width * 0.42) : Math.min(c.width - 40, (c.height - 100) / 2);
    st.bx = Math.max(0, Math.min(7, Math.floor(((x - 20) / size) * 8)));
    st.by = Math.max(0, Math.min(7, Math.floor(((y - 70) / size) * 8)));
    api.invalidate();
  },
  nudge(id, dx, dy, api) {
    st.bx = Math.max(0, Math.min(7, st.bx + Math.sign(dx)));
    st.by = Math.max(0, Math.min(7, st.by + Math.sign(dy)));
    api.invalidate();
  },
};

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.readout = null;
  api.note({ blocks: 'A 64 × 64 picture, in squares of 8 × 8', patterns: 'The 64 patterns, and how much of each this square needs', quantise: 'Rounding away the small amounts', artefacts: 'The picture rebuilt from what survived' }[id]);
  if (id !== 'artefacts') ui.hint('Drag the red square, or select the picture and use the arrow keys.');
  if (id === 'quantise' || id === 'artefacts') ui.slider({ label: 'Quality', min: 1, max: 100, value: st.quality, onInput(v) { st.quality = v; api.invalidate(); } });
  if (id === 'blocks') st.readout = api.readout([{ key: 'block', label: 'Square' }]);
  else if (id === 'patterns') st.readout = api.readout([{ key: 'big', label: 'Patterns with an amount of 10 or more' }]);
  else if (id === 'quantise') st.readout = api.readout([{ key: 'here', label: 'Zeros in this square' }, { key: 'all', label: 'Zeros in the picture' }]);
  else st.readout = api.readout([{ key: 'all', label: 'Zeros' }, { key: 'err', label: 'Typical error' }]);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw, handles });
