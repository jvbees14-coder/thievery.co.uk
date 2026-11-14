// ---------------------------------------------------------------------------
// How a pin tumbler lock works: the scene.
//
// The lock, cut down the middle (art.js), with an end view beside it that
// turns when the lock opens. Chapter 2 pushes a key in; chapters 4 and 5
// pick it, one pin at a time, the way the MIT guide describes: turning
// pressure makes one pin bind, lifting that pin to the shear line sets it,
// and then the next one binds. Lift a binding pin too far and it jams.
// ---------------------------------------------------------------------------

import { mount, Smooth, fmt, clamp } from '../engine.js';
import { label, setFace, TOKENS } from '../shared/draw.js';
import { PINS, NEED, WRONG, SHEAR, REST, KEY_PIN, liftsFor, makeView, drawLock, drawEnd } from './art.js';

const ORDER = [2, 0, 3, 4, 1];   // the order the pins bind in, under tension
const TOL = 0.9;                 // how close to the line counts as on it
const SHIFT = [0.6, -0.4, 1.1, -0.2, 0.5];   // the chambers' small misalignment, exaggerated in chapter 3

const st = {
  keyS: new Smooth(0, 5),
  which: 'right',
  manual: false,
  phase: 0,
  turn: new Smooth(0, 4),
  lift: PINS.map(() => new Smooth(0, 14)),
  set: PINS.map(() => false),
  over: PINS.map(() => false),
  tension: false,
  spools: false,
  pickAt: null,
  release: 0,
  depths: 6,
  pins: 5,
  readout: null,
};

const binding = () => ORDER.find((i) => !st.set[i]) ?? -1;
const open = () => st.set.every(Boolean);

function resetPick(api) {
  st.set = PINS.map(() => false);
  st.over = PINS.map(() => false);
  for (const l of st.lift) l.set(0, !api.motion);
  st.turn.set(0, !api.motion);
}

// What happens when the pick lets go of a pin.
function letGo(i, api) {
  const lift = st.lift[i].target;
  const b = binding();
  if (st.tension && i === b && Math.abs(lift - NEED[i]) <= TOL) {
    st.set[i] = true;
    st.lift[i].set(0);
    api.status(open() ? 'Every pin is set: the plug turns.' : `Pin ${i + 1} is set. Pin ${binding() + 1} binds next.`);
  } else if (st.tension && i === b && lift > NEED[i] + TOL) {
    st.over[i] = true;
    api.status(`Pin ${i + 1} went too far and jammed. Let go of the tension to start again.`);
  } else if (!st.over[i]) {
    st.lift[i].set(0);
    if (st.tension && i !== b) api.status(`Pin ${i + 1} isn't binding, so it drops back.`);
  }
  if (open()) st.turn.set(1, !api.motion);
  api.invalidate();
}

function draw(ctx, f, api) {
  const col = api.colours;
  setFace(col['font-text']);
  const { w, h, dt } = f;
  const bg = col['hiw-scene-bg'];
  const ch = api.chapter;
  const still = !api.motion;
  let moving = false;

  const picking = ch === 'picking' || ch === 'security';
  const withKey = ch === 'key';
  const endR = Math.min(w, h) * 0.09;
  const view = makeView(w - endR * 3, h * 0.92);
  view.oy += h * 0.02;

  let lifts, drivers = [];
  if (withKey) {
    // The key goes in and out by itself until the slider is touched.
    if (!st.manual && api.playing && api.motion) {
      st.phase += dt;
      const p = (st.phase % 6) / 6;
      st.keyS.set(p < 0.45 ? p / 0.45 : p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3);
      moving = true;
    }
    moving = st.keyS.step(dt, still) || moving;
    const cuts = st.which === 'right' ? NEED : WRONG;
    lifts = liftsFor(cuts, st.keyS.v);
    const aligned = lifts.filter((l, i) => Math.abs(l - NEED[i]) < 0.3).length;
    const ok = aligned === 5 && st.keyS.v > 0.995;
    st.turn.set(ok ? 1 : 0, still);
    if (st.readout) {
      st.readout.set('aligned', `${aligned} of 5`);
      st.readout.set('state', ok ? 'Turns' : 'Locked');
    }
  } else if (picking) {
    for (const l of st.lift) moving = l.step(dt, still) || moving;
    lifts = st.lift.map((l) => l.v);
    drivers = PINS.map((_, i) => (st.set[i] ? SHEAR : null));
    if (st.release) {
      st.release -= dt;
      if (st.release <= 0 && st.pickAt != null) letGo(st.pickAt, api);
      moving = true;
    }
    if (st.readout) {
      st.readout.set('set', `${st.set.filter(Boolean).length} of 5`);
      st.readout.set('binding', !st.tension ? 'None' : open() ? '–' : `Pin ${binding() + 1}`);
      st.readout.set('combos', fmt(st.depths ** st.pins));
    }
  } else {
    lifts = PINS.map(() => 0);
    if (st.readout) st.readout.set('state', 'Locked');
  }
  moving = st.turn.step(dt, still) || moving;

  const showShift = ch === 'tolerance';
  const highlight = (showShift || picking) && st.tension && !open() ? binding() : showShift ? ORDER[0] : -1;
  drawLock(ctx, view, col, {
    lifts,
    drivers,
    key: withKey ? (st.which === 'right' ? NEED : WRONG) : null,
    keyS: st.keyS.v,
    turn: st.turn.v,
    shift: showShift ? SHIFT : [],
    highlight,
    spools: ch === 'security' && st.spools,
    pick: picking ? { at: st.pickAt, lift: st.pickAt != null ? st.lift[st.pickAt].v : 0 } : null,
  });

  const k = view.scale;
  label(ctx, 'Shear line', view.ox + 96 * k, view.oy + SHEAR * k - 8, col['accent-strong'], bg, { size: 12, align: 'right' });
  if (ch === 'pins') {
    label(ctx, 'Spring', view.ox + (PINS[0] - 5) * k, view.oy + 12 * k, col['label-secondary'], bg, { size: 11, align: 'right' });
    label(ctx, 'Driver pin', view.ox + (PINS[0] - 5) * k, view.oy + 27 * k, col['label-secondary'], bg, { size: 11, align: 'right' });
    label(ctx, 'Key pin', view.ox + (PINS[0] - 5) * k, view.oy + 42 * k, col.accent, bg, { size: 11, align: 'right' });
    label(ctx, 'Plug (turns)', view.ox + 50 * k, view.oy + 61 * k + 10, col['label-secondary'], bg, { size: 11, align: 'center' });
  }
  if (picking) {
    PINS.forEach((px, i) => {
      if (st.over[i]) label(ctx, 'Jammed', view.ox + px * k, view.oy + 3 * k - 8, col.danger, bg, { size: 11, align: 'center' });
      else if (st.set[i]) label(ctx, 'Set', view.ox + px * k, view.oy + 3 * k - 8, col.success, bg, { size: 11, align: 'center' });
      if (api.handles?.focused && api.handles.selected === `p${i}`) {
        ctx.strokeStyle = col['focus-ring'];
        ctx.lineWidth = 3;
        ctx.strokeRect(view.ox + (px - 4) * k, view.oy + (REST - st.lift[i].v - KEY_PIN[i] - 1) * k, 8 * k, (KEY_PIN[i] + 2) * k);
      }
    });
  }
  drawEnd(ctx, w - endR * 1.6, h * 0.42, endR, col, st.turn.v, 'End on');
  return moving;
}

const handles = {
  list(api) {
    if (api.chapter !== 'picking' && api.chapter !== 'security') return [];
    const { w, h } = api.scene;
    const endR = Math.min(w, h) * 0.09;
    const view = makeView(w - endR * 3, h * 0.92);
    view.oy += h * 0.02;
    return PINS.map((px, i) => ({
      id: `p${i}`,
      x: view.ox + px * view.scale,
      y: view.oy + (REST - st.lift[i].v - KEY_PIN[i] / 2) * view.scale,
      r: Math.max(18, view.scale * 5),
      label: `Pin ${i + 1}`,
    }));
  },
  drag(id, x, y, api) {
    const i = Number(id.slice(1));
    if (st.set[i] || st.over[i]) return;
    const { w, h } = api.scene;
    const endR = Math.min(w, h) * 0.09;
    const view = makeView(w - endR * 3, h * 0.92);
    view.oy += h * 0.02;
    const lift = clamp(REST - KEY_PIN[i] / 2 - (y - view.oy) / view.scale, 0, 13);
    st.pickAt = i;
    st.lift[i].set(lift, true);
  },
  nudge(id, dx, dy, api) {
    const i = Number(id.slice(1));
    if (st.set[i] || st.over[i]) return;
    st.pickAt = i;
    st.lift[i].set(clamp(st.lift[i].target - dy * 0.5 + dx * 0, 0, 13), true);
    st.release = 0.9;
    api.invalidate();
  },
  changed(s, api) {
    if (s.dragging == null && st.pickAt != null && st.release <= 0) letGo(st.pickAt, api);
  },
};

function chapter(id, api) {
  const ui = api.controls();
  api.status('');
  st.manual = false;
  st.pickAt = null;
  api.note(id === 'tolerance' ? 'Misalignment exaggerated' : id === 'picking' || id === 'security' ? 'Drag a pin up, or use N and the arrows' : '');
  if (id === 'pins') {
    st.readout = api.readout([{ key: 'state', label: 'Plug' }]);
    api.status('The driver pins cross the shear line, so the plug cannot turn.');
  }
  if (id === 'key') {
    ui.choice({
      label: 'Key',
      options: [{ id: 'right', label: 'The right key' }, { id: 'wrong', label: 'A different key' }],
      value: st.which,
      onChange(v) {
        st.which = v;
        api.invalidate();
      },
    });
    ui.slider({
      label: 'Push the key in',
      min: 0,
      max: 100,
      value: Math.round(st.keyS.target * 100),
      format: (v) => `${v}%`,
      onInput(v) {
        st.manual = true;
        st.keyS.set(v / 100);
        api.invalidate();
      },
    });
    st.readout = api.readout([{ key: 'aligned', label: 'Gaps on the shear line' }, { key: 'state', label: 'Plug' }]);
  }
  if (id === 'tolerance') {
    resetPick(api);
    st.tension = true;
    st.readout = api.readout([]);
    api.status(`Turn the plug, and pin ${ORDER[0] + 1} is the one that catches.`);
  }
  if (id === 'picking' || id === 'security') {
    resetPick(api);
    st.tension = true;
    ui.toggle({
      label: 'Turning pressure',
      checked: st.tension,
      onChange(on) {
        st.tension = on;
        if (!on) resetPick(api);
        api.status(on ? `Pin ${binding() + 1} binds first.` : 'No pressure: every pin drops back.');
        api.invalidate();
      },
    });
    ui.button({ label: 'Start again', onClick: () => { resetPick(api); api.status(''); } });
    if (id === 'security') {
      ui.toggle({ label: 'Spool driver pins', checked: st.spools, onChange: (on) => { st.spools = on; api.invalidate(); } });
      ui.slider({ label: 'Pins', min: 4, max: 7, value: st.pins, onInput: (v) => { st.pins = v; api.invalidate(); } });
      ui.slider({ label: 'Cut depths', min: 4, max: 10, value: st.depths, onInput: (v) => { st.depths = v; api.invalidate(); } });
    }
    st.readout = api.readout([
      { key: 'set', label: 'Pins set' },
      { key: 'binding', label: 'Binding now' },
      ...(id === 'security' ? [{ key: 'combos', label: 'Possible keys' }] : []),
    ]);
    if (id === 'picking') api.status(`Pin ${binding() + 1} binds first. Lift it to the line.`);
  }
  if (id !== 'picking' && id !== 'security') st.turn.set(0, !api.motion);
  api.invalidate();
}

mount({ colours: TOKENS, chapter, draw, handles });
