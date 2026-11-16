// ---------------------------------------------------------------------------
// The six digits on your phone: the scene.
//
// TOTP as RFC 6238 has it: the count of 30-second steps since 1970 as an
// eight-byte number, HMAC-SHA-1 of it under the shared secret, then RFC
// 4226's truncation (the low four bits of the last byte pick an offset,
// four bytes from there with the top bit cleared, the last six digits).
// The secret is the RFC's test key, so the codes can be checked against
// its published table. The QR code is the qr-codes explainer's encoder.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, box, TOKENS } from '../shared/draw.js';
import { sha1, hmac, utf8 } from '../shared/sha.js';
import { encode } from '../qr-codes/qr.js';

const KEY = utf8('12345678901234567890');
const BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const URI = `otpauth://totp/Thievery:demo?secret=${BASE32}&issuer=Thievery`;
const QR = encode(URI, 'L');
const st = { shift: 0, tries: 5, readout: null };

function totp(step) {
  const c = new Uint8Array(8);
  const v = new DataView(c.buffer);
  v.setUint32(0, Math.floor(step / 0x100000000));
  v.setUint32(4, step >>> 0);
  const h = hmac(sha1, KEY, c);
  const off = h[19] & 15;
  const num = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return { h, off, num, code: String(num % 1e6).padStart(6, '0') };
}

function phone(ctx, x, y, wd, ht, col, bg, code, left) {
  box(ctx, x, y, wd, ht, 18);
  ctx.fillStyle = col['bg-elevated'];
  ctx.fill();
  ctx.strokeStyle = col['separator-strong'];
  ctx.lineWidth = 2;
  ctx.stroke();
  label(ctx, 'Thievery', x + wd / 2, y + ht * 0.3, col['label-secondary'], null, { size: 12, align: 'center' });
  label(ctx, `${code.slice(0, 3)} ${code.slice(3)}`, x + wd / 2, y + ht * 0.45, col.accent, null, { size: Math.min(26, wd * 0.18), weight: 700, align: 'center', mono: true });
  // The ring of time left in this step.
  const cx = x + wd / 2, cy = y + ht * 0.68, R = Math.min(wd * 0.16, 22);
  ctx.strokeStyle = alpha(col['label-tertiary'], 0.3);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = left < 6 ? col.danger : col['hiw-ink-1'];
  ctx.beginPath();
  ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + (left / 30) * TAU);
  ctx.stroke();
  label(ctx, `${Math.ceil(left)}`, cx, cy, col.label, null, { size: 12, align: 'center' });
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  const now = Date.now() / 1000;
  const step = Math.floor(now / 30) + st.shift;
  const left = 30 - (now % 30);
  const { h: mac, off, num, code } = totp(step);
  if (ch === 'secret') {
    const size = Math.min(h - 120, w * 0.45);
    const m = size / (QR.size + 8);
    const x0 = w * 0.06, y0 = 60;
    ctx.fillStyle = col.stock;
    ctx.fillRect(x0, y0, size, size);
    ctx.fillStyle = col['stock-ink'];
    for (let y = 0; y < QR.size; y++) for (let x = 0; x < QR.size; x++) if (QR.modules[y][x]) ctx.fillRect(x0 + (x + 4) * m, y0 + (y + 4) * m, m + 0.3, m + 0.3);
    const tx = x0 + size + 24, tw = w - tx - 16;
    label(ctx, 'Inside the QR code', tx, y0 + 6, col['label-secondary'], bg, { size: 11 });
    const parts = ['otpauth://totp/', 'Thievery:demo', '?secret=', BASE32.slice(0, 16), BASE32.slice(16), '&issuer=Thievery'];
    parts.forEach((p, i) => label(ctx, p, tx, y0 + 30 + i * 20, i === 3 || i === 4 ? col.accent : col.label, bg, { size: Math.min(13, tw / 13), mono: true }));
    // On a narrow screen the note goes under the code, where there is room.
    if (tw < 230) label(ctx, 'The secret, in gold, kept by both sides', x0, y0 + size + 18, col.accent, bg, { size: 11 });
    else label(ctx, 'The secret, in gold, kept by both sides', tx, y0 + 30 + parts.length * 20 + 10, col.accent, bg, { size: 11 });
    r?.set('secret', '160 bits');
  } else if (ch === 'clock') {
    const pw = Math.min(150, w * 0.3), ph = pw * 1.7;
    phone(ctx, w * 0.12, 64, pw, ph, col, bg, code, left);
    label(ctx, 'Your phone', w * 0.12 + pw / 2, 64 + ph + 16, col['label-secondary'], bg, { size: 11, align: 'center' });
    const sx = w * 0.88 - pw;
    box(ctx, sx, 64, pw, ph, 8);
    ctx.fillStyle = alpha(col['label-tertiary'], 0.1);
    ctx.fill();
    label(ctx, 'The website', sx + pw / 2, 64 + ph + 16, col['label-secondary'], bg, { size: 11, align: 'center' });
    label(ctx, 'Expects', sx + pw / 2, 64 + ph * 0.3, col['label-secondary'], null, { size: 12, align: 'center' });
    label(ctx, `${code.slice(0, 3)} ${code.slice(3)}`, sx + pw / 2, 64 + ph * 0.45, col.accent, null, { size: Math.min(26, pw * 0.18), weight: 700, align: 'center', mono: true });
    label(ctx, `Step ${fmt(step)}`, w / 2, 64 + ph / 2, col.label, bg, { size: 14, weight: 700, align: 'center' });
    label(ctx, 'seconds since 1970 ÷ 30', w / 2, 64 + ph / 2 + 20, col['label-tertiary'], bg, { size: 11, align: 'center' });
    r?.set('step', fmt(step));
    r?.set('left', `${Math.ceil(left)} s`);
  } else if (ch === 'code') {
    const x0 = 20, wd = w - 40;
    label(ctx, `HMAC-SHA-1 of step ${fmt(step)}, under the secret: 20 bytes`, x0, 64, col['label-secondary'], bg, { size: 11 });
    const c = Math.min(wd / 10, 46);
    for (let i = 0; i < 20; i++) {
      const x = x0 + (i % 10) * c, y = 78 + Math.floor(i / 10) * (c * 0.8);
      const picked = i >= off && i < off + 4;
      box(ctx, x + 2, y, c - 4, c * 0.8 - 6, 4);
      ctx.fillStyle = picked ? alpha(col.accent, 0.25) : i === 19 ? alpha(col['hiw-ink-2'], 0.25) : alpha(col['label-tertiary'], 0.08);
      ctx.fill();
      label(ctx, mac[i].toString(16).padStart(2, '0'), x + c / 2, y + c * 0.37, picked ? col.accent : col.label, null, { size: Math.min(14, c * 0.32), mono: true, align: 'center' });
    }
    const y = 78 + 2 * c * 0.8 + 24;
    label(ctx, `Last byte ends in ${mac[19] & 15}, so start at byte ${off}`, x0, y, col['hiw-ink-2'], bg, { size: 12 });
    label(ctx, `Those four bytes, top bit dropped: ${fmt(num)}`, x0, y + 24, col.accent, bg, { size: 12 });
    label(ctx, `Last six digits: ${code}`, x0, y + 56, col.label, bg, { size: 18, weight: 700 });
    r?.set('code', code);
    r?.set('step', `${st.shift > 0 ? '+' : ''}${st.shift} from now`);
  } else if (ch === 'guess') {
    const p = 1 - (1 - 1e-6) ** st.tries;
    const cells = 100;
    const side = Math.min(w - 60, h - 130);
    const c = side / cells;
    const x0 = (w - side) / 2, y0 = 60;
    ctx.fillStyle = alpha(col['label-tertiary'], 0.1);
    ctx.fillRect(x0, y0, side, side);
    label(ctx, 'A square of 10,000 dots, each standing for 100 codes', w / 2, y0 + side + 18, col['label-tertiary'], bg, { size: 11, align: 'center' });
    ctx.fillStyle = col.danger;
    ctx.fillRect(x0 + 37 * c, y0 + 61 * c, Math.max(2, c), Math.max(2, c));
    r?.set('one', '1 in 1,000,000');
    r?.set('all', `1 in ${fmt(1 / p)}`);
  }
  return (ch === 'clock' || ch === 'code') && api.playing && api.motion;
}

// Still or not, the code changes every 30 seconds; a redraw a second keeps
// the figures true without anything sliding about.
function setup(api) {
  setInterval(() => {
    if (api.chapter === 'clock' || api.chapter === 'code') api.invalidate();
  }, 1000);
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.readout = null;
  st.shift = 0;
  api.note({ secret: 'The QR code a website shows when you set it up', clock: 'Live: the real time, now', code: 'The arithmetic behind the code', guess: 'Every possible code' }[id]);
  if (id === 'secret') st.readout = api.readout([{ key: 'secret', label: 'Secret' }]);
  else if (id === 'clock') st.readout = api.readout([{ key: 'step', label: 'Steps since 1970' }, { key: 'left', label: 'This code lasts' }]);
  else if (id === 'code') {
    ui.button({ label: 'Step back', onClick() { st.shift--; api.invalidate(); } });
    ui.button({ label: 'Step forward', onClick() { st.shift++; api.invalidate(); } });
    ui.button({ label: 'Now', onClick() { st.shift = 0; api.invalidate(); } });
    st.readout = api.readout([{ key: 'code', label: 'Code' }, { key: 'step', label: 'Step' }]);
  } else if (id === 'guess') {
    ui.slider({ label: 'Wrong tries allowed', min: 1, max: 100, value: st.tries, onInput(v) { st.tries = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'one', label: 'One guess' }, { key: 'all', label: 'Before the site locks' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw, setup });
