// ---------------------------------------------------------------------------
// Why 0.1 + 0.2 isn't 0.3: the scene.
//
// Chapter 1 writes a decimal fraction in binary, where 0.1 never ends.
// Chapter 2 shows the values a computer really stores (JavaScript's own
// doubles). Chapter 3 is a toy floating-point format with three bits after
// the point, to show that representable numbers thin out as they grow,
// the gap doubling at every power of two. Chapter 4 is the Patriot clock:
// tenths of a second added up in 24-bit fixed point.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, box, TOKENS } from '../shared/draw.js';

const st = { value: 0.1, x: 1000, hours: 100, readout: null };

/** The first n binary digits after the point, worked out exactly from the decimal. */
function binaryDigits(dec, n = 48) {
  // Work in whole numbers: dec as a fraction p / 10^k.
  const k = (String(dec).split('.')[1] || '').length;
  let p = BigInt(Math.round(dec * 10 ** k)), q = 10n ** BigInt(k);
  const out = [];
  for (let i = 0; i < n; i++) {
    p *= 2n;
    out.push(p >= q ? 1 : 0);
    if (p >= q) p -= q;
  }
  return out;
}

function drawBinary(ctx, w, h, col, bg) {
  const bits = binaryDigits(st.value), per = 24, cell = Math.min(24, (w - 50) / per);
  label(ctx, `${st.value} in binary is 0.`, 20, 80, col.label, bg, { size: 14, weight: 700 });
  bits.forEach((b, i) => {
    const x = 20 + (i % per) * cell, y = 100 + Math.floor(i / per) * (cell + 8);
    box(ctx, x + 1, y, cell - 2, cell, 3);
    ctx.fillStyle = i >= 52 ? alpha(col.danger, 0.3) : b ? col['hiw-ink-1'] : col['bg-elevated'];
    ctx.fill();
    label(ctx, String(b), x + cell / 2, y + cell / 2, b ? col['stock-ink'] : col['label-secondary'], null, { size: Math.max(10, cell * 0.5), weight: 700, align: 'center', mono: true });
  });
  const ends = bits.lastIndexOf(1) < 40;
  label(ctx, ends ? 'It ends: stored exactly.' : 'It never ends: the computer keeps 52 bits and rounds.', 20, 100 + 2 * (cell + 8) + 16, ends ? col.success : col.danger, bg, { size: 12, weight: 700 });
}

function drawStored(ctx, w, h, col, bg) {
  const rows = [['0.1', 0.1], ['0.2', 0.2], ['0.1 + 0.2', 0.1 + 0.2], ['0.3', 0.3]];
  rows.forEach(([name, v], i) => {
    const y = 100 + i * 60;
    label(ctx, name, 20, y, col['label-secondary'], bg, { size: 12 });
    label(ctx, v.toPrecision(21), 20, y + 22, i === 2 ? col.danger : col.label, bg, { size: 15, weight: 700, mono: true });
  });
  label(ctx, '0.1 + 0.2 == 0.3 is false', 20, 100 + 4 * 60 + 10, col.danger, bg, { size: 14, weight: 800, mono: true });
}

function drawGaps(ctx, w, h, col, bg) {
  // A toy format: 1.xxx × 2^e, three bits after the point, e from 0 to 3.
  const x0 = 20, x1 = w - 20, y = h * 0.45, X = (v) => x0 + (v / 16) * (x1 - x0);
  ctx.strokeStyle = col.separator;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  for (let e = 0; e <= 3; e++) {
    for (let m = 0; m < 8; m++) {
      const v = (1 + m / 8) * 2 ** e;
      ctx.strokeStyle = [col['hiw-ink-1'], col['hiw-ink-2'], col['hiw-ink-3'], col['hiw-ink-4']][e];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(X(v), y - 16);
      ctx.lineTo(X(v), y + 16);
      ctx.stroke();
    }
    label(ctx, `gap ${2 ** e / 8}`, X(1.5 * 2 ** e), y - 30 - (e % 2) * 16, [col['hiw-ink-1'], col['hiw-ink-2'], col['hiw-ink-3'], col['hiw-ink-4']][e], bg, { size: 11, align: 'center' });
  }
  for (const v of [0, 1, 2, 4, 8, 16]) label(ctx, String(v), X(v), y + 30, col['label-tertiary'], bg, { size: 11, align: 'center' });
  label(ctx, 'Every number a tiny format with 3 bits after the point can hold', w / 2, y + 60, col['label-secondary'], bg, { size: 11, align: 'center' });
}

function drawPatriot(ctx, w, h, col, bg) {
  const x0 = 60, x1 = w - 20, y0 = 80, y1 = h - 40;
  const tick = 0.1 - Math.floor(0.1 * 2 ** 23) / 2 ** 23;        // what 24 bits lose per tenth
  const err = (hrs) => tick * hrs * 36000;
  const X = (hrs) => x0 + (hrs / 120) * (x1 - x0), Y = (s) => y1 - (s / 0.45) * (y1 - y0);
  ctx.strokeStyle = col.separator;
  for (const s of [0, 0.1, 0.2, 0.3, 0.4]) {
    ctx.beginPath();
    ctx.moveTo(x0, Y(s));
    ctx.lineTo(x1, Y(s));
    ctx.stroke();
    label(ctx, `${s} s`, x0 - 6, Y(s), col['label-tertiary'], bg, { size: 11, align: 'right' });
  }
  for (const hrs of [0, 24, 48, 72, 96, 120]) label(ctx, `${hrs} h`, X(hrs), y1 + 14, col['label-tertiary'], bg, { size: 11, align: 'center' });
  label(ctx, 'How far the clock had drifted', x0, y0 - 16, col['label-tertiary'], bg, { size: 11 });
  ctx.strokeStyle = col.danger;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(X(0), Y(0));
  ctx.lineTo(X(120), Y(err(120)));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(X(st.hours), Y(err(st.hours)), 7, 0, Math.PI * 2);
  ctx.fillStyle = col.danger;
  ctx.fill();
  return err(st.hours);
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  if (ch === 'binary') {
    drawBinary(ctx, w, h, col, bg);
    r?.set('stored', st.value.toPrecision(21));
  } else if (ch === 'rounding') drawStored(ctx, w, h, col, bg);
  else if (ch === 'gaps') {
    drawGaps(ctx, w, h, col, bg);
    const gap = Number.EPSILON * 2 ** Math.floor(Math.log2(st.x));
    r?.set('gap', gap < 1e-3 ? gap.toExponential(2) : fmt(gap, gap < 1 ? 4 : 0));
  } else if (ch === 'errors') {
    const e = drawPatriot(ctx, w, h, col, bg);
    r?.set('err', `${fmt(e, 3)} s`);
    r?.set('miss', `${fmt(e * 1676, 0)} m`);
  }
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ binary: 'A decimal fraction, in binary', rounding: 'What the computer actually stores', gaps: 'A tiny made-up format, to show the pattern', errors: 'The Patriot’s clock: tenths of a second in 24 bits' }[id]);
  st.readout = null;
  if (id === 'binary') {
    ui.choice({ label: 'Number', options: ['0.5', '0.25', '0.75', '0.1', '0.2', '0.3'].map((v) => ({ id: v, label: v })), value: String(st.value), onChange(v) { st.value = Number(v); api.invalidate(); } });
    st.readout = api.readout([{ key: 'stored', label: 'Stored as' }]);
  } else if (id === 'gaps') {
    ui.slider({ label: 'A number', min: 0, max: 60, value: Math.round(Math.log10(st.x) * 4), format: (v) => fmt(Math.round(10 ** (v / 4))), onInput(v) { st.x = 10 ** (v / 4); api.invalidate(); } });
    st.readout = api.readout([{ key: 'gap', label: 'Gap to the next number a double can hold' }]);
  } else if (id === 'errors') {
    ui.slider({ label: 'Hours running', min: 0, max: 120, value: st.hours, onInput(v) { st.hours = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'err', label: 'Clock error' }, { key: 'miss', label: 'How far a Scud moves in that time' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
