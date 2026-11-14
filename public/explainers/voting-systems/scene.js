// ---------------------------------------------------------------------------
// How voting systems differ: the scene.
//
// The same 1,500 voters, the same candidates, counted four ways. Voters are
// dots on a map of opinion, coloured by their first choice; candidates can
// be dragged. Every tally is counted afresh from the ballots on every move.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, clamp, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { electorate, ballots, plurality, runoff, pairwise, approval } from './votes.js';

const VOTERS = electorate();
const NAMES = ['A', 'B', 'C', 'D'];
const INKS = ['hiw-ink-1', 'hiw-ink-2', 'accent', 'hiw-ink-4'];

const st = {
  cands: [{ x: 0.3, y: 0.45 }, { x: 0.68, y: 0.55 }, { x: 0.45, y: 0.3 }, { x: 0.5, y: 0.8 }],
  count: 3,
  method: 'plurality',
  readout: null,
};
const SETUPS = {
  plurality: [{ x: 0.3, y: 0.45 }, { x: 0.7, y: 0.55 }, { x: 0.5, y: 0.25 }],
  spoiler: [{ x: 0.36, y: 0.46 }, { x: 0.67, y: 0.55 }, { x: 0.28, y: 0.42 }],
  ranked: [{ x: 0.36, y: 0.46 }, { x: 0.67, y: 0.55 }, { x: 0.28, y: 0.42 }],
  condorcet: [{ x: 0.36, y: 0.46 }, { x: 0.67, y: 0.55 }, { x: 0.5, y: 0.5 }],
  arrow: [{ x: 0.3, y: 0.45 }, { x: 0.68, y: 0.55 }, { x: 0.5, y: 0.52 }, { x: 0.45, y: 0.2 }],
};

function count() {
  const cands = st.cands.slice(0, st.count);
  const b = ballots(VOTERS, cands);
  return { b, cands, plu: plurality(b, cands.length), irv: runoff(b, cands.length), pair: pairwise(b, cands.length), app: approval(VOTERS, cands) };
}

function area(w, h) {
  const s = Math.min(w * 0.62, h * 0.86);
  return { s, x0: 16, y0: (h - s) / 2 };
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const A = area(w, h);
  const res = count();
  const ink = (i) => col[INKS[i]];

  // The voters, coloured by first choice.
  ctx.strokeStyle = col.separator;
  ctx.strokeRect(A.x0, A.y0, A.s, A.s);
  VOTERS.forEach(([x, y], i) => {
    ctx.fillStyle = alpha(ink(res.b[i][0]), 0.55);
    ctx.fillRect(A.x0 + x * A.s - 1.2, A.y0 + y * A.s - 1.2, 2.4, 2.4);
  });
  label(ctx, '← left', A.x0 + 4, A.y0 + A.s + 12, col['label-tertiary'], bg, { size: 11, weight: 500 });
  label(ctx, 'right →', A.x0 + A.s - 4, A.y0 + A.s + 12, col['label-tertiary'], bg, { size: 11, weight: 500, align: 'right' });

  // The candidates.
  res.cands.forEach((c, i) => {
    const x = A.x0 + c.x * A.s, y = A.y0 + c.y * A.s;
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, TAU);
    ctx.fillStyle = ink(i);
    ctx.fill();
    ctx.strokeStyle = col['hiw-scene-bg'];
    ctx.lineWidth = 3;
    ctx.stroke();
    label(ctx, NAMES[i], x, y, col['hiw-scene-bg'], null, { size: 13, weight: 700, align: 'center' });
    if (api.handles?.focused && api.handles.selected === `c${i}`) {
      ctx.strokeStyle = col['focus-ring'];
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, TAU);
      ctx.stroke();
    }
  });

  // The count, to the right (or below, when narrow).
  const px = A.x0 + A.s + 24, wide = w - px > 150;
  const tx = wide ? px : 16, ty = wide ? A.y0 + 10 : A.y0 + A.s + 30;
  const total = VOTERS.length;
  const bars = (tally, title, winner, y0) => {
    label(ctx, title, tx, y0, col.label, bg, { size: 13 });
    tally.forEach((v, i) => {
      const y = y0 + 20 + i * 20;
      const bw = (wide ? w - tx - 70 : w - 100) * (v / total);
      ctx.fillStyle = ink(i);
      ctx.fillRect(tx + 18, y - 6, Math.max(1, bw), 12);
      label(ctx, NAMES[i], tx, y, ink(i), bg, { size: 12, weight: 700 });
      label(ctx, `${fmt((v / total) * 100)}%${i === winner ? ' ✓' : ''}`, tx + 24 + bw, y, i === winner ? col.label : col['label-secondary'], bg, { size: 11 });
    });
    return y0 + 20 + tally.length * 20 + 10;
  };
  if (ch === 'plurality' || ch === 'spoiler') bars(res.plu.tally, 'First choices', res.plu.winner, ty);
  if (ch === 'ranked') {
    let y = ty;
    res.irv.rounds.slice(0, 3).forEach((r, k) => {
      y = bars(r.tally, `Round ${k + 1}`, k === res.irv.rounds.length - 1 ? res.irv.winner : -1, y);
    });
  }
  if (ch === 'condorcet') {
    label(ctx, 'Head to head', tx, ty, col.label, bg, { size: 13 });
    let y = ty + 22;
    for (let i = 0; i < res.cands.length; i++) for (let j = i + 1; j < res.cands.length; j++) {
      const a = res.pair.wins[i][j], b = res.pair.wins[j][i];
      label(ctx, `${NAMES[i]} ${fmt((a / total) * 100)}% v ${NAMES[j]} ${fmt((b / total) * 100)}%`, tx, y, a > b ? ink(i) : ink(j), bg, { size: 12 });
      y += 20;
    }
  }
  if (ch === 'arrow') {
    label(ctx, 'Who wins, by each rule', tx, ty, col.label, bg, { size: 13 });
    [['Most first choices', res.plu.winner], ['Ranked choice', res.irv.winner], ['Head to head', res.pair.winner], ['Approval', res.app.winner]].forEach(([name, win], k) => {
      const y = ty + 24 + k * 22;
      label(ctx, name, tx, y, col['label-secondary'], bg, { size: 12 });
      label(ctx, win >= 0 ? NAMES[win] : 'no one', tx + 150, y, win >= 0 ? ink(win) : col['label-tertiary'], bg, { size: 13, weight: 700 });
    });
  }

  const r = st.readout;
  if (r) {
    r.set('plu', NAMES[res.plu.winner]);
    r.set('irv', NAMES[res.irv.winner]);
    r.set('cw', res.pair.winner >= 0 ? NAMES[res.pair.winner] : 'None: a cycle');
    r.set('app', NAMES[res.app.winner]);
    r.set('share', `${fmt((res.plu.tally[res.plu.winner] / total) * 100)}%`);
  }
  const spoiled = res.pair.winner >= 0 && res.plu.winner !== res.pair.winner;
  if (ch === 'spoiler') api.status(spoiled ? `${NAMES[res.plu.winner]} wins, though ${NAMES[res.pair.winner]} would beat every rival one to one.` : 'No spoiler effect with the candidates where they are.');
  return false;
}

const handles = {
  list(api) {
    const A = area(api.scene.w, api.scene.h);
    return st.cands.slice(0, st.count).map((c, i) => ({ id: `c${i}`, x: A.x0 + c.x * A.s, y: A.y0 + c.y * A.s, r: 18, label: `Candidate ${NAMES[i]}` }));
  },
  drag(id, x, y, api) {
    const A = area(api.scene.w, api.scene.h);
    const c = st.cands[Number(id.slice(1))];
    c.x = clamp((x - A.x0) / A.s, 0.02, 0.98);
    c.y = clamp((y - A.y0) / A.s, 0.02, 0.98);
    api.invalidate();
  },
  nudge(id, dx, dy, api) {
    const c = st.cands[Number(id.slice(1))];
    c.x = clamp(c.x + dx * 0.01, 0.02, 0.98);
    c.y = clamp(c.y + dy * 0.01, 0.02, 0.98);
    api.invalidate();
  },
};

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  const setup = SETUPS[id];
  st.count = setup.length;
  setup.forEach((c, i) => Object.assign(st.cands[i], c));
  api.note('Drag the candidates, or focus the map and use N and the arrows');
  if (id === 'arrow' || id === 'plurality') {
    ui.choice({ label: 'Candidates', options: [2, 3, 4].map((n) => ({ id: String(n), label: String(n) })), value: String(st.count), onChange: (n) => { st.count = Number(n); api.invalidate(); } });
  }
  ui.button({ label: 'Put them back', onClick: () => { SETUPS[id].forEach((c, i) => Object.assign(st.cands[i], c)); api.invalidate(); } });
  const rows = {
    plurality: [{ key: 'plu', label: 'Winner' }, { key: 'share', label: 'With' }],
    spoiler: [{ key: 'plu', label: 'Most first choices' }, { key: 'cw', label: 'Beats everyone one to one' }],
    ranked: [{ key: 'plu', label: 'Most first choices' }, { key: 'irv', label: 'Ranked choice' }],
    condorcet: [{ key: 'cw', label: 'Beats everyone one to one' }, { key: 'plu', label: 'Most first choices' }],
    arrow: [{ key: 'plu', label: 'Most first choices' }, { key: 'irv', label: 'Ranked choice' }, { key: 'cw', label: 'Head to head' }, { key: 'app', label: 'Approval' }],
  }[id];
  st.readout = api.readout(rows);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw, handles });
