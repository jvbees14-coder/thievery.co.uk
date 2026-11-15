// ---------------------------------------------------------------------------
// The Enigma machine: the scene.
//
// A real three-rotor army machine (machine.js), drawn as the current flows
// through it: keyboard, plugboard, rotors III, II and I, the reflector, and
// back out to a lamp. Chapter 3 draws the whole scramble at one rotor
// position as thirteen swapped pairs; chapter 4 counts the settings; chapter
// 5 slides a guessed word along a real ciphertext, which is how the codebreakers
// found where it could sit.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, clamp } from '../engine.js';
import { label, setFace, box, TOKENS } from '../shared/draw.js';
import { ABC, machine } from './machine.js';

const SETTINGS = { rotors: ['I', 'II', 'III'], start: 'AAA', rings: 'AAA', plugs: 'AQ EP' };
// Chapter 5: a real enciphering of a plausible weather message.
const CRIB_SETTINGS = { rotors: ['II', 'IV', 'I'], start: 'RDK', rings: 'AAA', plugs: 'AV BS CG DL FU HZ IN KM OW RX' };
const CRIB_PLAIN = 'KEINEBESONDERENVORKOMMNISSEXWETTERVORHERSAGEXREGEN';
const CRIB = 'WETTERVORHERSAGE';
const CIPHER = machine(CRIB_SETTINGS).type(CRIB_PLAIN);
const TRUE_AT = CRIB_PLAIN.indexOf(CRIB);

const st = {
  text: '',
  out: '',
  path: null,
  window: 'AAA',
  settings: SETTINGS,
  presses: 0,      // chapter 3: how many keys pressed before the scramble shown
  plugs: 10,
  offset: 0,
  readout: null,
};

const group = (s) => s.replace(/(.{5})/g, '$1 ').trim();

function retype() {
  const m = machine(st.settings);
  let out = '', path = null;
  for (const ch of st.text.toUpperCase()) {
    const r = m.press(ch);
    if (r) {
      out += r.out;
      path = r.path;
    }
  }
  st.out = out;
  st.path = path;
  st.window = m.window;
}

// The whole scramble after `presses` key presses: where each letter goes.
function scramble(presses) {
  const m = machine(SETTINGS);
  for (let i = 0; i < presses; i++) m.press('A');
  return m.wiring();
}

function plugCount(k) {
  let n = 1n;
  // 26! / ((26-2k)! k! 2^k)
  for (let i = 26 - 2 * k + 1; i <= 26; i++) n *= BigInt(i);
  for (let i = 2; i <= k; i++) n /= BigInt(i);
  return n / 2n ** BigInt(k);
}
const big = (n) => n.toLocaleString('en-GB');

// --- drawing ---

function drawCircuit(ctx, w, h, col, bg) {
  // On a narrow scene the part names go underneath, clear of the Play button.
  const small = w < 600;
  const top = small ? 50 : 66, rowH = (h - top - (small ? 30 : 14)) / 26;
  const names = ['Keys', 'Plugboard', 'Rotor III', 'Rotor II', 'Rotor I', 'Reflector'];
  const left = 26, right = w - 12;
  const bx = (i) => left + (i / 5) * (right - left - 24);
  const Y = (c) => top + (c + 0.5) * rowH;
  // The parts.
  for (let i = 1; i <= 5; i++) {
    const x0 = bx(i - 1) + 8, x1 = i === 5 ? right : bx(i) - 8;
    box(ctx, x0, top - 4, x1 - x0, rowH * 26 + 8, 6);
    ctx.fillStyle = col['bg-elevated'];
    ctx.fill();
    ctx.strokeStyle = col.separator;
    ctx.stroke();
    const name = small ? ['', 'Plugs', 'III', 'II', 'I', 'Refl.'][i] : names[i];
    label(ctx, name, (x0 + x1) / 2, small ? top + rowH * 26 + 18 : top - 16, col['label-secondary'], bg, { size: 12, align: 'center' });
  }
  // The letters down the keyboard side.
  for (let c = 0; c < 26; c++) {
    const lit = st.path && (c === st.path[0] || c === st.path[9]);
    // Too tight to letter every key: only the two lit ones, and A and Z.
    if (rowH < 12 && !lit && c !== 0 && c !== 25) continue;
    const colr = st.path && c === st.path[9] ? col.accent : st.path && c === st.path[0] ? col['hiw-ink-1'] : col['label-tertiary'];
    label(ctx, ABC[c], 12, Y(c), colr, null, { size: rowH > 13 ? 12 : 10, weight: lit ? 800 : 600, align: 'center', mono: true });
  }
  const p = st.path;
  if (!p) return;
  const xs = [bx(0), bx(1), bx(2), bx(3), bx(4)];
  const fwd = [0, 1, 2, 3, 4].map((i) => [xs[i], Y(p[i])]);
  const bck = [4, 3, 2, 1, 0].map((i, k) => [xs[i], Y(p[5 + k])]);
  const line = (pts, colr) => {
    ctx.strokeStyle = colr;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      if (!i) return ctx.moveTo(x, y);
      const [px, py] = pts[i - 1];
      const mx = (px + x) / 2;
      ctx.bezierCurveTo(mx, py, mx, y, x, y);
    });
    ctx.stroke();
  };
  line(fwd, col['hiw-ink-1']);
  line(bck, col.accent);
  // The turn in the reflector.
  const rx = xs[4] + (right - xs[4]) * 0.6;
  ctx.strokeStyle = col['label-secondary'];
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(xs[4], Y(p[4]));
  ctx.lineTo(rx, Y(p[4]));
  ctx.lineTo(rx, Y(p[5]));
  ctx.lineTo(xs[4], Y(p[5]));
  ctx.stroke();
}


function drawPairs(ctx, w, h, col, bg) {
  const map = st.map;
  const cx = w / 2, cy = h / 2 + 22, R = Math.min(w, h - 60) * 0.4;
  const at = (c) => {
    const a = (c / 26) * Math.PI * 2 - Math.PI / 2;
    return [cx + Math.cos(a) * R, cy + Math.sin(a) * R];
  };
  ctx.lineWidth = 1.8;
  for (let c = 0; c < 26; c++) {
    const d = map[c];
    if (d < c) continue;
    const [x1, y1] = at(c), [x2, y2] = at(d);
    ctx.strokeStyle = alpha(c % 2 ? col['hiw-ink-1'] : col['hiw-ink-2'], 0.85);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cx, cy, x2, y2);
    ctx.stroke();
  }
  for (let c = 0; c < 26; c++) {
    const [x, y] = at(c);
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fillStyle = col['bg-elevated-2'];
    ctx.fill();
    label(ctx, ABC[c], x, y, col.label, null, { size: 12, weight: 700, align: 'center', mono: true });
  }
}

function drawSpace(ctx, w, h, col, bg) {
  // Three factors, as bars on a scale of powers of ten.
  const parts = [
    { name: 'Which rotors, in which order', n: 60n },
    { name: 'Where each rotor starts', n: 17576n },
    { name: `Plugboard, ${st.plugs} cable${st.plugs === 1 ? '' : 's'}`, n: plugCount(st.plugs) },
  ];
  const total = parts.reduce((a, p) => a * p.n, 1n);
  const lg = (n) => n.toString().length - 1 + Math.log10(Number('0.' + n.toString().slice(0, 8)) * 10);
  const max = 21;
  const x0 = 20, x1 = w - 20;
  const X = (v) => x0 + (v / max) * (x1 - x0);
  let y = 72;
  for (const p of [...parts, { name: 'All together', n: total, total: true }]) {
    label(ctx, p.name, x0, y, col.label, bg, { size: 13, weight: 700 });
    label(ctx, big(p.n), x1, y, p.total ? col.accent : col['label-secondary'], bg, { size: 12, align: 'right', mono: true });
    const v = p.n > 1n ? lg(p.n) : 0;
    box(ctx, x0, y + 12, Math.max(2, X(v) - x0), 14, 4);
    ctx.fillStyle = p.total ? col.accent : col['hiw-ink-1'];
    ctx.fill();
    y += Math.max(58, Math.min(90, (h - 170) / 4));
  }
  // The scale.
  ctx.strokeStyle = col.separator;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  for (let e = 0; e <= max; e += 3) {
    ctx.beginPath();
    ctx.moveTo(X(e), y - 4);
    ctx.lineTo(X(e), y + 4);
    ctx.stroke();
    label(ctx, e ? `10${sup(e)}` : '1', X(e), y + 16, col['label-tertiary'], bg, { size: 11, align: 'center' });
  }
  st.total = total;
}
const sup = (n) => String(n).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);

function drawCrib(ctx, w, h, col, bg) {
  const cell = Math.max(17, Math.min(26, (w - 24) / CIPHER.length));
  const fit = Math.floor((w - 24) / cell);
  const start = clamp(st.offset - Math.floor((fit - CRIB.length) / 2), 0, Math.max(0, CIPHER.length - fit));
  const x0 = 12, y0 = h * 0.38;
  let clashes = 0;
  for (let i = start; i < Math.min(CIPHER.length, start + fit); i++) {
    const x = x0 + (i - start) * cell;
    const k = i - st.offset;
    const under = k >= 0 && k < CRIB.length ? CRIB[k] : null;
    const clash = under === CIPHER[i];
    if (clash) clashes++;
    box(ctx, x + 1, y0 - 14, cell - 2, 28, 3);
    ctx.fillStyle = clash ? alpha(col.danger, 0.35) : col['bg-elevated'];
    ctx.fill();
    label(ctx, CIPHER[i], x + cell / 2, y0, col.label, null, { size: 13, weight: 700, align: 'center', mono: true });
    if (under) {
      box(ctx, x + 1, y0 + 20, cell - 2, 28, 3);
      ctx.fillStyle = clash ? alpha(col.danger, 0.35) : alpha(col.accent, 0.18);
      ctx.fill();
      label(ctx, under, x + cell / 2, y0 + 34, clash ? col.danger : col.accent, null, { size: 13, weight: 700, align: 'center', mono: true });
    }
  }
  label(ctx, 'Intercepted', x0, y0 - 30, col['label-tertiary'], bg, { size: 11 });
  label(ctx, 'Guessed word', x0, y0 + 64, col['label-tertiary'], bg, { size: 11 });
  // Every place at once, as a strip of ticks.
  const places = CIPHER.length - CRIB.length + 1;
  const sy = h - 40, sw = (w - 24) / places;
  for (let o = 0; o < places; o++) {
    const ok = possible(o);
    ctx.fillStyle = o === st.offset ? col.accent : ok ? col.success : alpha(col.danger, 0.5);
    ctx.fillRect(x0 + o * sw + 1, sy, sw - 2, o === st.offset ? 18 : 12);
  }
  label(ctx, 'Every place it could sit: green is still possible', x0, sy - 12, col['label-tertiary'], bg, { size: 11 });
  return clashes;
}
function possible(o) {
  for (let i = 0; i < CRIB.length; i++) if (CIPHER[o + i] === CRIB[i]) return false;
  return true;
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;

  if (ch === 'circuit' || ch === 'rotors') {
    drawCircuit(ctx, w, h, col, bg);
    r?.set('typed', st.text ? group(st.text.toUpperCase().replace(/[^A-Z]/g, '')) : '–');
    r?.set('out', st.out ? group(st.out) : '–');
    r?.set('window', st.window);
  } else if (ch === 'never') {
    drawPairs(ctx, w, h, col, bg);
    const self = st.map.filter((d, c) => d === c).length;
    r?.set('presses', fmt(st.presses));
    r?.set('self', String(self));
  } else if (ch === 'keys') {
    drawSpace(ctx, w, h, col, bg);
    const d = st.total.toString();
    r?.set('total', d.length > 6 ? `about ${d[0]}.${d.slice(1, 3)} × 10${sup(d.length - 1)}` : big(st.total));
  } else if (ch === 'broken') {
    const clashes = drawCrib(ctx, w, h, col, bg);
    const places = CIPHER.length - CRIB.length + 1;
    let n = 0;
    for (let o = 0; o < places; o++) if (possible(o)) n++;
    r?.set('here', clashes ? `No: ${clashes} letter${clashes === 1 ? '' : 's'} would be ${clashes === 1 ? 'itself' : 'themselves'}` : 'Yes');
    r?.set('left', `${n} of ${places}`);
  }
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({
    circuit: 'Rotors I, II, III; plugboard A–Q, E–P',
    rotors: 'Rotors I, II, III; no cables in the plugboard',
    never: 'Every letter’s partner, at one rotor position',
    keys: 'The settings a clerk chose each day',
    broken: 'A real enciphered message and a guessed word',
  }[id]);
  if (id === 'circuit') {
    st.settings = SETTINGS;
    st.text = 'HELLO';
    retype();
    ui.text({
      label: 'Type a message',
      value: st.text,
      maxLength: 60,
      onInput(v) {
        st.text = v;
        retype();
        api.invalidate();
      },
    });
    st.readout = api.readout([{ key: 'typed', label: 'Typed' }, { key: 'out', label: 'Lamps' }, { key: 'window', label: 'Rotors show' }]);
  } else if (id === 'rotors') {
    st.settings = { ...SETTINGS, plugs: '' };
    st.text = '';
    retype();
    ui.button({
      label: 'Press A',
      onClick() {
        if (st.text.length >= 60) st.text = '';
        st.text += 'A';
        retype();
        api.status(`A lit ${st.out.slice(-1)}.`);
        api.invalidate();
      },
    });
    ui.button({ label: 'Start again', onClick() { st.text = ''; retype(); api.invalidate(); } });
    st.readout = api.readout([{ key: 'typed', label: 'Typed' }, { key: 'out', label: 'Lamps' }, { key: 'window', label: 'Rotors show' }]);
  } else if (id === 'never') {
    st.presses = 0;
    st.map = scramble(0);
    ui.button({
      label: 'Press a key',
      onClick() {
        st.presses++;
        st.map = scramble(st.presses);
        api.invalidate();
      },
    });
    st.readout = api.readout([{ key: 'presses', label: 'Keys pressed' }, { key: 'self', label: 'Letters that come out as themselves' }]);
  } else if (id === 'keys') {
    ui.slider({
      label: 'Plugboard cables',
      min: 0,
      max: 13,
      value: st.plugs,
      onInput(v) {
        st.plugs = v;
        api.invalidate();
      },
    });
    st.readout = api.readout([{ key: 'total', label: 'Possible settings' }]);
  } else if (id === 'broken') {
    st.offset = 0;
    const places = CIPHER.length - CRIB.length + 1;
    const slider = ui.slider({
      label: 'Slide the word along',
      min: 0,
      max: places - 1,
      value: 0,
      format: (v) => `Place ${v + 1}`,
      onInput(v) {
        st.offset = v;
        api.invalidate();
      },
    });
    ui.button({
      label: 'Where it really is',
      onClick() {
        st.offset = TRUE_AT;
        slider.set(TRUE_AT);
        api.invalidate();
      },
    });
    st.readout = api.readout([{ key: 'here', label: 'Could it sit here?' }, { key: 'left', label: 'Places still possible' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
