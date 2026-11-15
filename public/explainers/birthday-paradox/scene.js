// ---------------------------------------------------------------------------
// The birthday paradox: the scene.
//
// People arrive one at a time with random birthdays on a ring of the year;
// a shared day turns red. Beside it, the exact chance for a group that
// size. Chapter 3 fills room after room until each has a match and
// collects how many people it took. Chapter 4 changes the number of days,
// which is the same sum computers face with random codes.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { pShared, pairs, evenChance, drawYear } from './art.js';

const st = {
  people: [],
  n: 23,
  timer: 0,
  rooms: [],        // how many people each finished room took
  room: [],
  days: 365,
  readout: null,
};
const day = () => Math.floor(Math.random() * 365);

function setGroup(n, api) {
  st.n = n;
  st.people = Array.from({ length: n }, day);
  api.invalidate();
}

function curve(ctx, x0, y0, w, h, col, bg, mark) {
  const X = (n) => x0 + (n / 80) * w, Y = (p) => y0 + h - p * h;
  ctx.strokeStyle = col.separator;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0, y0 + h);
  ctx.lineTo(x0 + w, y0 + h);
  ctx.stroke();
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(x0, Y(0.5));
  ctx.lineTo(x0 + w, Y(0.5));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  for (let n = 0; n <= 80; n++) (n ? ctx.lineTo(X(n), Y(pShared(n))) : ctx.moveTo(X(n), Y(0)));
  ctx.strokeStyle = col['hiw-ink-1'];
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(X(mark), Y(pShared(mark)), 5, 0, Math.PI * 2);
  ctx.fillStyle = col.accent;
  ctx.fill();
  label(ctx, `${mark} people: ${fmt(pShared(mark) * 100, 1)}%`, X(mark) + 8, Y(pShared(mark)) - 12, col.label, bg, { size: 12 });
  label(ctx, '50%', x0 - 6, Y(0.5), col['label-tertiary'], bg, { size: 11, align: 'right' });
  label(ctx, 'People in the room', x0 + w, y0 + h + 14, col['label-tertiary'], bg, { size: 11, align: 'right' });
  for (const n of [0, 20, 40, 60, 80]) label(ctx, String(n), X(n), y0 + h + 14, col['label-tertiary'], bg, { size: 10, align: 'center' });
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const run = api.playing && api.motion;
  let moving = false;
  const wide = w > 560;

  if (ch === 'rooms') {
    // Fill a room until two share a day, then start another.
    if (run) {
      st.timer += dt;
      if (st.timer > 0.06) {
        st.timer = 0;
        const d = day();
        if (st.room.includes(d)) {
          st.rooms.push(st.room.length + 1);
          st.room = [];
        } else st.room.push(d);
      }
      moving = true;
    }
    const R = Math.min(wide ? w * 0.2 : w * 0.3, h * 0.28);
    drawYear(ctx, wide ? w * 0.25 : w / 2, wide ? h / 2 : h * 0.32, R, col, st.room);
    // How many people each room took before a match.
    const x0 = wide ? w * 0.52 : 30, y0 = wide ? h * 0.2 : h * 0.66, gw = wide ? w * 0.44 : w - 50, gh = wide ? h * 0.55 : h * 0.24;
    const counts = new Array(81).fill(0);
    for (const k of st.rooms) counts[Math.min(80, k)]++;
    const max = Math.max(1, ...counts);
    counts.forEach((c, k) => {
      if (!c) return;
      const bh = (c / max) * gh;
      ctx.fillStyle = k <= 23 ? col.accent : alpha(col['hiw-ink-1'], 0.7);
      ctx.fillRect(x0 + (k / 80) * gw, y0 + gh - bh, Math.max(1, gw / 80 - 1), bh);
    });
    label(ctx, 'People it took to find a match', x0, y0 - 12, col['label-secondary'], bg, { size: 12 });
    label(ctx, '23', x0 + (23 / 80) * gw, y0 + gh + 12, col.accent, bg, { size: 11, align: 'center' });
  } else if (ch === 'days') {
    const x0 = 50, y0 = 50, gw = w - 80, gh = h - 120;
    const X = (n) => x0 + (n / 120) * gw, Y = (p) => y0 + gh - p * gh;
    ctx.strokeStyle = col.separator;
    ctx.strokeRect(x0, y0, gw, gh);
    ctx.beginPath();
    for (let n = 0; n <= 120; n++) (n ? ctx.lineTo(X(n), Y(pShared(n, st.days))) : ctx.moveTo(X(0), Y(0)));
    ctx.strokeStyle = col['hiw-ink-1'];
    ctx.lineWidth = 2;
    ctx.stroke();
    const half = evenChance(st.days);
    if (half <= 120) {
      ctx.beginPath();
      ctx.arc(X(half), Y(pShared(half, st.days)), 5, 0, Math.PI * 2);
      ctx.fillStyle = col.accent;
      ctx.fill();
    }
    label(ctx, `${fmt(st.days)} possible values: an even chance of a match by ${fmt(half)}`, x0, y0 - 16, col.label, bg, { size: 13 });
    label(ctx, 'Things in the group, up to 120', x0 + gw, y0 + gh + 14, col['label-tertiary'], bg, { size: 11, align: 'right' });
  } else {
    const R = Math.min(wide ? w * 0.2 : w * 0.32, h * (wide ? 0.32 : 0.26));
    const match = drawYear(ctx, wide ? w * 0.28 : w / 2, wide ? h / 2 : h * 0.3, R, col, st.people, { pairsOf: ch === 'pairs' });
    if (ch === 'curve' || wide) {
      const x0 = wide ? w * 0.58 : 40, y0 = wide ? h * 0.22 : h * 0.66, gw = wide ? w * 0.36 : w - 70, gh = wide ? h * 0.5 : h * 0.22;
      curve(ctx, x0, y0, gw, gh, col, bg, st.n);
    }
    api.status(match ? 'Two people here share a birthday.' : 'No shared birthdays this time.');
  }

  const r = st.readout;
  if (r) {
    r.set('n', fmt(st.n));
    r.set('pairs', fmt(pairs(st.n)));
    r.set('p', `${fmt(pShared(st.n) * 100, 1)}%`);
    const done = st.rooms.length;
    r.set('rooms', fmt(done));
    r.set('avg', done ? fmt(st.rooms.reduce((a, b) => a + b, 0) / done, 1) : '–');
    r.set('days', fmt(st.days));
    r.set('half', fmt(evenChance(st.days)));
  }
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note(id === 'rooms' ? 'Rooms filled one person at a time' : id === 'days' ? '' : 'Birthdays drawn at random');
  if (id === 'pairs' || id === 'curve') {
    ui.slider({ label: 'People in the room', min: 2, max: 80, value: st.n, onInput: (v) => setGroup(v, api) });
    ui.button({ label: 'New room', onClick: () => setGroup(st.n, api) });
    setGroup(st.n, api);
  }
  if (id === 'rooms') {
    st.rooms = [];
    st.room = [];
    ui.button({
      label: 'Fill 1,000 rooms',
      onClick() {
        for (let i = 0; i < 1000; i++) {
          const seen = new Set();
          for (;;) {
            const d = day();
            if (seen.has(d)) {
              st.rooms.push(seen.size + 1);
              break;
            }
            seen.add(d);
          }
        }
        api.invalidate();
      },
    });
  }
  if (id === 'days') {
    ui.choice({
      label: 'Possible values',
      options: [[365, 'Birthdays (365)'], [1000, '1,000'], [10000, '10,000'], [1e6, 'A million']].map(([d, l]) => ({ id: String(d), label: l })),
      value: String(st.days),
      onChange: (d) => { st.days = Number(d); api.invalidate(); },
    });
  }
  const rows = {
    pairs: [{ key: 'n', label: 'People' }, { key: 'pairs', label: 'Pairs of people' }, { key: 'p', label: 'Chance of a shared birthday' }],
    curve: [{ key: 'n', label: 'People' }, { key: 'p', label: 'Chance of a shared birthday' }],
    rooms: [{ key: 'rooms', label: 'Rooms filled' }, { key: 'avg', label: 'People needed, on average' }],
    days: [{ key: 'days', label: 'Possible values' }, { key: 'half', label: 'Even chance of a match by' }],
  }[id];
  st.readout = api.readout(rows);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
