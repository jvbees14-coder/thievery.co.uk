// ---------------------------------------------------------------------------
// How a search engine ranks pages: the scene.
//
// Eight pages and their links. Chapter 1 sizes them by links in; chapter 2
// sends a random surfer round them and counts the visits; chapter 3 does
// the sum itself, a round at a time; chapter 4 changes the damping.
// ---------------------------------------------------------------------------

import { mount, fmt, alpha, TAU, clamp } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { PAGES, LINKS, inLinks, step, pagerank, hop } from './art.js';

const st = {
  at: 0, to: 1, t: 0, jump: false,
  visits: new Array(PAGES.length).fill(0), hops: 0,
  rank: null, rounds: 0,
  d: 0.85,
  readout: null,
};

const layout = (w, h) => {
  const top = 64, bottom = 24, side = 40;
  return PAGES.map((p) => [side + p.x * (w - 2 * side), top + p.y * (h - top - bottom) * 0.92]);
};

function drawWeb(ctx, w, h, col, bg, sizes, colourOf) {
  const pos = layout(w, h);
  const R = (v) => clamp(10 + Math.sqrt(v) * Math.min(w, h) * 0.13, 12, Math.min(w, h) * 0.12);
  // Links, curved a little so two pages that link both ways show two lines.
  LINKS.forEach((out, i) => {
    for (const j of out) {
      const [x1, y1] = pos[i], [x2, y2] = pos[j];
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
      const nx = -dy / L, ny = dx / L, bend = 14;
      const mx = (x1 + x2) / 2 + nx * bend, my = (y1 + y2) / 2 + ny * bend;
      ctx.strokeStyle = alpha(col['label-tertiary'], 0.6);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(mx, my, x2, y2);
      ctx.stroke();
      // The arrowhead, where the curve meets the target's circle.
      const rj = R(sizes[j]) + 3;
      const tx = x2 - (x2 - mx) / Math.hypot(x2 - mx, y2 - my) * rj, ty = y2 - (y2 - my) / Math.hypot(x2 - mx, y2 - my) * rj;
      const a = Math.atan2(y2 - my, x2 - mx);
      ctx.fillStyle = alpha(col['label-tertiary'], 0.9);
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - Math.cos(a - 0.4) * 8, ty - Math.sin(a - 0.4) * 8);
      ctx.lineTo(tx - Math.cos(a + 0.4) * 8, ty - Math.sin(a + 0.4) * 8);
      ctx.closePath();
      ctx.fill();
    }
  });
  PAGES.forEach((p, i) => {
    const [x, y] = pos[i], r = R(sizes[i]);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = colourOf(i);
    ctx.fill();
    label(ctx, p.name, x, y + r + 11, col.label, bg, { size: 12, weight: 700, align: 'center' });
  });
  return pos;
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  let moving = false;
  const n = PAGES.length;

  if (ch === 'links') {
    const c = inLinks();
    drawWeb(ctx, w, h, col, bg, c.map((v) => v / 4 * 0.35), () => alpha(col['hiw-ink-1'], 0.8));
    const pos = layout(w, h);
    c.forEach((v, i) => label(ctx, String(v), pos[i][0], pos[i][1], col['stock-ink'], null, { size: 13, weight: 800, align: 'center' }));
  } else if (ch === 'surfer') {
    if (api.playing && api.motion) {
      st.t += dt * (st.hops < 30 ? 2 : 12);
      while (st.t >= 1) {
        st.t -= 1;
        st.at = st.to;
        st.visits[st.at]++;
        st.hops++;
        const hp = hop(st.at, 0.85);
        st.to = hp.to;
        st.jump = hp.jump;
      }
      moving = true;
    }
    const share = st.visits.map((v) => (st.hops ? v / st.hops : 1 / n));
    const pos = drawWeb(ctx, w, h, col, bg, share, (i) => (i === st.at ? col.accent : alpha(col['hiw-ink-1'], 0.8)));
    const [x1, y1] = pos[st.at], [x2, y2] = pos[st.to];
    const x = x1 + (x2 - x1) * st.t, y = y1 + (y2 - y1) * st.t - (st.jump ? Math.sin(st.t * Math.PI) * 60 : 0);
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, TAU);
    ctx.fillStyle = st.jump ? col.warning : col.accent;
    ctx.fill();
    r?.set('hops', fmt(st.hops));
    const best = share.indexOf(Math.max(...share));
    r?.set('most', st.hops ? `${PAGES[best].name}, ${fmt(share[best] * 100, 0)}%` : '–');
  } else if (ch === 'rank' || ch === 'damping') {
    const rank = ch === 'damping' ? pagerank(st.d) : st.rank;
    drawWeb(ctx, w, h, col, bg, rank, () => alpha(col.accent, 0.85));
    const pos = layout(w, h);
    rank.forEach((v, i) => label(ctx, `${fmt(v * 100, 0)}%`, pos[i][0], pos[i][1], col['stock-ink'], null, { size: 11, weight: 800, align: 'center' }));
    r?.set('rounds', fmt(st.rounds));
    const order = [...rank.keys()].sort((a, b) => rank[b] - rank[a]);
    r?.set('top', order.slice(0, 3).map((i) => PAGES[i].name).join(', '));
  }
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({
    links: 'Each page sized by the links pointing to it',
    surfer: 'Each page sized by the surfer’s visits',
    rank: 'Each page sized by its rank',
    damping: 'Each page sized by its rank',
  }[id]);
  st.readout = null;
  if (id === 'surfer') {
    const reset = () => {
      st.visits.fill(0);
      st.hops = 0;
      st.at = 0;
      st.to = LINKS[0][0];
      st.t = 0;
      api.invalidate();
    };
    reset();
    ui.button({
      label: 'Take 1,000 hops',
      onClick() {
        for (let k = 0; k < 1000; k++) {
          st.at = hop(st.at, 0.85).to;
          st.visits[st.at]++;
          st.hops++;
        }
        st.to = hop(st.at, 0.85).to;
        st.t = 0;
        api.invalidate();
      },
    });
    ui.button({ label: 'Start again', onClick: reset });
    st.readout = api.readout([{ key: 'hops', label: 'Hops' }, { key: 'most', label: 'Visited most' }]);
    api.status('Orange hops are jumps to a page at random.');
  } else if (id === 'rank') {
    st.rank = new Array(PAGES.length).fill(1 / PAGES.length);
    st.rounds = 0;
    ui.button({ label: 'One round', onClick() { st.rank = step(st.rank); st.rounds++; api.invalidate(); } });
    ui.button({ label: 'Start again', onClick() { st.rank = new Array(PAGES.length).fill(1 / PAGES.length); st.rounds = 0; api.invalidate(); } });
    st.readout = api.readout([{ key: 'rounds', label: 'Rounds' }, { key: 'top', label: 'Top three' }]);
  } else if (id === 'damping') {
    ui.slider({
      label: 'Chance of following a link',
      min: 0.05,
      max: 0.99,
      step: 0.01,
      value: st.d,
      format: (v) => `${Math.round(v * 100)}%`,
      onInput(v) { st.d = v; api.invalidate(); },
    });
    st.rounds = 200;
    st.readout = api.readout([{ key: 'top', label: 'Top three' }]);
  }
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
