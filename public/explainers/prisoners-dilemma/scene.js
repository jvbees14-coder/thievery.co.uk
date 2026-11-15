// ---------------------------------------------------------------------------
// The prisoner's dilemma: the scene.
//
// Chapter 1 is the table of points. Chapter 2 is the reader playing 200
// rounds' worth against tit for tat, a move at a time. Chapter 3 is a
// round-robin tournament of seven strategies; chapter 4 lets a population
// of them breed by their scores.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, box, TOKENS } from '../shared/draw.js';
import { PAY, STRATEGIES, tournament, table, evolve } from './art.js';

const KEYS = Object.keys(STRATEGIES);
const COLOURS = ['hiw-ink-1', 'hiw-ink-3', 'hiw-ink-4', 'success', 'danger', 'warning', 'hiw-ink-2'];
const st = { you: 'C', them: 'C', mine: [], theirs: [], scores: [0, 0], results: null, history: null, gen: 0, readout: null };

function drawTable(ctx, w, h, col, bg) {
  const cell = Math.min(130, (w - 120) / 2), x0 = (w - cell * 2) / 2 + 30, y0 = 110;
  label(ctx, 'They cooperate', x0 + cell / 2, y0 - 16, col['label-secondary'], bg, { size: 12, align: 'center' });
  label(ctx, 'They defect', x0 + cell * 1.5, y0 - 16, col['label-secondary'], bg, { size: 12, align: 'center' });
  label(ctx, 'You cooperate', x0 - 10, y0 + cell / 2, col['label-secondary'], bg, { size: 12, align: 'right' });
  label(ctx, 'You defect', x0 - 10, y0 + cell * 1.5, col['label-secondary'], bg, { size: 12, align: 'right' });
  ['C', 'D'].forEach((y, i) => ['C', 'D'].forEach((t, j) => {
    const on = st.you === y && st.them === t;
    box(ctx, x0 + j * cell + 2, y0 + i * cell + 2, cell - 4, cell - 4, 8);
    ctx.fillStyle = on ? alpha(col.accent, 0.25) : col['bg-elevated'];
    ctx.fill();
    const [a, b] = PAY[y + t];
    label(ctx, `You ${a}`, x0 + j * cell + cell / 2, y0 + i * cell + cell * 0.4, col.label, null, { size: 15, weight: 800, align: 'center' });
    label(ctx, `They ${b}`, x0 + j * cell + cell / 2, y0 + i * cell + cell * 0.62, col['label-secondary'], null, { size: 13, align: 'center' });
  }));
}

function drawGame(ctx, w, h, col, bg) {
  const n = st.mine.length, show = Math.min(n, 24), cell = Math.min(24, (w - 100) / 24);
  const x0 = 90;
  for (const [row, moves, name] of [[0, st.mine, 'You'], [1, st.theirs, 'Tit for tat']]) {
    const y = 110 + row * (cell + 18);
    label(ctx, name, x0 - 10, y + cell / 2, col['label-secondary'], bg, { size: 12, align: 'right' });
    moves.slice(-show).forEach((m, i) => {
      box(ctx, x0 + i * cell + 1, y, cell - 2, cell, 4);
      ctx.fillStyle = m === 'C' ? col.success : col.danger;
      ctx.fill();
      label(ctx, m, x0 + i * cell + cell / 2, y + cell / 2, col['stock-ink'], null, { size: 11, weight: 800, align: 'center' });
    });
  }
  label(ctx, 'C cooperates, D defects; the last 24 rounds', x0, 110 + 2 * (cell + 18) + 10, col['label-tertiary'], bg, { size: 11 });
}

function drawTournament(ctx, w, h, col, bg) {
  const res = st.results, order = [...KEYS].sort((a, b) => res[b] - res[a]);
  const x0 = 140, x1 = w - 60, rowH = Math.min(40, (h - 120) / order.length);
  order.forEach((k, i) => {
    const y = 90 + i * rowH, v = res[k];
    label(ctx, STRATEGIES[k].name, x0 - 10, y + rowH / 2, col.label, bg, { size: 12, align: 'right' });
    box(ctx, x0, y + 4, ((v - 0) / 3) * (x1 - x0), rowH - 8, 4);
    ctx.fillStyle = col[COLOURS[KEYS.indexOf(k)]];
    ctx.fill();
    label(ctx, fmt(v, 2), x0 + (v / 3) * (x1 - x0) + 6, y + rowH / 2, col['label-secondary'], bg, { size: 11 });
  });
  label(ctx, 'Average points a round', x1, h - 20, col['label-tertiary'], bg, { size: 11, align: 'right' });
}

function drawEvolution(ctx, w, h, col, bg) {
  const x0 = 40, x1 = w - 130, y0 = 80, y1 = h - 40, gens = st.history.length;
  const X = (g) => x0 + (g / 60) * (x1 - x0), Y = (v) => y1 - (v / 0.4) * (y1 - y0);
  ctx.strokeStyle = col.separator;
  for (const v of [0, 0.1, 0.2, 0.3, 0.4]) {
    ctx.beginPath();
    ctx.moveTo(x0, Y(v));
    ctx.lineTo(x1, Y(v));
    ctx.stroke();
    label(ctx, `${v * 100}%`, x0 - 6, Y(v), col['label-tertiary'], bg, { size: 11, align: 'right' });
  }
  KEYS.forEach((k, i) => {
    ctx.strokeStyle = col[COLOURS[i]];
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    st.history.forEach((s, g) => (g ? ctx.lineTo : ctx.moveTo).call(ctx, X(g), Y(s[k])));
    ctx.stroke();
    const last = st.history[gens - 1][k];
    label(ctx, STRATEGIES[k].name, x1 + 6, Y(last) + (i - 3) * 2, col[COLOURS[i]], bg, { size: 11 });
  });
  label(ctx, 'Generations', x1, y1 + 16, col['label-tertiary'], bg, { size: 11, align: 'right' });
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  let moving = false;
  if (ch === 'dilemma') drawTable(ctx, w, h, col, bg);
  else if (ch === 'repeated') {
    drawGame(ctx, w, h, col, bg);
    r?.set('you', fmt(st.scores[0]));
    r?.set('them', fmt(st.scores[1]));
    r?.set('rounds', fmt(st.mine.length));
  } else if (ch === 'tournament') drawTournament(ctx, w, h, col, bg);
  else if (ch === 'evolution') {
    if (api.playing && api.motion && st.history.length < 61) {
      st.acc = (st.acc || 0) + dt * 8;
      while (st.acc >= 1 && st.history.length < 61) {
        st.history.push(evolve(st.history[st.history.length - 1], st.table));
        st.acc -= 1;
      }
      moving = true;
    }
    drawEvolution(ctx, w, h, col, bg);
    r?.set('gen', fmt(st.history.length - 1));
  }
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ dilemma: 'Points for one round', repeated: 'You against tit for tat', tournament: 'Everyone plays everyone, 200 rounds a match', evolution: 'Each generation breeds by its score' }[id]);
  if (id === 'dilemma') {
    ui.choice({ label: 'You', options: [{ id: 'C', label: 'Cooperate' }, { id: 'D', label: 'Defect' }], value: st.you, onChange(v) { st.you = v; api.invalidate(); } });
    ui.choice({ label: 'They', options: [{ id: 'C', label: 'Cooperate' }, { id: 'D', label: 'Defect' }], value: st.them, onChange(v) { st.them = v; api.invalidate(); } });
  } else if (id === 'repeated') {
    const move = (m) => {
      const t = STRATEGIES.titForTat.play(st.theirs, st.mine);
      const [a, b] = PAY[m + t];
      st.mine.push(m);
      st.theirs.push(t);
      st.scores = [st.scores[0] + a, st.scores[1] + b];
      api.invalidate();
    };
    ui.button({ label: 'Cooperate', onClick: () => move('C') });
    ui.button({ label: 'Defect', onClick: () => move('D') });
    ui.button({ label: 'Start again', onClick() { st.mine = []; st.theirs = []; st.scores = [0, 0]; api.invalidate(); } });
    st.readout = api.readout([{ key: 'you', label: 'Your points' }, { key: 'them', label: 'Theirs' }, { key: 'rounds', label: 'Rounds' }]);
  } else if (id === 'tournament') {
    st.results = tournament(KEYS);
    ui.button({ label: 'Play it again', onClick() { st.results = tournament(KEYS); api.invalidate(); } });
  } else if (id === 'evolution') {
    st.table = table(KEYS);
    const start = () => {
      st.history = [Object.fromEntries(KEYS.map((k) => [k, 1 / KEYS.length]))];
      st.acc = 0;
      api.invalidate();
    };
    start();
    ui.button({ label: 'Start again', onClick: start });
    st.readout = api.readout([{ key: 'gen', label: 'Generations' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
