// ---------------------------------------------------------------------------
// The Game of Life: the scene.
//
// A grid run by art.js. Chapter 1 has a blinker and a block to step by
// hand; chapter 2 a glider; chapter 3 a random soup; chapter 4 Gosper's
// glider gun, on a grid that doesn't wrap, so its gliders fly off the edge.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { PATTERNS, grid, place, step, population } from './art.js';

const st = { g: null, gen: 0, acc: 0, wrap: true, readout: null };

function setUp(id) {
  const W = id === 'gun' ? 64 : 48, H = id === 'gun' ? 40 : 32;
  st.g = grid(W, H);
  st.gen = 0;
  st.wrap = id !== 'gun';
  if (id === 'rules') {
    place(st.g, PATTERNS.blinker, 10, 15);
    place(st.g, PATTERNS.block, 30, 14);
    place(st.g, [[0, 0], [1, 0], [0, 1]], 20, 6);          // dies away to a block
    place(st.g, [[0, 0], [2, 0], [1, 1], [0, 2]], 34, 24);  // a few that change
  } else if (id === 'glider') {
    place(st.g, PATTERNS.glider, 4, 4);
  } else if (id === 'soup') {
    for (let i = 0; i < st.g.cells.length; i++) st.g.cells[i] = Math.random() < 0.3 ? 1 : 0;
  } else if (id === 'gun') {
    place(st.g, PATTERNS.gun, 2, 2);
  }
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const r = st.readout;
  let moving = false;
  if (api.playing && api.motion) {
    st.acc += dt * (api.chapter === 'rules' ? 2 : 10);
    while (st.acc >= 1) {
      step(st.g, st.wrap);
      st.gen++;
      st.acc -= 1;
    }
    moving = true;
  }
  const g = st.g, cell = Math.min((w - 20) / g.w, (h - 80) / g.h);
  const ox = (w - cell * g.w) / 2, oy = 66;
  ctx.fillStyle = col['bg-elevated'];
  ctx.fillRect(ox, oy, cell * g.w, cell * g.h);
  ctx.strokeStyle = alpha(col.separator, 0.5);
  ctx.lineWidth = 1;
  if (cell > 8) {
    for (let x = 0; x <= g.w; x++) {
      ctx.beginPath();
      ctx.moveTo(ox + x * cell, oy);
      ctx.lineTo(ox + x * cell, oy + g.h * cell);
      ctx.stroke();
    }
    for (let y = 0; y <= g.h; y++) {
      ctx.beginPath();
      ctx.moveTo(ox, oy + y * cell);
      ctx.lineTo(ox + g.w * cell, oy + y * cell);
      ctx.stroke();
    }
  }
  ctx.fillStyle = col.accent;
  for (let i = 0; i < g.cells.length; i++) if (g.cells[i]) ctx.fillRect(ox + (i % g.w) * cell + 1, oy + Math.floor(i / g.w) * cell + 1, cell - 2, cell - 2);
  r?.set('gen', fmt(st.gen));
  r?.set('alive', fmt(population(g)));
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ rules: 'Press Step, or Play slowly', glider: 'A glider', soup: 'A random soup, the edges wrapping round', gun: 'Gosper’s glider gun' }[id]);
  setUp(id);
  ui.button({ label: 'Step', onClick() { step(st.g, st.wrap); st.gen++; api.invalidate(); } });
  ui.button({ label: 'Start again', onClick() { setUp(id); api.invalidate(); } });
  st.readout = api.readout([{ key: 'gen', label: 'Generation' }, { key: 'alive', label: 'Cells alive' }]);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
