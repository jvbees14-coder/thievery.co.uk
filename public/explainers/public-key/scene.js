// ---------------------------------------------------------------------------
// How strangers share a secret: the scene.
//
// Alice and Bob on either side, Eve listening in the middle. Chapter 2
// mixes paint (the usual picture of Diffie-Hellman), chapter 3 does the
// same exchange with real numbers modulo a small prime, drawn as hops round
// a clock face, and chapter 5 is the textbook RSA example (n = 3233), with
// the arithmetic done exactly in BigInt.
// ---------------------------------------------------------------------------

import { mount, Smooth, fmt, TAU, lerp, ease } from '../engine.js';
import { label, setFace, TOKENS, mix, glow } from '../shared/draw.js';

export const P = 23n, G = 5n;
export const RSA = { n: 3233n, e: 17n, d: 2753n };

export function modpow(base, exp, mod) {
  let r = 1n, b = base % mod, e = exp;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return r;
}

const st = {
  a: 6,
  b: 15,
  hueA: 0.08,
  hueB: 0.62,
  msg: 65,
  hop: new Smooth(0, 1.6),
  loop: 0,
  readout: null,
};

// A paint colour from a hue in 0..1, in the scene's own inks.
function paint(col, t) {
  const inks = [col['hiw-ink-1'], col['hiw-ink-3'], col.accent, col['hiw-ink-2'], col['hiw-ink-4'], col['hiw-ink-1']];
  const x = t * (inks.length - 1);
  const i = Math.floor(x);
  return mix(inks[i], inks[Math.min(inks.length - 1, i + 1)], x - i);
}

function pot(ctx, x, y, r, fill, col, words, bg) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = col['separator-strong'];
  ctx.lineWidth = 1;
  ctx.stroke();
  if (words) label(ctx, words, x, y + r + 14, col['label-secondary'], bg, { size: 11, weight: 500, align: 'center' });
}

function people(ctx, w, h, col, bg) {
  label(ctx, 'Alice', w * 0.14, 64, col['hiw-ink-1'], bg, { size: 14, weight: 700, align: 'center' });
  label(ctx, 'Bob', w * 0.86, 64, col['hiw-ink-2'], bg, { size: 14, weight: 700, align: 'center' });
  label(ctx, 'Eve sees', w * 0.5, 64, col.danger, bg, { size: 14, weight: 700, align: 'center' });
  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = col.separator;
  ctx.beginPath();
  ctx.moveTo(w * 0.32, 50);
  ctx.lineTo(w * 0.32, h - 12);
  ctx.moveTo(w * 0.68, 50);
  ctx.lineTo(w * 0.68, h - 12);
  ctx.stroke();
  ctx.setLineDash([]);
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  let moving = false;
  if (api.playing && api.motion) {
    st.loop += dt;
    moving = true;
  }
  const phase = api.motion ? ease.inOut(Math.min(1, (st.loop % 6) / 3)) : 1;

  if (ch === 'problem') {
    people(ctx, w, h, col, bg);
    const y = h * 0.5;
    const x = lerp(w * 0.14, w * 0.86, phase);
    glow(ctx, x, y, col.accent, 6, 3);
    label(ctx, 'meet at 9?', x, y - 22, col.label, bg, { size: 13, align: 'center' });
    label(ctx, 'Anything sent, Eve can read', w * 0.5, h * 0.78, col.danger, bg, { size: 13, align: 'center' });
  }

  if (ch === 'paint') {
    people(ctx, w, h, col, bg);
    const r = Math.min(w, h) * 0.06;
    const pub = col.stock;
    const A = paint(col, st.hueA), B = paint(col, st.hueB);
    const mixA = mix(pub, A, 0.5), mixB = mix(pub, B, 0.5);
    const secret = mix(mix(pub, A, 0.5), B, 0.34);
    const rows = [h * 0.32, h * 0.5, h * 0.67, h * 0.85];
    pot(ctx, w * 0.5, rows[0], r, pub, col, 'Shared colour, public', bg);
    pot(ctx, w * 0.14, rows[0], r, A, col, "Alice's secret", bg);
    pot(ctx, w * 0.86, rows[0], r, B, col, "Bob's secret", bg);
    pot(ctx, w * 0.14, rows[1], r, mixA, col, 'Shared + hers', bg);
    pot(ctx, w * 0.86, rows[1], r, mixB, col, 'Shared + his', bg);
    // The two mixes cross in public.
    const t = phase;
    pot(ctx, lerp(w * 0.14, w * 0.86, t), rows[2], r * 0.8, mixA, col, null, bg);
    pot(ctx, lerp(w * 0.86, w * 0.14, t), rows[2], r * 0.8, mixB, col, null, bg);
    label(ctx, 'Sent in the open', w * 0.5, rows[2] + r + 14, col['label-secondary'], bg, { size: 11, weight: 500, align: 'center' });
    if (t > 0.98) {
      pot(ctx, w * 0.14, rows[3], r, secret, col, 'Theirs + hers', bg);
      pot(ctx, w * 0.86, rows[3], r, secret, col, 'Hers + his', bg);
      label(ctx, 'Same colour', w * 0.5, rows[3], col.success, bg, { size: 13, align: 'center' });
    }
  }

  if (ch === 'numbers' || ch === 'hard') {
    people(ctx, w, h, col, bg);
    const a = BigInt(st.a), b = BigInt(st.b);
    const A = modpow(G, a, P), B = modpow(G, b, P);
    const s = modpow(B, a, P);
    // A clock with 23 places; multiplying by 5 hops round it.
    const cx = w * 0.5, cy = h * 0.55, R = Math.min(w * 0.15, h * 0.28);
    ctx.strokeStyle = col.separator;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 23; i++) {
      const ang = (i / 23) * TAU - Math.PI / 2;
      label(ctx, String(i), cx + Math.cos(ang) * (R + 12), cy + Math.sin(ang) * (R + 12), col['label-tertiary'], bg, { size: 10, weight: 500, align: 'center' });
    }
    const steps = Math.min(st.a, Math.floor(phase * st.a + 0.0001));
    let v = 1n, prev = 1n;
    for (let i = 0; i <= steps; i++) {
      const ang = (Number(v) / 23) * TAU - Math.PI / 2;
      const pang = (Number(prev) / 23) * TAU - Math.PI / 2;
      if (i > 0) {
        ctx.strokeStyle = col['hiw-ink-1'];
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(pang) * R, cy + Math.sin(pang) * R);
        ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
        ctx.stroke();
      }
      glow(ctx, cx + Math.cos(ang) * R, cy + Math.sin(ang) * R, i === steps ? col['accent-strong'] : col['hiw-ink-1'], i === steps ? 4 : 2.5, 3, i === steps ? 0.6 : 0);
      prev = v;
      v = (v * G) % P;
    }
    label(ctx, `5 multiplied by itself ${st.a} times, round a clock of 23`, cx, h - 14, col['label-tertiary'], bg, { size: 11, weight: 500, align: 'center' });
    const y0 = 98;
    label(ctx, `secret a = ${st.a}`, w * 0.14, y0, col.label, bg, { size: 13, align: 'center' });
    label(ctx, `sends 5^${st.a} mod 23 = ${A}`, w * 0.14, y0 + 22, col['label-secondary'], bg, { size: 12, align: 'center' });
    label(ctx, `secret b = ${st.b}`, w * 0.86, y0, col.label, bg, { size: 13, align: 'center' });
    label(ctx, `sends 5^${st.b} mod 23 = ${B}`, w * 0.86, y0 + 22, col['label-secondary'], bg, { size: 12, align: 'center' });
    label(ctx, `5, 23, ${A} and ${B}`, w * 0.5, y0, col.danger, bg, { size: 13, align: 'center' });
    label(ctx, `${B}^${st.a} mod 23 = ${s}`, w * 0.14, h * 0.8, col.success, bg, { size: 13, align: 'center' });
    label(ctx, `${A}^${st.b} mod 23 = ${s}`, w * 0.86, h * 0.8, col.success, bg, { size: 13, align: 'center' });
    if (st.readout) {
      st.readout.set('A', String(A));
      st.readout.set('B', String(B));
      st.readout.set('s', String(s));
    }
  }

  if (ch === 'padlock') {
    const m = BigInt(st.msg);
    const c = modpow(m, RSA.e, RSA.n);
    const back = modpow(c, RSA.d, RSA.n);
    const x0 = w * 0.16, x1 = w * 0.5, x2 = w * 0.84, y = h * 0.42;
    const t = phase;
    label(ctx, 'Message', x0, y - 40, col['label-secondary'], bg, { size: 12, align: 'center' });
    label(ctx, String(m), x0, y, col.label, bg, { size: 26, weight: 700, align: 'center' });
    label(ctx, 'Locked with the public key', x1, y - 40, col['label-secondary'], bg, { size: 12, align: 'center' });
    label(ctx, t > 0.3 ? String(c) : '…', x1, y, col.danger, bg, { size: 26, weight: 700, align: 'center' });
    label(ctx, 'Opened with the private key', x2, y - 40, col['label-secondary'], bg, { size: 12, align: 'center' });
    label(ctx, t > 0.8 ? String(back) : '…', x2, y, col.success, bg, { size: 26, weight: 700, align: 'center' });
    label(ctx, `${m}^17 mod 3233`, x1, y + 30, col['label-tertiary'], bg, { size: 12, weight: 500, align: 'center' });
    label(ctx, `${t > 0.3 ? c : 'c'}^2753 mod 3233`, x2, y + 30, col['label-tertiary'], bg, { size: 12, weight: 500, align: 'center' });
    label(ctx, 'Public: n = 3233, e = 17    Private: d = 2753 (3233 = 61 × 53)', w / 2, h * 0.78, col['label-secondary'], bg, { size: 12, weight: 500, align: 'center' });
    if (st.readout) {
      st.readout.set('m', String(m));
      st.readout.set('c', String(c));
      st.readout.set('back', String(back));
    }
  }
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  st.loop = 0;
  api.status('');
  api.note(id === 'numbers' || id === 'hard' ? 'Real arithmetic, with tiny numbers' : id === 'padlock' ? 'The textbook RSA example' : '');
  st.readout = null;
  if (id === 'paint') {
    ui.slider({ label: "Alice's secret colour", min: 0, max: 100, value: Math.round(st.hueA * 100), format: () => '', onInput: (v) => { st.hueA = v / 100; api.invalidate(); } });
    ui.slider({ label: "Bob's secret colour", min: 0, max: 100, value: Math.round(st.hueB * 100), format: () => '', onInput: (v) => { st.hueB = v / 100; api.invalidate(); } });
  }
  if (id === 'numbers' || id === 'hard') {
    ui.slider({ label: "Alice's secret number", min: 1, max: 22, value: st.a, onInput: (v) => { st.a = v; st.loop = 0; api.invalidate(); } });
    ui.slider({ label: "Bob's secret number", min: 1, max: 22, value: st.b, onInput: (v) => { st.b = v; api.invalidate(); } });
    st.readout = api.readout([
      { key: 'A', label: 'Alice sends' },
      { key: 'B', label: 'Bob sends' },
      { key: 's', label: 'Shared secret' },
    ]);
  }
  if (id === 'padlock') {
    ui.slider({ label: 'Message (a number below 3233)', min: 0, max: 3232, value: st.msg, onInput: (v) => { st.msg = v; st.loop = 0; api.invalidate(); } });
    st.readout = api.readout([
      { key: 'm', label: 'Message' },
      { key: 'c', label: 'Locked' },
      { key: 'back', label: 'Unlocked' },
    ]);
  }
  if (!st.readout) api.readout([]);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
