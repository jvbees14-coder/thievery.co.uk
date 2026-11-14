// ---------------------------------------------------------------------------
// How a camera lens focuses: the scene.
//
// Chapter 1 is the classic ray diagram for a thin lens, in units of the
// focal length, with a subject that can be dragged. From chapter 2 on the
// lens is a real 50 mm lens on a full-frame camera: the picture shows the
// space between the lens and the sensor in millimetres, and the subject,
// metres away, is off to the left. Every number comes from the thin-lens
// equation, 1/f = 1/u + 1/v.
// ---------------------------------------------------------------------------

import { mount, fmt, clamp, alpha, TAU } from '../engine.js';
import { label, setFace, TOKENS, arrow } from '../shared/draw.js';

const COC = 0.03;          // mm: the blur a full-frame print can hide
const SENSOR_W = 36;       // mm: a full-frame sensor's width

const st = {
  u1: 2.6,                  // chapter 1: subject distance, in focal lengths
  h1: 0.8,                  // and its height
  subject: 2,               // m
  focusAt: 2,               // m: where the lens is focused
  far: 6,                   // m: chapter 4's second subject
  N: 2.8,
  f: 50,
  readout: null,
};
const STOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22];
const imageDist = (f, u) => (f * u) / (u - f);

function ch1(ctx, w, h, col, bg, api) {
  const F = Math.min(w / 8, h / 3.2);
  const cx = w * 0.5, cy = h * 0.55;
  const X = (x) => cx + x * F, Y = (y) => cy - y * F;
  // The axis, the lens and its focal points.
  ctx.strokeStyle = col.separator;
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(w, cy);
  ctx.stroke();
  ctx.fillStyle = alpha(col['hiw-ink-1'], 0.25);
  ctx.beginPath();
  ctx.ellipse(cx, cy, F * 0.12, F * 1.35, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = col['hiw-ink-1'];
  ctx.stroke();
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(X(s), cy, 3, 0, TAU);
    ctx.fillStyle = col.label;
    ctx.fill();
    label(ctx, 'F', X(s), cy + 14, col['label-secondary'], bg, { size: 12, align: 'center' });
  }
  const u = st.u1, ho = st.h1;
  const v = u === 1 ? Infinity : u / (u - 1);
  const hi = -ho * (v / u);
  // The subject.
  arrow(ctx, X(-u), cy, X(-u), Y(ho), col.accent, 2.5, 9);
  label(ctx, 'Subject', X(-u), Y(ho) - 14, col.accent, bg, { size: 12, align: 'center' });
  // Three rays whose paths are known: one level with the axis, which
  // leaves through the far focal point; one through the centre, which goes
  // straight on; one through the near focal point, which leaves level.
  const rays = [
    { at: ho, dir: [1, -ho] },
    { at: 0, dir: [1, -ho / u] },
    { at: Math.abs(u - 1) < 1e-3 ? 0 : -ho / (u - 1), dir: [1, 0] },
  ];
  const ink = [col['hiw-ink-2'], col['label-secondary'], col['hiw-ink-3']];
  rays.forEach((ray, i) => {
    if (i === 2 && Math.abs(u - 1) < 1e-3) return;
    const out = 8 - 0;
    ctx.beginPath();
    ctx.moveTo(X(-u), Y(ho));
    ctx.lineTo(X(0), Y(ray.at));
    ctx.lineTo(X(out), Y(ray.at + (ray.dir[1] / ray.dir[0]) * out));
    ctx.strokeStyle = ink[i];
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
  if (Number.isFinite(v) && v < 9) {
    arrow(ctx, X(v), cy, X(v), Y(hi), col['accent-strong'], 2.5, 9);
    label(ctx, 'Image', X(v), Y(hi) + 16, col['accent-strong'], bg, { size: 12, align: 'center' });
  }
  if (api.handles?.focused) {
    ctx.strokeStyle = col['focus-ring'];
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(X(-u), Y(ho), 14, 0, TAU);
    ctx.stroke();
  }
  return { u, v, mag: v / u };
}

// Chapters 2 to 5: inside the camera, in millimetres.
function inside(ctx, w, h, col, bg, ch) {
  const f = st.f;
  const D = f / st.N;
  const vFocus = imageDist(f, st.focusAt * 1000);   // where the sensor is
  const scale = Math.min((w * 0.62) / (vFocus + 12), (h * 0.7) / Math.max(D, SENSOR_W));
  const lx = w * 0.28, cy = h * 0.5;
  const X = (mm) => lx + mm * scale, Y = (mm) => cy - mm * scale;
  ctx.strokeStyle = col.separator;
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(w, cy);
  ctx.stroke();
  // The lens, as wide as its aperture lets light through.
  ctx.fillStyle = alpha(col['hiw-ink-1'], 0.25);
  ctx.beginPath();
  ctx.ellipse(lx, cy, Math.max(4, 3 * scale), (D / 2) * scale + 6, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = col['label-secondary'];
  ctx.fillRect(lx - 3, Y(D / 2) - 40, 6, 40);
  ctx.fillRect(lx - 3, Y(-D / 2), 6, 40);
  // The sensor.
  ctx.fillStyle = col.accent;
  ctx.fillRect(X(vFocus) - 2, Y(SENSOR_W / 2), 4, SENSOR_W * scale);
  label(ctx, 'Sensor', X(vFocus) + 8, Y(SENSOR_W / 2) + 8, col.accent, bg, { size: 12 });
  const cone = (subjectM, ink, name) => {
    const v = imageDist(f, subjectM * 1000);
    ctx.fillStyle = alpha(ink, 0.18);
    ctx.beginPath();
    ctx.moveTo(lx, Y(D / 2));
    ctx.lineTo(X(v), cy);
    ctx.lineTo(lx, Y(-D / 2));
    ctx.closePath();
    ctx.fill();
    // Past the focus the light spreads out again, to the sensor.
    ctx.beginPath();
    ctx.moveTo(X(v), cy);
    const over = vFocus - v;
    const half = (D / 2) * (over / v);
    ctx.lineTo(X(vFocus), Y(half));
    ctx.lineTo(X(vFocus), Y(-half));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(lx, Y(D / 2));
    ctx.lineTo(X(v), cy);
    ctx.lineTo(X(vFocus), Y(-half));
    ctx.moveTo(lx, Y(-D / 2));
    ctx.lineTo(X(v), cy);
    ctx.lineTo(X(vFocus), Y(half));
    ctx.stroke();
    const blur = (D * Math.abs(vFocus - v)) / v;
    label(ctx, `${name} ${fmt(subjectM, 1)} m away`, 12, cy - (name === 'Far' ? 28 : 12) - (D / 2) * scale, ink, bg, { size: 12 });
    return blur;
  };
  const blurNear = cone(st.subject, col['hiw-ink-2'], ch === 'depth' ? 'Near' : 'Subject');
  const blurFar = ch === 'depth' ? cone(st.far, col['hiw-ink-3'], 'Far') : 0;
  arrow(ctx, 8, cy + 24, 40, cy + 24, col['label-tertiary'], 1, 6);
  label(ctx, 'light from the left', 46, cy + 24, col['label-tertiary'], bg, { size: 11, weight: 500 });
  return { blurNear, blurFar, D, vFocus };
}

function ch5(ctx, w, h, col, bg) {
  const fov = 2 * Math.atan(SENSOR_W / (2 * st.f));
  const cx = w * 0.08, cy = h * 0.5;
  const L = w * 0.42;
  ctx.fillStyle = alpha(col.accent, 0.15);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(fov / 2) * L, cy - Math.sin(fov / 2) * L);
  ctx.lineTo(cx + Math.cos(fov / 2) * L, cy + Math.sin(fov / 2) * L);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = col.accent;
  ctx.stroke();
  label(ctx, `${fmt((fov * 180) / Math.PI, 1)}°`, cx + 34, cy, col.label, bg, { size: 16, weight: 700 });
  // The frame: 3 by 2, with a 1.8 m person 20 m away at their real size in it.
  const fw = Math.min(w * 0.4, (h * 0.7) * 1.5), fh = fw / 1.5;
  const fx = w * 0.55, fy = cy - fh / 2;
  ctx.fillStyle = col.bg;
  ctx.fillRect(fx, fy, fw, fh);
  ctx.strokeStyle = col['separator-strong'];
  ctx.strokeRect(fx, fy, fw, fh);
  const share = (1.8 * st.f) / 20 / 24;   // the person's height over the sensor's 24 mm
  const ph = share * fh;
  ctx.save();
  ctx.beginPath();
  ctx.rect(fx, fy, fw, fh);
  ctx.clip();
  const px = fx + fw / 2, base = fy + fh / 2 + ph / 2;
  ctx.fillStyle = col['hiw-ink-2'];
  ctx.beginPath();
  ctx.arc(px, base - ph * 0.9, ph * 0.1, 0, TAU);
  ctx.fill();
  ctx.fillRect(px - ph * 0.12, base - ph * 0.78, ph * 0.24, ph * 0.78);
  ctx.restore();
  label(ctx, 'A person 20 m away, in the frame', fx + fw / 2, fy + fh + 16, col['label-secondary'], bg, { size: 12, align: 'center' });
  return fov;
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const r = st.readout;
  if (ch === 'rays') {
    const res = ch1(ctx, w, h, col, bg, api);
    if (r) {
      r.set('u', `${fmt(st.u1, 2)} × f`);
      r.set('v', Number.isFinite(res.v) && res.v > 0 ? `${fmt(res.v, 2)} × f` : 'None: the rays never meet');
      r.set('mag', !Number.isFinite(res.v) ? '–' : res.v > 0 ? `${fmt(res.mag, 2)} ×, upside down` : `${fmt(-res.mag, 2)} ×, upright, seen through the lens`);
    }
  } else if (ch === 'focal') {
    const fov = ch5(ctx, w, h, col, bg);
    if (r) {
      r.set('f', `${st.f} mm`);
      r.set('fov', `${fmt((fov * 180) / Math.PI, 1)}° across`);
      r.set('person', `${fmt((1.8 * st.f) / 20, 1)} mm tall on the sensor`);
    }
  } else {
    const res = inside(ctx, w, h, col, bg, ch);
    if (r) {
      r.set('v', `${fmt(res.vFocus, 2)} mm`);
      r.set('shift', `${fmt(res.vFocus - st.f, 2)} mm`);
      r.set('blur', `${fmt(res.blurNear, 3)} mm`);
      r.set('N', `f/${st.N}`);
      r.set('D', `${fmt(res.D, 1)} mm`);
      r.set('light', `${fmt((2.8 / st.N) ** 2, 2)} × f/2.8`);
      r.set('far', `${fmt(res.blurFar, 3)} mm`);
      const H = (st.f * st.f) / (st.N * COC) + st.f;
      const s = st.subject * 1000;
      const near = (s * (H - st.f)) / (H + s - 2 * st.f);
      const farLim = s < H ? (s * (H - st.f)) / (H - s) : Infinity;
      r.set('dof', `${fmt(near / 1000, 2)} m to ${Number.isFinite(farLim) ? `${fmt(farLim / 1000, 2)} m` : 'infinity'}`);
      r.set('sharp', res.blurNear <= COC ? 'Yes' : 'No');
    }
  }
  return false;
}

const handles = {
  list(api) {
    if (api.chapter !== 'rays') return [];
    const { w, h } = api.scene;
    const F = Math.min(w / 8, h / 3.2);
    return [{ id: 'subject', x: w * 0.5 - st.u1 * F, y: h * 0.55 - st.h1 * F, r: 22, label: 'Subject' }];
  },
  drag(id, x, y, api) {
    const { w, h } = api.scene;
    const F = Math.min(w / 8, h / 3.2);
    st.u1 = clamp((w * 0.5 - x) / F, 0.4, 3.9);
    st.h1 = clamp((h * 0.55 - y) / F, 0.2, 1.2);
    api.invalidate();
  },
  nudge(id, dx, dy, api) {
    st.u1 = clamp(st.u1 - dx * 0.05, 0.4, 3.9);
    st.h1 = clamp(st.h1 - dy * 0.05, 0.2, 1.2);
    api.invalidate();
  },
};

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  if (id !== 'focal') st.f = 50;
  api.note({ rays: 'Drag the subject; distances in focal lengths', focus: 'A 50 mm lens; inside the camera, to scale', aperture: 'A 50 mm lens; inside the camera, to scale', depth: 'A 50 mm lens; inside the camera, to scale', focal: 'A full-frame sensor, 36 mm wide' }[id]);
  if (id === 'focus' || id === 'aperture' || id === 'depth') {
    ui.slider({ label: 'Subject distance', min: 0.3, max: 10, step: 0.1, value: st.subject, format: (v) => `${fmt(v, 1)} m`, onInput: (v) => { st.subject = v; if (id !== 'focus') st.focusAt = v; api.invalidate(); } });
  }
  if (id === 'focus') {
    ui.slider({ label: 'Focused at', min: 0.3, max: 10, step: 0.1, value: st.focusAt, format: (v) => `${fmt(v, 1)} m`, onInput: (v) => { st.focusAt = v; api.invalidate(); } });
  }
  if (id === 'aperture' || id === 'depth') {
    st.focusAt = st.subject;
    ui.slider({ label: 'Aperture', min: 0, max: STOPS.length - 1, value: STOPS.indexOf(st.N), format: (i) => `f/${STOPS[i]}`, onInput: (i) => { st.N = STOPS[i]; api.invalidate(); } });
  }
  if (id === 'depth') {
    ui.slider({ label: 'Far subject', min: 1, max: 30, step: 0.5, value: st.far, format: (v) => `${fmt(v, 1)} m`, onInput: (v) => { st.far = v; api.invalidate(); } });
  }
  if (id === 'focal') {
    ui.slider({ label: 'Focal length', min: 14, max: 300, value: st.f, format: (v) => `${v} mm`, onInput: (v) => { st.f = v; api.invalidate(); } });
  }
  const rows = {
    rays: [{ key: 'u', label: 'Subject at' }, { key: 'v', label: 'Image at' }, { key: 'mag', label: 'Image size' }],
    focus: [{ key: 'v', label: 'Sensor behind lens' }, { key: 'shift', label: 'Lens moved out' }, { key: 'blur', label: 'Blur on the sensor' }, { key: 'sharp', label: 'Looks sharp' }],
    aperture: [{ key: 'N', label: 'Aperture' }, { key: 'D', label: 'Opening' }, { key: 'light', label: 'Light let in' }],
    depth: [{ key: 'N', label: 'Aperture' }, { key: 'far', label: 'Far subject blur' }, { key: 'dof', label: 'Sharp from' }],
    focal: [{ key: 'f', label: 'Focal length' }, { key: 'fov', label: 'Angle of view' }, { key: 'person', label: 'A person 20 m away' }],
  }[id];
  st.readout = api.readout(rows);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw, handles });
