// ---------------------------------------------------------------------------
// Why sunflowers spiral: the scene.
//
// A seed head grown by art.js, one seed at a time, each turned a fixed
// angle from the last. Chapter 1 sets the angle freely; chapter 2 offers a
// few telling angles; chapter 3 colours the seeds into the spiral families
// the eye sees; chapter 4 is a smaller head, as on a pine cone.
// ---------------------------------------------------------------------------

import { mount, fmt } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { GOLDEN, seeds, evenness, drawHead } from './art.js';

const st = { angle: 137.5, n: 700, grown: 700, spiral: 21, readout: null };

// The simplest fraction of a turn close to an angle, for the readout.
function nearFraction(angle) {
  const f = angle / 360;
  for (let q = 1; q <= 12; q++) {
    const p = Math.round(f * q);
    if (Math.abs(f - p / q) < 0.004) return `${p}/${q} turn, ${q} spokes`;
  }
  return null;
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  let moving = false;
  if (!api.motion) st.grown = st.n;
  if (api.playing && api.motion && st.grown < st.n) {
    st.grown = Math.min(st.n, st.grown + dt * 200);
    moving = true;
  }
  const angle = ch === 'spirals' || ch === 'cones' ? GOLDEN : st.angle;
  const pts = seeds(Math.floor(st.grown), angle);
  const R = Math.min(w, h - 80) * 0.45, cx = w / 2, cy = 60 + (h - 60) / 2;
  const fam = ch === 'spirals' ? st.spiral : ch === 'cones' ? 13 : 0;
  drawHead(ctx, cx, cy, R * Math.sqrt(st.grown / st.n), pts, col, fam ? (i) => ((i % fam) % 2 ? col.accent : col['hiw-ink-1']) : null);
  if (ch === 'cones') label(ctx, 'Coloured in 13 families: 13 spirals one way', w / 2, h - 16, col['label-secondary'], bg, { size: 11, align: 'center' });
  r?.set('angle', `${fmt(angle, 3)}°`);
  r?.set('even', `${fmt(Math.max(0, evenness(seeds(st.n, angle))) * 100, 0)}%`);
  r?.set('note', nearFraction(angle) || (Math.abs(angle - GOLDEN) < 0.01 ? 'The golden angle' : 'No simple fraction'));
  return moving;
}

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  api.note({ angle: 'Each new seed turned by the same angle', golden: 'A few telling angles', spirals: 'The golden angle, seeds coloured by family', cones: 'A smaller head, as on a pine cone' }[id]);
  st.n = id === 'cones' ? 120 : 700;
  st.grown = api.motion ? 0 : st.n;
  if (id === 'angle') {
    ui.slider({ label: 'Turn between seeds', min: 90, max: 180, step: 0.1, value: st.angle, format: (v) => `${fmt(v, 1)}°`, onInput(v) { st.angle = v; st.grown = st.n; api.invalidate(); } });
  } else if (id === 'golden') {
    ui.choice({
      label: 'Angle',
      options: [{ id: '120', label: '120°' }, { id: '144', label: '144°' }, { id: '137', label: '137°' }, { id: String(GOLDEN), label: '137.508°' }],
      value: String(GOLDEN),
      onChange(v) { st.angle = Number(v); st.grown = api.motion ? 0 : st.n; api.invalidate(); },
    });
    st.angle = GOLDEN;
  } else if (id === 'spirals') {
    ui.choice({ label: 'Colour into families of', options: [8, 13, 21, 34, 55].map((k) => ({ id: String(k), label: String(k) })).concat([{ id: '20', label: '20' }]), value: String(st.spiral), onChange(v) { st.spiral = Number(v); api.invalidate(); } });
  }
  ui.button({ label: 'Grow it again', onClick() { st.grown = api.motion ? 0 : st.n; api.invalidate(); } });
  st.readout = api.readout([{ key: 'angle', label: 'Turn' }, { key: 'note', label: 'Which is' }, { key: 'even', label: 'How evenly packed' }]);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw });
