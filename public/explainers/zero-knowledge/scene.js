// ---------------------------------------------------------------------------
// Zero-knowledge proofs: the scene.
//
// The cave from Quisquater and colleagues' "How to explain zero-knowledge
// protocols to your children" (1989): a ring-shaped tunnel with a locked
// door at the far side. Peggy goes in by the left or the right while Victor
// waits outside; he calls a side and she must come out of it. Knowing the
// door's word, she always can; not knowing it, only half the time.
// ---------------------------------------------------------------------------

import { mount, fmt, TAU } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';

const st = { knows: true, rounds: 0, passed: 0, failed: false, anim: null, log: [], readout: null };

function playRound() {
  if (st.failed) return null;
  const went = Math.random() < 0.5 ? 'left' : 'right';
  const asked = Math.random() < 0.5 ? 'left' : 'right';
  const ok = st.knows || went === asked;
  st.rounds++;
  if (ok) st.passed++;
  else st.failed = true;
  st.log.push({ went, asked, ok });
  return { went, asked, ok };
}

function cave(ctx, w, h, col, bg) {
  const cx = w / 2, cy = h * 0.46, R = Math.min(w * 0.3, h * 0.28);
  ctx.strokeStyle = col['bg-elevated-2'];
  ctx.lineWidth = Math.max(18, R * 0.22);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.stroke();
  // The entrance tunnel at the bottom.
  ctx.beginPath();
  ctx.moveTo(cx, cy + R);
  ctx.lineTo(cx, cy + R + R * 0.7);
  ctx.stroke();
  // The door at the top.
  ctx.fillStyle = col.warning;
  ctx.fillRect(cx - 4, cy - R - ctx.lineWidth / 2, 8, ctx.lineWidth);
  ctx.lineWidth = 1;
  label(ctx, 'Locked door', cx, cy - R - R * 0.2 - 8, col.warning, bg, { size: 11, weight: 700, align: 'center' });
  label(ctx, 'Left', cx - R - 30, cy, col['label-secondary'], bg, { size: 12, align: 'center' });
  label(ctx, 'Right', cx + R + 34, cy, col['label-secondary'], bg, { size: 12, align: 'center' });
  label(ctx, 'Victor waits here', cx, cy + R * 1.7 + 14, col['label-secondary'], bg, { size: 11, align: 'center' });
  return { cx, cy, R };
}

// Peggy's position along a round's path, from 0 to 1.
function peggyAt(g, a, u) {
  const side = (s) => (s === 'left' ? 1 : -1);
  // In along the entrance, round to the far side by her chosen way, wait,
  // then back out by the side Victor named (through the door if need be).
  const entrance = (k) => [g.cx, g.cy + g.R + g.R * 0.7 * (1 - k)];
  const around = (s, k) => {
    const ang = Math.PI / 2 + side(s) * k * (Math.PI * 0.9);
    return [g.cx + Math.cos(ang) * g.R, g.cy + Math.sin(ang) * g.R];
  };
  if (u < 0.15) return entrance(u / 0.15);
  if (u < 0.4) return around(a.went, (u - 0.15) / 0.25);
  if (u < 0.55) return around(a.went, 1);
  const back = (u - 0.55) / 0.3;
  if (a.ok) {
    if (u >= 0.85) return entrance(1 - Math.min(1, (u - 0.85) / 0.15));
    // Through the door if needed: swap sides at the top.
    return around(a.asked, 1 - back);
  }
  return around(a.went, 1);
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  let moving = false;
  if (ch === 'odds') {
    const x0 = 50, x1 = w - 20, y0 = 80, y1 = h - 40;
    const X = (k) => x0 + (k / 20) * (x1 - x0), Y = (p) => y1 - p * (y1 - y0);
    ctx.strokeStyle = col.separator;
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      ctx.beginPath();
      ctx.moveTo(x0, Y(p));
      ctx.lineTo(x1, Y(p));
      ctx.stroke();
      label(ctx, `${p * 100}%`, x0 - 6, Y(p), col['label-tertiary'], bg, { size: 11, align: 'right' });
    }
    for (let k = 0; k <= 20; k++) {
      ctx.fillStyle = col.danger;
      const p = 0.5 ** k;
      ctx.fillRect(X(k) - 6, Y(p), 12, y1 - Y(p));
      if (k % 5 === 0) label(ctx, String(k), X(k), y1 + 14, col['label-tertiary'], bg, { size: 11, align: 'center' });
    }
    label(ctx, 'Chance a cheat survives this many rounds', x0, y0 - 16, col['label-tertiary'], bg, { size: 11 });
    label(ctx, 'Rounds', x1, y1 + 28, col['label-tertiary'], bg, { size: 11, align: 'right' });
    return false;
  }
  const g = cave(ctx, w, h, col, bg);
  if (st.anim) {
    st.anim.u = Math.min(1, st.anim.u + dt / 2.2);
    if (!api.motion) st.anim.u = 1;
    moving = st.anim.u < 1;
    const [px, py] = peggyAt(g, st.anim.round, st.anim.u);
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, TAU);
    ctx.fillStyle = col['hiw-ink-1'];
    ctx.fill();
    if (st.anim.u > 0.5) label(ctx, `Victor: “Come out on the ${st.anim.round.asked}!”`, g.cx, g.cy, col.label, bg, { size: 12, weight: 700, align: 'center' });
    if (st.anim.u >= 1) label(ctx, st.anim.round.ok ? 'She does.' : 'She can’t. Caught.', g.cx, g.cy + 20, st.anim.round.ok ? col.success : col.danger, bg, { size: 12, weight: 700, align: 'center' });
  }
  r?.set('rounds', `${st.passed} of ${st.rounds}`);
  r?.set('cheat', st.failed ? 'Caught' : st.passed ? `1 in ${fmt(2 ** st.passed)}` : '–');
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ cave: 'A ring of tunnel with a locked door', rounds: 'Peggy knows the word', cheat: 'Peggy is bluffing', odds: 'Each round halves a cheat’s chances' }[id]);
  st.rounds = 0;
  st.passed = 0;
  st.failed = false;
  st.anim = null;
  st.knows = id !== 'cheat';
  if (id === 'odds') return api.invalidate();
  ui.button({
    label: 'Play a round',
    onClick() {
      const round = playRound();
      if (round) st.anim = { round, u: 0 };
      api.invalidate();
    },
  });
  ui.button({
    label: 'Play 20 rounds',
    onClick() {
      let last = null;
      for (let i = 0; i < 20 && !st.failed; i++) last = playRound() || last;
      if (last) st.anim = { round: last, u: api.motion ? 0 : 1 };
      api.invalidate();
    },
  });
  ui.button({ label: 'Start again', onClick() { st.rounds = 0; st.passed = 0; st.failed = false; st.anim = null; api.invalidate(); } });
  st.readout = api.readout([{ key: 'rounds', label: 'Rounds passed' }, { key: 'cheat', label: 'Chance a bluffer would get this far' }]);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });

