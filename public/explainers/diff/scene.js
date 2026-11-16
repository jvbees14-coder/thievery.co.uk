// ---------------------------------------------------------------------------
// How diff finds what changed: the scene.
//
// Two versions of a short recipe. Chapter 1 compares them line by line in
// place, which falls apart after one inserted line. Chapter 2 keeps the
// longest common subsequence (worked out by the usual table, filled from
// the bottom right) and marks the rest as removed or added. Chapter 3 draws
// the edit graph: old lines down, new lines across, a free diagonal where
// two lines match, and the cheapest path traced back through the table.
// Chapter 4 runs the same thing on the words of two lines the reader types.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, box, TOKENS } from '../shared/draw.js';

const OLD = ['Heat the oven to 200°C.', 'Rub the chicken with oil.', 'Season with salt.', 'Roast for an hour.', 'Rest for ten minutes.', 'Carve and serve.'];
const NEW = ['Heat the oven to 200°C.', 'Put a lemon inside the chicken.', 'Rub the chicken with oil.', 'Season with salt.', 'Roast for 50 minutes.', 'Rest for ten minutes.', 'Carve and serve.'];
const st = { a: 'Meet me at the station at six on Friday', b: 'Meet me outside the station at half six on Saturday', step: 99, readout: null };

/** The table of common-subsequence lengths, and the edit script read from it. */
export function diff(a, b) {
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { ops.push({ op: '=', text: a[i], i, j }); i++; j++; }
    else if (i < n && (j === m || L[i + 1][j] >= L[i][j + 1])) { ops.push({ op: '-', text: a[i], i, j }); i++; }
    else { ops.push({ op: '+', text: b[j], i, j }); j++; }
  }
  return { ops, same: L[0][0] };
}

function lineRow(ctx, x, y, wd, text, kind, col) {
  const tone = kind === '-' ? col.danger : kind === '+' ? col.success : kind === '~' ? col.warning : null;
  box(ctx, x, y, wd, 24, 4);
  ctx.fillStyle = tone ? alpha(tone, 0.16) : alpha(col['label-tertiary'], 0.06);
  ctx.fill();
  if (kind && kind !== '=') label(ctx, kind === '~' ? '≠' : kind === '-' ? '−' : '+', x + 10, y + 12, tone, null, { size: 13, weight: 700, align: 'center', mono: true });
  label(ctx, text, x + 24, y + 12, col.label, null, { size: Math.min(13, wd / 26) });
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  if (ch === 'lines') {
    const half = (w - 50) / 2;
    label(ctx, 'Old', 20, 62, col['label-secondary'], bg, { size: 12, weight: 700 });
    label(ctx, 'New', 30 + half, 62, col['label-secondary'], bg, { size: 12, weight: 700 });
    let changed = 0;
    const rows = Math.max(OLD.length, NEW.length);
    for (let k = 0; k < rows; k++) {
      const same = OLD[k] === NEW[k];
      if (!same) changed++;
      if (OLD[k]) lineRow(ctx, 20, 76 + k * 32, half, OLD[k], same ? '=' : '~', col);
      if (NEW[k]) lineRow(ctx, 30 + half, 76 + k * 32, half, NEW[k], same ? '=' : '~', col);
    }
    label(ctx, 'Compared line 1 with line 1, line 2 with line 2, and so on', 20, 76 + rows * 32 + 16, col['label-tertiary'], bg, { size: 11 });
    r?.set('marked', `${changed} of ${rows} lines`);
  } else if (ch === 'common') {
    const { ops, same } = diff(OLD, NEW);
    const wd = Math.min(w - 40, 520);
    ops.forEach((o, k) => lineRow(ctx, 20, 60 + k * 30, wd, o.text, o.op, col));
    r?.set('kept', `${same} lines`);
    r?.set('edits', `${ops.filter((o) => o.op !== '=').length}`);
  } else if (ch === 'grid') {
    const { ops } = diff(OLD, NEW);
    const n = OLD.length, m = NEW.length;
    const cell = Math.min((w - 160) / m, (h - 140) / n);
    const x0 = 140, y0 = 120;
    // Matches: free diagonals.
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      if (OLD[i] === NEW[j]) {
        ctx.strokeStyle = alpha(col.success, 0.7);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x0 + j * cell, y0 + i * cell);
        ctx.lineTo(x0 + (j + 1) * cell, y0 + (i + 1) * cell);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = col.separator;
    ctx.lineWidth = 1;
    for (let i = 0; i <= n; i++) { ctx.beginPath(); ctx.moveTo(x0, y0 + i * cell); ctx.lineTo(x0 + m * cell, y0 + i * cell); ctx.stroke(); }
    for (let j = 0; j <= m; j++) { ctx.beginPath(); ctx.moveTo(x0 + j * cell, y0); ctx.lineTo(x0 + j * cell, y0 + n * cell); ctx.stroke(); }
    OLD.forEach((t, i) => label(ctx, t.length > 18 ? `${t.slice(0, 17)}…` : t, x0 - 8, y0 + (i + 0.5) * cell, col['label-secondary'], bg, { size: 10, align: 'right' }));
    NEW.forEach((t, j) => {
      ctx.save();
      ctx.translate(x0 + (j + 0.5) * cell, y0 - 6);
      ctx.rotate(-0.6);
      label(ctx, t.length > 14 ? `${t.slice(0, 13)}…` : t, 0, 0, col['label-secondary'], bg, { size: 10 });
      ctx.restore();
    });
    // The path, step by step.
    let x = x0, y = y0;
    ctx.strokeStyle = col.accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const k = Math.min(st.step, ops.length);
    for (let s = 0; s < k; s++) {
      const o = ops[s];
      if (o.op === '=') { x += cell; y += cell; } else if (o.op === '+') x += cell; else y += cell;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, TAU);
    ctx.fillStyle = col.accent;
    ctx.fill();
    const cost = ops.slice(0, k).filter((o) => o.op !== '=').length;
    r?.set('cost', `${cost}`);
    r?.set('steps', `${k} of ${ops.length}`);
  } else if (ch === 'words') {
    const a = st.a.split(/ +/).filter(Boolean), b = st.b.split(/ +/).filter(Boolean);
    const { ops, same } = diff(a, b);
    let x = 20, y = 80;
    const size = 16;
    ctx.font = `600 ${size}px system-ui`;
    for (const o of ops) {
      const t = o.text;
      const tw = ctx.measureText(`${t} `).width + 6;
      if (x + tw > w - 20) { x = 20; y += 34; }
      const tone = o.op === '-' ? col.danger : o.op === '+' ? col.success : null;
      if (tone) {
        box(ctx, x - 3, y - 13, tw - 2, 26, 4);
        ctx.fillStyle = alpha(tone, 0.18);
        ctx.fill();
      }
      label(ctx, t, x, y, tone || col.label, null, { size, weight: 600 });
      if (o.op === '-') {
        ctx.strokeStyle = col.danger;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + tw - 8, y);
        ctx.stroke();
      }
      x += tw;
    }
    r?.set('kept', `${same} words`);
    r?.set('edits', `${ops.filter((o) => o.op !== '=').length}`);
  }
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.readout = null;
  api.note({ lines: 'Two versions of a recipe', common: 'Keeping the longest run of lines in order', grid: 'The edit graph: across is added, down is removed, diagonal is kept', words: 'The same thing, word by word' }[id]);
  if (id === 'lines') st.readout = api.readout([{ key: 'marked', label: 'Marked as different' }]);
  else if (id === 'common') st.readout = api.readout([{ key: 'kept', label: 'Kept' }, { key: 'edits', label: 'Lines removed or added' }]);
  else if (id === 'grid') {
    st.step = diff(OLD, NEW).ops.length;
    ui.slider({ label: 'Step along the path', min: 0, max: st.step, value: st.step, onInput(v) { st.step = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'cost', label: 'Edits so far' }, { key: 'steps', label: 'Step' }]);
  } else if (id === 'words') {
    ui.text({ label: 'Old', value: st.a, maxLength: 120, onInput(v) { st.a = v; api.invalidate(); } });
    ui.text({ label: 'New', value: st.b, maxLength: 120, onInput(v) { st.b = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'kept', label: 'Kept' }, { key: 'edits', label: 'Words removed or added' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
