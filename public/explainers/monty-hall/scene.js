// ---------------------------------------------------------------------------
// The Monty Hall problem: the scene.
//
// Chapter 1 is the game, played by hand. Chapter 2 plays it thousands of
// times and keeps score for sticking and for switching. Chapter 3 is the
// same game with a hundred doors, which is where the answer becomes
// obvious. Chapter 4 changes one thing, a host who doesn't know where the
// prize is, and the advantage disappears.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { deal, hostOpens, play, randomHost, drawDoor } from './art.js';

const st = {
  g: deal(3),
  phase: 'pick',          // pick, decide, done
  tally: { stick: [0, 0], switch: [0, 0] },   // [wins, games]
  auto: 0,
  readout: null,
  ui: {},
};

function newGame(n, api) {
  st.g = deal(n);
  st.phase = 'pick';
  api.status(n === 3 ? 'Pick a door.' : 'Pick any of the hundred doors.');
  refresh(api);
}
function pickDoor(i, api) {
  if (st.phase !== 'pick') return;
  st.g.pick = i;
  hostOpens(st.g);
  st.phase = 'decide';
  api.status(st.g.n === 3
    ? `The host opens door ${[...st.g.open][0] + 1}: empty. Stick with ${i + 1}, or switch to ${st.g.other + 1}?`
    : `The host opens 98 doors, all empty. Stick with ${i + 1}, or switch to ${st.g.other + 1}?`);
  refresh(api);
}
function decide(choice, api) {
  if (st.phase !== 'decide') return;
  st.g.final = choice === 'switch' ? st.g.other : st.g.pick;
  const won = st.g.final === st.g.prize;
  st.tally[choice][1]++;
  if (won) st.tally[choice][0]++;
  st.phase = 'done';
  api.status(won ? `You ${choice === 'switch' ? 'switched' : 'stuck'}, and won.` : `You ${choice === 'switch' ? 'switched' : 'stuck'}, and the prize was behind door ${st.g.prize + 1}.`);
  refresh(api);
}
function refresh(api) {
  st.ui.pick?.forEach((b, i) => (b.disabled = st.phase !== 'pick'));
  for (const k of ['stick', 'switch']) if (st.ui[k]) st.ui[k].disabled = st.phase !== 'decide';
  api.invalidate();
}
function runMany(api, count, host) {
  for (let i = 0; i < count; i++) {
    for (const choice of ['stick', 'switch']) {
      const r = host === 'random' ? randomHost(choice) : play(3, choice);
      if (r === null) continue;
      st.tally[choice][1]++;
      if (r) st.tally[choice][0]++;
    }
  }
  api.invalidate();
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  let moving = false;

  if (ch === 'game' || ch === 'hundred') {
    const g = st.g;
    const shown = (i) => st.phase === 'done' || g.open.has(i);
    if (g.n === 3) {
      const dw = Math.min(w / 4.2, h * 0.42), dh = dw * 1.6, gap = dw * 0.25;
      const x0 = (w - 3 * dw - 2 * gap) / 2, y0 = (h - dh) / 2 - 10;
      for (let i = 0; i < 3; i++) {
        drawDoor(ctx, x0 + i * (dw + gap), y0, dw, dh, col, { num: i + 1, open: shown(i), prize: g.prize === i, picked: g.pick === i, other: st.phase === 'decide' && g.other === i });
        if (g.pick === i) label(ctx, 'Your pick', x0 + i * (dw + gap) + dw / 2, y0 + dh + 18, col.accent, bg, { size: 12, align: 'center' });
      }
    } else {
      const cols = 20, rows = 5;
      const cw = Math.min((w - 40) / cols, (h - 80) / (rows * 1.6));
      const x0 = (w - cols * cw) / 2, y0 = (h - rows * cw * 1.6) / 2 - 10;
      for (let i = 0; i < 100; i++) {
        const x = x0 + (i % cols) * cw, y = y0 + Math.floor(i / cols) * cw * 1.6;
        drawDoor(ctx, x + 1, y + 1, cw - 2, cw * 1.6 - 2, col, { num: cw > 26 ? i + 1 : null, open: shown(i), prize: g.prize === i, picked: g.pick === i, other: st.phase === 'decide' && g.other === i });
      }
      if (st.phase === 'decide') label(ctx, 'Two doors left shut: yours, and the one the host avoided', w / 2, h - 24, col.label, bg, { size: 13, align: 'center' });
    }
  }

  if (ch === 'many' || ch === 'host') {
    // Keep playing by itself, a game of each every frame, while it is on.
    if (api.playing && api.motion) {
      st.auto += dt;
      if (st.auto > 0.05) {
        st.auto = 0;
        runMany(api, 3, ch === 'host' ? 'random' : 'knows');
      }
      moving = true;
    }
    const base = h * 0.8, top = h * 0.18, bw = Math.min(110, w * 0.22);
    [['stick', 'Stick', col['hiw-ink-2']], ['switch', 'Switch', col['hiw-ink-1']]].forEach(([k, name, ink], i) => {
      const [wins, games] = st.tally[k];
      const share = games ? wins / games : 0;
      const x = w / 2 + (i ? 30 : -30 - bw);
      ctx.fillStyle = alpha(col['label-secondary'], 0.15);
      ctx.fillRect(x, top, bw, base - top);
      ctx.fillStyle = ink;
      ctx.fillRect(x, base - share * (base - top), bw, share * (base - top));
      label(ctx, `${name}: ${games ? fmt(share * 100, 1) : '–'}%`, x + bw / 2, base + 18, col.label, bg, { size: 14, align: 'center' });
      label(ctx, `${fmt(wins)} of ${fmt(games)}`, x + bw / 2, base + 36, col['label-tertiary'], bg, { size: 11, align: 'center' });
    });
    for (const [frac, name] of [[1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔']]) {
      const y = base - frac * (base - top);
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = col['label-tertiary'];
      ctx.beginPath();
      ctx.moveTo(w / 2 - 50 - bw, y);
      ctx.lineTo(w / 2 + 50 + bw, y);
      ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, name, w / 2 + 56 + bw, y, col['label-tertiary'], bg, { size: 12 });
    }
  }

  const r = st.readout;
  if (r) {
    const pc = (k) => (st.tally[k][1] ? `${fmt((st.tally[k][0] / st.tally[k][1]) * 100, 1)}%` : '–');
    r.set('stick', pc('stick'));
    r.set('switch', pc('switch'));
    r.set('games', fmt(st.tally.stick[1] + st.tally.switch[1]));
  }
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  st.ui = {};
  st.tally = { stick: [0, 0], switch: [0, 0] };
  api.status('');
  api.note({ game: '', many: 'Played thousands of times', hundred: 'A hundred doors', host: 'A host who does not know' }[id] || '');
  if (id === 'game' || id === 'hundred') {
    if (id === 'game') st.ui.pick = [0, 1, 2].map((i) => ui.button({ label: `Door ${i + 1}`, onClick: () => pickDoor(i, api) }));
    st.ui.stick = ui.button({ label: 'Stick', onClick: () => decide('stick', api) });
    st.ui.switch = ui.button({ label: 'Switch', onClick: () => decide('switch', api) });
    ui.button({ label: 'Play again', onClick: () => newGame(id === 'game' ? 3 : 100, api) });
    if (id === 'hundred') {
      ui.button({ label: 'Pick a door at random', onClick: () => pickDoor(Math.floor(Math.random() * 100), api) });
    }
    newGame(id === 'game' ? 3 : 100, api);
  } else {
    ui.button({ label: 'Play 1,000 games', onClick: () => runMany(api, 1000, id === 'host' ? 'random' : 'knows') });
    ui.button({ label: 'Start again', onClick: () => { st.tally = { stick: [0, 0], switch: [0, 0] }; api.invalidate(); } });
  }
  st.readout = api.readout([
    { key: 'stick', label: 'Won by sticking' },
    { key: 'switch', label: 'Won by switching' },
    { key: 'games', label: 'Games' },
  ]);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
