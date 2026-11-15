// ---------------------------------------------------------------------------
// Why the house always wins: the scene.
//
// A European wheel, spun for real (a random pocket, then an eased spin that
// lands on it). Chapter 3 gives a hundred players £100 each and lets them
// bet £1 on red a thousand times, drawing every balance; chapter 4 does the
// same with the doubling system; chapter 5 adds the American 00. Nothing
// here is a recommendation to gamble: the whole page is the opposite.
// ---------------------------------------------------------------------------

import { mount, fmt, signed, alpha, ease, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { REDS, spin, redBet, drawWheel, ballAt } from './art.js';

const st = {
  angle: 0,
  ball: null,
  spinning: null,     // { t, from, to, target }
  last: null,
  history: [],
  players: [],        // arrays of balances
  step: 0,
  pockets: 37,
  system: 'flat',
  readout: null,
};

function spinOnce(api) {
  const target = spin(37);
  if (!api.motion) {
    st.last = target;
    st.ball = ballAt(target, st.angle);
    st.history.push(target);
    api.invalidate();
    return;
  }
  st.spinning = { t: 0, from: st.angle, to: st.angle + TAU * (2 + Math.random()), target };
  api.invalidate();
}

// A hundred players, £100 each, a thousand spins.
function seat(api) {
  st.players = Array.from({ length: 100 }, () => [100]);
  st.step = 0;
  api.invalidate();
}
function betRound() {
  for (const p of st.players) {
    const bal = p[p.length - 1];
    if (bal <= 0) {
      p.push(0);
      continue;
    }
    if (st.system === 'double') {
      // Double the stake after every loss, back to £1 after a win, and
      // never more than the table's £100 limit or what is left.
      p.stake = p.stake || 1;
      const stake = Math.min(p.stake, bal, 100);
      const won = redBet(st.pockets) > 0;
      p.push(bal + (won ? stake : -stake));
      p.stake = won ? 1 : Math.min(p.stake * 2, 100);
    } else {
      p.push(bal + redBet(st.pockets));
    }
  }
  st.step++;
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  let moving = false;

  if (ch === 'wheel' || ch === 'edge') {
    if (st.spinning) {
      const s = st.spinning;
      s.t = Math.min(1, s.t + dt / 3);
      st.angle = s.from + (s.to - s.from) * ease.out(s.t);
      st.ball = ballAt(s.target, st.angle) - (1 - ease.out(s.t)) * TAU * 3;
      if (s.t >= 1) {
        st.last = s.target;
        st.history.push(s.target);
        st.spinning = null;
        api.status(`${s.target}: ${s.target === 0 ? 'zero, so every bet on red or black loses' : REDS.has(s.target) ? 'red' : 'black'}.`);
      }
      moving = true;
    }
    const R = Math.min(w * 0.36, h * 0.4);
    drawWheel(ctx, w * (w > 560 ? 0.32 : 0.5), h * 0.5, R, col, st.angle, st.ball);
    if (w > 560) {
      // The last few results.
      st.history.slice(-12).reverse().forEach((n, i) => {
        const x = w * 0.68, y = 40 + i * 24;
        ctx.fillStyle = n === 0 ? col.success : REDS.has(n) ? col['stock-red'] : col['stock-ink'];
        ctx.fillRect(x, y - 9, 30, 18);
        label(ctx, String(n), x + 15, y, col.stock, null, { size: 12, align: 'center' });
      });
    }
  }

  if (ch === 'long' || ch === 'systems' || ch === 'american') {
    if (api.playing && api.motion && st.step < 1000) {
      for (let i = 0; i < 10 && st.step < 1000; i++) betRound();
      moving = true;
    }
    const x0 = 50, x1 = w - 16, y0 = 30, y1 = h - 40;
    const max = st.system === 'double' ? 400 : 200;
    const X = (t) => x0 + (t / 1000) * (x1 - x0), Y = (v) => y1 - (Math.max(0, Math.min(max, v)) / max) * (y1 - y0);
    ctx.strokeStyle = col.separator;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0, y1);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x0, Y(100));
    ctx.lineTo(x1, Y(100));
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, '£100', x0 - 6, Y(100), col['label-tertiary'], bg, { size: 11, align: 'right' });
    label(ctx, 'Spins', x1, y1 + 14, col['label-tertiary'], bg, { size: 11, align: 'right' });
    ctx.lineWidth = 1;
    for (const p of st.players) {
      const end = p[p.length - 1];
      ctx.strokeStyle = alpha(end > 100 ? col.success : col['hiw-ink-2'], 0.35);
      ctx.beginPath();
      p.forEach((v, t) => (t ? ctx.lineTo(X(t), Y(v)) : ctx.moveTo(X(0), Y(v))));
      ctx.stroke();
    }
    // What the arithmetic expects, for a flat £1 on red.
    if (st.system === 'flat') {
      const edge = st.pockets === 38 ? 2 / 38 : 1 / 37;
      ctx.strokeStyle = col.accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(X(0), Y(100));
      ctx.lineTo(X(1000), Y(100 - 1000 * edge));
      ctx.stroke();
      label(ctx, 'Expected', X(1000) - 4, Y(100 - 1000 * edge) - 12, col.accent, bg, { size: 12, align: 'right' });
    }
  }

  const r = st.readout;
  if (r) {
    const spins = st.history.length;
    const reds = st.history.filter((n) => REDS.has(n)).length;
    r.set('spins', fmt(spins));
    r.set('net', spins ? `${signed(2 * reds - spins)} on £1 a spin` : '–');
    const balances = st.players.map((p) => p[p.length - 1]);
    r.set('step', fmt(st.step));
    r.set('ahead', balances.length ? `${balances.filter((b) => b > 100).length} of 100` : '–');
    r.set('broke', balances.length ? `${balances.filter((b) => b <= 0).length} of 100` : '–');
    r.set('mean', balances.length ? `£${fmt(balances.reduce((a, b) => a + b, 0) / balances.length, 2)}` : '–');
    r.set('edge', st.pockets === 38 ? '5.26%' : '2.70%');
  }
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ wheel: 'A European wheel', edge: 'A European wheel', long: '100 players, £1 on red each spin', systems: 'Doubling after every loss, £100 table limit', american: 'An American wheel, with 00' }[id]);
  if (id === 'wheel' || id === 'edge') {
    ui.button({ label: 'Spin', onClick: () => spinOnce(api) });
    ui.button({
      label: 'Spin 1,000 times',
      onClick() {
        for (let i = 0; i < 1000; i++) st.history.push(spin(37));
        api.invalidate();
      },
    });
    st.readout = api.readout([{ key: 'spins', label: 'Spins' }, { key: 'net', label: 'Betting red every time' }, { key: 'edge', label: 'House edge' }]);
  } else {
    st.pockets = id === 'american' ? 38 : 37;
    st.system = id === 'systems' ? 'double' : 'flat';
    seat(api);
    ui.button({ label: 'Play it all at once', onClick: () => { while (st.step < 1000) betRound(); api.invalidate(); } });
    ui.button({ label: 'New players', onClick: () => seat(api) });
    st.readout = api.readout([
      { key: 'step', label: 'Spins' },
      { key: 'ahead', label: 'Players ahead' },
      { key: 'broke', label: 'Players with nothing left' },
      { key: 'mean', label: 'Average balance' },
      { key: 'edge', label: 'House edge' },
    ]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
