// ---------------------------------------------------------------------------
// The odds of the lottery: the scene.
//
// Chapter 1 is the board of 59 balls with a ticket and a draw. Chapter 2
// puts one ticket a week on a timeline. Chapter 3 plays a thousand draws
// against one ticket and counts the matches. Chapter 4 shows how few
// tickets use only numbers up to 31.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, box, TOKENS } from '../shared/draw.js';
import { BALLS, TICKETS, choose, draw6, drawBall } from './art.js';

const st = { ticket: [7, 12, 19, 28, 33, 41], drawn: [], draws: 0, best: 0, counts: [0, 0, 0, 0, 0, 0, 0], readout: null };
const YEARS = TICKETS / 52;

function board(ctx, w, h, col, top) {
  const cols = 10, cell = Math.min((w - 32) / cols, (h - top - 20) / 6), x0 = (w - cell * cols) / 2;
  const mine = new Set(st.ticket), drawn = new Set(st.drawn);
  for (let n = 1; n <= BALLS; n++) {
    const i = n - 1;
    drawBall(ctx, x0 + (i % cols) * cell + cell / 2, top + Math.floor(i / cols) * cell + cell / 2, cell * 0.4, n, col, { picked: mine.has(n), drawn: drawn.has(n) });
  }
}

function timeline(ctx, w, h, col, bg) {
  // Years on a log scale, from one to a million.
  const x0 = 30, x1 = w - 30, y = h * 0.45;
  const X = (yrs) => x0 + (Math.log10(yrs) / 6) * (x1 - x0);
  ctx.strokeStyle = col.separator;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  for (let e = 0; e <= 6; e++) label(ctx, e ? `${fmt(10 ** e)}` : '1', X(10 ** e), y + 16, col['label-tertiary'], bg, { size: 11, align: 'center' });
  label(ctx, 'Years ago, or years of tickets', x1, y + 32, col['label-tertiary'], bg, { size: 11, align: 'right' });
  const marks = [[80, 'A long life', col['hiw-ink-1'], -1], [4500, 'The pyramids', col['hiw-ink-4'], 1], [300000, 'The first modern humans', col['hiw-ink-3'], -1], [YEARS, 'A ticket a week, to win', col.accent, 1]];
  marks.forEach(([v, name, c, side], i) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = 2;
    const yy = y + side * (36 + Math.floor(i / 2) * 40);
    ctx.beginPath();
    ctx.moveTo(X(v), y);
    ctx.lineTo(X(v), yy);
    ctx.stroke();
    // Marks near the right end are labelled leftwards, so the words stay on the scene.
    const right = X(v) > w * 0.6;
    label(ctx, name, X(v) + (right ? 6 : 0), yy + side * 10, c, bg, { size: 11, weight: 700, align: right ? 'right' : 'center' });
  });
}

function histogram(ctx, w, h, col, bg) {
  const x0 = 50, x1 = w - 20, y0 = 90, y1 = h - 40, slot = (x1 - x0) / 7;
  const max = Math.max(1, ...st.counts);
  st.counts.forEach((c, m) => {
    const bh = (c / max) * (y1 - y0);
    box(ctx, x0 + m * slot + slot * 0.15, y1 - bh, slot * 0.7, bh, 4);
    ctx.fillStyle = m >= 3 ? col.success : col['hiw-ink-1'];
    ctx.fill();
    label(ctx, String(c), x0 + m * slot + slot / 2, y1 - bh - 10, col.label, bg, { size: 11, align: 'center' });
    label(ctx, `${m}`, x0 + m * slot + slot / 2, y1 + 14, col['label-secondary'], bg, { size: 12, weight: 700, align: 'center' });
  });
  label(ctx, 'Numbers matched', x1, y1 + 30, col['label-tertiary'], bg, { size: 11, align: 'right' });
}

function popular(ctx, w, h, col, bg) {
  // One square for every 1% of all tickets; the share using only 1 to 31.
  const share = choose(31, 6) / TICKETS;
  const cells = 100, per = 10, cell = Math.min((w - 40) / per, (h - 140) / 10), x0 = (w - cell * per) / 2;
  for (let i = 0; i < cells; i++) {
    box(ctx, x0 + (i % per) * cell + 2, 90 + Math.floor(i / per) * cell + 2, cell - 4, cell - 4, 3);
    ctx.fillStyle = i < share * 100 ? col.accent : alpha(col['hiw-ink-1'], 0.3);
    ctx.fill();
  }
  label(ctx, 'Every possible ticket, in hundredths. Gold: numbers 1 to 31 only.', w / 2, 90 + 10 * cell + 20, col['label-secondary'], bg, { size: 11, align: 'center' });
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  if (ch === 'odds') {
    board(ctx, w, h, col, 70);
    const hit = st.drawn.filter((n) => st.ticket.includes(n)).length;
    r?.set('match', st.drawn.length ? `${hit} of 6` : '–');
    r?.set('draws', fmt(st.draws));
    r?.set('best', `${st.best} of 6`);
  } else if (ch === 'scale') {
    timeline(ctx, w, h, col, bg);
  } else if (ch === 'smaller') {
    histogram(ctx, w, h, col, bg);
    r?.set('draws', fmt(st.counts.reduce((a, b) => a + b, 0)));
    r?.set('three', `${st.counts[3] + st.counts[4] + st.counts[5] + st.counts[6]}`);
  } else if (ch === 'popular') {
    popular(ctx, w, h, col, bg);
  }
  return false;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ odds: 'Blue: your ticket. Gold: drawn. Green: a match', scale: 'Years, on a scale where each step is ten times', smaller: 'One ticket against many draws', popular: 'Which tickets people choose' }[id]);
  if (id === 'odds') {
    ui.button({
      label: 'Draw',
      onClick() {
        st.drawn = draw6();
        st.draws++;
        st.best = Math.max(st.best, st.drawn.filter((n) => st.ticket.includes(n)).length);
        api.invalidate();
      },
    });
    ui.button({ label: 'New ticket', onClick() { st.ticket = draw6(); st.drawn = []; api.invalidate(); } });
    st.readout = api.readout([{ key: 'match', label: 'This draw' }, { key: 'draws', label: 'Draws' }, { key: 'best', label: 'Best so far' }]);
  } else if (id === 'scale') {
    st.readout = api.readout([{ key: 'odds', label: 'Chance of the jackpot' }, { key: 'years', label: 'A ticket a week, typical wait' }]);
    st.readout.set('odds', `1 in ${fmt(TICKETS)}`);
    st.readout.set('years', `${fmt(YEARS)} years`);
  } else if (id === 'smaller') {
    const play = (n) => {
      for (let i = 0; i < n; i++) st.counts[draw6().filter((x) => st.ticket.includes(x)).length]++;
      api.invalidate();
    };
    ui.button({ label: 'Play 100 draws', onClick: () => play(100) });
    ui.button({ label: 'Play 10,000', onClick: () => play(10000) });
    ui.button({ label: 'Start again', onClick() { st.counts.fill(0); api.invalidate(); } });
    st.readout = api.readout([{ key: 'draws', label: 'Draws' }, { key: 'three', label: 'Three or more matched' }]);
  } else if (id === 'popular') {
    st.readout = api.readout([{ key: 'share', label: 'Tickets using only 1 to 31' }]);
    st.readout.set('share', `${fmt((choose(31, 6) / TICKETS) * 100, 2)}%`);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

