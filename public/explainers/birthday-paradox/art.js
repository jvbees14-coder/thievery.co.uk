// ---------------------------------------------------------------------------
// The birthday paradox: the arithmetic and the calendar.
//
// The chance that at least two of n people share a birthday, with 365
// equally likely days (leap days and the real, slightly uneven spread of
// births are left out, as every textbook does). It is one minus the chance
// that all n differ, which multiplies out exactly.
// ---------------------------------------------------------------------------

import { TAU, alpha } from '../engine.js';

export function pShared(n, days = 365) {
  let allDiffer = 1;
  for (let i = 0; i < n; i++) allDiffer *= (days - i) / days;
  return 1 - allDiffer;
}
export const pairs = (n) => (n * (n - 1)) / 2;
/** The smallest group with at least an even chance of a shared value among `days`. */
export function evenChance(days) {
  let n = 1;
  while (pShared(n, days) < 0.5) n++;
  return n;
}

/** The year as a ring of 365 days, with birthdays on it; shared ones ringed. */
export function drawYear(ctx, cx, cy, R, col, people, { pairsOf = null } = {}) {
  const at = (d) => (d / 365) * TAU - Math.PI / 2;
  ctx.strokeStyle = col.separator;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.stroke();
  const starts = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const names = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  ctx.font = '500 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  starts.forEach((d, i) => {
    const a = at(d);
    ctx.strokeStyle = col['separator-strong'];
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (R - 6), cy + Math.sin(a) * (R - 6));
    ctx.lineTo(cx + Math.cos(a) * (R + 6), cy + Math.sin(a) * (R + 6));
    ctx.stroke();
    const m = at(d + 15);
    ctx.fillStyle = col['label-tertiary'];
    ctx.fillText(names[i], cx + Math.cos(m) * (R + 16), cy + Math.sin(m) * (R + 16));
  });
  // Faint threads for every pair, when there are few enough to see.
  if (pairsOf && people.length <= 30) {
    ctx.strokeStyle = alpha(col['label-secondary'], 0.12);
    ctx.beginPath();
    for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
      const a = at(people[i]), b = at(people[j]);
      ctx.moveTo(cx + Math.cos(a) * R * 0.92, cy + Math.sin(a) * R * 0.92);
      ctx.lineTo(cx + Math.cos(b) * R * 0.92, cy + Math.sin(b) * R * 0.92);
    }
    ctx.stroke();
  }
  const count = new Map();
  for (const d of people) count.set(d, (count.get(d) || 0) + 1);
  const stack = new Map();
  for (const d of people) {
    const k = stack.get(d) || 0;
    stack.set(d, k + 1);
    const a = at(d), r = R + 0 - k * 9;
    const shared = count.get(d) > 1;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, shared ? 5 : 3.5, 0, TAU);
    ctx.fillStyle = shared ? col.danger : col['hiw-ink-1'];
    ctx.fill();
  }
  return [...count.values()].some((c) => c > 1);
}
