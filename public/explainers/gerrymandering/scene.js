// ---------------------------------------------------------------------------
// Drawing the lines: the scene.
//
// The map and the plans are art.js. The grid of voters is drawn as dots in
// each party's colour (purple is --hiw-ink-4, gold --hiw-signal), with the
// district boundaries drawn wherever two neighbours are in different
// districts, and each district washed in its winner's colour. Beside it,
// the seats, and in chapter 4 the wasted votes.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { ROWS, COLS, PLANS, party, tally } from './art.js';

const st = { plan: 'rows', readout: null };

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  const P = col['hiw-ink-4'], G = col['hiw-signal'];
  const wide = w > 600;
  const cell = Math.min((wide ? w * 0.6 : w - 40) / COLS, (wide ? h - 110 : h * 0.5) / ROWS);
  const x0 = 20, y0 = 70;
  const show = ch !== 'map';
  const of = PLANS[st.plan].of;
  const t = tally(st.plan);
  if (show) {
    for (let rr = 0; rr < ROWS; rr++) for (let c = 0; c < COLS; c++) {
      const d = t.districts[of(rr, c)];
      const win = d.P > d.G ? P : d.G > d.P ? G : col['label-tertiary'];
      ctx.fillStyle = alpha(win, 0.18);
      ctx.fillRect(x0 + c * cell, y0 + rr * cell, cell, cell);
    }
  }
  for (let rr = 0; rr < ROWS; rr++) for (let c = 0; c < COLS; c++) {
    ctx.beginPath();
    ctx.arc(x0 + (c + 0.5) * cell, y0 + (rr + 0.5) * cell, cell * 0.28, 0, TAU);
    ctx.fillStyle = party(rr, c) === 'P' ? P : G;
    ctx.fill();
  }
  ctx.strokeStyle = show ? col.label : col.separator;
  ctx.lineWidth = show ? 3 : 1;
  ctx.lineCap = 'round';
  for (let rr = 0; rr < ROWS; rr++) for (let c = 0; c < COLS; c++) {
    const here = show ? of(rr, c) : -1;
    if (c + 1 < COLS && (!show || of(rr, c + 1) !== here)) {
      ctx.beginPath();
      ctx.moveTo(x0 + (c + 1) * cell, y0 + rr * cell);
      ctx.lineTo(x0 + (c + 1) * cell, y0 + (rr + 1) * cell);
      ctx.stroke();
    }
    if (rr + 1 < ROWS && (!show || of(rr + 1, c) !== here)) {
      ctx.beginPath();
      ctx.moveTo(x0 + c * cell, y0 + (rr + 1) * cell);
      ctx.lineTo(x0 + (c + 1) * cell, y0 + (rr + 1) * cell);
      ctx.stroke();
    }
  }
  ctx.strokeRect(x0, y0, COLS * cell, ROWS * cell);
  // The results, beside the map or under it.
  const rx = wide ? x0 + COLS * cell + 30 : x0, ry = wide ? y0 : y0 + ROWS * cell + 30;
  if (!show) {
    label(ctx, '30 purple voters (60%)', rx, ry + 10, P, bg, { size: 14, weight: 700 });
    label(ctx, '20 gold voters (40%)', rx, ry + 34, G, bg, { size: 14, weight: 700 });
    label(ctx, 'Five districts of ten', rx, ry + 64, col['label-secondary'], bg, { size: 12 });
    r?.set('votes', '30 to 20');
  } else {
    const roomy = ry + 88 + 5 * 20 + 60 < h;
    if (roomy) {
      label(ctx, PLANS[st.plan].name, rx, ry + 8, col.label, bg, { size: 14, weight: 700 });
      label(ctx, `Purple ${t.seats.P} seats`, rx, ry + 34, P, bg, { size: 14, weight: 700 });
      label(ctx, `Gold ${t.seats.G} seats`, rx, ry + 56, G, bg, { size: 14, weight: 700 });
    } else {
      label(ctx, `Purple ${t.seats.P} seats`, rx, ry + 4, P, bg, { size: 14, weight: 700 });
      label(ctx, `Gold ${t.seats.G} seats`, rx + 130, ry + 4, G, bg, { size: 14, weight: 700 });
    }
    // A phone has no room for the list of districts; the map shows them.
    if (roomy) t.districts.forEach((d, i) => label(ctx, `District ${i + 1}: ${d.P} to ${d.G}`, rx, ry + 88 + i * 20, col['label-secondary'], bg, { size: 12 }));
    if (ch === 'measure') {
      const y = roomy ? ry + 88 + 5 * 20 + 16 : ry + 30;
      label(ctx, `Wasted: purple ${t.waste.P}, gold ${t.waste.G}`, rx, y, col.label, bg, { size: 12, weight: 700 });
      label(ctx, `Gap ${fmt(Math.abs(t.gap) * 100)}% against ${t.gap > 0 ? 'purple' : t.gap < 0 ? 'gold' : 'neither'}`, rx, y + 22, col.accent, bg, { size: 13, weight: 700 });
    }
    r?.set('seats', `Purple ${t.seats.P}, gold ${t.seats.G}`);
    if (ch === 'measure') r?.set('gap', `${fmt(Math.abs(t.gap) * 100)}%`);
  }
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.readout = null;
  api.note({ map: 'Purple voters on the left, gold on the right', lines: 'Two neat ways to draw five districts', packing: 'Lines drawn to help gold', measure: 'Wasted votes in each plan' }[id]);
  if (id === 'map') {
    st.readout = api.readout([{ key: 'votes', label: 'Votes' }]);
  } else {
    st.plan = id === 'packing' ? 'rigged' : 'rows';
    const opts = id === 'lines' ? ['rows', 'columns'] : ['rows', 'columns', 'rigged'];
    ui.choice({ label: 'Plan', options: opts.map((k) => ({ id: k, label: PLANS[k].name })), value: st.plan, onChange(v) { st.plan = v; api.invalidate(); } });
    st.readout = api.readout(id === 'measure' ? [{ key: 'seats', label: 'Seats' }, { key: 'gap', label: 'Efficiency gap' }] : [{ key: 'seats', label: 'Seats' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
