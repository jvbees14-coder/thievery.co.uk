// ---------------------------------------------------------------------------
// How card counting works: the scene.
//
// A six-deck shoe dealt one card at a time. Each card is tagged with its
// Hi-Lo value, the running count and true count are kept, and the shoe's
// remaining make-up (low, middle and high cards) is drawn against the share
// each group has in a full shoe. The edge is the counters' rule of thumb and
// is labelled as rough wherever it appears.
// ---------------------------------------------------------------------------

import { mount, Smooth, alpha, fmt, signed, clamp, lerp, ease } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { DECKS, RANKS, BASE_EDGE, PER_TRUE_COUNT, CUT, hiLo, newShoe, drawCard, drawBack } from './art.js';

const TOTAL = DECKS * 52;
const st = {
  shoe: newShoe(),
  dealt: [],
  running: 0,
  flight: new Smooth(1, 7),   // 0 as a card leaves the shoe, 1 when it lands
  timer: 0,
  hold: 0,
  hide: false,
  readout: null,
};

function deal(api, n = 1) {
  for (let i = 0; i < n; i++) {
    if (st.dealt.length >= TOTAL * CUT) break;
    const c = st.shoe[st.dealt.length];
    st.dealt.push(c);
    st.running += hiLo(c.r);
  }
  st.flight.set(0, true);
  st.flight.set(1, !api.motion);
  if (st.dealt.length >= TOTAL * CUT) api.status('The cut card: the shoe is shuffled from here.');
  api.invalidate();
}
function reshuffle(api) {
  st.shoe = newShoe();
  st.dealt = [];
  st.running = 0;
  st.hold = 0;
  api.status('');
  api.invalidate();
}

const decksLeft = () => (TOTAL - st.dealt.length) / 52;
const trueCount = () => st.running / Math.max(0.5, decksLeft());

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  let moving = st.flight.step(dt, !api.motion);

  // Dealing by itself, about a card a second, and starting a new shoe a
  // moment after the cut card comes out.
  if (api.playing && api.motion) {
    moving = true;
    if (st.dealt.length >= TOTAL * CUT) {
      st.hold += dt;
      if (st.hold > 2.5) reshuffle(api);
    } else {
      st.timer += dt;
      if (st.timer > (ch === 'edge' ? 0.9 : 1.1)) {
        st.timer = 0;
        deal(api);
      }
    }
  }

  const cw = clamp(Math.min(w * 0.17, h * 0.2), 44, 96);
  const top = h * 0.3;
  // The shoe, with how much of it is left.
  const sx = w * 0.16;
  for (let i = 3; i >= 0; i--) drawBack(ctx, sx + i * 2, top + i * 2, cw, col);
  const left = 1 - st.dealt.length / TOTAL;
  const barY = top + cw * 0.85, barW = cw * 1.1;
  ctx.fillStyle = alpha(col['label-secondary'], 0.25);
  ctx.fillRect(sx - barW / 2, barY, barW, 5);
  ctx.fillStyle = col.accent;
  ctx.fillRect(sx - barW / 2, barY, barW * left, 5);
  ctx.fillStyle = col.danger;
  ctx.fillRect(sx - barW / 2 + barW * (1 - CUT) - 1, barY - 3, 2, 11);
  label(ctx, `${fmt(decksLeft(), 1)} decks left`, sx, barY + 20, col['label-secondary'], bg, { size: 12, weight: 500, align: 'center' });

  // The card just dealt, on its way from the shoe.
  const showTags = ch !== 'edge' && !st.hide;
  const last = st.dealt[st.dealt.length - 1];
  if (last) {
    const e = ease.out(st.flight.v);
    drawCard(ctx, lerp(sx, w * 0.5, e), lerp(top, top, e), cw * lerp(0.8, 1.15, e), last, col, { tilt: (1 - e) * -0.3, tag: showTags && e > 0.6 ? true : null });
  } else {
    label(ctx, 'Press Deal, or Play', w * 0.5, top, col['label-secondary'], bg, { size: 13, align: 'center' });
  }

  // The last few cards, smaller, with their tags.
  const hist = st.dealt.slice(-9, -1);
  const sw = clamp(w / 14, 26, 46);
  const hy = h * 0.66;
  hist.forEach((c, i) => {
    const x = w / 2 - ((hist.length - 1) * sw * 1.12) / 2 + i * sw * 1.12;
    drawCard(ctx, x, hy, sw, c, col, { alpha: 0.55 + (0.45 * (i + 1)) / hist.length, tag: showTags ? true : null });
  });

  // What is left in the shoe, by Hi-Lo group, against a full shoe's share.
  if (ch === 'why' || ch === 'catch' || ch === 'true') {
    const rest = st.shoe.slice(st.dealt.length);
    const groups = [
      { name: '2 to 6', v: 1, share: 5 / 13 },
      { name: '7 to 9', v: 0, share: 3 / 13 },
      { name: '10 to A', v: -1, share: 5 / 13 },
    ];
    const gx = w * 0.72, gy = h * 0.14, gw = Math.min(w * 0.24, 150);
    if (w > 520) {
      groups.forEach((g, i) => {
        const now = rest.filter((c) => hiLo(c.r) === g.v).length / Math.max(1, rest.length);
        const y = gy + i * 34;
        label(ctx, g.name, gx, y, col['label-secondary'], bg, { size: 12, weight: 500 });
        ctx.fillStyle = alpha(col['label-secondary'], 0.2);
        ctx.fillRect(gx, y + 9, gw, 8);
        ctx.fillStyle = g.v > 0 ? col.success : g.v < 0 ? col.danger : col['label-secondary'];
        ctx.fillRect(gx, y + 9, gw * Math.min(1, now / 0.6), 8);
        ctx.fillStyle = col.label;
        ctx.fillRect(gx + gw * (g.share / 0.6) - 1, y + 6, 2, 14);
      });
      label(ctx, 'Left in the shoe; line = a full shoe', gx, gy + 3 * 34 + 2, col['label-tertiary'], bg, { size: 11, weight: 500 });
    }
  }

  const r = st.readout;
  if (r) {
    const tc = trueCount();
    const edge = BASE_EDGE + PER_TRUE_COUNT * tc;
    r.set('dealt', `${fmt(st.dealt.length)} of ${fmt(TOTAL)}`);
    r.set('running', st.hide ? '?' : signed(st.running));
    r.set('decks', fmt(decksLeft(), 1));
    r.set('true', st.hide ? '?' : signed(tc, 1));
    r.set('edge', st.hide ? '?' : `${signed(edge, 1)}%`);
  }
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.note(id === 'edge' ? 'Six decks, shuffled' : id === 'why' || id === 'catch' ? 'Edge is a rough rule of thumb' : '');
  ui.button({ label: 'Deal', onClick: () => deal(api) });
  ui.button({ label: 'Deal 20', onClick: () => deal(api, 20) });
  ui.button({ label: 'New shoe', onClick: () => reshuffle(api) });
  if (id === 'count' || id === 'true') {
    ui.toggle({
      label: 'Hide the count and test yourself',
      checked: st.hide,
      onChange(on) {
        st.hide = on;
        api.invalidate();
      },
    });
  } else st.hide = false;
  const rows = [{ key: 'dealt', label: 'Cards dealt' }];
  if (id !== 'edge') rows.push({ key: 'running', label: 'Running count' });
  if (id === 'true' || id === 'why' || id === 'catch') rows.push({ key: 'decks', label: 'Decks left' }, { key: 'true', label: 'True count' });
  if (id === 'why' || id === 'catch') rows.push({ key: 'edge', label: 'Player edge, roughly' });
  st.readout = api.readout(rows);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
