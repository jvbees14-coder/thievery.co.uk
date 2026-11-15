// ---------------------------------------------------------------------------
// Hiding a message in a picture: the scene.
//
// Chapter 1 is one pixel's brightness as eight bits. Chapter 2 hides the
// reader's message in the picture's lowest bits and shows the picture
// before and after. Chapter 3 shows any one of the eight bit layers on its
// own. Chapter 4 shows the lowest layer with the message in it.
// ---------------------------------------------------------------------------

import { mount, fmt } from '../engine.js';
import { label, setFace, box, mix, TOKENS } from '../shared/draw.js';
import { W, H, picture, hide, reveal, paint, bytesOf } from './art.js';

const PIC = picture();
const st = { text: 'Meet me at the old mill at nine', value: 173, plane: 7, readout: null };

function hidden() {
  return hide(PIC, st.text.slice(0, 120));
}

function drawBits(ctx, w, h, col, bg) {
  const v = st.value, cell = Math.min(56, (w - 40) / 8), x0 = (w - cell * 8) / 2, y = h * 0.5;
  for (let k = 0; k < 8; k++) {
    const bit = (v >> (7 - k)) & 1;
    box(ctx, x0 + k * cell + 3, y, cell - 6, cell - 6, 6);
    ctx.fillStyle = k === 7 ? col.accent : bit ? col['hiw-ink-1'] : col['bg-elevated'];
    ctx.fill();
    label(ctx, String(bit), x0 + k * cell + cell / 2, y + cell / 2 - 3, bit || k === 7 ? col['stock-ink'] : col.label, null, { size: 18, weight: 800, align: 'center', mono: true });
    label(ctx, String(2 ** (7 - k)), x0 + k * cell + cell / 2, y + cell + 8, col['label-tertiary'], bg, { size: 11, align: 'center' });
  }
  // The two shades, with and without the last bit.
  const sw = Math.min(120, w * 0.3);
  for (const [k, vv, name] of [[0, v & 0xfe, `${v & 0xfe}`], [1, v | 1, `${v | 1}`]]) {
    const x = w / 2 - sw - 10 + k * (sw + 20);
    box(ctx, x, 80, sw, sw * 0.6, 8);
    ctx.fillStyle = mix(col.back, col.stock, vv / 255);
    ctx.fill();
    label(ctx, name, x + sw / 2, 80 + sw * 0.6 + 14, col['label-secondary'], bg, { size: 12, align: 'center' });
  }
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  if (ch === 'bits') {
    drawBits(ctx, w, h, col, bg);
    r?.set('value', `${st.value} of 255`);
    return false;
  }
  const { out, used } = hidden();
  if (ch === 'hide') {
    const half = (h - 110) / 2;
    label(ctx, 'Before', 16, 74, col['label-secondary'], bg, { size: 11 });
    paint(ctx, 16, 82, w - 32, half - 20, PIC, col, mix);
    label(ctx, 'After: the message is in here', 16, 82 + half + 2, col['label-secondary'], bg, { size: 11 });
    paint(ctx, 16, 82 + half + 10, w - 32, half - 20, out, col, mix);
    let changed = 0;
    for (let i = 0; i < PIC.length; i++) if (PIC[i] !== out[i]) changed++;
    r?.set('bytes', `${bytesOf(st.text.slice(0, 120)).length} bytes, ${used} bits`);
    r?.set('changed', `${fmt(changed)} of ${fmt(W * H)}`);
    r?.set('read', reveal(out));
  } else if (ch === 'planes') {
    const k = st.plane;
    paint(ctx, 16, 74, w - 32, h - 100, out, col, mix, (v) => (v >> k) & 1);
  } else if (ch === 'traces') {
    paint(ctx, 16, 74, w - 32, h - 100, out, col, mix, (v, x, y) => ((y * W + x < used ? 0.15 : 0) + (v & 1) * 0.85));
    r?.set('rows', `${fmt(used / W, 1)} rows of ${H}`);
  }
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ bits: 'One pixel’s brightness, as eight bits', hide: 'The picture, before and after', planes: 'One layer of bits on its own', traces: 'The lowest layer, message included' }[id]);
  if (id === 'bits') {
    ui.slider({ label: 'Brightness', min: 0, max: 255, value: st.value, onInput(v) { st.value = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'value', label: 'Brightness' }]);
  } else if (id === 'hide') {
    ui.text({ label: 'Your message', value: st.text, maxLength: 120, onInput(v) { st.text = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'bytes', label: 'Message' }, { key: 'changed', label: 'Pixels changed by one shade' }, { key: 'read', label: 'Read back' }]);
  } else if (id === 'planes') {
    ui.slider({ label: 'Bit layer', min: 0, max: 7, value: st.plane, format: (v) => (v === 7 ? 'Top (128s)' : v === 0 ? 'Lowest (1s)' : `${2 ** v}s`), onInput(v) { st.plane = v; api.invalidate(); } });
  } else if (id === 'traces') {
    ui.text({ label: 'Your message', value: st.text, maxLength: 120, onInput(v) { st.text = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'rows', label: 'Message fills' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
