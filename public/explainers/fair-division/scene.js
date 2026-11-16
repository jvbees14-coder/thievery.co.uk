// ---------------------------------------------------------------------------
// I cut, you choose: the scene.
//
// A cake as a strip from 0 to 1, chocolate on the left half and vanilla on
// the right. Each person values it by a density that adds to 1 over the
// whole cake: Ann likes chocolate three times as much as vanilla (1.5 and
// 0.5), Ben likes both the same (1 and 1), Cy likes vanilla three times as
// much (0.5 and 1.5). Values of pieces are integrals of those densities.
// Chapter 3 runs the moving knife for three; chapter 4 checks who envies
// whom in the result.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';

const PEOPLE = [
  { name: 'Ann', choc: 1.5, van: 0.5 },
  { name: 'Ben', choc: 1, van: 1 },
  { name: 'Cy', choc: 0.5, van: 1.5 },
];
const st = { cut: 0.5, knife: 0, readout: null, roles: 'ann' };

/** How much person p values the piece from a to b. */
function value(p, a, b) {
  const c = Math.max(0, Math.min(b, 0.5) - a);
  const v = Math.max(0, b - Math.max(a, 0.5));
  return p.choc * Math.max(0, c) + p.van * Math.max(0, v);
}
/** Where p would cut so the piece from a is worth `share` to them. */
function cutAt(p, a, share) {
  let lo = a, hi = 1;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (value(p, a, m) < share) lo = m; else hi = m;
  }
  return lo;
}

/** The moving knife for three: returns pieces [{ who, a, b }]. */
function knife() {
  let left = [0, 1, 2], a = 0;
  const pieces = [];
  while (left.length > 1) {
    // The knife moves right; the first to think the piece is worth a third shouts.
    let first = null, at = 1;
    for (const i of left) {
      const x = cutAt(PEOPLE[i], a, 1 / 3);
      if (x < at) { at = x; first = i; }
    }
    pieces.push({ who: first, a, b: at });
    left = left.filter((i) => i !== first);
    a = at;
    if (left.length === 1) pieces.push({ who: left[0], a, b: 1 });
  }
  return pieces;
}

function cake(ctx, x0, x1, y, ht, col, bg, cuts, owners) {
  const X = (u) => x0 + u * (x1 - x0);
  ctx.fillStyle = col.ornament;
  ctx.fillRect(X(0), y, X(0.5) - X(0), ht);
  ctx.fillStyle = col.stock;
  ctx.fillRect(X(0.5), y, X(1) - X(0.5), ht);
  ctx.strokeStyle = col['separator-strong'];
  ctx.strokeRect(X(0), y, X(1) - X(0), ht);
  label(ctx, 'Chocolate', X(0.25), y - 12, col['label-secondary'], bg, { size: 11, align: 'center' });
  label(ctx, 'Vanilla', X(0.75), y - 12, col['label-secondary'], bg, { size: 11, align: 'center' });
  for (const c of cuts) {
    ctx.strokeStyle = col.danger;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(X(c), y - 6);
    ctx.lineTo(X(c), y + ht + 6);
    ctx.stroke();
  }
  for (const o of owners || []) label(ctx, PEOPLE[o.who].name, X((o.a + o.b) / 2), y + ht + 18, col.label, bg, { size: 13, weight: 700, align: 'center' });
  return X;
}

function table(ctx, x, y, rows, col, bg) {
  rows.forEach((row, i) => row.forEach((cell, j) => {
    label(ctx, cell.text, x + j * 110, y + i * 22, cell.tone || (i === 0 || j === 0 ? col['label-secondary'] : col.label), bg, { size: 12, weight: i === 0 || j === 0 ? 600 : 700 });
  }));
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  const x0 = 30, x1 = w - 30, cy = 90, ht = Math.min(80, h * 0.18);
  if (ch === 'cut' || ch === 'choose') {
    const cutter = ch === 'cut' ? PEOPLE[0] : PEOPLE[1];
    const chooser = ch === 'cut' ? PEOPLE[1] : PEOPLE[0];
    const L = [0, st.cut], R = [st.cut, 1];
    const pickLeft = value(chooser, ...L) >= value(chooser, ...R);
    const mine = pickLeft ? R : L, theirs = pickLeft ? L : R;
    cake(ctx, x0, x1, cy, ht, col, bg, [st.cut], [{ who: PEOPLE.indexOf(chooser), a: theirs[0], b: theirs[1] }, { who: PEOPLE.indexOf(cutter), a: mine[0], b: mine[1] }]);
    const y = cy + ht + 60;
    label(ctx, `${cutter.name} cuts; ${chooser.name} chooses first`, x0, y - 10, col['label-secondary'], bg, { size: 12 });
    table(ctx, x0, y + 16, [
      [{ text: '' }, { text: 'Left piece' }, { text: 'Right piece' }],
      ...[cutter, chooser].map((p) => [{ text: `${p.name} thinks` }, { text: `${fmt(value(p, ...L) * 100)}%` }, { text: `${fmt(value(p, ...R) * 100)}%` }]),
    ], col, bg);
    r?.set('cutter', `${fmt(value(cutter, ...mine) * 100)}% of the cake`);
    r?.set('chooser', `${fmt(value(chooser, ...theirs) * 100)}% of the cake`);
  } else if (ch === 'three' || ch === 'envy') {
    const pieces = knife();
    const k = ch === 'three' ? st.knife : 1;
    const shown = pieces.filter((p) => p.b <= k + 1e-9 || p.b === 1 && k >= 1);
    const X = cake(ctx, x0, x1, cy, ht, col, bg, pieces.slice(0, -1).map((p) => p.b).filter((b) => b <= k + 1e-9), shown);
    if (ch === 'three' && k < 1) {
      ctx.strokeStyle = col.accent;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(X(k), cy - 20);
      ctx.lineTo(X(k), cy + ht + 20);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const y = cy + ht + 60;
    if (ch === 'envy' || k >= 1) {
      const rows = [[{ text: '' }, ...pieces.map((p) => ({ text: `${PEOPLE[p.who].name}’s piece` }))]];
      let envious = 0;
      for (const p of pieces) {
        const me = PEOPLE[p.who];
        const own = value(me, p.a, p.b);
        rows.push([{ text: `${me.name} thinks` }, ...pieces.map((q) => {
          const v = value(me, q.a, q.b);
          const envy = q !== p && v > own + 1e-9;
          if (envy) envious++;
          return { text: `${fmt(v * 100)}%`, tone: q === p ? col.success : envy ? col.danger : null };
        })]);
      }
      table(ctx, x0, y, rows, col, bg);
      r?.set('envy', ch === 'envy' ? `${envious} ${envious === 1 ? 'case' : 'cases'}` : '');
    }
    if (ch === 'three') r?.set('knife', `${fmt(k * 100)}% along`);
  }
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.readout = null;
  api.note({ cut: 'Ann loves chocolate; Ben likes both the same', choose: 'The same cake with the roles swapped', three: 'Ann, Ben and Cy, who loves vanilla', envy: 'Who would rather have someone else’s piece' }[id]);
  if (id === 'cut' || id === 'choose') {
    st.cut = 0.5;
    ui.slider({ label: `${id === 'cut' ? 'Ann' : 'Ben'} cuts at`, min: 5, max: 95, value: 50, format: (v) => `${v}% along`, onInput(v) { st.cut = v / 100; api.invalidate(); } });
    st.readout = api.readout([{ key: 'cutter', label: id === 'cut' ? 'Ann gets, by her measure' : 'Ben gets, by his measure' }, { key: 'chooser', label: id === 'cut' ? 'Ben gets, by his measure' : 'Ann gets, by her measure' }]);
  } else if (id === 'three') {
    st.knife = api.motion ? 0 : 1;
    ui.slider({ label: 'Move the knife', min: 0, max: 100, value: Math.round(st.knife * 100), format: (v) => `${v}%`, onInput(v) { st.knife = v / 100; api.invalidate(); } });
    st.readout = api.readout([{ key: 'knife', label: 'Knife' }]);
  } else if (id === 'envy') {
    st.readout = api.readout([{ key: 'envy', label: 'Envy' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
