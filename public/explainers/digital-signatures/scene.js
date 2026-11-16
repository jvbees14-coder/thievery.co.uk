// ---------------------------------------------------------------------------
// Signing without a pen: the scene.
//
// Real SHA-256 for the fingerprint (shared/sha.js), and the textbook RSA
// keys n = 3233 (61 × 53), e = 17, d = 2753 for the signing. To fit the
// toy, the fingerprint's first three bytes are taken mod 3233. Signing is
// s = h^d mod n and checking is s^e mod n = h. Every product stays below
// 3233², well inside a double, so plain numbers do.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, box, TOKENS } from '../shared/draw.js';
import { sha256, utf8, hex, bits } from '../shared/sha.js';

const N = 3233, E = 17, D = 2753;
const pow = (b, e, m) => { let r = 1; b %= m; while (e > 0) { if (e & 1) r = (r * b) % m; b = (b * b) % m; e >>= 1; } return r; };
const small = (h) => ((h[0] << 16) | (h[1] << 8) | h[2]) % N;

const ORIGINAL = 'Pay Sam £20 on Friday.';
const st = { msg: ORIGINAL, signed: ORIGINAL, sig: null, before: null, guesses: 0, hits: 0, last: null, readout: null };

function bitGrid(ctx, x0, y0, wd, hash, prev, col) {
  const b = bits(hash), p = prev ? bits(prev) : null;
  const per = 32, c = Math.min(wd / per, 12);
  for (let i = 0; i < 256; i++) {
    const on = b[i] === '1';
    const changed = p && p[i] !== b[i];
    ctx.fillStyle = changed ? col.danger : on ? col['hiw-ink-1'] : alpha(col['label-tertiary'], 0.15);
    ctx.fillRect(x0 + (i % per) * c + 1, y0 + Math.floor(i / per) * c + 1, c - 2, c - 2);
  }
  return y0 + 8 * c;
}

function card(ctx, x, y, wd, title, lines, col, tone) {
  const hgt = 26 + lines.length * 20;
  box(ctx, x, y, wd, hgt, 8);
  ctx.fillStyle = alpha(tone || col['label-tertiary'], 0.1);
  ctx.fill();
  ctx.strokeStyle = alpha(tone || col['label-tertiary'], 0.5);
  ctx.stroke();
  label(ctx, title, x + 12, y + 16, col['label-secondary'], null, { size: 11 });
  lines.forEach((l, i) => label(ctx, l, x + 12, y + 38 + i * 20, col.label, null, { size: 13, weight: 600, mono: /^[0-9a-f ]+$/.test(l) }));
  return y + hgt;
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  const hash = sha256(utf8(st.msg));
  const x = 20, wd = w - 40;
  if (ch === 'fingerprint') {
    let y = card(ctx, x, 56, wd, 'Message', [st.msg || ' '], col);
    const hx = hex(hash);
    y = card(ctx, x, y + 12, wd, 'SHA-256 fingerprint', [hx.slice(0, 32), hx.slice(32)], col);
    label(ctx, 'The same 256 bits; red ones changed with your last edit', x, y + 22, col['label-secondary'], bg, { size: 11 });
    bitGrid(ctx, x, y + 36, wd, hash, st.before, col);
    let changed = 0;
    if (st.before) { const a = bits(hash), b = bits(st.before); for (let i = 0; i < 256; i++) if (a[i] !== b[i]) changed++; }
    r?.set('changed', st.before ? `${changed} of 256` : '–');
  } else if (ch === 'sign' || ch === 'check') {
    const hs = small(sha256(utf8(st.signed)));
    const sig = pow(hs, D, N);
    let y = card(ctx, x, 56, wd, ch === 'sign' ? 'Message to sign' : 'Message as received', [st.msg || ' '], col);
    if (ch === 'sign') {
      y = card(ctx, x, y + 12, wd, 'Fingerprint, cut down', [`${hs}`], col);
      y = card(ctx, x, y + 12, wd, 'Signature: fingerprint to the power 2753, on a clock of 3233', [`${sig}`], col, col.accent);
      r?.set('fp', `${hs}`);
      r?.set('sig', `${sig}`);
    } else {
      const now = small(hash);
      const back = pow(sig, E, N);
      y = card(ctx, x, y + 12, wd, 'Signature that came with it', [`${sig}`], col, col.accent);
      y = card(ctx, x, y + 12, wd, 'Signature to the power 17, on a clock of 3233', [`${back}`], col);
      const ok = back === now;
      y = card(ctx, x, y + 12, wd, 'Fingerprint of the message received', [`${now}`], col, ok ? col.success : col.danger);
      label(ctx, ok ? 'They match: signed, and unchanged' : 'They differ: altered, or not signed by this key', w / 2, y + 26, ok ? col.success : col.danger, bg, { size: 14, weight: 700, align: 'center' });
      r?.set('ok', ok ? 'Valid' : 'Not valid');
    }
  } else if (ch === 'forge') {
    const target = small(hash);
    let y = card(ctx, x, 56, wd, 'A message the forger wants signed', [st.msg], col);
    y = card(ctx, x, y + 12, wd, 'Its fingerprint, cut down', [`${target}`], col);
    if (st.last !== null) {
      const back = pow(st.last, E, N);
      y = card(ctx, x, y + 12, wd, `Guess ${fmt(st.guesses)}: ${st.last}, to the power 17`, [`${back}`], col, back === target ? col.success : col.danger);
    }
    // Every guess so far, as a strip of ticks along 0 to 3232.
    const sy = y + 34;
    ctx.fillStyle = alpha(col['label-tertiary'], 0.12);
    ctx.fillRect(x, sy, wd, 18);
    label(ctx, 'Every possible signature, 0 to 3232', x, sy + 32, col['label-tertiary'], bg, { size: 11 });
    const right = pow(target, D, N);
    ctx.fillStyle = col.success;
    ctx.fillRect(x + (right / N) * wd - 1, sy - 4, 3, 26);
    for (const g of st.tried || []) {
      ctx.fillStyle = alpha(col.danger, 0.6);
      ctx.fillRect(x + (g / N) * wd, sy, 1, 18);
    }
    r?.set('guesses', fmt(st.guesses));
    r?.set('hits', fmt(st.hits));
  }
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.readout = null;
  api.note({ fingerprint: 'SHA-256, worked out as you type', sign: 'Toy RSA keys: public 3233 and 17, private 2753', check: 'Checking with the public key only', forge: 'Guessing without the private key' }[id]);
  if (id === 'fingerprint') {
    st.before = null;
    let prev = sha256(utf8(st.msg));
    ui.text({ label: 'Message', value: st.msg, maxLength: 80, onInput(v) { st.before = prev; st.msg = v; prev = sha256(utf8(v)); api.invalidate(); } });
    st.readout = api.readout([{ key: 'changed', label: 'Bits changed by the last edit' }]);
  } else if (id === 'sign') {
    ui.text({ label: 'Message', value: st.msg, maxLength: 60, onInput(v) { st.msg = v; st.signed = v; api.invalidate(); } });
    st.signed = st.msg;
    st.readout = api.readout([{ key: 'fp', label: 'Fingerprint' }, { key: 'sig', label: 'Signature' }]);
  } else if (id === 'check') {
    st.signed = ORIGINAL;
    st.msg = ORIGINAL;
    ui.text({ label: 'Message as received', value: st.msg, maxLength: 60, onInput(v) { st.msg = v; api.invalidate(); } });
    ui.hint('The signature was made for “Pay Sam £20 on Friday.”');
    st.readout = api.readout([{ key: 'ok', label: 'Signature' }]);
  } else if (id === 'forge') {
    st.msg = 'Pay Mallory £2,000 on Friday.';
    st.guesses = 0;
    st.hits = 0;
    st.last = null;
    st.tried = [];
    const target = () => small(sha256(utf8(st.msg)));
    const guess = (k) => {
      for (let i = 0; i < k; i++) {
        const g = Math.floor(Math.random() * N);
        st.last = g;
        st.tried.push(g);
        st.guesses++;
        if (pow(g, E, N) === target()) st.hits++;
      }
      api.status(st.hits ? `${st.hits} of ${fmt(st.guesses)} guesses worked.` : `None of ${fmt(st.guesses)} guesses worked.`);
      api.invalidate();
    };
    ui.button({ label: 'Guess once', onClick() { guess(1); } });
    ui.button({ label: 'Guess 100 times', onClick() { guess(100); } });
    st.readout = api.readout([{ key: 'guesses', label: 'Guesses' }, { key: 'hits', label: 'Worked' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
