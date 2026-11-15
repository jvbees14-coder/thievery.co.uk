// ---------------------------------------------------------------------------
// Frequency analysis: the scene.
//
// One letter, enciphered with a fresh random alphabet on every visit. The
// scene counts its letters against English, makes the first guess by rank,
// lets the reader fix it a letter at a time, and in the last chapter shows
// what several alphabets in turn do to the counts.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, box, TOKENS } from '../shared/draw.js';
import { ABC, PASSAGE, ENGLISH, BY_FREQ, newKey, encipher, counts, rankGuess } from './text.js';

const st = {
  key: newKey(),
  cipher: '',
  guess: null,       // cipher letter -> plain guess
  alphabets: 1,
  keys: [],
  readout: null,
};

function rekey() {
  st.key = newKey();
  st.cipher = encipher(PASSAGE, [st.key]);
  st.guess = rankGuess(st.cipher);
}
rekey();

const plainOf = (c) => ABC[st.key.indexOf(c)];

function lettersRight() {
  let n = 0, all = 0;
  for (const ch of st.cipher) {
    if (!ABC.includes(ch)) continue;
    all++;
    if (st.guess[ch] === plainOf(ch)) n++;
  }
  return n / all;
}

// Put right the wrong guess that costs the most letters.
function fixOne() {
  const c = counts(st.cipher);
  const wrong = [...ABC].filter((L) => c[L] > 0 && st.guess[L] !== plainOf(L)).sort((a, b) => c[b] - c[a]);
  if (!wrong.length) return null;
  const L = wrong[0], want = plainOf(L);
  const other = Object.keys(st.guess).find((k) => st.guess[k] === want);
  if (other) st.guess[other] = st.guess[L];
  st.guess[L] = want;
  return [L, want];
}

// --- drawing ---

function wrapText(text, perLine) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > perLine) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

function drawText(ctx, x0, y0, w, h, col, mode) {
  // Find the largest size at which the whole passage fits.
  let size = 20, lines, cw, lh;
  for (; size >= 9; size--) {
    cw = size * 0.62;
    lh = size * 1.45;
    lines = wrapText(st.cipher, Math.floor(w / cw));
    if (lines.length * lh <= h) break;
  }
  ctx.font = `600 ${size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  lines.forEach((ln, r) => {
    [...ln].forEach((ch, i) => {
      const x = x0 + i * cw, y = y0 + r * lh + lh / 2;
      if (!ABC.includes(ch)) {
        ctx.fillStyle = col['label-tertiary'];
        ctx.fillText(ch, x, y);
        return;
      }
      if (mode === 'cipher') {
        ctx.fillStyle = col.label;
        ctx.fillText(ch, x, y);
      } else {
        const g = st.guess[ch], ok = g === plainOf(ch);
        ctx.fillStyle = ok ? col.success : col.danger;
        ctx.fillText(g.toLowerCase(), x, y);
      }
    });
  });
}

function drawBars(ctx, x0, y0, w, h, col, bg, cipherCounts, showEnglish) {
  const cipherOrder = [...ABC].sort((a, b) => cipherCounts[b] - cipherCounts[a] || a.localeCompare(b));
  const slot = w / 26, max = 14;
  const H = (v) => (Math.min(v, max) / max) * (h - 30);
  const base = y0 + h - 30;
  const narrow = slot < 16;
  for (let i = 0; i < 26; i++) {
    const x = x0 + i * slot;
    const bw = showEnglish ? slot * 0.4 : slot * 0.7;
    const cv = cipherCounts[cipherOrder[i]];
    ctx.fillStyle = col.accent;
    ctx.fillRect(x + slot * 0.1, base - H(cv), bw, H(cv));
    label(ctx, cipherOrder[i], x + slot * 0.1 + bw / 2, base + 10, col.accent, null, { size: narrow ? 9 : 11, weight: 700, align: 'center', mono: true });
    if (showEnglish) {
      const ev = ENGLISH[BY_FREQ[i]];
      ctx.fillStyle = alpha(col['hiw-ink-1'], 0.8);
      ctx.fillRect(x + slot * 0.5, base - H(ev), bw, H(ev));
      label(ctx, BY_FREQ[i], x + slot * 0.5 + bw / 2, base + 22, col['hiw-ink-1'], null, { size: narrow ? 9 : 11, weight: 700, align: 'center', mono: true });
    }
  }
  ctx.strokeStyle = col.separator;
  ctx.beginPath();
  ctx.moveTo(x0, base);
  ctx.lineTo(x0 + w, base);
  ctx.stroke();
  label(ctx, 'The message', x0, y0 + 4, col.accent, bg, { size: 12, weight: 700 });
  if (showEnglish) label(ctx, 'English in general', x0 + 110, y0 + 4, col['hiw-ink-1'], bg, { size: 12, weight: 700 });
}

function drawKey(ctx, x0, y0, w, col) {
  const cell = w / 26;
  for (let i = 0; i < 26; i++) {
    const x = x0 + i * cell + cell / 2;
    label(ctx, ABC[i].toLowerCase(), x, y0, col['label-tertiary'], null, { size: cell > 16 ? 13 : 10, align: 'center', mono: true });
    label(ctx, st.key[i], x, y0 + 18, col.accent, null, { size: cell > 16 ? 13 : 10, weight: 800, align: 'center', mono: true });
  }
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  const pad = 16;

  if (ch === 'substitution') {
    drawKey(ctx, pad, 60, w - 2 * pad, col);
    drawText(ctx, pad, 100, w - 2 * pad, h - 112, col, 'cipher');
  } else if (ch === 'counting') {
    drawBars(ctx, pad, 54, w - 2 * pad, h - 66, col, bg, counts(st.cipher), true);
    const c = counts(st.cipher);
    const top = [...ABC].sort((a, b) => c[b] - c[a])[0];
    r?.set('top', `${top}, ${fmt(c[top], 1)}% of letters`);
  } else if (ch === 'matching' || ch === 'solving') {
    drawText(ctx, pad, 54, w - 2 * pad, h - 66, col, 'guess');
    r?.set('right', `${fmt(lettersRight() * 100, 0)}%`);
  } else if (ch === 'defence') {
    const c = counts(encipher(PASSAGE, st.keys));
    drawBars(ctx, pad, 54, w - 2 * pad, h - 66, col, bg, c, true);
    r?.set('tallest', `${fmt(Math.max(...Object.values(c)), 1)}% of letters`);
  }
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({
    substitution: 'A fresh random alphabet on every visit',
    counting: 'Both sorted, commonest first',
    matching: 'Green is right, red is wrong',
    solving: 'Green is right, red is wrong',
    defence: 'The same letter, more alphabets',
  }[id]);
  if (id === 'substitution') {
    ui.button({ label: 'New alphabet', onClick() { rekey(); api.invalidate(); } });
    st.readout = api.readout([{ key: 'keys', label: 'Possible alphabets' }]);
    st.readout.set('keys', '403,291,461,126,605,635,584,000,000');
  } else if (id === 'counting') {
    st.readout = api.readout([{ key: 'top', label: 'Commonest letter in the message' }]);
  } else if (id === 'matching') {
    st.guess = rankGuess(st.cipher);
    st.readout = api.readout([{ key: 'right', label: 'Letters right' }]);
  } else if (id === 'solving') {
    st.guess = rankGuess(st.cipher);
    ui.button({
      label: 'Fix a letter',
      onClick() {
        const done = fixOne();
        api.status(done ? `${done[0]} is ${done[1].toLowerCase()}.` : 'Every letter is right.');
        api.invalidate();
      },
    });
    ui.button({ label: 'Start again', onClick() { st.guess = rankGuess(st.cipher); api.status(''); api.invalidate(); } });
    st.readout = api.readout([{ key: 'right', label: 'Letters right' }]);
  } else if (id === 'defence') {
    const pick = (n) => {
      st.alphabets = n;
      st.keys = [st.key, ...Array.from({ length: n - 1 }, () => newKey())];
      api.invalidate();
    };
    pick(st.alphabets);
    ui.choice({
      label: 'Alphabets, used in turn',
      options: [1, 2, 3, 5, 8].map((n) => ({ id: String(n), label: String(n) })),
      value: String(st.alphabets),
      onChange: (v) => pick(Number(v)),
    });
    st.readout = api.readout([{ key: 'tallest', label: 'Commonest letter in the message' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
