// How a screen makes every colour: the index card's picture. Three
// overlapping lights, red, green and blue, mixing to white in the middle.
// Literal colours, as in the scene: the colours are the subject.

export const colours = [];

export function thumb(ctx, w, h, t) {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.28, d = R * (0.55 + 0.1 * Math.sin(t));
  ctx.save();
  ctx.fillStyle = 'rgb(0, 0, 0)';
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'lighter';
  [['rgb(255, 0, 0)', -90], ['rgb(0, 255, 0)', 30], ['rgb(0, 0, 255)', 150]].forEach(([c, a]) => {
    const r = (a * Math.PI) / 180;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(r) * d, cy + Math.sin(r) * d, R, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
  });
  ctx.restore();
}
