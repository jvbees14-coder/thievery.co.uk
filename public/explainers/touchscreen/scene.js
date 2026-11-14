// ---------------------------------------------------------------------------
// How a touchscreen knows where you touched: the scene.
//
// A projected-capacitance grid: rows of transparent electrodes that are
// driven one at a time, columns that listen. Where a row crosses a column
// there is a small capacitor; a finger near a crossing draws away some of
// its field and the measured signal drops. The scene models that drop as a
// smooth bump round each finger, with a little noise, scans the grid row by
// row, and finds each touch the way a controller does: the strongest
// crossings, then a weighted average of the crossings round them, which
// places the finger between the wires.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, clamp, TAU } from '../engine.js';
import { label, setFace, TOKENS, ramp, glow } from '../shared/draw.js';

const COLS = 10, ROWS = 16;
const PITCH = 4.5;                     // mm between electrodes
const SPREAD = 0.85;                   // the bump's width, in electrode spacings
const THRESHOLD = 0.25;

const st = {
  fingers: [{ x: 4.3, y: 6.6 }, { x: 6.8, y: 11.2 }],
  count: 1,
  scanRow: 0,
  interpolate: true,
  noise: 0.04,
  seed: 1,
  readout: null,
};

function rand() {
  st.seed = (st.seed * 16807) % 2147483647;
  return st.seed / 2147483647;
}

function signalGrid() {
  const g = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      let s = 0;
      for (const f of st.fingers.slice(0, st.count)) s += Math.exp(-((c - f.x) ** 2 + (r - f.y) ** 2) / (2 * SPREAD * SPREAD));
      row.push(s + (rand() - 0.5) * st.noise);
    }
    g.push(row);
  }
  return g;
}

/** Touches: crossings stronger than their neighbours, then the weighted middle round each. */
function touches(g) {
  const out = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = g[r][c];
      if (v < THRESHOLD) continue;
      let peak = true;
      for (let dr = -1; dr <= 1 && peak; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && g[rr][cc] > v) peak = false;
      }
      if (!peak) continue;
      let sx = 0, sy = 0, sw = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
        const wgt = Math.max(0, g[rr][cc]);
        sx += wgt * cc;
        sy += wgt * rr;
        sw += wgt;
      }
      out.push({ x: st.interpolate ? sx / sw : c, y: st.interpolate ? sy / sw : r });
    }
  }
  return out;
}

function layout(w, h) {
  const cell = Math.min((w * 0.6) / COLS, (h * 0.86) / ROWS);
  const x0 = w * 0.08 + (w * 0.6 - cell * COLS) / 2, y0 = (h - cell * ROWS) / 2;
  return { cell, x0, y0, X: (c) => x0 + (c + 0.5) * cell, Y: (r) => y0 + (r + 0.5) * cell };
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const run = api.playing && api.motion;
  if (run) st.scanRow = (st.scanRow + dt * 30) % ROWS;
  const L = layout(w, h);
  const g = signalGrid();

  // The glass.
  ctx.fillStyle = col.bg;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(L.x0 - 10, L.y0 - 10, L.cell * COLS + 20, L.cell * ROWS + 20, 18) : ctx.rect(L.x0 - 10, L.y0 - 10, L.cell * COLS + 20, L.cell * ROWS + 20);
  ctx.fill();
  ctx.strokeStyle = col['separator-strong'];
  ctx.stroke();

  // What the controller measures at every crossing.
  if (ch !== 'grid') {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const v = clamp(g[r][c], 0, 1);
      if (v < 0.04) continue;
      ctx.fillStyle = alpha(ramp([col['hiw-ink-1'], col.accent, col['hiw-ink-2']], v), 0.15 + v * 0.7);
      ctx.fillRect(L.X(c) - L.cell / 2 + 1, L.Y(r) - L.cell / 2 + 1, L.cell - 2, L.cell - 2);
    }
  }
  // The electrodes: rows driven, columns listening.
  for (let r = 0; r < ROWS; r++) {
    const live = Math.floor(st.scanRow) === r;
    ctx.strokeStyle = live ? col['accent-strong'] : alpha(col['hiw-ink-1'], 0.45);
    ctx.lineWidth = live ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(L.x0, L.Y(r));
    ctx.lineTo(L.x0 + L.cell * COLS, L.Y(r));
    ctx.stroke();
  }
  for (let c = 0; c < COLS; c++) {
    ctx.strokeStyle = alpha(col['hiw-ink-2'], 0.45);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(L.X(c), L.y0);
    ctx.lineTo(L.X(c), L.y0 + L.cell * ROWS);
    ctx.stroke();
  }

  // The fingers, and where the controller thinks they are.
  st.fingers.slice(0, st.count).forEach((fg, i) => {
    ctx.beginPath();
    ctx.arc(L.X(fg.x), L.Y(fg.y), L.cell * 0.9, 0, TAU);
    ctx.fillStyle = alpha(col.label, 0.12);
    ctx.fill();
    ctx.strokeStyle = alpha(col.label, 0.6);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (api.handles?.focused && api.handles.selected === `f${i}`) {
      ctx.strokeStyle = col['focus-ring'];
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  });
  const found = ch === 'grid' ? [] : touches(g);
  for (const t of found) glow(ctx, L.X(t.x), L.Y(t.y), col.danger, 4, 3, 0.6);

  // A key, beside the glass.
  const kx = L.x0 + L.cell * COLS + 28;
  if (kx < w - 170) {
    label(ctx, 'Rows: driven in turn', kx, h * 0.25, col['hiw-ink-1'], bg, { size: 12 });
    label(ctx, 'Columns: listening', kx, h * 0.25 + 20, col['hiw-ink-2'], bg, { size: 12 });
    if (ch !== 'grid') label(ctx, 'Red: where it thinks you are', kx, h * 0.25 + 40, col.danger, bg, { size: 12 });
    label(ctx, `${PITCH} mm between wires`, kx, h * 0.25 + 60, col['label-tertiary'], bg, { size: 11, weight: 500 });
  }

  const r = st.readout;
  if (r) {
    const f0 = st.fingers[0];
    const est = found.length ? found.reduce((b, t) => (Math.hypot(t.x - f0.x, t.y - f0.y) < Math.hypot(b.x - f0.x, b.y - f0.y) ? t : b)) : null;
    r.set('crossings', fmt(ROWS * COLS));
    r.set('found', fmt(found.length));
    r.set('err', est ? `${fmt(Math.hypot(est.x - f0.x, est.y - f0.y) * PITCH, 2)} mm` : '–');
    r.set('true', `${fmt(f0.x * PITCH, 1)}, ${fmt(f0.y * PITCH, 1)} mm`);
  }
  return run;
}

const handles = {
  list(api) {
    if (api.chapter === 'grid') return [];
    const L = layout(api.scene.w, api.scene.h);
    return st.fingers.slice(0, st.count).map((f, i) => ({ id: `f${i}`, x: L.X(f.x), y: L.Y(f.y), r: L.cell * 1.2, label: `Finger ${i + 1}` }));
  },
  drag(id, x, y, api) {
    const L = layout(api.scene.w, api.scene.h);
    const f = st.fingers[Number(id.slice(1))];
    f.x = clamp((x - L.x0) / L.cell - 0.5, 0, COLS - 1);
    f.y = clamp((y - L.y0) / L.cell - 0.5, 0, ROWS - 1);
    api.invalidate();
  },
  nudge(id, dx, dy, api) {
    const f = st.fingers[Number(id.slice(1))];
    f.x = clamp(f.x + dx * 0.2, 0, COLS - 1);
    f.y = clamp(f.y + dy * 0.2, 0, ROWS - 1);
    api.invalidate();
  },
};

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.count = id === 'multi' ? 2 : 1;
  st.interpolate = true;
  api.note({ grid: 'The grid, much enlarged', finger: 'Drag the finger', between: 'Drag the finger slowly between wires', multi: 'Drag either finger' }[id]);
  if (id === 'between') {
    ui.toggle({ label: 'Work out the point between the wires', checked: true, onChange: (on) => { st.interpolate = on; api.invalidate(); } });
  }
  if (id === 'finger' || id === 'between' || id === 'multi') {
    ui.slider({ label: 'Electrical noise', min: 0, max: 30, value: Math.round(st.noise * 100), format: (v) => `${v}%`, onInput: (v) => { st.noise = v / 100; api.invalidate(); } });
  }
  const rows = {
    grid: [{ key: 'crossings', label: 'Crossings measured' }],
    finger: [{ key: 'found', label: 'Touches found' }, { key: 'err', label: 'Off by' }],
    between: [{ key: 'true', label: 'Finger at' }, { key: 'err', label: 'Off by' }],
    multi: [{ key: 'found', label: 'Touches found' }],
  }[id];
  st.readout = api.readout(rows);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw, handles });
