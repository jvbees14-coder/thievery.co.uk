// ---------------------------------------------------------------------------
// The cipher that stood for 300 years: the scene.
//
// The arithmetic is in art.js. Each chapter shows a strip of the message
// over its secret version, and the letter counts as bars. Chapter 4 runs
// the whole crack: scores for key lengths 1 to 10, the first length that
// stands out (a multiple of the right length scores as well, so the first
// is taken), and the shift found for each column.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { TEXT, ENGLISH, letters, vigenere, counts, lengthScores, crack } from './art.js';

const st = { shift: 3, key: 'VAULT', readout: null };
const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function strip(ctx, x0, y0, wd, plain, key, col, bg) {
  const L = letters(plain).slice(0, 40), K = letters(key) || 'A';
  const c = Math.min(22, wd / Math.min(L.length, 30));
  const n = Math.floor(wd / c);
  const inks = [col['hiw-ink-1'], col['hiw-ink-2'], col['hiw-ink-3'], col['hiw-ink-4'], col.accent];
  for (let i = 0; i < Math.min(n, L.length); i++) {
    const x = x0 + i * c + c / 2;
    const k = K[i % K.length];
    const ink = K.length > 1 ? inks[(i % K.length) % inks.length] : col.accent;
    const out = String.fromCharCode(65 + ((L.charCodeAt(i) - 65 + k.charCodeAt(0) - 65) % 26));
    label(ctx, L[i], x, y0, col['label-secondary'], null, { size: 13, align: 'center', mono: true });
    label(ctx, k, x, y0 + 20, ink, null, { size: 11, align: 'center', mono: true });
    label(ctx, out, x, y0 + 42, col.label, null, { size: 14, weight: 700, align: 'center', mono: true });
  }
  label(ctx, 'Message', x0, y0 - 18, col['label-tertiary'], bg, { size: 11 });
  label(ctx, 'Shift', x0 + wd, y0 - 18, col['label-tertiary'], bg, { size: 11, align: 'right' });
  return y0 + 60;
}

function bars(ctx, x0, y0, wd, ht, n, col, bg, title, compare) {
  const N = n.reduce((a, b) => a + b, 0) || 1;
  const bw = wd / 26, top = 14;
  label(ctx, title, x0, y0 - 12, col['label-secondary'], bg, { size: 11 });
  for (let i = 0; i < 26; i++) {
    const p = (n[i] / N) * 100;
    const bh = Math.min(1, p / top) * ht;
    ctx.fillStyle = col['hiw-ink-1'];
    ctx.fillRect(x0 + i * bw + 1, y0 + ht - bh, bw - 2, bh);
    if (compare) {
      const e = (compare[i] / top) * ht;
      ctx.fillStyle = alpha(col.accent, 0.9);
      ctx.fillRect(x0 + i * bw + 1, y0 + ht - e - 1, bw - 2, 2.5);
    }
    label(ctx, AZ[i], x0 + i * bw + bw / 2, y0 + ht + 10, col['label-tertiary'], null, { size: 10, align: 'center' });
  }
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  const x = 24, wd = w - 48;
  if (ch === 'shift') {
    const key = AZ[st.shift];
    const cipher = vigenere(TEXT, key);
    const y = strip(ctx, x, 84, wd, TEXT, key, col, bg);
    const shifted = ENGLISH.map((_, i) => ENGLISH[(i - st.shift + 26) % 26]);
    bars(ctx, x, y + 40, wd, h - y - 90, counts(cipher), col, bg, 'Letters in the secret message (gold: English, shifted)', shifted);
    r?.set('shift', `${st.shift} (A → ${key})`);
    const n = counts(cipher);
    r?.set('top', AZ[n.indexOf(Math.max(...n))]);
  } else if (ch === 'keyword' || ch === 'flat') {
    const key = letters(st.key) || 'A';
    const cipher = vigenere(TEXT, key);
    const y = strip(ctx, x, 84, wd, TEXT, key, col, bg);
    bars(ctx, x, y + 40, wd, h - y - 90, counts(cipher), col, bg, ch === 'flat' ? 'Letters in the secret message (gold: plain English)' : 'Letters in the secret message', ch === 'flat' ? ENGLISH : null);
    const n = counts(cipher), N = n.reduce((a, b) => a + b, 0);
    r?.set('top', `${fmt((Math.max(...n) / N) * 100, 1)}%`);
    r?.set('secret', vigenere('THE', key).replace(/ /g, ''));
  } else if (ch === 'crack') {
    const key = letters(st.key) || 'A';
    const cipher = vigenere(TEXT, key);
    const scores = lengthScores(cipher, 10);
    let pick = scores.findIndex((s) => s > 0.06);
    if (pick < 0) pick = scores.indexOf(Math.max(...scores));
    const len = pick + 1;
    const found = crack(cipher, len);
    const x0 = x + 34, x1 = w - 24, y0 = 90, y1 = Math.min(h * 0.55, 290);
    const Y = (v) => y1 - (v / 0.09) * (y1 - y0);
    label(ctx, 'How often two letters in a column match', x0, y0 - 24, col['label-secondary'], bg, { size: 11 });
    for (const v of [0.04, 0.07]) {
      ctx.strokeStyle = col.separator;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x0, Y(v));
      ctx.lineTo(x1, Y(v));
      ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, `${Math.round(v * 100)}%`, x0 - 6, Y(v), col['label-tertiary'], bg, { size: 11, align: 'right' });
    }
    label(ctx, 'English', x1, Y(0.07) - 10, col['label-tertiary'], bg, { size: 11, align: 'right' });
    label(ctx, 'Random', x1, Y(0.04) + 10, col['label-tertiary'], bg, { size: 11, align: 'right' });
    const bw = (x1 - x0) / 10;
    scores.forEach((s, i) => {
      ctx.fillStyle = i === pick ? col.accent : alpha(col['hiw-ink-1'], 0.7);
      ctx.fillRect(x0 + i * bw + bw * 0.2, Y(s), bw * 0.6, y1 - Y(s));
      label(ctx, `${i + 1}`, x0 + i * bw + bw / 2, y1 + 12, col['label-secondary'], null, { size: 11, align: 'center' });
    });
    label(ctx, 'Guessed key length', x1, y1 + 28, col['label-tertiary'], bg, { size: 11, align: 'right' });
    const yy = y1 + 66;
    label(ctx, 'Secret message', x, yy, col['label-tertiary'], bg, { size: 11 });
    label(ctx, cipher.slice(0, 56), x, yy + 20, col.label, bg, { size: 13, mono: true });
    label(ctx, `Key found: ${found}`, x, yy + 52, found === key ? col.success : col.danger, bg, { size: 15, weight: 700 });
    label(ctx, vigenere(cipher, found, -1).slice(0, 56), x, yy + 76, col['label-secondary'], bg, { size: 13, mono: true });
    r?.set('len', `${len}`);
    r?.set('key', found);
  }
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.readout = null;
  api.note({ shift: 'A single shift, on a 449-letter message', keyword: 'A keyword of shifts', flat: 'Longer keywords', crack: 'Breaking it, knowing nothing but the secret message' }[id]);
  if (id === 'shift') {
    ui.slider({ label: 'Shift', min: 0, max: 25, value: st.shift, onInput(v) { st.shift = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'shift', label: 'Shift' }, { key: 'top', label: 'Commonest secret letter' }]);
  } else if (id === 'keyword' || id === 'flat') {
    if (id === 'flat') st.key = 'VAULT';
    ui.text({ label: 'Keyword', value: st.key, maxLength: 20, onInput(v) { st.key = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'top', label: 'Commonest letter’s share' }, { key: 'secret', label: '“THE” becomes' }]);
  } else if (id === 'crack') {
    ui.text({ label: 'Keyword (the crack is not told it)', value: st.key, maxLength: 10, onInput(v) { st.key = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'len', label: 'Key length found' }, { key: 'key', label: 'Key found' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
