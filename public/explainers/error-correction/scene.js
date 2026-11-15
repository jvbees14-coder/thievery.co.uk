// ---------------------------------------------------------------------------
// How errors fix themselves: the scene.
//
// Chapter 1 sends a row of bits through a noisy line. Chapter 2 adds one
// parity bit and lets the reader flip bits to fool it. Chapter 3 is
// Hamming's code drawn as three overlapping circles, with the failing
// circles lit and the guilty bit found. Chapter 4 is how often a message
// gets through, plain and coded.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, box, TOKENS } from '../shared/draw.js';
import { encode, syndrome, decode, covers, plainOk, hammingOk } from './art.js';

const st = { rate: 0.05, sent: [], got: [], flips: new Set(), n: 11, readout: null };

function noisy() {
  st.sent = Array.from({ length: 32 }, () => (Math.random() < 0.5 ? 1 : 0));
  st.got = st.sent.map((b) => (Math.random() < st.rate ? 1 - b : b));
}
noisy();

function bitRow(ctx, x0, y, w, bits, col, bad, title, bg) {
  const cell = Math.min(28, w / bits.length);
  label(ctx, title, x0, y - 14, col['label-tertiary'], bg, { size: 11 });
  bits.forEach((b, i) => {
    const x = x0 + i * cell;
    box(ctx, x + 1, y, cell - 2, cell, 3);
    ctx.fillStyle = bad?.(i) ? alpha(col.danger, 0.45) : b ? col['hiw-ink-1'] : col['bg-elevated'];
    ctx.fill();
    label(ctx, String(b), x + cell / 2, y + cell / 2, b ? col['stock-ink'] : col['label-secondary'], null, { size: Math.max(10, cell * 0.45), weight: 700, align: 'center', mono: true });
  });
  return cell;
}

function drawVenn(ctx, w, h, col, bg) {
  const sent = encode(st.n);
  const got = sent.slice();
  for (const f of st.flips) got[f] ^= 1;
  const { pos, failed } = syndrome(got);
  const cx = w / 2, cy = h * 0.45, R = Math.min(w, h) * 0.2, d = R * 0.62;
  const centres = { 1: [cx - d * 0.87, cy - d * 0.5], 2: [cx + d * 0.87, cy - d * 0.5], 4: [cx, cy + d] };
  const names = { 1: 'Check 1', 2: 'Check 2', 4: 'Check 4' };
  for (const c of [1, 2, 4]) {
    const [x, y] = centres[c];
    const bad = failed.includes(c);
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.fillStyle = alpha(bad ? col.danger : col['hiw-ink-1'], bad ? 0.22 : 0.08);
    ctx.fill();
    ctx.strokeStyle = bad ? col.danger : alpha(col['hiw-ink-1'], 0.6);
    ctx.lineWidth = 2;
    ctx.stroke();
    const away = [x - cx, y - cy], L = Math.hypot(...away);
    label(ctx, names[c], x + (away[0] / L) * R * 0.95, y + (away[1] / L) * R * 1.12, bad ? col.danger : col['label-secondary'], bg, { size: 11, weight: 700, align: 'center' });
  }
  // Each position sits in the region of exactly the circles that cover it.
  for (let p = 1; p <= 7; p++) {
    const inside = [1, 2, 4].filter((c) => covers(c, p));
    let x = 0, y = 0;
    for (const c of inside) {
      x += centres[c][0];
      y += centres[c][1];
    }
    x /= inside.length;
    y /= inside.length;
    if (inside.length === 1) {
      x += (x - cx) * 0.55;
      y += (y - cy) * 0.55;
    }
    const flipped = st.flips.has(p), found = pos === p;
    box(ctx, x - 16, y - 16, 32, 32, 6);
    ctx.fillStyle = got[p] ? col['hiw-ink-1'] : col['bg-elevated-2'];
    ctx.fill();
    if (found) {
      ctx.strokeStyle = col.accent;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    label(ctx, String(got[p]), x, y, got[p] ? col['stock-ink'] : col.label, null, { size: 15, weight: 800, align: 'center', mono: true });
    label(ctx, `${p}`, x + 18, y - 16, flipped ? col.danger : col['label-tertiary'], null, { size: 10, weight: 700 });
  }
  const fixed = got.slice();
  if (pos) fixed[pos] ^= 1;
  return { pos, failed, read: decode(fixed), sent: st.n };
}

function drawOdds(ctx, w, h, col, bg) {
  const x0 = 50, x1 = w - 20, y0 = 80, y1 = h - 40;
  const X = (p) => x0 + (p / 0.2) * (x1 - x0), Y = (v) => y1 - v * (y1 - y0);
  ctx.strokeStyle = col.separator;
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    ctx.beginPath();
    ctx.moveTo(x0, Y(v));
    ctx.lineTo(x1, Y(v));
    ctx.stroke();
    label(ctx, `${v * 100}%`, x0 - 6, Y(v), col['label-tertiary'], bg, { size: 11, align: 'right' });
  }
  for (const p of [0, 0.05, 0.1, 0.15, 0.2]) label(ctx, `${p * 100}%`, X(p), y1 + 14, col['label-tertiary'], bg, { size: 11, align: 'center' });
  label(ctx, 'Bits flipped by the noise', x1, y1 + 28, col['label-tertiary'], bg, { size: 11, align: 'right' });
  for (const [fn, c, name] of [[plainOk, col.danger, 'Sent plain'], [hammingOk, col.success, 'Sent as Hamming code']]) {
    ctx.strokeStyle = c;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let p = 0; p <= 0.2; p += 0.002) (p ? ctx.lineTo : ctx.moveTo).call(ctx, X(p), Y(fn(p)));
    ctx.stroke();
    label(ctx, name, X(0.2) - 4, Y(fn(0.2)) - 12, c, bg, { size: 11, align: 'right' });
  }
  ctx.beginPath();
  ctx.arc(X(st.rate), Y(hammingOk(st.rate)), 6, 0, TAU);
  ctx.fillStyle = col.success;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(X(st.rate), Y(plainOk(st.rate)), 6, 0, TAU);
  ctx.fillStyle = col.danger;
  ctx.fill();
  label(ctx, 'Messages of 4 bits that arrive right', x0, y0 - 16, col['label-tertiary'], bg, { size: 11 });
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  if (ch === 'noise') {
    const cell = bitRow(ctx, 16, 100, w - 32, st.sent, col, null, 'Sent', bg);
    bitRow(ctx, 16, 100 + cell + 40, w - 32, st.got, col, (i) => st.got[i] !== st.sent[i], 'Received', bg);
    r?.set('wrong', `${st.got.filter((b, i) => b !== st.sent[i]).length} of 32`);
  } else if (ch === 'parity') {
    const data = [1, 0, 1, 1, 0, 0, 1];
    const parity = data.reduce((a, b) => a ^ b, 0);
    const sent = [...data, parity];
    const got = sent.map((b, i) => (st.flips.has(i + 1) ? 1 - b : b));
    const cell = bitRow(ctx, 16, 100, w - 32, sent, col, (i) => i === 7 && false, 'Sent: seven bits and a parity bit, so the ones are even', bg);
    bitRow(ctx, 16, 100 + cell + 50, w - 32, got, col, (i) => st.flips.has(i + 1), 'Received', bg);
    const ones = got.reduce((a, b) => a + b, 0);
    r?.set('ones', `${ones}, ${ones % 2 ? 'odd' : 'even'}`);
    r?.set('verdict', ones % 2 ? 'Something is wrong' : st.flips.size ? 'Looks fine, but isn’t' : 'Looks fine');
  } else if (ch === 'hamming') {
    const v = drawVenn(ctx, w, h, col, bg);
    r?.set('sent', String(v.sent));
    r?.set('failed', v.failed.length ? v.failed.map((c) => `check ${c}`).join(', ') : 'None');
    r?.set('fix', v.pos ? `Flip bit ${v.pos}, read ${v.read}` : `Read ${v.read}`);
  } else if (ch === 'everywhere') {
    drawOdds(ctx, w, h, col, bg);
    r?.set('plain', `${fmt(plainOk(st.rate) * 100, 1)}%`);
    r?.set('coded', `${fmt(hammingOk(st.rate) * 100, 1)}%`);
  }
  return false;
}

function flipChips(ui, api, count, title) {
  ui.chips({
    label: title,
    items: Array.from({ length: count }, (_, i) => ({ id: i + 1, label: `${i + 1}`, pressed: st.flips.has(i + 1) })),
    onChange(id, on) { on ? st.flips.add(id) : st.flips.delete(id); api.invalidate(); },
  });
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ noise: 'Thirty-two bits down a noisy line', parity: 'One extra bit', hamming: 'Seven bits carrying four', everywhere: 'How often four bits get through' }[id]);
  st.flips = new Set();
  if (id === 'noise' || id === 'everywhere') {
    ui.slider({ label: 'Noise', min: 0, max: 0.2, step: 0.01, value: st.rate, format: (v) => `${Math.round(v * 100)}% of bits flipped`, onInput(v) { st.rate = v; if (id === 'noise') noisy(); api.invalidate(); } });
  }
  if (id === 'noise') {
    ui.button({ label: 'Send again', onClick() { noisy(); api.invalidate(); } });
    st.readout = api.readout([{ key: 'wrong', label: 'Bits that arrived wrong' }]);
  } else if (id === 'parity') {
    flipChips(ui, api, 8, 'Flip bits on the way');
    st.readout = api.readout([{ key: 'ones', label: 'Ones received' }, { key: 'verdict', label: 'The check says' }]);
  } else if (id === 'hamming') {
    ui.slider({ label: 'Number sent', min: 0, max: 15, value: st.n, onInput(v) { st.n = v; api.invalidate(); } });
    flipChips(ui, api, 7, 'Flip bits on the way');
    st.readout = api.readout([{ key: 'sent', label: 'Sent' }, { key: 'failed', label: 'Checks that fail' }, { key: 'fix', label: 'So' }]);
  } else {
    st.readout = api.readout([{ key: 'plain', label: 'Plain' }, { key: 'coded', label: 'Hamming code' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
