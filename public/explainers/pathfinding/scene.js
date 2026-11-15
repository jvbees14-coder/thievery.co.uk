// ---------------------------------------------------------------------------
// How a satnav finds a route: the scene.
//
// A grid with walls (and in chapter 2, mud), searched by art.js and played
// back a cell at a time: lit cells have been settled, and when the goal is
// reached the route is drawn. Chapter 4 runs all three on the same grid
// and counts the cells each had to look at.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, box, TOKENS } from '../shared/draw.js';
import { COLS, ROWS, WALL, MUD, makeGrid, search } from './art.js';

const st = { seed: 3, grid: null, method: 'bfs', result: null, shown: 0, compare: null, readout: null };

function setUp(ch) {
  st.grid = makeGrid(st.seed, { mud: ch === 'mud' ? 0.85 : 0 });
  st.result = search(st.grid, st.method);
  st.shown = 0;
  if (ch === 'compare') st.compare = Object.fromEntries(['bfs', 'dijkstra', 'astar'].map((m) => [m, search(st.grid, m)]));
}

function drawGrid(ctx, x0, y0, w, h, col, grid, result, shown, colour) {
  const cell = Math.min(w / COLS, h / ROWS);
  const ox = x0 + (w - cell * COLS) / 2;
  const at = (r, c) => [ox + c * cell, y0 + r * cell];
  grid.g.forEach((row, r) => row.forEach((v, c) => {
    const [x, y] = at(r, c);
    ctx.fillStyle = v === WALL ? col['label-tertiary'] : v === MUD ? alpha(col.warning, 0.45) : col['bg-elevated'];
    ctx.fillRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
  }));
  const n = Math.min(shown, result.order.length);
  for (let i = 0; i < n; i++) {
    const [r, c] = result.order[i], [x, y] = at(r, c);
    ctx.fillStyle = alpha(colour, 0.35);
    ctx.fillRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
  }
  if (n >= result.order.length && result.path.length) {
    ctx.strokeStyle = col.accent;
    ctx.lineWidth = Math.max(2, cell * 0.25);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    result.path.forEach(([r, c], i) => {
      const [x, y] = at(r, c);
      i ? ctx.lineTo(x + cell / 2, y + cell / 2) : ctx.moveTo(x + cell / 2, y + cell / 2);
    });
    ctx.stroke();
  }
  for (const [[r, c], k] of [[grid.start, col.success], [grid.goal, col.danger]]) {
    const [x, y] = at(r, c);
    box(ctx, x + 2, y + 2, cell - 4, cell - 4, 3);
    ctx.fillStyle = k;
    ctx.fill();
  }
  return cell;
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  let moving = false;
  if (ch === 'compare') {
    const third = (h - 80) / 3;
    const names = { bfs: 'Breadth first', dijkstra: 'Dijkstra', astar: 'A*' };
    const colours = { bfs: col['hiw-ink-1'], dijkstra: col['hiw-ink-4'], astar: col['hiw-ink-2'] };
    ['bfs', 'astar'].forEach((m, i) => {
      const y = 70 + i * (third * 1.5);
      label(ctx, `${names[m]}: ${st.compare[m].order.length} cells looked at`, 16, y, colours[m], bg, { size: 12, weight: 700 });
      drawGrid(ctx, 16, y + 12, w - 32, third * 1.5 - 30, col, st.grid, st.compare[m], Infinity, colours[m]);
    });
    r?.set('bfs', fmt(st.compare.bfs.order.length));
    r?.set('astar', fmt(st.compare.astar.order.length));
    return false;
  }
  if (api.playing && api.motion && st.shown < st.result.order.length) {
    st.shown += dt * 60;
    moving = true;
  } else if (!api.motion) st.shown = Infinity;
  const colour = { bfs: col['hiw-ink-1'], dijkstra: col['hiw-ink-4'], astar: col['hiw-ink-2'] }[st.method];
  drawGrid(ctx, 12, 64, w - 24, h - 80, col, st.grid, st.result, st.shown, colour);
  const done = st.shown >= st.result.order.length;
  r?.set('looked', fmt(Math.min(Math.floor(st.shown), st.result.order.length)));
  r?.set('steps', done ? `${st.result.path.length - 1} steps` : '…');
  r?.set('cost', done ? fmt(st.result.cost) : '…');
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ flood: 'Breadth first: green start, red goal', mud: 'Orange is mud: five times the cost to cross', astar: 'A*: aiming at the goal', compare: 'The same grid, two ways' }[id]);
  st.method = id === 'astar' ? 'astar' : id === 'mud' ? 'dijkstra' : 'bfs';
  setUp(id);
  if (id === 'mud') {
    ui.choice({
      label: 'Method',
      options: [{ id: 'bfs', label: 'Fewest steps' }, { id: 'dijkstra', label: 'Dijkstra: lowest cost' }],
      value: st.method,
      onChange(v) { st.method = v; st.result = search(st.grid, v); st.shown = 0; api.invalidate(); },
    });
  }
  ui.button({ label: 'New grid', onClick() { st.seed = Math.floor(Math.random() * 1e6); setUp(id); api.invalidate(); } });
  if (id !== 'compare') ui.button({ label: 'Search again', onClick() { st.shown = 0; api.invalidate(); } });
  st.readout = id === 'compare'
    ? api.readout([{ key: 'bfs', label: 'Breadth first looked at' }, { key: 'astar', label: 'A* looked at' }])
    : api.readout(id === 'mud'
      ? [{ key: 'looked', label: 'Cells looked at' }, { key: 'steps', label: 'Route' }, { key: 'cost', label: 'Route cost' }]
      : [{ key: 'looked', label: 'Cells looked at' }, { key: 'steps', label: 'Route' }]);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
