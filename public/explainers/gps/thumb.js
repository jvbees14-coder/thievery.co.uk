// ---------------------------------------------------------------------------
// GPS: the moving picture on the /how-it-works card.
//
// The same globe as the explainer's first chapter, smaller, and turning a
// little slower so that a page of cards is not all motion.
// ---------------------------------------------------------------------------

import * as G from './globe.js';

export const colours = G.TOKENS;

export function thumb(ctx, w, h, t, col) {
  const sim = 1800 + t * 600;
  const cam = G.fit(w, h, 2.1 + t * 0.03, 0.4, 1.02);
  G.drawGlobe(ctx, cam, sim, G.inks(col));
}

/** The share picture: the globe, turned so London faces the viewer, with
    signals spreading from four satellites in view. */
export function share(ctx, w, h, _t, col) {
  const t = 5400;
  const yaw = (-0.13 * Math.PI) / 180 + (2 * Math.PI * t) / G.SIDEREAL_DAY + (100 * Math.PI) / 180;
  const cam = G.fit(w, h, yaw, 0.38, 1.06);
  const placed = G.drawGlobe(ctx, cam, t, G.inks(col));
  const you = G.groundAt(51.5, -0.13, t);
  const q = G.project(cam, you);
  G.SATS.map((s, i) => [i, G.elevation(G.satAt(s, t), you)])
    .filter(([, e]) => e > 0.3)
    .slice(0, 4)
    .forEach(([i], k) => {
      const p = placed[i];
      for (const r of [0.35, 0.7]) {
        ctx.beginPath();
        ctx.arc(p[0], p[1], G.distance(G.satAt(G.SATS[i], t), you) * r * cam.scale + k * 6, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(241, 211, 130, ${0.55 - r * 0.4})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });
  if (q[2] > 0) {
    ctx.beginPath();
    ctx.arc(q[0], q[1], 5, 0, Math.PI * 2);
    ctx.fillStyle = col.label;
    ctx.fill();
  }
}
