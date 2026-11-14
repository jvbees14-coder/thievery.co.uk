// ---------------------------------------------------------------------------
// How compression works: the scene.
//
// Whatever the reader types is stored the ordinary way (8 bits a letter),
// counted, built into a Huffman tree merge by merge, and encoded with it.
// Every number is the real count of bits for that text.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, clamp } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { counts, build, codes, utf8Bits, entropy, shown } from './huffman.js';

const st = {
  text: 'steal their cards before they steal yours',
  step: 0,
  auto: 0,
  readout: null,
  ui: {},
};
let model = build(st.text);

function retext(api, text) {
  st.text = text;
  model = build(text);
  st.step = model.steps.length;
  if (st.ui.step) {
    st.ui.step.input.max = model.steps.length;
    st.ui.step.set(st.step);
  }
  api.invalidate();
}

// The forest after `k` merges: what is still separate.
function forestAt(k) {
  let pool = model.leaves.slice();
  for (let i = 0; i < k && i < model.steps.length; i++) {
    const { a, b, node } = model.steps[i];
    pool = pool.filter((x) => x !== a && x !== b);
    pool.push(node);
  }
  return pool;
}

function leafCount(n) {
  return n.leaf ? 1 : leafCount(n.left) + leafCount(n.right);
}
function depthOf(n) {
  return n.leaf ? 0 : 1 + Math.max(depthOf(n.left), depthOf(n.right));
}

function drawForest(ctx, w, h, col, bg, k) {
  const forest = forestAt(k);
  const total = forest.reduce((s, n) => s + leafCount(n), 0);
  const maxDepth = Math.max(1, ...forest.map(depthOf));
  const slot = (w - 24) / Math.max(1, total);
  const top = 30, rowH = Math.min(46, (h - 80) / (maxDepth + 1));
  const bottom = top + maxDepth * rowH;
  let x = 12;
  const r = clamp(slot * 0.38, 7, 15);
  const newest = k > 0 ? model.steps[k - 1].node : null;
  for (const tree of forest) {
    const place = (n) => {
      if (n.leaf) {
        const px = x + slot / 2;
        x += slot;
        return [px, bottom];
      }
      const L = place(n.left), R = place(n.right);
      const y = bottom - (depthOf(n)) * rowH;
      const px = (L[0] + R[0]) / 2;
      ctx.strokeStyle = n === newest ? col.accent : alpha(col['label-secondary'], 0.6);
      ctx.lineWidth = n === newest ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(L[0], L[1]);
      ctx.lineTo(px, y);
      ctx.lineTo(R[0], R[1]);
      ctx.stroke();
      if (slot > 14) {
        label(ctx, '0', (L[0] + px) / 2 - 6, (L[1] + y) / 2, col['hiw-ink-1'], bg, { size: 10 });
        label(ctx, '1', (R[0] + px) / 2 + 6, (R[1] + y) / 2, col['hiw-ink-2'], bg, { size: 10 });
      }
      ctx.beginPath();
      ctx.arc(px, y, r * 0.75, 0, Math.PI * 2);
      ctx.fillStyle = n === newest ? col.accent : col['bg-elevated-2'];
      ctx.fill();
      label(ctx, String(n.n), px, y, n === newest ? col['hiw-scene-bg'] : col.label, null, { size: 10, align: 'center' });
      return [px, y];
    };
    place(tree);
  }
  // Leaves on top of the lines.
  x = 12;
  for (const tree of forest) {
    const leaves = [];
    const collect = (n) => (n.leaf ? leaves.push(n) : (collect(n.left), collect(n.right)));
    collect(tree);
    for (const leaf of leaves) {
      const px = x + slot / 2;
      x += slot;
      ctx.beginPath();
      ctx.arc(px, bottom, r, 0, Math.PI * 2);
      ctx.fillStyle = col['hiw-ink-1'];
      ctx.fill();
      label(ctx, shown(leaf.ch), px, bottom, col['hiw-scene-bg'], null, { size: Math.min(13, r * 1.2), weight: 700, align: 'center' });
      label(ctx, String(leaf.n), px, bottom + r + 10, col['label-tertiary'], bg, { size: 10, align: 'center' });
    }
  }
}

function drawBars(ctx, w, h, col, bg) {
  const cs = counts(st.text).sort((a, b) => b.n - a.n);
  const max = Math.max(1, ...cs.map((c) => c.n));
  const bw = Math.min(28, (w - 24) / Math.max(1, cs.length));
  const base = h * 0.8;
  cs.forEach((c, i) => {
    const x = 12 + i * bw;
    const bh = (c.n / max) * h * 0.6;
    ctx.fillStyle = i < 3 ? col.accent : alpha(col['hiw-ink-1'], 0.7);
    ctx.fillRect(x + 2, base - bh, bw - 4, bh);
    label(ctx, shown(c.ch), x + bw / 2, base + 12, col.label, bg, { size: 12, align: 'center' });
    label(ctx, String(c.n), x + bw / 2, base - bh - 10, col['label-tertiary'], bg, { size: 10, align: 'center' });
  });
}

function drawBits(ctx, w, h, col, bg, encoded) {
  // The text as bits, coloured by character, eight to a letter or by its code.
  const chars = [...st.text];
  const table = codes(model.root);
  const cell = clamp(Math.floor(Math.sqrt((w * h * 0.55) / Math.max(1, chars.length * 8))), 3, 12);
  const perRow = Math.floor((w - 24) / cell);
  let i = 0;
  const palette = [col['hiw-ink-1'], col['hiw-ink-2'], col['hiw-ink-3'], col['hiw-ink-4'], col.accent];
  const index = new Map(counts(st.text).map((c, k) => [c.ch, k]));
  chars.forEach((ch) => {
    const bits = encoded ? table.get(ch) || '' : [...new TextEncoder().encode(ch)].map((b) => b.toString(2).padStart(8, '0')).join('');
    for (const b of bits) {
      const x = 12 + (i % perRow) * cell, y = 40 + Math.floor(i / perRow) * cell;
      ctx.fillStyle = alpha(palette[index.get(ch) % palette.length], b === '1' ? 0.95 : 0.35);
      ctx.fillRect(x, y, cell - 1, cell - 1);
      i++;
    }
  });
  label(ctx, encoded ? `Huffman coded: ${fmt(i)} bits` : `Stored normally: ${fmt(i)} bits`, 12, 20, col.label, bg, { size: 13 });
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  let moving = false;
  if (ch === 'huffman' && api.playing && api.motion && st.step < model.steps.length) {
    st.auto += dt;
    if (st.auto > 0.9) {
      st.auto = 0;
      st.step++;
      st.ui.step?.set(st.step);
    }
    moving = true;
  }
  if (ch === 'bits') drawBits(ctx, w, h, col, bg, false);
  else if (ch === 'frequent') drawBars(ctx, w, h, col, bg);
  else if (ch === 'huffman') drawForest(ctx, w, h, col, bg, st.step);
  else if (ch === 'result') drawBits(ctx, w, h, col, bg, true);
  else if (ch === 'limits') drawBits(ctx, w, h, col, bg, true);

  const r = st.readout;
  if (r) {
    const chars = [...st.text];
    const plain = chars.reduce((s, c) => s + utf8Bits(c), 0);
    const table = codes(model.root);
    const packed = chars.reduce((s, c) => s + (table.get(c) || '').length, 0);
    r.set('chars', fmt(chars.length));
    r.set('plain', `${fmt(plain)} bits`);
    r.set('distinct', fmt(counts(st.text).length));
    r.set('packed', `${fmt(packed)} bits`);
    r.set('saved', plain ? `${fmt((1 - packed / plain) * 100)}%` : '–');
    r.set('avg', chars.length ? `${fmt(packed / chars.length, 2)} bits` : '–');
    r.set('entropy', chars.length ? `${fmt(entropy(st.text), 2)} bits` : '–');
    r.set('step', `${st.step} of ${model.steps.length}`);
  }
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  st.ui = {};
  api.status('');
  api.note({ bits: 'Each square is one bit', frequent: 'How often each character appears', huffman: 'Join the two smallest, again and again', result: 'Each square is one bit', limits: '' }[id]);
  ui.text({ label: 'Text to compress', value: st.text, maxLength: 160, onInput: (v) => retext(api, v) });
  if (id === 'huffman') {
    st.step = 0;
    st.auto = 0;
    st.ui.step = ui.slider({ label: 'Merges', min: 0, max: model.steps.length, value: 0, onInput: (v) => { st.step = v; api.invalidate(); } });
  } else st.step = model.steps.length;
  if (id === 'limits') {
    ui.button({
      label: 'Random letters',
      onClick() {
        const abc = 'abcdefghijklmnopqrstuvwxyz';
        let s = '';
        for (let i = 0; i < 60; i++) s += abc[Math.floor(Math.random() * 26)];
        retext(api, s);
        document.querySelector('.hiw-text-field input').value = s;
      },
    });
    ui.button({
      label: 'One letter, repeated',
      onClick() {
        const s = 'a'.repeat(60);
        retext(api, s);
        document.querySelector('.hiw-text-field input').value = s;
      },
    });
  }
  const rows = {
    bits: [{ key: 'chars', label: 'Characters' }, { key: 'plain', label: 'Stored normally' }],
    frequent: [{ key: 'chars', label: 'Characters' }, { key: 'distinct', label: 'Different characters' }],
    huffman: [{ key: 'step', label: 'Merges' }],
    result: [{ key: 'plain', label: 'Stored normally' }, { key: 'packed', label: 'Huffman coded' }, { key: 'saved', label: 'Saved' }, { key: 'avg', label: 'Bits a character' }],
    limits: [{ key: 'avg', label: 'Bits a character' }, { key: 'entropy', label: 'The limit (entropy)' }, { key: 'saved', label: 'Saved' }],
  }[id];
  st.readout = api.readout(rows);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
