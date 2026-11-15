// The Monty Hall problem: the index card's picture. Three doors; one
// opens on nothing, and the other shut one glows.

import { TOKENS } from '../shared/draw.js';
import { drawDoor } from './art.js';

export const colours = TOKENS;

export function thumb(ctx, w, h, t, col) {
  const step = Math.floor(t / 1.6) % 3;
  const dw = Math.min(w / 4.4, h / 1.9), dh = dw * 1.6, gap = dw * 0.25;
  const x0 = (w - 3 * dw - 2 * gap) / 2, y0 = (h - dh) / 2;
  for (let i = 0; i < 3; i++) {
    drawDoor(ctx, x0 + i * (dw + gap), y0, dw, dh, col, {
      num: i + 1,
      open: (step >= 1 && i === 2) || (step === 2 && i === 1),
      prize: i === 1,
      picked: i === 0,
      other: step === 1 && i === 1,
    });
  }
}
