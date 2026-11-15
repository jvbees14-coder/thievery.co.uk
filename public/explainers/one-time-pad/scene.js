// ---------------------------------------------------------------------------
// The one-time pad: the scene.
//
// Chapter 1 enciphers the reader's message with a random key. Chapter 2
// takes the same ciphertext and shows the key that would turn it into any
// other message they type. Chapter 3 shows two messages sent with one key,
// and how guessing a word in one reads the other. Chapter 4 is the key
// itself: as long as everything ever sent, and used once.
// ---------------------------------------------------------------------------

import { mount } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { letters, add, sub, randomKey, drawRows } from './art.js';

const P1 = 'THEGOLDISUNDERTHEOAK', P2 = 'MEETMEBYTHEOLDBRIDGE';
const st = { msg: 'MEET AT NOON', key: '', other: 'SELL THE CAR', shared: randomKey(20), crib: 'THE', at: 0, sent: 0, readout: null };
st.key = randomKey(40);

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const ch = api.chapter;
  const r = st.readout;
  const x0 = 16, wide = w - 32;
  const m = letters(st.msg).slice(0, 20);
  const key = st.key.slice(0, m.length);
  const cipher = add(m, key);

  if (ch === 'pad') {
    drawRows(ctx, x0, 90, wide, [
      { name: 'Message', text: m },
      { name: 'Key, at random', text: key, ink: col.accent },
      { name: 'Sent', text: cipher, ink: col['hiw-ink-1'] },
    ], col, label);
    r?.set('sent', cipher || '–');
  } else if (ch === 'perfect') {
    const other = letters(st.other).padEnd(m.length, 'X').slice(0, m.length);
    const fake = sub(cipher, other);
    drawRows(ctx, x0, 90, wide, [
      { name: 'Sent', text: cipher, ink: col['hiw-ink-1'] },
      { name: 'A key that reads it as your message', text: fake, ink: col.accent },
      { name: 'Reads as', text: other },
    ], col, label);
    r?.set('possible', `Every one of 26^${m.length}`);
  } else if (ch === 'reuse') {
    const c1 = add(P1, st.shared), c2 = add(P2, st.shared);
    const diff = sub(c1, c2);
    const crib = letters(st.crib).slice(0, P1.length);
    const at = Math.min(st.at, P1.length - crib.length);
    // If the crib is in message 1 at `at`, message 2 there is crib minus the difference.
    const shown = [...P1].map((_, i) => (i >= at && i < at + crib.length ? sub(crib[i - at], diff[i]) : '·')).join('');
    drawRows(ctx, x0, 90, wide, [
      { name: 'First message sent', text: c1, ink: col['hiw-ink-1'] },
      { name: 'Second message sent, same key', text: c2, ink: col['hiw-ink-1'] },
      { name: 'First minus second: the key has gone', text: diff, ink: col.warning },
      { name: 'Your guess in the first message', text: [...P1].map((_, i) => (i >= at && i < at + crib.length ? crib[i - at] : '·')).join(''), ink: col.accent },
      { name: 'What that makes the second say', text: shown, ink: col.success },
    ], col, label);
    r?.set('reads', shown.replace(/·/g, '') || '–');
  } else if (ch === 'keys') {
    // Pages of key used up as messages go.
    const pages = 12, per = Math.min(70, (wide - 20) / 6);
    for (let i = 0; i < pages; i++) {
      const x = x0 + (i % 6) * (per + 4), y = 90 + Math.floor(i / 6) * (per * 1.3 + 10);
      const used = i < st.sent;
      ctx.fillStyle = used ? col['bg-elevated'] : col.stock;
      ctx.fillRect(x, y, per, per * 1.3);
      if (used) {
        ctx.strokeStyle = col.danger;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 6, y + 6);
        ctx.lineTo(x + per - 6, y + per * 1.3 - 6);
        ctx.stroke();
      } else {
        for (let k = 0; k < 6; k++) label(ctx, randomKey(5, mulberry(i * 7 + k)), x + per / 2, y + 12 + k * per * 0.19, col['stock-ink'], null, { size: Math.max(9, per * 0.13), align: 'center', mono: true });
      }
    }
    r?.set('left', `${12 - st.sent} of 12`);
  }
  return false;
}
function mulberry(seed) {
  let s = seed + 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ pad: 'Up to 20 letters', perfect: 'The same message sent', reuse: 'Two messages, one key', keys: 'A pad of key pages' }[id]);
  if (id === 'pad') {
    ui.text({ label: 'Your message', value: st.msg, maxLength: 30, onInput(v) { st.msg = v; api.invalidate(); } });
    ui.button({ label: 'New key', onClick() { st.key = randomKey(40); api.invalidate(); } });
    st.readout = api.readout([{ key: 'sent', label: 'What is sent' }]);
  } else if (id === 'perfect') {
    ui.text({ label: 'What else could it say?', value: st.other, maxLength: 30, onInput(v) { st.other = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'possible', label: 'Messages it could be' }]);
  } else if (id === 'reuse') {
    ui.text({ label: 'Guess a word in the first message', value: st.crib, maxLength: 12, onInput(v) { st.crib = v; api.invalidate(); } });
    ui.slider({ label: 'Where it might be', min: 0, max: 19, value: st.at, format: (v) => `Letter ${v + 1}`, onInput(v) { st.at = v; api.invalidate(); } });
    st.readout = api.readout([{ key: 'reads', label: 'The second message there' }]);
  } else if (id === 'keys') {
    ui.button({ label: 'Send a message', onClick() { st.sent = Math.min(12, st.sent + 1); api.status(st.sent >= 12 ? 'Out of key. Somebody must deliver a new pad.' : ''); api.invalidate(); } });
    ui.button({ label: 'New pad', onClick() { st.sent = 0; api.status(''); api.invalidate(); } });
    st.readout = api.readout([{ key: 'left', label: 'Key pages left' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
