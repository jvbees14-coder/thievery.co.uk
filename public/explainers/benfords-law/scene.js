// ---------------------------------------------------------------------------
// Benford's law: the scene.
//
// Chapter 1 counts the first digits of the powers of 2 against Benford's
// figures. Chapter 2 is a number growing steadily, drawn on a scale where
// each tenfold rise takes the same room, so the time it spends starting
// with each digit can be seen. Chapter 3 lets the reader pick a data set;
// chapter 4 puts made-up figures beside it.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { benford, firstDigits, SETS } from './art.js';

const st = { set: 'powers', t: 0, cache: {}, readout: null };
const digitsOf = (k) => (st.cache[k] ||= firstDigits(SETS[k].make()));

function bars(ctx, w, h, col, bg, shares, colour, title) {
  const x0 = 40, x1 = w - 16, y0 = 90, y1 = h - 40, slot = (x1 - x0) / 9;
  const Y = (v) => y1 - (v / 0.35) * (y1 - y0);
  label(ctx, title, x0, y0 - 20, colour, bg, { size: 12, weight: 700 });
  for (const v of [0, 0.1, 0.2, 0.3]) label(ctx, `${v * 100}%`, x0 - 6, Y(v), col['label-tertiary'], bg, { size: 11, align: 'right' });
  for (let d = 1; d <= 9; d++) {
    const x = x0 + (d - 1) * slot;
    ctx.fillStyle = colour;
    ctx.fillRect(x + slot * 0.18, Y(shares[d]), slot * 0.64, y1 - Y(shares[d]));
    label(ctx, String(d), x + slot / 2, y1 + 14, col['label-secondary'], bg, { size: 12, weight: 700, align: 'center' });
  }
  // Benford's figures, as dots joined up.
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let d = 1; d <= 9; d++) (d === 1 ? ctx.moveTo : ctx.lineTo).call(ctx, x0 + (d - 0.5) * slot, Y(benford(d)));
  ctx.stroke();
  for (let d = 1; d <= 9; d++) {
    ctx.beginPath();
    ctx.arc(x0 + (d - 0.5) * slot, Y(benford(d)), 4, 0, TAU);
    ctx.fillStyle = col.accent;
    ctx.fill();
  }
  label(ctx, 'Benford', x1, Y(benford(9)) - 14, col.accent, bg, { size: 11, align: 'right' });
}

function drawRuler(ctx, w, h, col, bg, api, dt) {
  // A log scale from 1 to 10; a number doubling every few seconds moves along it evenly.
  const x0 = 30, x1 = w - 30, y = h * 0.45;
  const X = (v) => x0 + Math.log10(v) * (x1 - x0);
  for (let d = 1; d <= 9; d++) {
    ctx.fillStyle = d % 2 ? alpha(col['hiw-ink-1'], 0.35) : alpha(col['hiw-ink-4'], 0.35);
    ctx.fillRect(X(d), y - 20, X(d + 1) - X(d), 40);
    label(ctx, String(d), (X(d) + X(d + 1)) / 2, y + 36, col['label-secondary'], bg, { size: 12, weight: 700, align: 'center' });
  }
  if (api.playing && api.motion) st.t += dt * 0.12;
  const v = 10 ** (st.t % 1);
  ctx.beginPath();
  ctx.arc(X(v), y, 9, 0, TAU);
  ctx.fillStyle = col.accent;
  ctx.fill();
  label(ctx, `Starts with ${Math.floor(v)}`, Math.min(Math.max(X(v), x0 + 40), x1 - 40), y - 34, col.accent, bg, { size: 12, weight: 700, align: 'center' });
  label(ctx, 'Each step along is the same percentage of growth', w / 2, y + 70, col['label-tertiary'], bg, { size: 11, align: 'center' });
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  let moving = false;
  if (ch === 'why') {
    drawRuler(ctx, w, h, col, bg, api, dt);
    moving = api.playing && api.motion;
  } else {
    const k = ch === 'digits' ? 'powers' : ch === 'fraud' ? 'madeUp' : st.set;
    const shares = digitsOf(k);
    bars(ctx, w, h, col, bg, shares, ch === 'fraud' ? col.danger : col['hiw-ink-1'], SETS[k].name);
    r?.set('ones', `${fmt(shares[1] * 100, 1)}%`);
    r?.set('nines', `${fmt(shares[9] * 100, 1)}%`);
  }
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ digits: 'The first thousand powers of 2', why: 'A growing number on a ten-fold scale', data: 'Choose a collection of numbers', fraud: 'A thousand figures picked evenly' }[id]);
  if (id === 'data') {
    ui.choice({
      label: 'Numbers',
      options: [{ id: 'powers', label: 'Powers of 2' }, { id: 'fibonacci', label: 'Fibonacci' }, { id: 'savings', label: 'Savings growing' }],
      value: st.set,
      onChange(v) { st.set = v; api.invalidate(); },
    });
  }
  if (id === 'fraud') ui.button({ label: 'Make up more', onClick() { delete st.cache.madeUp; api.invalidate(); } });
  if (id !== 'why') st.readout = api.readout([{ key: 'ones', label: 'Starting with 1' }, { key: 'nines', label: 'Starting with 9' }]);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
