// ---------------------------------------------------------------------------
// How it works: the engine every explainer is built on.
//
// An explainer is a live scene beside a piece of writing cut into chapters.
// Every chapter changes what the scene shows, and the reader can poke at it.
// This module holds everything that is the same from one explainer to the
// next, so a new one is mostly a scene and some writing:
//
//   Scene        a canvas that knows its size, its pixel ratio, and when to
//                stop drawing (off screen, in a background tab, or nothing
//                moving)
//   chapters()   which chapter is the reader on: scrolled to on a wide
//                screen, stepped through with buttons on a phone
//   ui           sliders, switches, chips and buttons, each a real control
//   Readout      the panel of live numbers under the scene
//   glossary()   the pop-ups on the words in dotted underline
//   handles()    things in the scene that can be dragged, or moved with keys
//   mount()      all of the above put together on one page
//
// docs/ADDING_AN_EXPLAINER.md is the walk-through. Nothing here knows about
// GPS; gps/scene.js is the first thing built on it.
// ---------------------------------------------------------------------------

// --- motion -------------------------------------------------------------------

// Two things can ask for stillness: the device (prefers-reduced-motion) and
// the site's own setting in prefs.js, which writes data-motion on <html>.
// Either one stops anything moving by itself. Dragging still moves things,
// because the reader is the one doing it.
const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)');
export function motionAllowed() {
  if (REDUCE.matches) return false;
  if (typeof window.thieveryStill === 'function' && window.thieveryStill()) return false;
  return document.documentElement.dataset.motion !== 'still';
}

// --- arithmetic -----------------------------------------------------------------

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;
export const ease = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

// A value that glides to wherever it is told to go. It closes a fixed share
// of the gap every second, so it moves the same at 30 frames a second as at
// 120, starts quickly and settles without a bump. `instant` is for stillness.
export class Smooth {
  constructor(value, rate = 6) {
    this.v = value;
    this.target = value;
    this.rate = rate;
  }
  set(target, snap = false) {
    this.target = target;
    if (snap) this.v = target;
  }
  /** One frame's worth. True while it is still on its way. */
  step(dt, instant = false) {
    if (this.v === this.target) return false;
    if (instant) {
      this.v = this.target;
      return true;
    }
    this.v = this.target + (this.v - this.target) * Math.exp(-this.rate * dt);
    if (Math.abs(this.v - this.target) <= 1e-5 * Math.max(1, Math.abs(this.target))) this.v = this.target;
    return true;
  }
}

/** Number formatting with the site's British separators. */
export function fmt(x, digits = 0) {
  if (!Number.isFinite(x)) return '–';
  return x.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
/** A signed figure, with a real minus sign rather than a hyphen. */
export function signed(x, digits = 0) {
  const s = fmt(Math.abs(x), digits);
  if (Number(s.replace(/,/g, '')) === 0) return s;
  return (x < 0 ? '−' : '+') + s;
}

// --- colour -------------------------------------------------------------------

// The scene is drawn in the site's tokens, read off the page, so it follows
// light and dark (and more contrast) with everything else. Custom
// properties come back with their var() references already resolved.
export function readPalette(el, names) {
  const style = getComputedStyle(el);
  const out = {};
  for (const n of names) out[n] = style.getPropertyValue(`--${n}`).trim() || '#888';
  return out;
}

const alphaCache = new Map();
/** The same colour at another opacity. Takes #rgb, #rrggbb, rgb() or rgba(). */
export function alpha(colour, a) {
  const key = `${colour}|${a}`;
  let hit = alphaCache.get(key);
  if (hit) return hit;
  let r = 128, g = 128, b = 128, base = 1;
  const c = colour.trim();
  if (c[0] === '#') {
    const h = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1, 7);
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else {
    const m = c.match(/[\d.]+/g);
    if (m) {
      [r, g, b] = m.slice(0, 3).map(Number);
      if (m[3] !== undefined) base = Number(m[3]);
    }
  }
  hit = `rgba(${r}, ${g}, ${b}, ${clamp(a * base, 0, 1)})`;
  alphaCache.set(key, hit);
  return hit;
}

// --- the scene ------------------------------------------------------------------

/**
 * A canvas that draws itself.
 *
 * `draw(ctx, frame)` is called with the context already scaled to CSS pixels
 * and a frame of { w, h, dt, t }. It returns true if it wants another frame
 * straight away (something is moving). When it returns false the loop
 * sleeps until `invalidate()` is called, so a still scene costs nothing.
 *
 * The loop also sleeps whenever the canvas is off screen or the tab is in
 * the background, and picks up where it left off without a jump: the first
 * frame after a sleep has a dt of zero.
 */
export class Scene {
  constructor(canvas, draw) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.draw = draw;
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.t = 0;
    this.onScreen = true;
    this.raf = 0;
    this.last = 0;
    this.tick = this.tick.bind(this);

    this.resizer = new ResizeObserver(() => this.resize());
    this.resizer.observe(canvas);
    this.watcher = new IntersectionObserver((entries) => {
      this.onScreen = entries[entries.length - 1].isIntersecting;
      this.invalidate();
    });
    this.watcher.observe(canvas);
    document.addEventListener('visibilitychange', () => this.invalidate());
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    // Two device pixels per CSS pixel is as sharp as an eye can tell on a
    // phone, and a third would be half as many pixels again for every frame.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.invalidate();
  }

  get awake() {
    return this.onScreen && document.visibilityState !== 'hidden';
  }

  invalidate() {
    if (this.raf || !this.awake) return;
    this.last = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  tick(now) {
    this.raf = 0;
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.05) : 0;
    this.last = now;
    this.t += dt;
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    const more = this.draw(ctx, { w: this.w, h: this.h, dt, t: this.t });
    if (more && this.awake) this.raf = requestAnimationFrame(this.tick);
  }
}

// --- things you can drag -----------------------------------------------------------

/**
 * Handles: points in the scene that can be picked up.
 *
 * `opts.list()` returns what can be held right now, each { id, x, y, r,
 * label } in CSS pixels; `opts.drag(id, x, y)` moves one to a point;
 * `opts.nudge(id, dx, dy)` moves one a step, for the keyboard.
 *
 * A finger that lands on a handle drags it; a finger anywhere else scrolls
 * the page as usual, which is why the canvas is not simply touch-action:
 * none. With the keyboard, the canvas takes focus, N picks the next handle
 * and the arrows move it (Shift for bigger steps).
 */
export function handles(canvas, scene, opts) {
  const state = { selected: null, dragging: null, focused: false, hover: null };
  const hit = (x, y, slop) => {
    let best = null;
    let bestD = Infinity;
    for (const h of opts.list()) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < Math.max(h.r, slop) && d < bestD) {
        best = h;
        bestD = d;
      }
    }
    return best;
  };
  const local = (ev) => {
    const r = canvas.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  };

  canvas.addEventListener(
    'touchstart',
    (ev) => {
      const t = ev.touches[0];
      if (!t) return;
      const r = canvas.getBoundingClientRect();
      if (hit(t.clientX - r.left, t.clientY - r.top, 30)) ev.preventDefault();
    },
    { passive: false },
  );
  canvas.addEventListener('pointerdown', (ev) => {
    const [x, y] = local(ev);
    const h = hit(x, y, ev.pointerType === 'mouse' ? 16 : 30);
    if (!h) return;
    ev.preventDefault();
    state.dragging = h.id;
    state.selected = h.id;
    canvas.setPointerCapture(ev.pointerId);
    canvas.classList.add('is-dragging');
    opts.drag(h.id, x, y);
    opts.changed?.(state);
    scene.invalidate();
  });
  canvas.addEventListener('pointermove', (ev) => {
    const [x, y] = local(ev);
    if (state.dragging) {
      opts.drag(state.dragging, x, y);
      scene.invalidate();
      return;
    }
    if (ev.pointerType === 'mouse') {
      const h = hit(x, y, 16);
      const id = h ? h.id : null;
      canvas.classList.toggle('is-grabbable', !!h);
      if (id !== state.hover) {
        state.hover = id;
        scene.invalidate();
      }
    }
  });
  const end = () => {
    if (!state.dragging) return;
    state.dragging = null;
    canvas.classList.remove('is-dragging');
    opts.changed?.(state);
    scene.invalidate();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  canvas.addEventListener('focus', () => {
    state.focused = true;
    const list = opts.list();
    if (!list.some((h) => h.id === state.selected)) state.selected = list[0]?.id ?? null;
    opts.changed?.(state);
    scene.invalidate();
  });
  canvas.addEventListener('blur', () => {
    state.focused = false;
    opts.changed?.(state);
    scene.invalidate();
  });
  canvas.addEventListener('keydown', (ev) => {
    const list = opts.list();
    if (!list.length) return;
    if (ev.key === 'n' || ev.key === 'N') {
      const i = list.findIndex((h) => h.id === state.selected);
      state.selected = list[(i + (ev.shiftKey ? list.length - 1 : 1)) % list.length].id;
      ev.preventDefault();
    } else {
      const step = ev.shiftKey ? 5 : 1;
      const dir = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key];
      if (!dir || state.selected == null) return;
      ev.preventDefault();
      opts.nudge(state.selected, dir[0], dir[1]);
    }
    opts.changed?.(state);
    scene.invalidate();
  });
  return state;
}

// --- controls -----------------------------------------------------------------------

let uid = 0;
const nextId = (p) => `hiw-${p}-${++uid}`;
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

/**
 * The controls a chapter puts under the scene. Each is a real input with a
 * visible label, so a keyboard and a screen reader get them for nothing.
 */
export function controlsIn(parent) {
  return {
    /** A range with its value written beside its label. */
    slider({ label, min, max, step = 1, value, format = (v) => String(v), onInput }) {
      const id = nextId('slider');
      const wrap = el('div', 'hiw-field hiw-slider');
      const top = el('div', 'hiw-field-top');
      const lab = el('label', null, label);
      lab.htmlFor = id;
      const out = el('output', 'hiw-field-value num');
      out.htmlFor = id;
      const input = el('input');
      Object.assign(input, { type: 'range', id, min, max, step, value });
      const paint = () => {
        const v = Number(input.value);
        out.textContent = format(v);
        input.setAttribute('aria-valuetext', format(v));
        input.style.setProperty('--fill', `${((v - min) / (max - min)) * 100}%`);
      };
      input.addEventListener('input', () => {
        paint();
        onInput?.(Number(input.value));
      });
      paint();
      top.append(lab, out);
      wrap.append(top, input);
      parent.append(wrap);
      return {
        input,
        set(v) {
          input.value = v;
          paint();
        },
      };
    },

    /** An on/off switch, drawn by the site's own .switch. */
    toggle({ label, checked = false, hint, onChange }) {
      const id = nextId('toggle');
      const wrap = el('div', 'hiw-field hiw-toggle');
      const lab = el('label', null, label);
      lab.htmlFor = id;
      const input = el('input', 'switch');
      Object.assign(input, { type: 'checkbox', id, checked });
      input.setAttribute('role', 'switch');
      input.addEventListener('change', () => onChange?.(input.checked));
      wrap.append(lab, input);
      if (hint) {
        const h = el('p', 'hiw-field-hint', hint);
        h.id = nextId('hint');
        input.setAttribute('aria-describedby', h.id);
        wrap.append(h);
      }
      parent.append(wrap);
      return {
        input,
        set(v) {
          input.checked = v;
        },
      };
    },

    /** A row of buttons that each stay pressed or not: satellites on and off. */
    chips({ label, items, onChange }) {
      const wrap = el('div', 'hiw-field hiw-chips');
      const head = el('p', 'hiw-chips-label', label);
      head.id = nextId('chips');
      const row = el('div', 'hiw-chip-row');
      row.setAttribute('role', 'group');
      row.setAttribute('aria-labelledby', head.id);
      const buttons = new Map();
      for (const it of items) {
        const b = el('button', 'hiw-chip');
        b.type = 'button';
        b.setAttribute('aria-pressed', String(!!it.pressed));
        if (it.colour) b.style.setProperty('--chip', it.colour);
        b.append(el('span', 'hiw-chip-dot'), el('span', null, it.label));
        const note = el('span', 'hiw-chip-note');
        b.append(note);
        b.addEventListener('click', () => {
          const on = b.getAttribute('aria-pressed') !== 'true';
          b.setAttribute('aria-pressed', String(on));
          onChange?.(it.id, on);
        });
        buttons.set(it.id, { b, note });
        row.append(b);
      }
      wrap.append(head, row);
      parent.append(wrap);
      return {
        set(id, on) {
          buttons.get(id)?.b.setAttribute('aria-pressed', String(on));
        },
        /** A word after the name, such as "blocked". */
        note(id, text) {
          const n = buttons.get(id)?.note;
          if (n && n.textContent !== text) n.textContent = text ? ` · ${text}` : '';
        },
      };
    },

    /** One of a few choices, drawn as a row of buttons of which one is pressed. */
    choice({ label, options, value, onChange }) {
      const wrap = el('div', 'hiw-field hiw-chips');
      const head = el('p', 'hiw-chips-label', label);
      head.id = nextId('choice');
      const row = el('div', 'hiw-chip-row');
      row.setAttribute('role', 'radiogroup');
      row.setAttribute('aria-labelledby', head.id);
      const buttons = options.map((o) => {
        const b = el('button', 'hiw-chip hiw-choice', o.label);
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.dataset.id = o.id;
        b.addEventListener('click', () => {
          set(o.id);
          onChange?.(o.id);
        });
        b.addEventListener('keydown', (ev) => {
          const i = options.indexOf(o);
          const step = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 0;
          if (!step) return;
          ev.preventDefault();
          const next = options[(i + step + options.length) % options.length];
          set(next.id);
          onChange?.(next.id);
          buttons[options.indexOf(next)].focus();
        });
        row.append(b);
        return b;
      });
      function set(id) {
        for (const b of buttons) {
          const on = b.dataset.id === id;
          b.setAttribute('aria-checked', String(on));
          b.tabIndex = on ? 0 : -1;
        }
      }
      set(value);
      wrap.append(head, row);
      parent.append(wrap);
      return { set };
    },

    /** A line of text to type into. */
    text({ label, value = '', maxLength = 200, placeholder = '', onInput }) {
      const id = nextId('text');
      const wrap = el('div', 'hiw-field hiw-text-field');
      const lab = el('label', null, label);
      lab.htmlFor = id;
      const input = el('input');
      Object.assign(input, { type: 'text', id, value, maxLength, placeholder, autocomplete: 'off', spellcheck: false });
      input.addEventListener('input', () => onInput?.(input.value));
      wrap.append(lab, input);
      parent.append(wrap);
      return input;
    },

    /** A line of small print: what can be dragged, and how to do it with keys. */
    hint(words) {
      const p = el('p', 'hiw-field-hint hiw-hint', words);
      parent.append(p);
      return p;
    },

    /** A plain button, for an action rather than a setting. */
    button({ label, onClick }) {
      const b = el('button', 'btn small', label);
      b.type = 'button';
      b.addEventListener('click', onClick);
      // Buttons one after another share a row.
      let row = parent.lastElementChild;
      if (!row || !row.classList.contains('hiw-action')) {
        row = el('div', 'hiw-field hiw-action');
        parent.append(row);
      }
      row.append(b);
      return b;
    },
  };
}

// --- live numbers ------------------------------------------------------------------------

/**
 * The panel of numbers under the scene. `set` only touches the page when
 * the text actually changes, so it can be called every frame. It is not a
 * live region: numbers that change sixty times a second would talk over
 * everything. What is worth announcing goes through the status line.
 */
export class Readout {
  constructor(parent, rows) {
    this.cells = new Map();
    const dl = el('dl', 'hiw-readout-list');
    for (const r of rows) {
      const row = el('div', 'hiw-readout-row');
      if (r.colour) row.style.setProperty('--row', r.colour);
      const dt = el('dt', null, r.label);
      const dd = el('dd', 'num', r.value ?? '–');
      row.append(dt, dd);
      dl.append(row);
      this.cells.set(r.key, dd);
    }
    parent.append(dl);
  }
  set(key, text) {
    const dd = this.cells.get(key);
    if (dd && dd.textContent !== text) dd.textContent = text;
  }
}

// --- the glossary ----------------------------------------------------------------------------

/**
 * Words in the text that are jargon are buttons (`<button class="hiw-term"
 * data-term="ephemeris">`), and their meanings are in a <template
 * id="hiw-glossary"> as `<p data-def="ephemeris">`. Pressing one opens a
 * small card under it; Escape, a press elsewhere or pressing it again
 * closes it, and focus goes back to the word.
 */
export function glossary(root = document) {
  const tpl = root.querySelector('#hiw-glossary');
  if (!tpl) return;
  const defs = new Map();
  for (const d of tpl.content.querySelectorAll('[data-def]')) defs.set(d.dataset.def, d);
  const card = el('div', 'hiw-gloss');
  card.id = 'hiw-gloss';
  card.setAttribute('role', 'dialog');
  card.hidden = true;
  document.body.append(card);
  let owner = null;

  const close = (refocus) => {
    if (!owner) return;
    owner.setAttribute('aria-expanded', 'false');
    card.hidden = true;
    if (refocus) owner.focus();
    owner = null;
  };
  const place = () => {
    if (!owner) return;
    const r = owner.getBoundingClientRect();
    const width = Math.min(320, document.documentElement.clientWidth - 32);
    card.style.width = `${width}px`;
    const left = clamp(r.left + r.width / 2 - width / 2, 16, document.documentElement.clientWidth - width - 16);
    card.style.left = `${left + window.scrollX}px`;
    card.style.top = `${r.bottom + window.scrollY + 8}px`;
  };
  const open = (btn) => {
    const def = defs.get(btn.dataset.term);
    if (!def) return;
    close(false);
    owner = btn;
    card.replaceChildren(el('p', 'hiw-gloss-term', def.dataset.title || btn.textContent), ...[...def.cloneNode(true).childNodes]);
    card.setAttribute('aria-label', def.dataset.title || btn.textContent);
    card.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    place();
  };

  for (const btn of root.querySelectorAll('.hiw-term')) {
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'hiw-gloss');
    btn.addEventListener('click', () => (owner === btn ? close(false) : open(btn)));
  }
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && owner) close(true);
  });
  document.addEventListener('pointerdown', (ev) => {
    if (owner && !card.contains(ev.target) && ev.target !== owner) close(false);
  });
  window.addEventListener('resize', place);
}

// --- chapters --------------------------------------------------------------------------------

/**
 * Which chapter the reader is on.
 *
 * On a wide screen every chapter is on the page and the scene is pinned
 * beside them: whichever chapter crosses the middle of the window is the
 * current one, and the step buttons scroll to the next. On a phone (900px
 * and under, where the site's own bar turns into a tab bar) only the
 * current chapter is shown, under the scene, and the buttons step.
 *
 * The chapter is kept in the address (#chapter-id) so a link can open on
 * one, without adding a history entry for every scroll.
 */
export function chapters({ sections, nav, onChange }) {
  const wide = window.matchMedia('(min-width: 901px)');
  const list = [...sections];
  const titles = list.map((s) => s.querySelector('h2')?.textContent.trim() || s.id);
  let current = -1;

  const prev = nav.querySelector('[data-step="prev"]');
  const next = nav.querySelector('[data-step="next"]');
  const where = nav.querySelector('[data-step-label]');
  const dots = nav.querySelector('[data-step-dots]');
  const dotButtons = list.map((s, i) => {
    const b = el('button', 'hiw-dot');
    b.type = 'button';
    b.setAttribute('aria-label', `Chapter ${i + 1}: ${titles[i]}`);
    b.addEventListener('click', () => go(i, true));
    dots?.append(b);
    return b;
  });

  function show(i) {
    if (i === current) return;
    current = i;
    list.forEach((s, j) => s.classList.toggle('is-current', j === i));
    dotButtons.forEach((b, j) => (j === i ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current')));
    if (where) where.textContent = `${i + 1} of ${list.length} · ${titles[i]}`;
    prev.disabled = i === 0;
    next.disabled = i === list.length - 1;
    try {
      // The first chapter is the page's own address, so a reload or a
      // shared link starts at the title rather than jumping past it.
      history.replaceState(null, '', i === 0 ? location.pathname + location.search : `#${list[i].id}`);
    } catch {
      /* a sandboxed frame can refuse; the address is a nicety */
    }
    onChange(list[i].id, i);
  }

  function go(i, move) {
    i = clamp(i, 0, list.length - 1);
    if (wide.matches && move) {
      clearTimeout(gliding);
      gliding = setTimeout(() => (gliding = 0), 900);
      const smooth = motionAllowed() ? 'smooth' : 'auto';
      list[i].scrollIntoView({ behavior: smooth, block: 'start' });
    }
    show(i);
    if (!wide.matches && move) {
      // The text changed under the reader's thumb; bring its top into view
      // only if it has gone off the bottom of the screen.
      const r = list[i].getBoundingClientRect();
      if (r.top > window.innerHeight - 80) list[i].scrollIntoView({ block: 'nearest' });
    }
  }

  prev.addEventListener('click', () => go(current - 1, true));
  next.addEventListener('click', () => go(current + 1, true));
  nav.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowLeft') go(current - 1, true);
    else if (ev.key === 'ArrowRight') go(current + 1, true);
  });

  // While a scroll that a button started is gliding past other chapters,
  // the observer would flick the scene through each of them. It is ignored
  // until the scroll stops.
  let gliding = 0;
  const watcher = new IntersectionObserver(
    (entries) => {
      if (!wide.matches || gliding) return;
      for (const e of entries) if (e.isIntersecting) show(list.indexOf(e.target));
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  list.forEach((s) => watcher.observe(s));
  window.addEventListener('scroll', () => {
    if (!gliding) return;
    clearTimeout(gliding);
    gliding = setTimeout(() => (gliding = 0), 120);
  }, { passive: true });

  const mode = () => nav.closest('[data-explainer]')?.setAttribute('data-mode', wide.matches ? 'scroll' : 'step');
  wide.addEventListener('change', () => {
    mode();
    if (wide.matches) list[current]?.scrollIntoView({ block: 'start' });
  });
  mode();

  const fromHash = list.findIndex((s) => `#${s.id}` === location.hash);
  if (fromHash > 0 && wide.matches) list[fromHash].scrollIntoView({ block: 'start' });
  show(Math.max(0, fromHash));
  return { go: (i) => go(i, true), get index() { return current; } };
}

// --- putting a page together ----------------------------------------------------------------------

/**
 * One explainer page. `def` is the scene:
 *
 *   colours        token names to read off the page, e.g. ['accent', 'label']
 *   setup(api)     once, before the first chapter
 *   chapter(id, api)  whenever the chapter changes: build this chapter's
 *                  controls with api.controls and its numbers with api.readout
 *   draw(ctx, frame, api)  every frame; return true while anything moves
 *   handles        optional; see handles() above
 *
 * The api carries the colours (refreshed when the device changes scheme),
 * whether motion is allowed and whether the reader has paused it, the
 * status line, and invalidate() to ask for a frame.
 */
export function mount(def, root = document.querySelector('[data-explainer]')) {
  const canvas = root.querySelector('.hiw-canvas');
  const controlsSlot = root.querySelector('[data-slot="controls"]');
  const readoutSlot = root.querySelector('[data-slot="readout"]');
  const status = root.querySelector('[data-slot="status"]');
  const note = root.querySelector('[data-slot="note"]');
  const play = root.querySelector('[data-slot="play"]');

  const api = {
    colours: {},
    motion: motionAllowed(),
    playing: motionAllowed(),
    chapter: null,
    index: 0,
    controls() {
      controlsSlot.replaceChildren();
      return controlsIn(controlsSlot);
    },
    readout(rows) {
      readoutSlot.replaceChildren();
      return new Readout(readoutSlot, rows);
    },
    status(text) {
      if (status.textContent !== text) status.textContent = text;
    },
    note(text) {
      if (note.textContent !== text) note.textContent = text || '';
      note.hidden = !text;
    },
    invalidate: () => scene.invalidate(),
  };

  const paint = () => {
    api.colours = readPalette(root, def.colours || []);
    scene?.invalidate();
  };

  const scene = new Scene(canvas, (ctx, frame) => def.draw(ctx, frame, api));
  api.scene = scene;
  paint();
  for (const q of ['(prefers-color-scheme: dark)', '(prefers-contrast: more)']) window.matchMedia(q).addEventListener('change', paint);

  const syncPlay = () => {
    play.querySelector('[data-label]').textContent = api.playing ? 'Pause' : 'Play';
    play.classList.toggle('is-paused', !api.playing);
  };
  play.addEventListener('click', () => {
    api.playing = !api.playing;
    syncPlay();
    scene.invalidate();
  });
  const motionChanged = () => {
    const was = api.motion;
    api.motion = motionAllowed();
    if (was !== api.motion) {
      api.playing = api.motion;
      syncPlay();
      scene.invalidate();
    }
  };
  REDUCE.addEventListener('change', motionChanged);
  new MutationObserver(motionChanged).observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  syncPlay();

  if (def.handles) {
    canvas.tabIndex = 0;
    api.handles = handles(canvas, scene, {
      list: () => def.handles.list(api),
      drag: (id, x, y) => def.handles.drag(id, x, y, api),
      nudge: (id, dx, dy) => def.handles.nudge(id, dx, dy, api),
      changed: (s) => def.handles.changed?.(s, api),
    });
  }

  def.setup?.(api);
  chapters({
    sections: root.querySelectorAll('.hiw-chapter'),
    nav: root.querySelector('.hiw-steps'),
    onChange(id, i) {
      api.chapter = id;
      api.index = i;
      // A chapter with nothing to read out must not keep the last one's figures.
      readoutSlot.replaceChildren();
      def.chapter(id, api);
      scene.invalidate();
    },
  });
  glossary(root);
  return api;
}
