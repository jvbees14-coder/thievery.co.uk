// ---------------------------------------------------------------------------
// Card counting: the shoe, the cards, and the Hi-Lo count.
//
// A six-deck shoe is shuffled, dealt one card at a time, and counted the way
// the Hi-Lo system counts it. The edge shown is the counters' rule of thumb
// (about half a percentage point per point of true count, from a starting
// edge of half a percent to the house), which is approximate and is said
// so on the page; nothing here is a simulation of blackjack itself.
// ---------------------------------------------------------------------------

import { mix } from '../shared/draw.js';

export const DECKS = 6;
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const SUITS = ['♠', '♥', '♦', '♣'];
export const BASE_EDGE = -0.5;       // per cent, for the player, with basic strategy and good rules
export const PER_TRUE_COUNT = 0.5;   // per cent per point of true count: a rule of thumb
export const CUT = 0.75;             // the cut card: three-quarters of the shoe is dealt

/** Hi-Lo: low cards out are good for the player, high cards out are bad. */
export function hiLo(rank) {
  const i = RANKS.indexOf(rank);
  if (i <= 4) return 1;   // 2 to 6
  if (i <= 7) return 0;   // 7 to 9
  return -1;              // 10, J, Q, K, A
}

export function newShoe(rand = Math.random) {
  const shoe = [];
  for (let d = 0; d < DECKS; d++) for (const s of SUITS) for (const r of RANKS) shoe.push({ r, s });
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

/** A playing card, face up, on the site's own card stock. */
export function drawCard(ctx, x, y, w, card, col, { tilt = 0, alpha = 1, tag = null } = {}) {
  const h = w * 1.4;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(-w / 2, -h / 2, w, h, w * 0.1) : ctx.rect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = col.stock;
  ctx.fill();
  ctx.strokeStyle = col['stock-edge'];
  ctx.lineWidth = 1;
  ctx.stroke();
  const red = card.s === '♥' || card.s === '♦';
  ctx.fillStyle = red ? col['stock-red'] : col['stock-ink'];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(w * 0.36)}px system-ui, sans-serif`;
  ctx.fillText(card.r, 0, -h * 0.12);
  ctx.font = `${Math.round(w * 0.32)}px system-ui, sans-serif`;
  ctx.fillText(card.s, 0, h * 0.2);
  ctx.restore();
  if (tag !== null) {
    const v = hiLo(card.r);
    const ink = v > 0 ? col.success : v < 0 ? col.danger : col['label-secondary'];
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.font = `700 ${Math.round(Math.max(12, w * 0.28))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = ink;
    ctx.fillText(v > 0 ? '+1' : v < 0 ? '−1' : '0', x, y + h / 2 + Math.max(14, w * 0.3));
    ctx.restore();
  }
}

/** A face-down card, the site's own back. */
export function drawBack(ctx, x, y, w, col) {
  const h = w * 1.4;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x - w / 2, y - h / 2, w, h, w * 0.1) : ctx.rect(x - w / 2, y - h / 2, w, h);
  ctx.fillStyle = col.back;
  ctx.fill();
  ctx.strokeStyle = col['back-edge'];
  ctx.stroke();
  ctx.strokeStyle = mix(col.accent, col.back, 0.5);
  ctx.strokeRect(x - w / 2 + w * 0.12, y - h / 2 + w * 0.12, w * 0.76, h - w * 0.24);
}
