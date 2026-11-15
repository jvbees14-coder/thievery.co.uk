// ---------------------------------------------------------------------------
// Levers and pulleys: the scene.
//
// Chapter 1 is a lever on a movable pivot lifting a 100 kg crate. Chapter 2
// is one fixed pulley; chapter 3 a block and tackle with a chosen number of
// rope runs; chapter 4 pulls the rope and compares the work done at each
// end. No friction anywhere, and ropes and pulleys weigh nothing.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, box, arrow, TOKENS } from '../shared/draw.js';

const LOAD = 100;   // kg
const st = { pivot: 0.25, runs: 4, pulled: 0, readout: null };

function crate(ctx, x, y, s, col, text) {
  box(ctx, x - s / 2, y - s, s, s, 4);
  ctx.fillStyle = col.warning;
  ctx.fill();
  ctx.strokeStyle = alpha(col['stock-ink'], 0.4);
  ctx.stroke();
  label(ctx, text, x, y - s / 2, col['stock-ink'], null, { size: 12, weight: 800, align: 'center' });
}

function drawLever(ctx, w, h, col, bg) {
  const x0 = 40, x1 = w - 40, len = x1 - x0, y = h * 0.6;
  const px = x0 + st.pivot * len;
  ctx.fillStyle = col['bg-elevated-2'];
  ctx.beginPath();
  ctx.moveTo(px, y);
  ctx.lineTo(px - 22, y + 40);
  ctx.lineTo(px + 22, y + 40);
  ctx.fill();
  ctx.strokeStyle = col.label;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  ctx.lineWidth = 1;
  crate(ctx, x0 + 26, y - 4, 52, col, '100 kg');
  const effort = (LOAD * st.pivot) / (1 - st.pivot);
  arrow(ctx, x1 - 6, y - 90, x1 - 6, y - 10, col.accent, 3, 12);
  label(ctx, `Push: ${fmt(effort, 0)} kg`, x1 - 12, y - 100, col.accent, bg, { size: 13, weight: 700, align: 'right' });
  ctx.strokeStyle = col['label-tertiary'];
  ctx.setLineDash([3, 4]);
  for (const [a, b, t] of [[x0, px, 'Load side'], [px, x1, 'Your side']]) {
    ctx.beginPath();
    ctx.moveTo(a, y + 56);
    ctx.lineTo(b, y + 56);
    ctx.stroke();
    label(ctx, t, (a + b) / 2, y + 70, col['label-tertiary'], bg, { size: 11, align: 'center' });
  }
  ctx.setLineDash([]);
  return effort;
}

function drawTackle(ctx, w, h, col, bg, runs, pulled) {
  const cx = w * 0.45, top = 80, r = 14;
  const lift = pulled / runs;                          // metres the load rises
  const span = h * 0.5, lowY = top + 40 + span - lift * (span / 4);
  const n = runs;
  // The fixed beam.
  ctx.fillStyle = col['bg-elevated-2'];
  ctx.fillRect(cx - 120, top - 20, 240, 12);
  // Rope runs between the blocks, side by side.
  const xs = Array.from({ length: n }, (_, i) => cx - ((n - 1) / 2) * 22 + i * 22);
  ctx.strokeStyle = col.accent;
  ctx.lineWidth = 2.5;
  xs.forEach((x) => {
    ctx.beginPath();
    ctx.moveTo(x, top + 4);
    ctx.lineTo(x, n === 1 ? top + 4 : lowY);
    ctx.stroke();
  });
  // Blocks.
  box(ctx, xs[0] - r, top - 8, xs[n - 1] - xs[0] + 2 * r, 2 * r - 4, 8);
  ctx.fillStyle = col['hiw-ink-1'];
  ctx.fill();
  if (n > 1) {
    box(ctx, xs[0] - r, lowY - 4, xs[n - 1] - xs[0] + 2 * r, 2 * r - 4, 8);
    ctx.fill();
  }
  // The load, hanging from the lower block (or the rope itself with one pulley).
  const loadTop = n > 1 ? lowY + 2 * r - 4 : lowY;
  if (n === 1) {
    ctx.beginPath();
    ctx.moveTo(xs[0] - 10, top + 4);
    ctx.lineTo(xs[0] - 10, lowY);
    ctx.stroke();
  }
  crate(ctx, n > 1 ? cx : xs[0] - 10, loadTop + 50, 50, col, '100 kg');
  // The free end, which you pull.
  const freeX = xs[n - 1] + 40;
  ctx.strokeStyle = col.accent;
  ctx.beginPath();
  ctx.moveTo(xs[n - 1], top + 4);
  ctx.lineTo(freeX, top + 4);
  ctx.lineTo(freeX, Math.min(h - 10, h - 60 + pulled * 8));
  ctx.stroke();
  const effort = LOAD / runs;
  arrow(ctx, freeX, Math.min(h - 60, h - 100 + pulled * 8), freeX, Math.min(h - 12, h - 50 + pulled * 8), col.label, 3, 10);
  label(ctx, `Pull: ${fmt(effort, 0)} kg`, freeX + 10, h - 80, col.label, bg, { size: 13, weight: 700 });
  return { effort, lift };
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  if (ch === 'lever') {
    const e = drawLever(ctx, w, h, col, bg);
    r?.set('push', `${fmt(e, 0)} kg`);
    r?.set('ratio', `${fmt((1 - st.pivot) / st.pivot, 1)} to 1`);
  } else {
    const runs = ch === 'pulley' ? 1 : st.runs;
    const { effort, lift } = drawTackle(ctx, w, h, col, bg, runs, ch === 'work' ? st.pulled : 0);
    r?.set('pull', `${fmt(effort, 0)} kg`);
    r?.set('rope', `${runs} m of rope per metre lifted`);
    r?.set('lift', `${fmt(lift, 2)} m`);
    r?.set('in', `${fmt(effort * 9.81 * st.pulled, 0)} J`);
    r?.set('out', `${fmt(LOAD * 9.81 * lift, 0)} J`);
  }
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ lever: 'A plank on a pivot', pulley: 'One fixed pulley', tackle: 'A block and tackle', work: 'Pulling the rope' }[id]);
  if (id === 'lever') {
    ui.slider({ label: 'Pivot', min: 0.1, max: 0.6, step: 0.01, value: st.pivot, format: (v) => `${Math.round(v * 100)}% along`, onInput(v) { st.pivot = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'push', label: 'Push needed' }, { key: 'ratio', label: 'Your side against the load side' }]);
  } else if (id === 'pulley') {
    st.readout = api.readout([{ key: 'pull', label: 'Pull needed' }]);
  } else if (id === 'tackle') {
    ui.slider({ label: 'Rope runs holding the load', min: 2, max: 6, value: st.runs, onInput(v) { st.runs = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'pull', label: 'Pull needed' }, { key: 'rope', label: 'Rope pulled' }]);
  } else if (id === 'work') {
    st.pulled = 0;
    ui.slider({ label: 'Rope pulled', min: 0, max: 4 * st.runs > 12 ? 12 : 4 * st.runs, step: 0.1, value: 0, format: (v) => `${fmt(v, 1)} m`, onInput(v) { st.pulled = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'lift', label: 'Load raised' }, { key: 'in', label: 'Work you put in' }, { key: 'out', label: 'Work done on the load' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

