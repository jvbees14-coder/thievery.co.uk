// The prisoner's dilemma: the index card's picture. Two rows of moves,
// tit for tat answering a player who now and then defects.

import { TOKENS, box } from '../shared/draw.js';

export const colours = TOKENS;
const YOU = 'CCCDCCCCDDCCCCCCDCCC';

export function thumb(ctx, w, h, t, col) {
  const n = Math.min(YOU.length, 1 + Math.floor((t % 12) * 2.2)), cell = (w * 0.86) / YOU.length;
  for (let i = 0; i < n; i++) {
    const me = YOU[i], them = i ? YOU[i - 1] : 'C';
    [[me, h * 0.32], [them, h * 0.56]].forEach(([m, y]) => {
      box(ctx, w * 0.07 + i * cell + 1, y, cell - 2, cell * 1.4, 3);
      ctx.fillStyle = m === 'C' ? col.success : col.danger;
      ctx.fill();
    });
  }
}
