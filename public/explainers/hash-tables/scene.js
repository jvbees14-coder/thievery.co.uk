// ---------------------------------------------------------------------------
// How computers find things instantly: the scene.
//
// A table of buckets and some names. A hash function turns each name into a
// bucket number; looking a name up means hashing it and checking one
// bucket. Two hash functions: FNV-1a, a real one, and the first letter
// alone, which clumps. Chapter 3 grows the table when it fills.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, box, TOKENS } from '../shared/draw.js';

const NAMES = ('Ada Alan Amir Anna Ben Bea Cara Chen Dan Dina Eli Emma Finn Fay Gus Grace Hana Hugo Ivy Ian Jack Jo Kai Kate Leo Lily Max Maya Ned Nora Omar Olga Pete Pia Quin Rosa Ravi Sam Sara Tom Tess Uma Vic Vera Wes Wren Xi Yara Yusuf Zoe Zane Abe Ali Bo Cy Di Ed Flo Gil Hal').split(' ');
// Keys that look alike, as real ones often do.
const PHOTOS = Array.from({ length: 30 }, (_, i) => `photo-${String(i + 1).padStart(3, '0')}`);
const st = { n: 12, size: 16, query: 'Maya', good: true, grow: true, readout: null };

function fnv(s) {
  let h = 0x811c9dc5;
  for (const ch of s) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
// A poor hash: only the first letter, like the tabs of an address book.
const firstLetter = (s) => s.toUpperCase().charCodeAt(0) - 65;
const hash = (s) => (st.good ? fnv(s) : firstLetter(s));

function build(names, size) {
  const buckets = Array.from({ length: size }, () => []);
  for (const n of names) buckets[hash(n) % size].push(n);
  return buckets;
}

function drawTable(ctx, w, h, col, bg, buckets, highlight) {
  const size = buckets.length, cols = size <= 16 ? 2 : 4, rows = Math.ceil(size / cols);
  const cw = (w - 30) / cols, rh = Math.min(36, (h - 100) / rows);
  buckets.forEach((items, i) => {
    const x = 15 + (i % cols) * cw, y = 70 + Math.floor(i / cols) * rh;
    const hot = i === highlight;
    box(ctx, x + 2, y + 2, 26, rh - 4, 4);
    ctx.fillStyle = hot ? col.accent : col['bg-elevated-2'];
    ctx.fill();
    label(ctx, String(i), x + 15, y + rh / 2, hot ? col['stock-ink'] : col['label-tertiary'], null, { size: 10, weight: 700, align: 'center' });
    let cx = x + 34;
    items.forEach((name, k) => {
      ctx.font = `600 ${Math.min(12, rh * 0.42)}px system-ui, sans-serif`;
      const tw = ctx.measureText(name).width + 10;
      if (cx + tw > x + cw - 4) {
        if (k === items.length - 1 || cx + 14 > x + cw - 4) return;
        label(ctx, `+${items.length - k}`, cx, y + rh / 2, col.danger, null, { size: 11, weight: 700 });
        cx = Infinity;
        return;
      }
      box(ctx, cx, y + 4, tw, rh - 8, 4);
      ctx.fillStyle = hot && name === st.query ? col.success : items.length > 1 ? alpha(col.danger, 0.25) : alpha(col['hiw-ink-1'], 0.35);
      ctx.fill();
      label(ctx, name, cx + 5, y + rh / 2, col.label, null, { size: Math.min(12, rh * 0.42), weight: 600 });
      cx += tw + 4;
    });
  });
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const ch = api.chapter;
  const r = st.readout;
  const names = (ch === 'clumping' ? PHOTOS : NAMES).slice(0, st.n);
  let size = st.size;
  if (ch === 'load' && st.grow) while (names.length / size > 0.75) size *= 2;
  const buckets = build(names, size);
  const q = st.query.trim();
  const hb = q ? hash(q) % size : -1;
  drawTable(ctx, w, h, col, null, buckets, ch === 'buckets' ? hb : -1);
  const longest = Math.max(...buckets.map((b) => b.length));
  const used = buckets.filter((b) => b.length).length;
  const avg = names.reduce((s, n) => s + buckets[hash(n) % size].indexOf(n) + 1, 0) / (names.length || 1);
  r?.set('hash', q ? `${hash(q)} → bucket ${hb}` : '–');
  r?.set('found', q ? (buckets[hb].includes(q) ? `Yes, after checking ${buckets[hb].indexOf(q) + 1}` : `No, after checking ${buckets[hb].length}`) : '–');
  r?.set('longest', String(longest));
  r?.set('empty', `${size - used} of ${size}`);
  r?.set('avg', fmt(avg, 2));
  r?.set('size', String(size));
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ buckets: 'Names filed by their hash', collisions: 'Two names, one bucket', load: 'Filling the table', clumping: 'Thirty photo names, filed by a poor hash' }[id]);
  st.good = id !== 'clumping';
  st.size = 16;
  if (id === 'buckets') {
    st.n = 12;
    ui.text({ label: 'Look up a name', value: st.query, maxLength: 20, onInput(v) { st.query = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'hash', label: 'Its hash' }, { key: 'found', label: 'In the table?' }]);
  } else if (id === 'collisions') {
    st.n = 6;
    ui.slider({ label: 'Names', min: 1, max: 30, value: st.n, onInput(v) { st.n = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'longest', label: 'Most names in one bucket' }, { key: 'empty', label: 'Empty buckets' }]);
  } else if (id === 'load') {
    st.n = 12;
    ui.slider({ label: 'Names', min: 1, max: 60, value: st.n, onInput(v) { st.n = v; api.invalidate(); } });
    ui.toggle({ label: 'Double the table when three quarters full', checked: st.grow, onChange(v) { st.grow = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'size', label: 'Buckets' }, { key: 'avg', label: 'Average names checked to find one' }, { key: 'longest', label: 'Longest chain' }]);
  } else if (id === 'clumping') {
    st.n = 30;
    ui.toggle({ label: 'Use a good hash instead', checked: false, onChange(v) { st.good = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'longest', label: 'Most names in one bucket' }, { key: 'empty', label: 'Empty buckets' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
