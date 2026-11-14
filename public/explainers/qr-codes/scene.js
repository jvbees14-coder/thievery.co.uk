// ---------------------------------------------------------------------------
// How a QR code works: the scene.
//
// A real QR code for whatever the reader types (qr.js), drawn dark on light
// with its quiet border in every scheme, so it can be scanned off the
// screen. Chapter 1 colours each module by its job; chapter 2 lays the data
// in along its zigzag; chapter 3 changes the error-correction level;
// chapter 4 tries the eight masks; chapter 5 covers part of it.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { encode, LEVELS, RECOVERS } from './qr.js';

const st = {
  text: 'https://thievery.co.uk/how-it-works/qr-codes',
  ecl: 'M',
  mask: null,
  progress: 1,
  cover: false,
  code: null,
  readout: null,
};

function refresh(api) {
  st.code = encode(st.text, st.ecl, st.mask);
  api?.invalidate();
}

const KINDS = {
  finder: ['accent', 'Finder patterns'],
  separator: [null, null],
  timing: ['hiw-ink-3', 'Timing lines'],
  alignment: ['hiw-ink-4', 'Alignment'],
  format: ['hiw-ink-2', 'Format: level and mask'],
  version: ['hiw-ink-2', 'Version'],
  dark: ['hiw-ink-2', null],
  data: ['label', 'Your data'],
  ecc: ['hiw-ink-1', 'Error correction'],
};

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const q = st.code;
  let moving = false;
  if (!q) {
    label(ctx, 'Too long for this page’s codes. Try something shorter.', w / 2, h / 2, col.danger, bg, { size: 13, align: 'center' });
    return false;
  }
  const quiet = 4;
  const n = q.size + quiet * 2;
  const side = Math.min(w, h) * 0.86;
  const cell = Math.floor(side / n) || 1;
  const x0 = Math.round((w - cell * n) / 2), y0 = Math.round((h - cell * n) / 2);
  const coloured = ch === 'anatomy' || ch === 'data';

  if (ch === 'data' && st.progress < 1 && api.playing && api.motion) {
    st.progress = Math.min(1, st.progress + dt / 7);
    moving = true;
  }
  const shownBits = st.progress * (q.dataCount + q.eccCount) * 8;

  // The quiet border and the light background, always light.
  ctx.fillStyle = col.stock;
  ctx.fillRect(x0, y0, cell * n, cell * n);
  for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) {
    const k = q.kind[y][x];
    let dark = q.modules[y][x];
    let ink = col['stock-ink'];
    if (coloured) {
      const token = KINDS[k]?.[0];
      if (token && token !== 'label') ink = col[token];
      if (ch === 'data') {
        const o = q.order[y][x];
        if (o >= 0 && o >= shownBits) continue;
        if (k === 'data' || k === 'ecc') ink = k === 'ecc' ? col['hiw-ink-1'] : col['stock-ink'];
      }
    }
    if (!dark) {
      if (coloured && k !== 'data' && k !== 'ecc' && k !== 'separator' && KINDS[k]?.[0]) {
        ctx.fillStyle = alpha(col[KINDS[k][0]], 0.18);
        ctx.fillRect(x0 + (x + quiet) * cell, y0 + (y + quiet) * cell, cell, cell);
      }
      continue;
    }
    ctx.fillStyle = ink;
    ctx.fillRect(x0 + (x + quiet) * cell, y0 + (y + quiet) * cell, cell, cell);
  }

  // The zigzag's path, drawn faintly over the data in chapter 2.
  if (ch === 'data') {
    const pts = [];
    for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.order[y][x] >= 0 && q.order[y][x] < shownBits) pts[q.order[y][x]] = [x, y];
    ctx.beginPath();
    pts.forEach((p, i) => {
      if (!p) return;
      const px = x0 + (p[0] + quiet + 0.5) * cell, py = y0 + (p[1] + quiet + 0.5) * cell;
      if (i && pts[i - 1]) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    ctx.strokeStyle = alpha(col.danger, 0.55);
    ctx.lineWidth = Math.max(1, cell * 0.2);
    ctx.stroke();
  }

  // Chapter 5: a patch over the middle, sized to well within what the level can mend.
  if (ch === 'damage' && st.cover) {
    const share = (RECOVERS[st.ecl] / 100) * 0.5;
    const s = Math.floor(Math.sqrt(share * q.size * q.size * 0.55));
    const c = Math.floor((q.size - s) / 2);
    ctx.fillStyle = col.stock;
    ctx.fillRect(x0 + (c + quiet) * cell, y0 + (c + quiet) * cell, s * cell, s * cell);
    ctx.strokeStyle = col['stock-red'];
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 + (c + quiet) * cell, y0 + (c + quiet) * cell, s * cell, s * cell);
    ctx.fillStyle = col['stock-red'];
    ctx.font = `700 ${Math.max(10, s * cell * 0.22)}px ${col['font-text'] || 'system-ui'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('T', x0 + (c + quiet + s / 2) * cell, y0 + (c + quiet + s / 2) * cell);
  }

  if (ch === 'anatomy' && w > 560) {
    let ly = y0 + 10;
    for (const [k, [token, name]] of Object.entries(KINDS)) {
      if (!name || (k === 'version' && q.ver < 7)) continue;
      ctx.fillStyle = token === 'label' ? col.label : col[token];
      ctx.fillRect(x0 + n * cell + 16, ly - 6, 12, 12);
      label(ctx, name, x0 + n * cell + 34, ly, col['label-secondary'], bg, { size: 12 });
      ly += 22;
    }
  }

  const r = st.readout;
  if (r) {
    r.set('ver', `${q.ver} (${q.size} × ${q.size})`);
    r.set('bytes', `${fmt(q.bytes)} of ${fmt(q.capacity - 2)}`);
    r.set('data', fmt(q.dataCount));
    r.set('ecc', fmt(q.eccCount));
    r.set('mends', `about ${RECOVERS[st.ecl]}%`);
    r.set('mask', `${q.mask}${st.mask === null ? ' (lowest penalty)' : ''}`);
    r.set('penalty', fmt(q.penalties[q.mask]));
  }
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.mask = null;
  st.cover = false;
  st.progress = id === 'data' && api.motion ? 0 : 1;
  api.note({ anatomy: 'A real, scannable code', data: 'The red line is the order the bits go in', ecc: 'A real, scannable code', masks: 'A real, scannable code', damage: 'A real code, with part of it covered' }[id]);
  ui.text({ label: 'Text or link to encode', value: st.text, maxLength: 120, onInput: (v) => { st.text = v; st.progress = 1; refresh(api); } });
  if (id === 'data') ui.button({ label: 'Lay the bits in again', onClick: () => { st.progress = 0; api.invalidate(); } });
  if (id === 'ecc' || id === 'damage') {
    ui.choice({ label: 'Error correction', options: LEVELS.map((l) => ({ id: l, label: `${l}, ${RECOVERS[l]}%` })), value: st.ecl, onChange: (l) => { st.ecl = l; refresh(api); } });
  }
  if (id === 'masks') {
    ui.choice({
      label: 'Mask',
      options: [{ id: 'best', label: 'Best' }, ...[0, 1, 2, 3, 4, 5, 6, 7].map((m) => ({ id: String(m), label: String(m) }))],
      value: 'best',
      onChange: (m) => { st.mask = m === 'best' ? null : Number(m); refresh(api); },
    });
  }
  if (id === 'damage') ui.toggle({ label: 'Cover the middle', checked: false, onChange: (on) => { st.cover = on; api.invalidate(); } });
  const rows = {
    anatomy: [{ key: 'ver', label: 'Version' }, { key: 'bytes', label: 'Bytes used' }],
    data: [{ key: 'data', label: 'Data codewords' }, { key: 'ecc', label: 'Error-correction codewords' }],
    ecc: [{ key: 'ver', label: 'Version' }, { key: 'data', label: 'Data codewords' }, { key: 'ecc', label: 'Error-correction codewords' }, { key: 'mends', label: 'Can mend' }],
    masks: [{ key: 'mask', label: 'Mask' }, { key: 'penalty', label: 'Penalty' }],
    damage: [{ key: 'mends', label: 'Can mend' }, { key: 'ver', label: 'Version' }],
  }[id];
  st.readout = api.readout(rows);
  refresh(api);
}

mount({ colours: TOKENS, chapter, draw });
