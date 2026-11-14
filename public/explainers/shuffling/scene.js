// ---------------------------------------------------------------------------
// How a shuffle mixes a deck: the scene.
//
// A deck of 52 drawn as a row of cards, each coloured by where it started.
// The reader riffles and overhands it and watches the colours break up, the
// rising sequences multiply, and (in chapter 4) the distance from a truly
// random deck fall away after five riffles. The riffle is the
// Gilbert-Shannon-Reeds model and the distances are Bayer and Diaconis's
// exact figures for it, so the chart is the real one, not a simulation.
// ---------------------------------------------------------------------------

import { mount, Smooth, alpha, fmt, clamp } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { N, DISTANCE, fresh, riffle, overhand, risingSequences, cardInk, sequenceInk, drawDeck } from './art.js';

const st = {
  order: fresh(),
  cards: Array.from({ length: N }, (_, v) => ({ place: v, lift: 0, p: new Smooth(v, 7), l: new Smooth(0, 9) })),
  riffles: 0,
  overhands: 0,
  bySequence: false,
  pending: null,     // the second half of a riffle: lift, then fall into place
  wait: 0,
  auto: 0,           // chapter 1 shuffles by itself
  readout: null,
};

function place(order, instant) {
  order.forEach((v, i) => st.cards[v].p.set(i, instant));
}

function doRiffle(api) {
  const r = riffle(st.order);
  st.order = r.order;
  st.riffles++;
  const instant = !api.motion;
  // The two halves part, one up and one down, and then fall together.
  for (let v = 0; v < N; v++) st.cards[v].l.set(r.fromTop.has(v) ? 1 : -1, instant);
  if (instant) {
    place(st.order, true);
    for (const c of st.cards) c.l.set(0, true);
  } else {
    st.pending = st.order;
    st.wait = 0.28;
  }
  changed(api);
}
function doOverhand(api) {
  st.order = overhand(st.order);
  st.overhands++;
  place(st.order, !api.motion);
  changed(api);
}
function reset(api) {
  st.order = fresh();
  st.riffles = 0;
  st.overhands = 0;
  st.pending = null;
  place(st.order, !api.motion);
  for (const c of st.cards) c.l.set(0, !api.motion);
  changed(api);
}

function changed(api) {
  const rs = risingSequences(st.order).count;
  if (api.chapter === 'seven' || api.chapter === 'rising') {
    if (st.overhands === 0 && st.riffles >= 7) api.status(`${st.riffles} riffles: as good as random.`);
    else if (st.overhands === 0 && st.riffles >= 5) api.status(`${st.riffles} riffles: mixing has started.`);
    else api.status(rs === 1 ? 'One rising sequence: the deck is in its original order.' : '');
  }
  api.invalidate();
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const still = !api.motion;
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  let moving = false;

  // Chapter 1 shuffles by itself, so the page is moving when it opens.
  if (api.chapter === 'order' && api.playing && api.motion) {
    st.auto += f.dt;
    if (st.auto > 2.4) {
      st.auto = 0;
      if (st.riffles >= 7) reset(api);
      else doRiffle(api);
    }
    moving = true;
  }
  if (st.pending) {
    st.wait -= f.dt;
    if (st.wait <= 0) {
      place(st.pending, false);
      for (const c of st.cards) c.l.set(0);
      st.pending = null;
    }
    moving = true;
  }
  for (const c of st.cards) {
    if (c.p.step(f.dt, still)) moving = true;
    if (c.l.step(f.dt, still)) moving = true;
    c.place = c.p.v;
    c.lift = c.l.v;
  }

  const rs = risingSequences(st.order);
  const showChart = api.chapter === 'seven';
  const margin = Math.max(16, w * 0.05);
  const deckH = Math.min(h * (showChart ? 0.3 : 0.42), 220);
  const deckY = showChart ? h * 0.18 : (h - deckH) / 2;
  const ink = st.bySequence ? (v) => sequenceInk(col, rs.id[v]) : (v) => cardInk(col, v);
  drawDeck(ctx, margin, deckY, w - margin * 2, deckH, st.cards, ink, col);
  label(ctx, 'Top', margin, deckY + deckH + 22, col['label-secondary'], bg, { size: 12, weight: 500 });
  label(ctx, 'Bottom', w - margin, deckY + deckH + 22, col['label-secondary'], bg, { size: 12, weight: 500, align: 'right' });

  // Chapter 4: the distance from random after each number of riffles.
  if (showChart) {
    const cx = margin + 28, cy = h * 0.62, cw = w - margin * 2 - 28, ch = h * 0.26;
    ctx.strokeStyle = col.separator;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy + ch);
    ctx.lineTo(cx + cw, cy + ch);
    ctx.stroke();
    label(ctx, '1', cx - 8, cy, col['label-secondary'], bg, { size: 11, weight: 500, align: 'right' });
    label(ctx, '0', cx - 8, cy + ch, col['label-secondary'], bg, { size: 11, weight: 500, align: 'right' });
    const bw = cw / DISTANCE.length;
    DISTANCE.forEach((d, i) => {
      const here = st.overhands === 0 && Math.min(st.riffles, 10) === i + 1;
      const bh = d * ch;
      ctx.fillStyle = here ? col.accent : alpha(col['label-secondary'], 0.35);
      ctx.fillRect(cx + i * bw + bw * 0.18, cy + ch - bh, bw * 0.64, bh);
      label(ctx, String(i + 1), cx + i * bw + bw / 2, cy + ch + 14, here ? col.accent : col['label-secondary'], bg, { size: 11, align: 'center' });
    });
    label(ctx, 'Distance from random, after this many riffles', cx, cy - 16, col.label, bg, { size: 12 });
  }

  const r = st.readout;
  if (r) {
    r.set('riffles', fmt(st.riffles));
    r.set('overhands', fmt(st.overhands));
    r.set('rising', fmt(rs.count));
    r.set('distance', st.overhands ? '–' : st.riffles === 0 ? '1.000' : st.riffles > 10 ? 'under 0.043' : DISTANCE[st.riffles - 1].toFixed(3));
  }
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  st.auto = 0;
  api.status('');
  api.note(id === 'order' ? 'Each card is coloured by where it started' : id === 'rising' ? 'Colours show rising sequences' : '');
  st.bySequence = id === 'rising';
  // Chapter 1 shuffles itself; the rest are the reader's to shuffle. The
  // overhand chapter, and any riffle chapter arrived at with overhands
  // already done, start from a new deck so the numbers mean something.
  if (id === 'order' || id === 'overhand' || st.overhands) reset(api);
  if (id !== 'order') ui.button({ label: 'Riffle', onClick: () => doRiffle(api) });
  if (id === 'overhand') {
    ui.button({ label: 'Overhand', onClick: () => doOverhand(api) });
    ui.button({
      label: 'Overhand 100 times',
      onClick: () => {
        for (let i = 0; i < 99; i++) {
          st.order = overhand(st.order);
          st.overhands++;
        }
        doOverhand(api);
      },
    });
  }
  if (id !== 'order') ui.button({ label: 'New deck', onClick: () => reset(api) });
  if (id === 'rising' || id === 'seven') {
    ui.toggle({ label: 'Colour by rising sequence', checked: st.bySequence, onChange: (on) => { st.bySequence = on; api.invalidate(); } });
  }
  st.readout = api.readout([
    { key: 'riffles', label: 'Riffles' },
    ...(id === 'overhand' ? [{ key: 'overhands', label: 'Overhands' }] : []),
    { key: 'rising', label: 'Rising sequences' },
    { key: 'distance', label: 'Distance from random' },
  ]);
  changed(api);
}

mount({ colours: TOKENS, chapter, draw });
