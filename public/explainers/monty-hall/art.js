// ---------------------------------------------------------------------------
// The Monty Hall problem: doors, and the game played out.
//
// One prize behind n doors. The player picks one; the host, who knows where
// the prize is, opens every other door but one, never the prize. Then the
// player sticks or switches. `play` runs a whole game with a given choice
// and says whether it won; `randomHost` runs the variant where the host
// opens doors without knowing, and games where he reveals the prize are
// thrown away, which is the version where switching does not help.
// ---------------------------------------------------------------------------

import { TAU } from '../engine.js';
import { label, box } from '../shared/draw.js';

export function deal(n, rand = Math.random) {
  return { n, prize: Math.floor(rand() * n), pick: null, open: new Set(), final: null };
}

/** The host opens every door except the pick and one other, never the prize. */
export function hostOpens(g, rand = Math.random) {
  let keep = g.prize;
  if (keep === g.pick) {
    do keep = Math.floor(rand() * g.n);
    while (keep === g.pick);
  }
  g.open = new Set();
  for (let i = 0; i < g.n; i++) if (i !== g.pick && i !== keep) g.open.add(i);
  g.other = keep;
  return g;
}

export function play(n, choice, rand = Math.random) {
  const g = deal(n, rand);
  g.pick = Math.floor(rand() * n);
  hostOpens(g, rand);
  const final = choice === 'switch' ? g.other : g.pick;
  return final === g.prize;
}

/** The host who does not know: returns null for a game he spoiled. */
export function randomHost(choice, rand = Math.random) {
  const prize = Math.floor(rand() * 3), pick = Math.floor(rand() * 3);
  const others = [0, 1, 2].filter((d) => d !== pick);
  const opened = others[Math.floor(rand() * 2)];
  if (opened === prize) return null;
  const other = others.find((d) => d !== opened);
  return (choice === 'switch' ? other : pick) === prize;
}

/** A door: closed with its number, or open on a prize or nothing. */
export function drawDoor(ctx, x, y, w, h, col, { num, open = false, prize = false, picked = false, other = false }) {
  box(ctx, x, y, w, h, Math.max(3, w * 0.08));
  ctx.fillStyle = open ? col['bg-elevated-2'] : col['bg-elevated'];
  ctx.fill();
  ctx.lineWidth = picked ? 3 : 1.5;
  ctx.strokeStyle = picked ? col.accent : other ? col['hiw-ink-1'] : col['separator-strong'];
  ctx.stroke();
  const bg = col['hiw-scene-bg'];
  if (open) {
    if (prize) {
      // The prize: a bar of gold.
      ctx.fillStyle = col.accent;
      const bw = w * 0.56, bh = Math.max(4, h * 0.14);
      ctx.beginPath();
      ctx.moveTo(x + w / 2 - bw / 2, y + h / 2 + bh / 2);
      ctx.lineTo(x + w / 2 + bw / 2, y + h / 2 + bh / 2);
      ctx.lineTo(x + w / 2 + bw * 0.35, y + h / 2 - bh / 2);
      ctx.lineTo(x + w / 2 - bw * 0.35, y + h / 2 - bh / 2);
      ctx.closePath();
      ctx.fill();
      if (w > 40) label(ctx, 'Prize', x + w / 2, y + h * 0.78, col.accent, bg, { size: 12, align: 'center' });
    } else if (w > 40) {
      label(ctx, 'Empty', x + w / 2, y + h / 2, col['label-tertiary'], null, { size: 12, align: 'center' });
    }
  } else {
    // A handle, and the number.
    ctx.beginPath();
    ctx.arc(x + w * 0.8, y + h * 0.55, Math.max(1.5, w * 0.04), 0, TAU);
    ctx.fillStyle = col['label-secondary'];
    ctx.fill();
    if (num != null && w > 18) label(ctx, String(num), x + w / 2, y + h * 0.35, col.label, null, { size: Math.min(26, w * 0.32), weight: 700, align: 'center' });
  }
}
