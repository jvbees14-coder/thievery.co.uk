// ---------------------------------------------------------------------------
// Agreeing a secret in public: the scene.
//
// Chapter 1 is the paint picture: a public colour, two secret ones, mixed
// in equal parts (the mixing is the shared mix() helper on tokens).
// Chapters 2 and 3 are Diffie–Hellman on a clock of p hours, with g a
// primitive root: 5 for 23 and 2 for 101. Chapter 4 puts Mallory between
// them, running one exchange with each side.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU } from '../engine.js';
import { label, setFace, arrow, box, mix, TOKENS } from '../shared/draw.js';

const pow = (b, e, m) => { let r = 1; b %= m; while (e > 0) { if (e & 1) r = (r * b) % m; b = (b * b) % m; e >>= 1; } return r; };
const st = { step: 0, a: 4, b: 3, p: 23, g: 5, m: 6, mallory: false, readout: null };

function pot(ctx, x, y, r, colour, title, col, bg, sub) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.strokeStyle = col['separator-strong'];
  ctx.lineWidth = 1.5;
  ctx.stroke();
  label(ctx, title, x, y + r + 14, col.label, bg, { size: 12, weight: 700, align: 'center' });
  if (sub) label(ctx, sub, x, y + r + 30, col['label-secondary'], bg, { size: 11, align: 'center' });
}

function person(ctx, x, y, name, col, bg, colour) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(x, y - 14, 10, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y + 14, 16, Math.PI, 0);
  ctx.fill();
  label(ctx, name, x, y + 30, col.label, bg, { size: 13, weight: 700, align: 'center' });
}

function paint(ctx, w, h, col, bg) {
  const base = col['hiw-signal'], sa = col['hiw-ink-2'], sb = col['hiw-ink-1'];
  const ma = mix(base, sa, 0.5), mb = mix(base, sb, 0.5);
  const fin = mix(mix(base, sa, 0.5), sb, 1 / 3);
  const L = w * 0.18, R = w * 0.82, M = w / 2, r = Math.min(26, w * 0.05);
  person(ctx, L, 82, 'Alice', col, bg, sa);
  person(ctx, R, 82, 'Bob', col, bg, sb);
  person(ctx, M, 82, 'Listener', col, bg, col['label-tertiary']);
  // Rows spaced to the height there is, so a phone fits them too.
  const y1 = 82 + (h - 82) * 0.28, y2 = 82 + (h - 82) * 0.55, y3 = 82 + (h - 82) * 0.78;
  pot(ctx, M, y1, r, base, 'Public colour', col, bg);
  if (st.step >= 1) {
    pot(ctx, L, y1, r, sa, 'Secret', col, bg);
    pot(ctx, R, y1, r, sb, 'Secret', col, bg);
  }
  if (st.step >= 2) {
    pot(ctx, L, y2, r, ma, 'Mixed', col, bg);
    pot(ctx, R, y2, r, mb, 'Mixed', col, bg);
  }
  if (st.step >= 3) {
    arrow(ctx, L + r + 6, y2 - 6, R - r - 10, y2 - 6, col['label-secondary'], 1.5);
    arrow(ctx, R - r - 6, y2 + 6, L + r + 10, y2 + 6, col['label-secondary'], 1.5);
    pot(ctx, M - r * 1.2, y2 + r + 16, r * 0.7, ma, '', col, bg);
    pot(ctx, M + r * 1.2, y2 + r + 16, r * 0.7, mb, '', col, bg);
    label(ctx, 'Overheard', M, y2 + 2 * r + 24, col['label-secondary'], bg, { size: 11, align: 'center' });
  }
  if (st.step >= 4) {
    const roomy = w > 500;
    pot(ctx, L, y3, r, fin, 'Shared secret', col, bg, roomy ? 'Bob’s mix + own secret' : '');
    pot(ctx, R, y3, r, fin, 'Shared secret', col, bg, roomy ? 'Alice’s mix + own secret' : '');
  }
}

function clock(ctx, w, h, col, bg) {
  const { p, g } = st;
  const cx = w / 2, cy = h / 2 + 30, R = Math.min(w * 0.4, h * 0.32);
  const P = (k) => [cx + Math.sin((k / p) * TAU) * R, cy - Math.cos((k / p) * TAU) * R];
  ctx.strokeStyle = col.separator;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.stroke();
  const A = pow(g, st.a, p), B = pow(g, st.b, p), S = pow(B, st.a, p);
  for (let k = 0; k < p; k++) {
    const [x, y] = P(k);
    const tag = k === S ? col.success : k === A ? col['hiw-ink-2'] : k === B ? col['hiw-ink-1'] : null;
    ctx.beginPath();
    ctx.arc(x, y, tag ? 8 : 3, 0, TAU);
    ctx.fillStyle = tag || col['label-tertiary'];
    ctx.fill();
    if (p <= 30) label(ctx, `${k}`, cx + Math.sin((k / p) * TAU) * (R + 18), cy - Math.cos((k / p) * TAU) * (R + 18), col['label-secondary'], bg, { size: 11, align: 'center' });
  }
  // Alice's hops: g, g², … up to g^a.
  let v = 1;
  ctx.strokeStyle = alpha(col['hiw-ink-2'], 0.7);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(...P(1));
  for (let i = 1; i <= st.a; i++) { v = (v * g) % p; ctx.lineTo(...P(v)); }
  ctx.stroke();
  label(ctx, `Alice sends ${g}^${st.a} → ${A}`, 16, 66, col['hiw-ink-2'], bg, { size: 12, weight: 700 });
  label(ctx, `Bob sends ${g}^${st.b} → ${B}`, w - 16, 66, col['hiw-ink-1'], bg, { size: 12, weight: 700, align: 'right' });
  label(ctx, `Both get ${S}`, cx, cy, col.success, bg, { size: 15, weight: 700, align: 'center' });
  return { A, B, S };
}

function scatter(ctx, w, h, col, bg) {
  const { p, g } = st;
  const x0 = 60, x1 = w - 20, y0 = 90, y1 = h - 50;
  ctx.strokeStyle = col.separator;
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  for (let k = 1; k < p; k++) {
    const v = pow(g, k, p);
    ctx.beginPath();
    ctx.arc(x0 + (k / p) * (x1 - x0), y1 - (v / p) * (y1 - y0), p > 50 ? 3 : 5, 0, TAU);
    ctx.fillStyle = k === st.a ? col.danger : col['hiw-ink-1'];
    ctx.fill();
  }
  label(ctx, 'The secret', x1, y1 + 20, col['label-tertiary'], bg, { size: 11, align: 'right' });
  label(ctx, 'What is sent', x0, y0 - 14, col['label-tertiary'], bg, { size: 11 });
  label(ctx, `${g} to the power of the secret, on a clock of ${p}`, x1, y0 - 14, col['label-secondary'], bg, { size: 11, align: 'right' });
}

function middle(ctx, w, h, col, bg) {
  const p = 23, g = 5, m = st.m;
  const L = w * 0.14, R = w * 0.86, M = w / 2, y = h * 0.3;
  person(ctx, L, y, 'Alice', col, bg, col['hiw-ink-2']);
  person(ctx, R, y, 'Bob', col, bg, col['hiw-ink-1']);
  const A = pow(g, st.a, p), B = pow(g, st.b, p), Mv = pow(g, m, p);
  let sA, sB, rows;
  if (st.mallory) {
    person(ctx, M, y, 'Mallory', col, bg, col.danger);
    arrow(ctx, L + 24, y - 10, M - 28, y - 10, col['label-secondary']);
    label(ctx, `${A}`, (L + M) / 2, y - 22, col['hiw-ink-2'], bg, { size: 12, align: 'center' });
    arrow(ctx, M - 24, y + 10, L + 28, y + 10, col['label-secondary']);
    label(ctx, `${Mv}`, (L + M) / 2, y + 24, col.danger, bg, { size: 12, align: 'center' });
    arrow(ctx, M + 24, y - 10, R - 28, y - 10, col['label-secondary']);
    label(ctx, `${Mv}`, (M + R) / 2, y - 22, col.danger, bg, { size: 12, align: 'center' });
    arrow(ctx, R - 24, y + 10, M + 28, y + 10, col['label-secondary']);
    label(ctx, `${B}`, (M + R) / 2, y + 24, col['hiw-ink-1'], bg, { size: 12, align: 'center' });
    sA = pow(Mv, st.a, p);
    sB = pow(Mv, st.b, p);
    rows = [['Alice’s secret', sA], ['Mallory’s with Alice', pow(A, m, p)], ['Mallory’s with Bob', pow(B, m, p)], ['Bob’s secret', sB]];
  } else {
    arrow(ctx, L + 24, y - 10, R - 28, y - 10, col['label-secondary']);
    label(ctx, `${A}`, M, y - 22, col['hiw-ink-2'], bg, { size: 12, align: 'center' });
    arrow(ctx, R - 24, y + 10, L + 28, y + 10, col['label-secondary']);
    label(ctx, `${B}`, M, y + 24, col['hiw-ink-1'], bg, { size: 12, align: 'center' });
    sA = pow(B, st.a, p);
    sB = pow(A, st.b, p);
    rows = [['Alice’s secret', sA], ['Bob’s secret', sB]];
  }
  rows.forEach(([name, v], i) => {
    const yy = h * 0.58 + i * 30;
    box(ctx, M - 130, yy - 12, 260, 24, 6);
    ctx.fillStyle = alpha(col['label-tertiary'], 0.1);
    ctx.fill();
    label(ctx, name, M - 120, yy, col.label, null, { size: 12 });
    label(ctx, `${v}`, M + 120, yy, col.label, null, { size: 13, weight: 700, align: 'right' });
  });
  return sA === sB;
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  if (ch === 'paint') {
    paint(ctx, w, h, col, bg);
  }
  else if (ch === 'clock') {
    const { A, B, S } = clock(ctx, w, h, col, bg);
    r?.set('sent', `${A} and ${B}`);
    r?.set('shared', `${S}`);
  } else if (ch === 'hard') {
    scatter(ctx, w, h, col, bg);
    r?.set('tries', fmt(st.p - 1));
  } else if (ch === 'middle') {
    const same = middle(ctx, w, h, col, bg);
    r?.set('same', same ? 'Yes' : 'No');
    r?.set('reads', st.mallory ? 'Everything' : 'Nothing');
  }
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.readout = null;
  api.note({ paint: 'The exchange, drawn with paint', clock: 'A clock of 23 hours, starting number 5', hard: 'Every possible secret, and what it sends', middle: 'The same exchange, with somebody in the line' }[id]);
  if (id === 'paint') {
    st.step = api.motion ? 0 : 4;
    const words = ['They agree a public colour.', 'Each picks a secret colour.', 'Each mixes their secret into the public colour.', 'They swap mixtures. The listener sees both.', 'Each adds their own secret to the other’s mixture: the same colour.'];
    // Said under the controls rather than over the picture, which has no room for it on a phone.
    st.words = words;
    const say = () => { hint.textContent = `${st.step + 1} of 5: ${words[st.step]}`; };
    ui.button({ label: 'Next step', onClick() { st.step = Math.min(4, st.step + 1); say(); api.invalidate(); } });
    ui.button({ label: 'Start again', onClick() { st.step = 0; say(); api.invalidate(); } });
    const hint = ui.hint('');
    hint.setAttribute('aria-live', 'polite');
    say();
  } else if (id === 'clock') {
    st.p = 23;
    st.g = 5;
    st.a = 4;
    st.b = 3;
    ui.slider({ label: 'Alice’s secret', min: 1, max: 21, value: st.a, onInput(v) { st.a = v; api.invalidate(); } });
    ui.slider({ label: 'Bob’s secret', min: 1, max: 21, value: st.b, onInput(v) { st.b = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'sent', label: 'Sent in public' }, { key: 'shared', label: 'Shared secret' }]);
  } else if (id === 'hard') {
    st.p = 23;
    st.g = 5;
    ui.choice({
      label: 'Clock',
      options: [{ id: '23', label: '23 hours' }, { id: '101', label: '101 hours' }],
      value: '23',
      onChange(v) { st.p = Number(v); st.g = v === '23' ? 5 : 2; st.a = Math.min(st.a, st.p - 2); api.invalidate(); },
    });
    ui.slider({ label: 'Alice’s secret', min: 1, max: 99, value: st.a, onInput(v) { st.a = Math.min(v, st.p - 2); api.invalidate(); } });
    st.readout = api.readout([{ key: 'tries', label: 'Secrets to try' }]);
  } else if (id === 'middle') {
    st.p = 23;
    st.g = 5;
    st.a = 4;
    st.b = 3;
    st.mallory = false;
    ui.toggle({ label: 'Somebody in the middle', checked: false, onChange(v) { st.mallory = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'same', label: 'Alice and Bob match' }, { key: 'reads', label: 'Mallory can read' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
