// ---------------------------------------------------------------------------
// Why a chained ledger can't be quietly changed: the scene.
//
// Four pages of a ledger. A page's fingerprint is SHA-256 of the previous
// page's fingerprint, its entry and its nonce (shared/sha.js). A page is
// sound when the "previous" it carries matches the real fingerprint of the
// page before; the pages hold what they held when written, so editing one
// breaks the links after it. Chapter 4 searches nonces for a fingerprint
// with k leading zero digits, a slice of tries per frame.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, box, arrow, TOKENS } from '../shared/draw.js';
import { sha256, utf8, hex } from '../shared/sha.js';

const ENTRIES = ['Ada pays Ben £30', 'Ben pays Cy £12', 'Cy pays Ada £5', 'Ada pays Dee £8'];
const ZERO = '0'.repeat(64);
const fp = (prev, text, nonce) => hex(sha256(utf8(`${prev}|${text}|${nonce}`)));

const st = { pages: [], zeros: 3, mining: null, readout: null, edited: -1 };

/** Write the ledger afresh: each page records the fingerprint before it. */
function write(texts) {
  let prev = ZERO;
  st.pages = texts.map((text) => {
    const p = { text, nonce: 0, prev };
    prev = fp(p.prev, p.text, p.nonce);
    return p;
  });
}
const real = (i) => fp(st.pages[i].prev, st.pages[i].text, st.pages[i].nonce);
const sound = (i) => i === 0 || st.pages[i].prev === real(i - 1);

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  let more = false;
  if (ch === 'work' && st.mining) {
    const m = st.mining;
    const goal = '0'.repeat(st.zeros);
    const t0 = performance.now();
    while (performance.now() - t0 < 12) {
      for (let k = 0; k < 200; k++) {
        m.nonce++;
        if (fp(st.pages[0].prev, st.pages[0].text, m.nonce).startsWith(goal)) {
          st.pages[0].nonce = m.nonce;
          api.status(`Found after ${fmt(m.nonce)} tries.`);
          st.mining = null;
          break;
        }
      }
      if (!st.mining) break;
    }
    if (st.mining) st.pages[0].nonce = m.nonce;
    more = !!st.mining;
  }
  const n = ch === 'ledger' || ch === 'work' ? 1 : 4;
  const narrow = w < 560;
  const cols = narrow ? 2 : n === 1 ? 1 : 4;
  const pw = n === 1 ? Math.min(w - 60, 420) : (w - 40 - (cols - 1) * 20) / cols;
  const ph = narrow && n > 1 ? 100 : 132, gap = narrow ? 14 : 44;
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? (w - pw) / 2 : 20 + (i % cols) * (pw + 20);
    const y = n === 1 ? 70 : 64 + Math.floor(i / cols) * (ph + gap);
    const p = st.pages[i];
    const ok = sound(i);
    box(ctx, x, y, pw, ph, 8);
    ctx.fillStyle = alpha(ok ? col['label-tertiary'] : col.danger, ok ? 0.08 : 0.12);
    ctx.fill();
    ctx.strokeStyle = ok ? col['separator-strong'] : col.danger;
    ctx.lineWidth = ok ? 1 : 2;
    ctx.stroke();
    const small = Math.min(12, pw / 16);
    label(ctx, `Page ${i + 1}`, x + 10, y + 16, col['label-secondary'], null, { size: 11 });
    if (n > 1 || ch === 'work') label(ctx, `Previous ${p.prev.slice(0, 8)}`, x + 10, y + 40, ok ? col['label-secondary'] : col.danger, null, { size: small, mono: true });
    label(ctx, p.text, x + 10, y + 64, col.label, null, { size: Math.min(13, pw / 14), weight: 700 });
    if (ch === 'work') label(ctx, `Nonce ${fmt(p.nonce)}`, x + 10, y + 86, col['label-secondary'], null, { size: small, mono: true });
    const own = real(i);
    const lead = own.match(/^0*/)[0].length;
    label(ctx, `Fingerprint ${own.slice(0, 8)}`, x + 10, y + ph - 18, ch === 'work' && lead >= st.zeros ? col.success : col.accent, null, { size: small, mono: true, weight: 700 });
    if (n > 1 && i > 0 && (i % cols) > 0) arrow(ctx, x - 4, y + 40, x - 16, y + ph - 18, ok ? col['label-tertiary'] : col.danger, 1.5);
  }
  if (ch === 'ledger') {
    label(ctx, real(0), w / 2, 70 + ph + 30, col['label-secondary'], bg, { size: Math.min(12, (w - 30) / 40), mono: true, align: 'center' });
    label(ctx, 'The whole fingerprint', w / 2, 70 + ph + 50, col['label-tertiary'], bg, { size: 11, align: 'center' });
  }
  if (ch === 'work') {
    const lead = real(0).match(/^0*/)[0].length;
    r?.set('tries', fmt(st.pages[0].nonce));
    r?.set('expect', fmt(16 ** st.zeros));
    r?.set('lead', `${Math.min(lead, 64)}`);
  } else if (n > 1) {
    if (ch === 'tamper') {
      const now = real(3);
      const y = 64 + Math.ceil(4 / cols) * (ph + gap) + 6;
      label(ctx, `Kept safe: ${st.safe.slice(0, 16)}`, 20, y, col['label-secondary'], bg, { size: 12, mono: true });
      label(ctx, `Last page now: ${now.slice(0, 16)}`, 20, y + 22, now === st.safe ? col.success : col.danger, bg, { size: 12, mono: true, weight: 700 });
    }
    r?.set('broken', `${[1, 2, 3].filter((i) => !sound(i)).length} of 3`);
  }
  return more;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.readout = null;
  st.mining = null;
  write(ENTRIES);
  st.safe = real(3);
  api.note({ ledger: 'One page and its SHA-256 fingerprint', chain: 'Four pages, each carrying the fingerprint before it', tamper: 'The ledger as written; now change it', work: 'A page that only counts with leading zeros' }[id]);
  if (id === 'ledger') {
    ui.text({ label: 'Entry', value: ENTRIES[0], maxLength: 40, onInput(v) { st.pages[0].text = v; api.invalidate(); } });
  } else if (id === 'chain') {
    st.readout = api.readout([{ key: 'broken', label: 'Broken links' }]);
  } else if (id === 'tamper') {
    ui.text({ label: 'Page 2', value: ENTRIES[1], maxLength: 40, onInput(v) { st.pages[1].text = v; api.invalidate(); } });
    ui.button({ label: 'Rewrite the later pages', onClick() { write(st.pages.map((p) => p.text)); api.status('Later pages rewritten.'); api.invalidate(); } });
    ui.button({ label: 'Put it back', onClick() { write(ENTRIES); api.status(''); api.invalidate(); } });
    st.readout = api.readout([{ key: 'broken', label: 'Broken links' }]);
  } else if (id === 'work') {
    ui.slider({ label: 'Leading zeros', min: 1, max: 5, value: st.zeros, onInput(v) { st.zeros = v; api.invalidate(); } });
    ui.button({ label: 'Find a nonce', onClick() { st.mining = { nonce: -1 }; api.status('Searching…'); api.invalidate(); } });
    st.readout = api.readout([{ key: 'tries', label: 'Tries' }, { key: 'expect', label: 'Expected, on average' }, { key: 'lead', label: 'Zeros now' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
