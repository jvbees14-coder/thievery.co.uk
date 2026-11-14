// ---------------------------------------------------------------------------
// How passwords are cracked: the scene.
//
// The reader's password (or the example) is hashed for real, and its 256
// bits drawn as a grid; a change of one letter lights up the half of them
// that flip. Later chapters turn the same password into a size of search,
// and that into a time on one graphics card, for fast and slow hashes.
// Nothing typed leaves the page, and the field is not remembered.
// ---------------------------------------------------------------------------

import { mount, Smooth, fmt } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { SPEEDS, sha256, hex, searchSize, isCommon, duration, drawBits } from './art.js';

const st = {
  pw: 'thievery',
  bytes: null,
  prev: null,
  flash: new Smooth(0, 2.5),
  flipped: 0,
  speed: 'md5',
  salt: false,
  saltA: 'k3P9',
  saltB: 'Zq71',
  pairA: null,
  pairB: null,
  readout: null,
  spin: 0,
};

const bitsDiffer = (a, b) => {
  if (!a || !b) return 0;
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    let x = a[i] ^ b[i];
    while (x) {
      n += x & 1;
      x >>= 1;
    }
  }
  return n;
};

async function rehash(api) {
  const pw = st.pw;
  const bytes = await sha256(pw);
  if (pw !== st.pw) return;
  st.prev = st.bytes;
  st.bytes = bytes;
  st.flipped = bitsDiffer(st.prev, bytes);
  st.flash.set(1, true);
  st.flash.set(0);
  st.pairA = await sha256((st.salt ? st.saltA : '') + pw);
  st.pairB = await sha256((st.salt ? st.saltB : '') + pw);
  api.invalidate();
}

function times() {
  const rate = SPEEDS.find((s) => s.id === st.speed).rate;
  const { set, count } = searchSize(st.pw);
  const common = isCommon(st.pw);
  return { set, count, rate, common, secs: common ? 0 : count / rate };
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  let moving = st.flash.step(dt, !api.motion);
  if (api.playing && api.motion && (ch === 'guess' || ch === 'slow')) {
    st.spin += dt;
    moving = true;
  }

  const shown = st.pw || ' ';
  if (ch === 'length') {
    drawLengths(ctx, w, h, col, bg);
  } else if (ch === 'salt') {
    // Two people with the same password, and what the site keeps for each.
    const size = Math.min(w * 0.36, h * 0.5);
    const y = h * 0.28;
    [['Ana', st.pairA, st.saltA, col['hiw-ink-1']], ['Ben', st.pairB, st.saltB, col['hiw-ink-2']]].forEach(([who, bytes, salt, ink], i) => {
      const x = w * (i ? 0.56 : 0.08);
      label(ctx, `${who}: "${shown}"${st.salt ? ` + salt ${salt}` : ''}`, x, y - 22, col.label, bg, { size: 13 });
      drawBits(ctx, x, y, size, bytes, null, col, ink, 0);
    });
    const same = st.pairA && st.pairB && hex(st.pairA) === hex(st.pairB);
    label(ctx, same ? 'Identical: crack one and you have cracked both.' : 'Different: each must be cracked on its own.', w / 2, y + size + 26, same ? col.danger : col.success, bg, { size: 13, align: 'center' });
  } else {
    const size = Math.min(w * 0.5, h * 0.62);
    const x = (w - size) / 2 + (w > 560 ? w * 0.1 : 0), y = h * 0.18;
    drawBits(ctx, x, y, size, st.bytes, st.prev, col, col['hiw-ink-1'], st.flash.v);
    label(ctx, `"${shown}"`, w > 560 ? x - 24 : w / 2, w > 560 ? y + size / 2 : y - 20, col.label, bg, { size: 15, align: w > 560 ? 'right' : 'center' });
    if (w > 560) label(ctx, 'SHA-256 →', x - 24, y + size / 2 + 22, col['label-secondary'], bg, { size: 12, weight: 500, align: 'right' });
    if (st.bytes) {
      const hx = hex(st.bytes);
      label(ctx, hx.slice(0, 32), w / 2, y + size + 22, col['label-secondary'], bg, { size: 11, weight: 500, align: 'center', mono: true });
      label(ctx, hx.slice(32), w / 2, y + size + 38, col['label-secondary'], bg, { size: 11, weight: 500, align: 'center', mono: true });
    }
    if (ch === 'guess' || ch === 'slow') {
      const t = times();
      const tried = Math.min(t.count, t.rate * st.spin);
      label(ctx, `Guesses so far: ${tried > 1e15 ? tried.toExponential(2) : fmt(tried)}`, w / 2, h - 30, col.accent, bg, { size: 13, align: 'center' });
    }
  }

  const r = st.readout;
  if (r) {
    const t = times();
    r.set('length', fmt(st.pw.length));
    r.set('flipped', st.prev ? `${st.flipped} of 256` : '–');
    r.set('alphabet', t.set ? `${t.set} characters` : '–');
    r.set('count', t.count > 1e15 ? t.count.toExponential(2).replace('e+', ' × 10^') : fmt(t.count));
    r.set('rate', t.rate >= 1e9 ? `${fmt(t.rate / 1e9, 1)} billion` : fmt(t.rate));
    r.set('time', t.common ? 'At once: it is on every list' : duration(t.secs));
  }
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.spin = 0;
  api.note(id === 'guess' || id === 'slow' ? 'One RTX 4090 graphics card' : 'Nothing you type leaves this page');
  if (id !== 'length') {
    ui.text({
      label: 'A password (it stays on this page)',
      value: st.pw,
      maxLength: 40,
      onInput(v) {
        st.pw = v;
        st.spin = 0;
        rehash(api);
      },
    });
  }
  if (id === 'guess' || id === 'slow') {
    const options = id === 'guess' ? SPEEDS.slice(0, 2) : SPEEDS;
    if (!options.some((o) => o.id === st.speed)) st.speed = options[0].id;
    ui.choice({ label: 'How the site stored it', options: options.map((s) => ({ id: s.id, label: s.name })), value: st.speed, onChange: (v) => { st.speed = v; st.spin = 0; api.invalidate(); } });
  }
  if (id === 'salt') {
    ui.toggle({ label: 'Add a salt', checked: st.salt, onChange: (on) => { st.salt = on; rehash(api); } });
  }
  const rows = {
    hash: [{ key: 'length', label: 'Characters' }, { key: 'flipped', label: 'Bits changed by your last edit' }],
    guess: [{ key: 'alphabet', label: 'Alphabet' }, { key: 'count', label: 'Possible passwords' }, { key: 'rate', label: 'Guesses a second' }, { key: 'time', label: 'Time to try them all' }],
    slow: [{ key: 'rate', label: 'Guesses a second' }, { key: 'time', label: 'Time to try them all' }],
    salt: [],
    length: [],
  }[id];
  st.readout = api.readout(rows);
  rehash(api);
}

// Chapter 5: how long each kind of password lasts, against a fast hash and
// a slow one, on a scale where every step is a thousand times longer.
const LENGTHS = [
  ['8 random characters', 95 ** 8],
  ['12 random characters', 95 ** 12],
  ['3 random words', 7776 ** 3],
  ['4 random words', 7776 ** 4],
  ['5 random words', 7776 ** 5],
];
function drawLengths(ctx, w, h, col, bg) {
  const fast = SPEEDS.find((x) => x.id === 'md5').rate;
  const slow = SPEEDS.find((x) => x.id === 'bcrypt10').rate;
  const left = Math.min(150, w * 0.32), right = w - 16, top = h * 0.12, row = (h * 0.76) / LENGTHS.length;
  const span = (secs) => Math.max(0, Math.min(1, Math.log10(Math.max(1, secs)) / 24));
  LENGTHS.forEach(([name, n], i) => {
    const y = top + i * row;
    label(ctx, name, left - 10, y + row * 0.32, col.label, bg, { size: 12, align: 'right' });
    [[n / fast, col['hiw-ink-1'], 'MD5'], [n / slow, col['hiw-ink-2'], 'bcrypt 10']].forEach(([secs, ink, how], j) => {
      const by = y + row * (0.12 + j * 0.36);
      const bw = (right - left - 8) * span(secs);
      ctx.fillStyle = ink;
      ctx.fillRect(left, by, Math.max(2, bw), row * 0.26);
      const words = `${how}: ${duration(secs)}`;
      const inside = bw > w * 0.45;
      label(ctx, words, inside ? left + bw - 6 : left + bw + 6, by + row * 0.13, inside ? bg : col['label-secondary'], inside ? null : bg, { size: 11, weight: 600, align: inside ? 'right' : 'left' });
    });
  });
  label(ctx, 'Each step along is a thousand times longer', left, h - 14, col['label-tertiary'], bg, { size: 11, weight: 500 });
}

mount({ colours: TOKENS, chapter, draw });
