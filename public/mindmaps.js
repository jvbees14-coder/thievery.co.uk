/* Thievery.co.uk — mind maps, as you see them.
 *
 * Two screens: the list of your maps, and one map open on a sheet you can
 * pan and zoom. Everything is drawn here as SVG and everything is exported
 * from here too; the server stores the tree and checks its shape, and that
 * is all it does.
 *
 * Five things worth knowing before changing anything.
 *
 * **One press means several things.** A bubble that is pressed and let go
 * quickly is being edited; one that is pressed and held is growing a branch;
 * one that is pressed and moved is being dragged, and dropped on another
 * bubble it is joined to that one instead. The + buttons beside the selected
 * bubble and the count on a folded one are pressed the same way. The pointer
 * handlers below are the only place that tells all of these apart, and they
 * use pointer events so a finger and a mouse go down the same road.
 *
 * **Only a new branch is placed.** When a branch is added it goes wherever
 * there is room near its parent, and nothing else on the sheet moves. That
 * is what lets a bubble somebody dragged stay where they put it. Tidy is the
 * one thing that lays out the whole map.
 *
 * **The sheet is drawn by key, not from scratch.** Every bubble and branch
 * keeps its element from one draw to the next, and only what changed is
 * written. That is what lets a glide redraw sixty times a second, and what
 * keeps the keyboard focus on a bubble while it moves.
 *
 * **Undo is snapshots.** Every change that is saved is also a copy of the
 * whole tree on a stack. Undo puts the last one back and saves that. There is
 * no list of operations to keep in step with the code that makes them.
 *
 * **What is drawn is what is exported.** Every colour and every face is
 * written on the elements as attributes rather than left to the stylesheet,
 * so a copy of the sheet taken out of the page still looks like the sheet.
 * The dots, the selection and the + buttons are in layers of their own that
 * the export leaves behind. The one thing that cannot travel as an attribute
 * is the font, which is why the export fetches it and writes it into the
 * file. */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const esc = (s) =>
    String(s == null ? '' : s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const r1 = (v) => Math.round(v * 10) / 10;

  // How long a press has to last to count as a hold, and how far a pointer
  // can wander before a press is a drag instead.
  const HOLD_MS = 450;
  const SLOP = 6;
  const SAVE_AFTER_MS = 800;
  const RETRY_MS = 5000;
  const GLIDE_MS = 260;
  const HISTORY = 100;
  const DOUBLE_TAP_MS = 350;

  // Bubble sizes: the middle, the ring round it, and everything further out.
  const FACE = {
    root: { size: 23, line: 29, wrap: 240, padX: 24, padY: 15 },
    first: { size: 18.5, line: 23, wrap: 210, padX: 18, padY: 11 },
    node: { size: 16, line: 20, wrap: 190, padX: 14, padY: 9 },
  };
  const faceAt = (depth) => (depth === 0 ? FACE.root : depth === 1 ? FACE.first : FACE.node);
  const MIN_W = 64;

  let limits = { maps: 50, nodes: 250, text: 80, colours: 6 };
  let maps = [];

  // The map open, if there is one.
  // { id, rev, nodes: Map<id, node>, dirty, conflict: false | 'clash' | 'refused' }
  let map = null;
  const view = { x: 0, y: 0, k: 1 };
  let selected = null;

  // --- small things ------------------------------------------------------------

  let toastTimer = null;
  function toast(message, kind = '') {
    const box = $('#toast');
    box.textContent = message;
    box.className = 'toast' + (kind === 'info' ? ' info' : '');
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      box.hidden = true;
    }, 4200);
  }

  async function api(route, { method = 'GET', body } = {}) {
    const res = await fetch(`/api/mindmaps/${route}`, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await res.json().catch(() => ({}));
    if (res.status === 401) {
      location.reload();
      throw new Error('Sign in first.');
    }
    if (!res.ok) throw Object.assign(new Error(payload.error || 'Something went wrong.'), { status: res.status });
    return payload;
  }

  const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function newId() {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    let s = '';
    for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
    return s;
  }

  function when(ms) {
    return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function el(name, attrs = {}) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  }

  function set(node, attrs) {
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  }

  const typing = (target) => !!target?.closest?.('input, textarea, select, [contenteditable]');

  // The site's own "keep things still" setting, and the browser's.
  const still = () =>
    !!window.thieveryStill?.() || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // --- colours -------------------------------------------------------------------

  // The colours the sheet is drawn in, read off the stylesheet's tokens, so
  // the plain design and the Vault each get their own. Read once and kept,
  // because a glide draws sixty times a second; a change of design in
  // another tab clears it.
  let colours = null;
  function palette() {
    if (colours) return colours;
    const css = getComputedStyle(document.documentElement);
    const get = (name) => css.getPropertyValue(name).trim();
    colours = {
      paper: get('--mm-paper'),
      rootFill: get('--mm-root'),
      rootInk: get('--mm-root-ink'),
      fill: get('--mm-bubble'),
      ink: get('--mm-ink'),
      grid: get('--mm-grid'),
      shadow: get('--mm-shadow'),
      shadowAlpha: get('--mm-shadow-alpha') || '0.3',
      select: get('--mm-select'),
      handle: get('--mm-handle'),
      branches: [0, 1, 2, 3, 4, 5].map((i) => get(`--mm-c${i}`)),
      face: getComputedStyle($('#sheet')).fontFamily,
    };
    return colours;
  }

  function rgb(hex) {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }

  // `t` of the first colour laid over the second.
  function mix(a, b, t) {
    const x = rgb(a);
    const y = rgb(b);
    if (!x || !y) return b;
    return '#' + x.map((v, i) => Math.round(v * t + y[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
  }

  // --- the list of maps --------------------------------------------------------

  const SORT_KEY = 'thievery-mm-sort';
  let listQuery = '';
  let listSort = 'updated';
  try {
    if (localStorage.getItem(SORT_KEY) === 'title') listSort = 'title';
  } catch {
    // remembered for this visit only
  }

  async function loadList() {
    const got = await api('maps');
    maps = got.maps;
    limits = got.limits || limits;
    if (got.you) {
      $('#who').textContent = got.you.name;
      for (const id of ['#nav-members', '#who-members']) {
        const link = $(id);
        if (link) link.hidden = !got.you.admin;
      }
    }
    drawList();
  }

  // A thumbnail from the handful of positions the list carries: the lines and
  // the dots of the map, in its own colours, and no words.
  function thumb(rows) {
    if (!rows?.length) return '';
    const c = palette();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of rows) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    let w = Math.max(x1 - x0, 240);
    let h = Math.max(y1 - y0, 140);
    if (w / h < 1.6) w = h * 1.6;
    else h = w / 1.6;
    w *= 1.25;
    h *= 1.25;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const unit = w / 160;
    const colourOf = (b) => (b < 0 ? c.rootFill : c.branches[b % c.branches.length]);
    let lines = '';
    let dots = '';
    rows.forEach(([x, y, parent, branch], i) => {
      if (parent >= 0 && rows[parent]) {
        const [px, py] = rows[parent];
        const mid = (px + x) / 2;
        lines += `<path d="M${px} ${py}C${mid} ${py} ${mid} ${y} ${x} ${y}" fill="none" stroke="${esc(colourOf(branch))}" stroke-width="${r1((parent === 0 ? 2.6 : 1.5) * unit)}" stroke-linecap="round"/>`;
      }
      const r = i === 0 ? 8 : parent === 0 ? 4.2 : 3;
      dots += `<circle cx="${x}" cy="${y}" r="${r1(r * unit)}" fill="${esc(colourOf(branch))}"/>`;
    });
    return `<svg class="mm-thumb" viewBox="${r1(cx - w / 2)} ${r1(cy - h / 2)} ${r1(w)} ${r1(h)}" aria-hidden="true">${lines}${dots}</svg>`;
  }

  function drawList() {
    $('#map-count').textContent = maps.length ? `${maps.length} of ${limits.maps}` : '';
    $('#map-none').hidden = maps.length > 0;
    $('#list-tools').hidden = maps.length < 2;
    $('#map-sort').value = listSort;
    const q = listQuery.trim().toLowerCase();
    const shown = maps
      .filter((m) => !q || m.title.toLowerCase().includes(q))
      .sort((a, b) => (listSort === 'title' ? a.title.localeCompare(b.title, 'en-GB') : b.updated - a.updated));
    $('#map-nomatch').hidden = !maps.length || shown.length > 0;
    $('#map-list').innerHTML = shown
      .map(
        (m) => `<li class="mm-card">
          <a class="mm-card-link" href="#${esc(m.id)}">
            ${thumb(m.preview)}
            <span class="mm-card-name">${esc(m.title)}</span>
            <span class="mm-card-meta">${plural(m.count, 'bubble', 'bubbles')} &middot; ${esc(when(m.updated))}</span>
          </a>
          <div class="mm-card-acts">
            <button class="btn small ghost" type="button" data-act="copy-map" data-id="${esc(m.id)}">Duplicate</button>
            <button class="btn small ghost" type="button" data-act="delete-map" data-id="${esc(m.id)}">Delete</button>
          </div>
        </li>`
      )
      .join('');
  }

  $('#map-search').addEventListener('input', (ev) => {
    listQuery = ev.target.value;
    drawList();
  });
  $('#map-sort').addEventListener('change', (ev) => {
    listSort = ev.target.value === 'title' ? 'title' : 'updated';
    try {
      localStorage.setItem(SORT_KEY, listSort);
    } catch {
      // remembered for this visit only
    }
    drawList();
  });

  $('#new-map').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const input = $('#new-text');
    const text = input.value.trim();
    if (!text) return;
    try {
      const { map: made } = await api('maps', { method: 'POST', body: { text } });
      input.value = '';
      location.hash = made.id;
    } catch (err) {
      toast(err.message);
    }
  });

  // --- the tree ------------------------------------------------------------------

  const rootOf = () => {
    for (const n of map.nodes.values()) if (n.parentId === null) return n;
    return null;
  };

  // Who hangs off whom, worked out afresh when it is wanted: it is one pass
  // over at most 250 bubbles, and a copy kept up to date is a copy that can
  // be wrong.
  function index() {
    const kids = new Map();
    for (const n of map.nodes.values()) {
      if (n.parentId === null) continue;
      let list = kids.get(n.parentId);
      if (!list) kids.set(n.parentId, (list = []));
      list.push(n);
    }
    return kids;
  }

  function subtree(id, kids = index()) {
    const out = [];
    const queue = [id];
    while (queue.length) {
      const at = queue.shift();
      out.push(at);
      for (const c of kids.get(at) || []) queue.push(c.id);
    }
    return out;
  }

  function depthOf(node) {
    let d = 0;
    for (let at = node; at && at.parentId !== null; at = map.nodes.get(at.parentId)) d++;
    return d;
  }

  // Everything under a folded bubble, which is on the map but not drawn.
  function hiddenSet(kids = index()) {
    const hidden = new Set();
    const walk = (n, under) => {
      if (under) hidden.add(n.id);
      for (const k of kids.get(n.id) || []) walk(k, under || !!n.folded);
    };
    const root = rootOf();
    if (root) walk(root, false);
    return hidden;
  }

  const visibleNodes = (hidden = hiddenSet()) => [...map.nodes.values()].filter((n) => !hidden.has(n.id));

  // Which colour each branch of the middle is: its own if it was given one,
  // otherwise by its place round the middle.
  function branchColours(kids = index()) {
    const out = new Map();
    const root = rootOf();
    (kids.get(root.id) || []).forEach((n, i) => out.set(n.id, n.colour ?? i % limits.colours));
    return out;
  }

  function colourIndexOf(node, firsts) {
    let at = node;
    while (at && at.parentId !== null && map.nodes.get(at.parentId)?.parentId !== null) at = map.nodes.get(at.parentId);
    if (!at || at.parentId === null) return -1;
    return firsts.get(at.id) ?? 0;
  }

  // --- sizing a bubble to its words ------------------------------------------------

  // A hidden text element on the sheet itself, so the measuring is done in
  // exactly the face the bubble will be drawn in.
  let ruler = null;
  function width(text, face) {
    if (!ruler) {
      ruler = el('text');
      $('#measure').appendChild(ruler);
    }
    ruler.setAttribute('font-size', face.size);
    ruler.textContent = text;
    return ruler.getComputedTextLength();
  }

  function wrap(text, face) {
    const lines = [];
    for (const para of String(text || '').split('\n')) {
      let line = '';
      for (const word of para.split(' ').filter(Boolean)) {
        const tryLine = line ? `${line} ${word}` : word;
        if (line && width(tryLine, face) > face.wrap) {
          lines.push(line);
          line = word;
        } else {
          line = tryLine;
        }
      }
      if (line) lines.push(line);
    }
    return lines;
  }

  function measure(node) {
    const face = faceAt(depthOf(node));
    const lines = wrap(node.text, face);
    const widest = Math.max(0, ...lines.map((l) => width(l, face)));
    node._face = face;
    node._lines = lines;
    node._w = Math.max(MIN_W, Math.ceil(widest) + face.padX * 2);
    node._h = Math.max(1, lines.length) * face.line + face.padY * 2;
  }

  function remeasure() {
    if (!map) return;
    for (const n of map.nodes.values()) measure(n);
    draw();
  }
  document.fonts?.addEventListener?.('loadingdone', remeasure);

  // --- gliding -------------------------------------------------------------------

  // Bubbles are drawn where they are going, less whatever is left of the
  // glide from where they were. `from` holds only the ones that move.
  let glide = null; // { from: Map<id, {x, y}>, t0 }

  const ease = (t) => 1 - Math.pow(1 - t, 3);

  function pos(n) {
    const f = glide?.from.get(n.id);
    if (!f) return n;
    const t = ease(Math.min(1, (performance.now() - glide.t0) / GLIDE_MS));
    return { x: f.x + (n.x - f.x) * t, y: f.y + (n.y - f.y) * t };
  }

  function where() {
    const out = new Map();
    for (const n of map.nodes.values()) {
      const p = pos(n);
      out.set(n.id, { x: p.x, y: p.y });
    }
    return out;
  }

  function startGlide(from) {
    if (!map) return;
    if (still() || !from.size) {
      glide = null;
      draw();
      return;
    }
    // A glide that starts while another is running starts from wherever
    // the first had got to.
    const merged = new Map();
    if (glide) for (const id of glide.from.keys()) if (map.nodes.has(id)) merged.set(id, { ...pos(map.nodes.get(id)) });
    for (const [id, p] of from) merged.set(id, p);
    const running = !!glide;
    glide = { from: merged, t0: performance.now() };
    draw();
    if (!running) requestAnimationFrame(frame);
  }

  function frame(now) {
    if (!glide || !map) return;
    if (now - glide.t0 >= GLIDE_MS) glide = null;
    draw();
    if (glide) requestAnimationFrame(frame);
  }

  // --- drawing -------------------------------------------------------------------

  const drawn = new Map(); // id -> { g, ring, shape, text, badge, key }
  const paths = new Map(); // id -> the branch into that bubble

  function clearSheet() {
    for (const id of ['#branches', '#bubbles', '#handles']) $(id).textContent = '';
    drawn.clear();
    paths.clear();
  }

  // A branch as a filled shape that narrows from its parent to its child:
  // the same S-curve as ever, walked in steps and offset either side.
  function taper(p, c, w0, w1) {
    const mid = (p.x + c.x) / 2;
    const P = [p, { x: mid, y: p.y }, { x: mid, y: c.y }, c];
    const chord = Math.hypot(c.x - p.x, c.y - p.y) || 1;
    const left = [];
    const right = [];
    const STEPS = 18;
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const u = 1 - t;
      const x = u * u * u * P[0].x + 3 * u * u * t * P[1].x + 3 * u * t * t * P[2].x + t * t * t * P[3].x;
      const y = u * u * u * P[0].y + 3 * u * u * t * P[1].y + 3 * u * t * t * P[2].y + t * t * t * P[3].y;
      let dx = 3 * u * u * (P[1].x - P[0].x) + 6 * u * t * (P[2].x - P[1].x) + 3 * t * t * (P[3].x - P[2].x);
      let dy = 3 * u * u * (P[1].y - P[0].y) + 6 * u * t * (P[2].y - P[1].y) + 3 * t * t * (P[3].y - P[2].y);
      let len = Math.hypot(dx, dy);
      if (len < 1e-6) {
        dx = (c.x - p.x) / chord;
        dy = (c.y - p.y) / chord;
        len = 1;
      }
      const half = (w0 + (w1 - w0) * t) / 2;
      const nx = (-dy / len) * half;
      const ny = (dx / len) * half;
      left.push(`${r1(x + nx)} ${r1(y + ny)}`);
      right.push(`${r1(x - nx)} ${r1(y - ny)}`);
    }
    return `M${left.join('L')}L${right.reverse().join('L')}Z`;
  }

  function draw() {
    if (!map) return;
    const c = palette();
    const kids = index();
    const hidden = hiddenSet(kids);
    const firsts = branchColours(kids);
    const root = rootOf();
    const focusable = selected && map.nodes.has(selected) && !hidden.has(selected) ? selected : root.id;

    set($('#mm-shadow-drop'), { 'flood-color': c.shadow || '#000', 'flood-opacity': c.shadowAlpha });
    set($('#mm-root-top'), { 'stop-color': mix('#ffffff', c.rootFill, 0.22) });
    set($('#mm-root-bottom'), { 'stop-color': c.rootFill });
    set($('#mm-dot'), { fill: c.grid || 'transparent' });

    const branchLayer = $('#branches');
    const bubbleLayer = $('#bubbles');
    const seen = new Set();

    for (const n of map.nodes.values()) {
      if (hidden.has(n.id)) continue;
      seen.add(n.id);
      const p = pos(n);
      const depth = n.parentId === null ? 0 : n._face === FACE.first ? 1 : 2;
      const ci = colourIndexOf(n, firsts);
      const colour = depth === 0 ? c.rootFill : c.branches[ci % c.branches.length];

      // The branch in.
      if (n.parentId !== null) {
        const parent = map.nodes.get(n.parentId);
        let path = paths.get(n.id);
        if (!path) {
          path = el('path', { class: 'mm-branch' });
          paths.set(n.id, path);
          branchLayer.appendChild(path);
        }
        const fromMiddle = parent.parentId === null;
        set(path, { d: taper(pos(parent), p, fromMiddle ? 10 : 5, fromMiddle ? 3 : 1.8), fill: colour });
      }

      // The bubble.
      let d = drawn.get(n.id);
      if (!d) {
        const g = el('g', { class: 'mm-node', 'data-id': n.id, role: 'button' });
        const ring = el('rect', { class: 'mm-ring', fill: 'none', 'stroke-width': 3, pathLength: 100 });
        const shape = el('rect', { class: 'mm-bubble', filter: 'url(#mm-shadow)' });
        const text = el('text', { 'text-anchor': 'middle' });
        const badge = el('g', { class: 'mm-fold', display: 'none' });
        badge.append(el('circle', { r: 12 }), el('text', { 'text-anchor': 'middle', dy: '0.35em', 'font-size': 12 }));
        g.append(ring, shape, text, badge);
        bubbleLayer.appendChild(g);
        d = { g, ring, shape, text, badge, key: '' };
        drawn.set(n.id, d);
      }
      d.g.setAttribute('transform', `translate(${r1(p.x)} ${r1(p.y)})`);
      d.g.setAttribute('tabindex', n.id === focusable ? 0 : -1);
      d.g.classList.toggle('is-root', depth === 0);

      const face = n._face || FACE.node;
      const w = n._w;
      const h = n._h;
      const fill = depth === 0 ? 'url(#mm-root-fill)' : mix(colour, c.paper, depth === 1 ? 0.2 : 0.12);
      const key = [w, h, n._lines.join('|'), colour, fill, depth, c.ink, c.rootInk, c.face].join(';');
      if (key !== d.key) {
        d.key = key;
        const r = depth === 1 ? h / 2 : Math.min(h / 2, 14);
        set(d.ring, { x: -w / 2 - 5, y: -h / 2 - 5, width: w + 10, height: h + 10, rx: r + 5, stroke: colour });
        set(d.shape, {
          x: -w / 2,
          y: -h / 2,
          width: w,
          height: h,
          rx: depth === 0 ? Math.min(h / 2, 26) : r,
          fill,
          stroke: depth === 0 ? 'none' : colour,
          'stroke-width': depth === 1 ? 2 : 1.5,
        });
        set(d.text, { 'font-size': face.size, 'font-family': c.face, fill: depth === 0 ? c.rootInk : c.ink });
        d.text.textContent = '';
        const lines = n._lines.length ? n._lines : [''];
        // The first baseline sits so the block of lines is centred on the
        // bubble; 0.35em is about where a lower-case x has its middle.
        const top = -((lines.length - 1) * face.line) / 2;
        lines.forEach((line, i) => {
          const span = el('tspan', { x: 0, y: top + i * face.line, dy: '0.35em' });
          span.textContent = line;
          d.text.appendChild(span);
        });
      }

      // The count on a folded bubble, on the side away from its parent.
      const under = n.folded ? subtree(n.id, kids).length - 1 : 0;
      if (under > 0 && depth > 0) {
        const parent = map.nodes.get(n.parentId);
        const side = Math.sign(n.x - parent.x) || 1;
        set(d.badge, { display: 'inline', transform: `translate(${r1(side * (w / 2))} 0)` });
        set(d.badge.firstChild, { fill: colour, stroke: c.paper, 'stroke-width': 2 });
        set(d.badge.lastChild, { fill: c.paper, 'font-family': c.face });
        d.badge.lastChild.textContent = `+${under}`;
        d.g.setAttribute('aria-label', `${n.text || 'Empty bubble'} (folded, ${plural(under, 'bubble', 'bubbles')} hidden)`);
      } else {
        d.badge.setAttribute('display', 'none');
        d.g.setAttribute('aria-label', n.text || 'Empty bubble');
      }
    }

    for (const [id, d] of drawn) {
      if (!seen.has(id)) {
        d.g.remove();
        drawn.delete(id);
      }
    }
    for (const [id, path] of paths) {
      if (!seen.has(id) || map.nodes.get(id)?.parentId == null) {
        path.remove();
        paths.delete(id);
      }
    }

    drawHandles();
    $('#map-title').textContent = (root?.text || '').replace(/[\n]/g, ' ');
    document.title = `${$('#map-title').textContent || 'Mind map'} · Mind maps · Thievery`;
  }

  // The selection and its buttons, drawn at the same size on screen whatever
  // the zoom. They are the page's, not the map's, and are never exported.
  function drawHandles() {
    const layer = $('#handles');
    layer.textContent = '';
    if (!map || !selected || gesture?.kind === 'drag') return;
    const n = map.nodes.get(selected);
    if (!n || !drawn.has(n.id)) return;
    const c = palette();
    const s = 1 / view.k;
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    const R = (coarse ? 15 : 11) * s;
    const p = pos(n);
    const isRoot = n.parentId === null;
    const parent = isRoot ? null : map.nodes.get(n.parentId);
    const side = isRoot ? 1 : Math.sign(n.x - parent.x) || 1;
    const colour = isRoot ? c.rootFill : c.branches[colourIndexOf(n, branchColours()) % c.branches.length];
    const gap = 8 * s;

    layer.appendChild(
      el('rect', {
        class: 'mm-select',
        x: p.x - n._w / 2 - 5 * s,
        y: p.y - n._h / 2 - 5 * s,
        width: n._w + 10 * s,
        height: n._h + 10 * s,
        rx: Math.min(n._h / 2, 26) + 5 * s,
        fill: 'none',
        stroke: c.select,
        'stroke-width': 2 * s,
      })
    );

    const button = (kind, x, y, label, glyph) => {
      const g = el('g', { class: 'mm-handle', 'data-handle': kind, 'data-id': n.id, transform: `translate(${r1(x)} ${r1(y)})` });
      const title = el('title');
      title.textContent = label;
      g.append(title, el('circle', { r: R, fill: c.handle, stroke: colour, 'stroke-width': 1.5 * s }));
      const arm = R * 0.45;
      g.appendChild(el('path', { d: `M${-arm} 0H${arm}`, stroke: colour, 'stroke-width': 2 * s, 'stroke-linecap': 'round' }));
      if (glyph === '+') {
        g.appendChild(el('path', { d: `M0 ${-arm}V${arm}`, stroke: colour, 'stroke-width': 2 * s, 'stroke-linecap': 'round' }));
      }
      layer.appendChild(g);
    };

    // Past the count on a folded bubble, which sits on the same edge.
    const past = n.folded ? 14 : 0;
    button('child', p.x + side * (n._w / 2 + past + gap + R), p.y, 'Add a branch (Tab)', '+');
    if (!isRoot) {
      button('sibling', p.x, p.y + n._h / 2 + gap + R, 'Add a bubble beside this one (Enter)', '+');
      const hasKids = [...map.nodes.values()].some((k) => k.parentId === n.id);
      if (hasKids && !n.folded) button('fold', p.x, p.y - n._h / 2 - gap - R * 0.85, 'Fold this branch away', '-');
    }
  }

  // Only the pan and zoom, for when nothing on the sheet itself has changed.
  function place() {
    const t = `translate(${r1(view.x)} ${r1(view.y)}) scale(${view.k})`;
    $('#world').setAttribute('transform', t);
    $('#mm-dots').setAttribute('patternTransform', t);
    $('#grid').setAttribute('opacity', Math.min(1, view.k * 1.6).toFixed(2));
    $('#zoom-level').textContent = `${Math.round(view.k * 100)}%`;
    drawHandles();
    if (editing) placeEditor();
  }

  function bounds(nodes = visibleNodes()) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of nodes) {
      x0 = Math.min(x0, n.x - n._w / 2);
      y0 = Math.min(y0, n.y - n._h / 2);
      x1 = Math.max(x1, n.x + n._w / 2);
      y1 = Math.max(y1, n.y + n._h / 2);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  const clampK = (k) => Math.min(3, Math.max(0.15, k));

  function fit() {
    const stage = $('#stage').getBoundingClientRect();
    const b = bounds();
    const pad = 56;
    const k = Math.min(1.25, (stage.width - pad * 2) / b.w, (stage.height - pad * 2) / b.h);
    view.k = clampK(k);
    view.x = stage.width / 2 - (b.x + b.w / 2) * view.k;
    view.y = stage.height / 2 - (b.y + b.h / 2) * view.k;
    place();
  }

  function zoomBy(factor) {
    const stage = $('#stage').getBoundingClientRect();
    const at = { x: stage.width / 2, y: stage.height / 2 };
    const k = clampK(view.k * factor);
    view.x = at.x - ((at.x - view.x) * k) / view.k;
    view.y = at.y - ((at.y - view.y) * k) / view.k;
    view.k = k;
    place();
  }

  // --- selecting -----------------------------------------------------------------

  function select(id, { focus = false } = {}) {
    selected = id && map?.nodes.has(id) ? id : null;
    const root = map && rootOf();
    const focusable = selected || root?.id;
    for (const [nid, d] of drawn) d.g.setAttribute('tabindex', nid === focusable ? 0 : -1);
    drawHandles();
    if (focus && selected) drawn.get(selected)?.g.focus({ preventScroll: true });
  }

  // The nearest bubble in the direction of an arrow, favouring the ones
  // straight ahead over the ones off to the side.
  function nearest(from, dx, dy) {
    let best = null;
    let score = Infinity;
    for (const n of visibleNodes()) {
      if (n === from) continue;
      const vx = n.x - from.x;
      const vy = n.y - from.y;
      const along = vx * dx + vy * dy;
      if (along <= 1) continue;
      const s = along + Math.abs(vx * dy - vy * dx) * 2;
      if (s < score) {
        score = s;
        best = n;
      }
    }
    return best;
  }

  // --- where a new branch goes ---------------------------------------------------

  const GAP = 14;
  function overlaps(x, y, w, h, skip) {
    for (const n of map.nodes.values()) {
      if (n === skip) continue;
      if (Math.abs(n.x - x) * 2 < n._w + w + GAP * 2 && Math.abs(n.y - y) * 2 < n._h + h + GAP * 2) return true;
    }
    return false;
  }

  // How far from the parent's centre a child has to sit, in a given
  // direction, for the two to clear each other with a branch between.
  function reach(p, c, angle, stretch) {
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    return ((p._w + c._w) / 2) * cos + ((p._h + c._h) / 2) * sin + 46 * stretch;
  }

  const ROOT_ORDER = [0, 180, 300, 120, 240, 60, 330, 150, 30, 210, 270, 90, 15, 195, 345, 165, 285, 105, 255, 75];
  const FAN = [0, 25, -25, 50, -50, 75, -75, 100, -100, 130, -130];

  function placeChild(parent, child) {
    let angles;
    if (parent.parentId === null) {
      angles = ROOT_ORDER.map((a) => (a * Math.PI) / 180);
    } else {
      const g = map.nodes.get(parent.parentId);
      const out = Math.atan2(parent.y - g.y, parent.x - g.x);
      angles = FAN.map((a) => out + (a * Math.PI) / 180);
    }
    for (const stretch of [1, 1.8, 2.8, 4, 5.5]) {
      for (const a of angles) {
        const r = reach(parent, child, a, stretch);
        const x = parent.x + Math.cos(a) * r;
        const y = parent.y + Math.sin(a) * r;
        if (!overlaps(x, y, child._w, child._h, child)) {
          child.x = Math.round(x);
          child.y = Math.round(y);
          return;
        }
      }
    }
    // Nowhere clear: straight out, a long way, and the member can move it.
    const a = angles[0];
    const r = reach(parent, child, a, 7);
    child.x = Math.round(parent.x + Math.cos(a) * r);
    child.y = Math.round(parent.y + Math.sin(a) * r);
  }

  function addBranch(parentId) {
    if (map.nodes.size >= limits.nodes) {
      toast(`A map can have up to ${limits.nodes} bubbles.`);
      return null;
    }
    const parent = map.nodes.get(parentId);
    if (!parent) return null;
    if (parent.folded) unfold(parent);
    // Placed at the size of a short phrase rather than of an empty bubble,
    // so that typing into it does not immediately push it into a neighbour.
    const child = { id: newId(), parentId, text: '', x: parent.x, y: parent.y, _lines: [], _w: 130, _h: 41 };
    placeChild(parent, child);
    map.nodes.set(child.id, child);
    measure(child);
    selected = child.id;
    startGlide(new Map([[child.id, { x: parent.x, y: parent.y }]]));
    return child;
  }

  function addSibling(id) {
    const n = map.nodes.get(id);
    if (!n) return null;
    return addBranch(n.parentId === null ? n.id : n.parentId);
  }

  // --- folding -------------------------------------------------------------------

  function unfold(n) {
    delete n.folded;
    const from = new Map();
    for (const id of subtree(n.id).slice(1)) from.set(id, { x: n.x, y: n.y });
    startGlide(from);
  }

  function toggleFold(id) {
    const n = map.nodes.get(id);
    if (!n || n.parentId === null) return;
    if (n.folded) {
      unfold(n);
    } else {
      if (![...map.nodes.values()].some((k) => k.parentId === n.id)) return;
      n.folded = true;
      if (selected && selected !== n.id && subtree(n.id).includes(selected)) selected = n.id;
      draw();
    }
    changed();
  }

  // --- tidy ----------------------------------------------------------------------

  // The branches of the middle shared out either side of it, so each side
  // is about as tall as the other, and everything further out set in
  // columns running away from the middle. A folded bubble is laid out as
  // if it had no branches, and what is folded inside it moves with it.
  function tidy() {
    const root = rootOf();
    const kids = index();
    const shown = (n) => (n.folded ? [] : kids.get(n.id) || []);
    const firsts = shown(root);
    if (!firsts.length) return;
    const from = where();
    const before = new Map([...map.nodes.values()].map((n) => [n.id, { x: n.x, y: n.y }]));

    const GAP_Y = 16;
    const GAP_X = 60;
    const span = new Map();
    const measureSpan = (n) => {
      const ks = shown(n);
      const own = n._h + GAP_Y;
      const s = ks.length ? Math.max(own, ks.reduce((a, k) => a + measureSpan(k), 0)) : own;
      span.set(n.id, s);
      return s;
    };
    const total = firsts.reduce((a, f) => a + measureSpan(f), 0);

    const right = [];
    const left = [];
    let acc = 0;
    for (const f of firsts) {
      const s = span.get(f.id);
      if (!right.length || acc + s / 2 <= total / 2) right.push(f);
      else left.push(f);
      acc += s;
    }
    // The left is read bottom to top, so the branches run on round the
    // middle rather than starting again at the top.
    left.reverse();

    const lay = (list, dir) => {
      const widest = [];
      const walk = (n, d) => {
        widest[d] = Math.max(widest[d] || 0, n._w);
        for (const k of shown(n)) walk(k, d + 1);
      };
      for (const f of list) walk(f, 1);
      // Where each column starts, measured from the middle outwards.
      const start = [0, root._w / 2 + GAP_X + 20];
      for (let d = 2; d < widest.length; d++) start[d] = start[d - 1] + widest[d - 1] + GAP_X;

      const put = (n, top, d) => {
        const s = span.get(n.id);
        const ks = shown(n);
        n.x = Math.round(dir * (start[d] + n._w / 2));
        if (ks.length) {
          const sum = ks.reduce((a, k) => a + span.get(k.id), 0);
          let t = top + (s - sum) / 2;
          for (const k of ks) {
            put(k, t, d + 1);
            t += span.get(k.id);
          }
          n.y = Math.round((ks[0].y + ks[ks.length - 1].y) / 2);
        } else {
          n.y = Math.round(top + s / 2);
        }
      };
      const height = list.reduce((a, f) => a + span.get(f.id), 0);
      let top = -height / 2;
      for (const f of list) {
        put(f, top, 1);
        top += span.get(f.id);
      }
    };
    root.x = 0;
    root.y = 0;
    lay(right, 1);
    lay(left, -1);

    for (const n of map.nodes.values()) {
      if (!n.folded) continue;
      const was = before.get(n.id);
      const dx = n.x - was.x;
      const dy = n.y - was.y;
      for (const id of subtree(n.id, kids).slice(1)) {
        const k = map.nodes.get(id);
        k.x = Math.round(k.x + dx);
        k.y = Math.round(k.y + dy);
      }
    }
    startGlide(from);
    fit();
    changed();
  }

  // --- editing a bubble ----------------------------------------------------------

  let editing = null; // { id, fresh, before }

  function placeEditor() {
    const n = map.nodes.get(editing.id);
    if (!n) return;
    const box = $('#editor');
    const w = Math.max(292, n._w * view.k + 20);
    box.style.width = `${w}px`;
    box.style.left = `${view.x + n.x * view.k - w / 2}px`;
    box.style.top = `${view.y + n.y * view.k - 30}px`;
  }

  function drawSwatches(n) {
    const box = $('#swatches');
    const firstRing = n.parentId !== null && map.nodes.get(n.parentId)?.parentId === null;
    box.hidden = !firstRing;
    if (!firstRing) return;
    const c = palette();
    const auto = (index().get(n.parentId) || []).indexOf(n) % limits.colours;
    box.innerHTML =
      `<button type="button" class="mm-swatch is-auto" data-act="colour" data-colour="" aria-label="Automatic colour" aria-pressed="${n.colour === undefined}" style="--sw:${esc(c.branches[auto % c.branches.length])}">Auto</button>` +
      c.branches
        .map(
          (colour, i) =>
            `<button type="button" class="mm-swatch" data-act="colour" data-colour="${i}" aria-label="Colour ${i + 1}" aria-pressed="${n.colour === i}" style="--sw:${esc(colour)}"></button>`
        )
        .join('');
  }

  function edit(id, fresh = false) {
    if (editing) commit();
    const n = map.nodes.get(id);
    if (!n) return;
    select(id);
    editing = { id, fresh, before: n.text };
    const area = $('#editor-text');
    area.value = n.text;
    area.maxLength = limits.text;
    $('#editor-delete').hidden = n.parentId === null;
    drawSwatches(n);
    $('#editor').hidden = false;
    placeEditor();
    area.focus();
    area.select();
  }

  function closeEditor() {
    const id = editing?.id;
    editing = null;
    $('#editor').hidden = true;
    if (id && map?.nodes.has(id)) select(id, { focus: true });
  }

  function tidyText(s) {
    return String(s)
      .split('\n')
      .map((l) => l.replace(/[\s]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
      .slice(0, limits.text);
  }

  function commit() {
    if (!editing) return;
    const n = map.nodes.get(editing.id);
    const text = tidyText($('#editor-text').value);
    if (!n) return closeEditor();
    if (!text) {
      if (n.parentId === null) {
        toast('The bubble in the middle needs some words.');
        closeEditor();
        return;
      }
      if ([...map.nodes.values()].some((k) => k.parentId === n.id)) {
        toast('Use Delete to remove a bubble that has branches.');
        closeEditor();
        return;
      }
      const parentId = n.parentId;
      map.nodes.delete(n.id);
      editing = null;
      $('#editor').hidden = true;
      select(parentId, { focus: true });
      draw();
      changed();
      return;
    }
    n.text = text;
    measure(n);
    closeEditor();
    draw();
    changed();
  }

  function cancel() {
    if (!editing) return;
    const n = map.nodes.get(editing.id);
    if (editing.fresh && n) {
      const parentId = n.parentId;
      map.nodes.delete(n.id);
      editing = null;
      $('#editor').hidden = true;
      select(parentId, { focus: true });
      draw();
      return;
    }
    closeEditor();
  }

  function removeBubble(id) {
    const n = map.nodes.get(id);
    if (!n || n.parentId === null) return;
    const going = subtree(id);
    const parentId = n.parentId;
    for (const g of going) map.nodes.delete(g);
    if (editing) {
      editing = null;
      $('#editor').hidden = true;
    }
    select(parentId);
    draw();
    select(parentId, { focus: true });
    changed();
    if (going.length > 1) toast(`Deleted ${plural(going.length, 'bubble', 'bubbles')}. Undo brings them back.`, 'info');
  }

  function setColour(id, value) {
    const n = map.nodes.get(id);
    if (!n) return;
    if (value === '' || value == null) delete n.colour;
    else n.colour = Number(value);
    draw();
    drawSwatches(n);
    changed();
  }

  $('#editor-text').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      commit();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      cancel();
    }
  });
  // A click on Done, Delete or a colour must not blur the text first, or
  // the blur would commit and close the editor before the button heard it.
  $('#editor').addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('button')) ev.preventDefault();
  });
  $('#editor-text').addEventListener('blur', () => {
    if (editing) commit();
  });

  // --- undo ----------------------------------------------------------------------

  // `shot` is the tree as it was last saved or restored; `past` and `future`
  // are the ones either side of it.
  let history = { past: [], future: [], shot: '' };

  function resetHistory() {
    history = { past: [], future: [], shot: map ? JSON.stringify(wire(map)) : '' };
    undoButtons();
  }

  function undoButtons() {
    $('#undo').disabled = !history.past.length;
    $('#redo').disabled = !history.future.length;
  }

  // Take a copy if the tree is not the one last copied. False if it is.
  function record() {
    const now = JSON.stringify(wire(map));
    if (now === history.shot) return false;
    history.past.push(history.shot);
    if (history.past.length > HISTORY) history.past.shift();
    history.shot = now;
    history.future = [];
    undoButtons();
    return true;
  }

  function restore(shot) {
    const from = where();
    const kept = new Map();
    for (const n of JSON.parse(shot)) kept.set(n.id, { ...n });
    map.nodes = kept;
    for (const n of map.nodes.values()) measure(n);
    if (editing) {
      editing = null;
      $('#editor').hidden = true;
    }
    if (!map.nodes.has(selected)) selected = null;
    history.shot = shot;
    undoButtons();
    startGlide(from);
    queueSave();
  }

  function undo() {
    if (!map || !history.past.length) return;
    history.future.push(history.shot);
    restore(history.past.pop());
  }

  function redo() {
    if (!map || !history.future.length) return;
    history.past.push(history.shot);
    restore(history.future.pop());
  }

  // --- saving --------------------------------------------------------------------

  // Every map with work the server has not got yet, whether or not it is
  // still the one open: leaving a map does not wait for a network that is
  // down, and the page is not left while one of these is waiting.
  const unsaved = new Set();
  let inflight = null;
  let saveTimer = null;

  function setState(text, target = map) {
    if (target === map) $('#save-state').textContent = text;
  }

  function changed() {
    if (!map) return;
    if (record()) queueSave();
  }

  function queueSave() {
    const target = map;
    if (!target || target.conflict) return;
    target.dirty = true;
    unsaved.add(target);
    setState('Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save(target), SAVE_AFTER_MS);
  }

  function wire(target = map) {
    return [...target.nodes.values()].map((n) => {
      const out = { id: n.id, parentId: n.parentId, text: n.text, x: n.x, y: n.y };
      if (n.folded) out.folded = true;
      if (n.colour !== undefined) out.colour = n.colour;
      return out;
    });
  }

  // One save at a time. A save asked for while one is on its way waits for
  // it and then goes, so nothing asked for is ever dropped; it used to
  // reschedule itself and return, and leaving the map in that moment threw
  // the second save away.
  async function save(target = map) {
    while (inflight) await inflight;
    if (!target || target.conflict || !target.dirty) return;
    target.dirty = false;
    inflight = send(target);
    try {
      await inflight;
    } finally {
      inflight = null;
    }
  }

  async function send(target) {
    try {
      const got = await api(`maps/${encodeURIComponent(target.id)}`, {
        method: 'POST',
        body: { nodes: wire(target), rev: target.rev },
      });
      target.rev = got.rev;
      if (!target.dirty) {
        unsaved.delete(target);
        setState('Saved', target);
        adopt(target, got.nodes);
      }
    } catch (err) {
      if (err.status === 409) {
        target.conflict = 'clash';
        setState('Not saved', target);
        if (target === map) $('#clash').hidden = false;
      } else if (err.status === 400 || err.status === 404) {
        // Something the server will refuse however often it is asked.
        target.conflict = 'refused';
        unsaved.delete(target);
        setState('Not saved', target);
        toast(err.message);
      } else {
        target.dirty = true;
        setState('Not saved yet. Trying again…', target);
        setTimeout(() => save(target), RETRY_MS);
      }
    }
  }

  // The tree comes back as stored, and `clean` may have dropped something
  // the page was still holding: an empty bubble, or a colour where a colour
  // cannot go. The page takes the server's word for it.
  function adopt(target, nodes) {
    if (target !== map || !Array.isArray(nodes)) return;
    const stored = new Map(nodes.map((n) => [n.id, n]));
    let moved = false;
    for (const [id, n] of map.nodes) {
      const s = stored.get(id);
      if (!s) {
        if (editing?.id === id) continue;
        map.nodes.delete(id);
        moved = true;
      } else if (s.colour !== n.colour) {
        if (s.colour === undefined) delete n.colour;
        else n.colour = s.colour;
        moved = true;
      }
    }
    if (moved) {
      history.shot = JSON.stringify(wire(map));
      draw();
    }
  }

  async function keepMine() {
    const target = map;
    if (!target) return;
    const got = await api(`maps/${encodeURIComponent(target.id)}`);
    target.rev = got.map.rev;
    target.conflict = false;
    $('#clash').hidden = true;
    queueSave();
    clearTimeout(saveTimer);
    await save(target);
  }

  async function loadTheirs() {
    const target = map;
    if (!target) return;
    unsaved.delete(target);
    $('#clash').hidden = true;
    map = null;
    clearSheet();
    await openMap(target.id);
  }

  window.addEventListener('beforeunload', (ev) => {
    if (editing) commit();
    if (inflight || unsaved.size) {
      ev.preventDefault();
      ev.returnValue = '';
    }
  });

  // --- opening a map -----------------------------------------------------------

  async function openMap(id) {
    let got;
    try {
      got = await api(`maps/${encodeURIComponent(id)}`);
    } catch (err) {
      toast(err.status === 404 ? 'That map isn’t there any more.' : err.message);
      location.hash = '';
      return;
    }
    limits = { ...limits, ...(got.limits || {}) };
    clearSheet();
    glide = null;
    map = { id: got.map.id, rev: got.map.rev, nodes: new Map(), dirty: false, conflict: false };
    for (const n of got.map.nodes) map.nodes.set(n.id, { ...n });
    selected = rootOf()?.id || null;
    $('#clash').hidden = true;
    setState('Saved');
    show('edit');
    // Measured in the wrong face, every bubble is the wrong size, so the
    // face is waited for first (and again, above, if it arrives late).
    await document.fonts.ready.catch(() => {});
    if (!map) return;
    for (const n of map.nodes.values()) measure(n);
    resetHistory();
    draw();
    fit();
  }

  // --- the pointer ------------------------------------------------------------------

  const sheet = $('#sheet');
  const pointers = new Map();
  let gesture = null;
  let lastTap = null;

  function local(ev) {
    const r = sheet.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  const toWorld = (at) => ({ x: (at.x - view.x) / view.k, y: (at.y - view.y) / view.k });

  function stopHold(g = gesture) {
    if (g?.timer) clearTimeout(g.timer);
    sheet.querySelector('.mm-node.is-holding')?.classList.remove('is-holding');
  }

  // The bubble a dragged branch would be joined to if it were let go here.
  function dropTarget(at, moving) {
    const w = toWorld(at);
    const skip = new Set(moving.map((m) => m.n.id));
    let best = null;
    for (const n of visibleNodes()) {
      if (skip.has(n.id)) continue;
      if (Math.abs(n.x - w.x) * 2 <= n._w && Math.abs(n.y - w.y) * 2 <= n._h) best = n;
    }
    return best;
  }

  function markTarget(id) {
    for (const [nid, d] of drawn) d.g.classList.toggle('is-target', nid === id);
  }

  sheet.addEventListener('contextmenu', (ev) => ev.preventDefault());

  sheet.addEventListener('pointerdown', (ev) => {
    if (!map || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    const handle = ev.target.closest('.mm-handle');
    const badge = ev.target.closest('.mm-fold');
    const bubble = ev.target.closest('.mm-node');
    if (editing) commit();
    const at = local(ev);
    pointers.set(ev.pointerId, at);
    sheet.setPointerCapture(ev.pointerId);

    if (pointers.size === 2) {
      // A second finger: whatever the first one was doing, this is a pinch.
      stopHold();
      const [a, b] = [...pointers.values()];
      gesture = {
        kind: 'pinch',
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        k: view.k,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        view: { ...view },
      };
      return;
    }
    if (pointers.size > 2) return;

    if (handle && map.nodes.has(handle.dataset.id)) {
      ev.preventDefault();
      gesture = { kind: 'handle', act: handle.dataset.handle, id: handle.dataset.id };
    } else if (badge && bubble) {
      gesture = { kind: 'fold', id: bubble.dataset.id };
    } else if (bubble && map.nodes.has(bubble.dataset.id)) {
      const id = bubble.dataset.id;
      select(id);
      bubble.classList.add('is-holding');
      gesture = {
        kind: 'press',
        id,
        start: at,
        timer: setTimeout(() => {
          bubble.classList.remove('is-holding');
          const child = addBranch(id);
          gesture = child ? { kind: 'held', id: child.id } : { kind: 'done' };
        }, HOLD_MS),
      };
    } else {
      gesture = { kind: 'pan', start: at, view: { ...view }, moved: false };
    }
  });

  sheet.addEventListener('pointermove', (ev) => {
    if (!pointers.has(ev.pointerId) || !gesture) return;
    const at = local(ev);
    pointers.set(ev.pointerId, at);

    if (gesture.kind === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const k = clampK(gesture.k * (dist / gesture.dist));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      // The point under the fingers' midpoint stays under it.
      const wx = (gesture.mid.x - gesture.view.x) / gesture.view.k;
      const wy = (gesture.mid.y - gesture.view.y) / gesture.view.k;
      view.k = k;
      view.x = mid.x - wx * k;
      view.y = mid.y - wy * k;
      place();
      return;
    }
    if (gesture.kind === 'press') {
      if (Math.hypot(at.x - gesture.start.x, at.y - gesture.start.y) <= SLOP) return;
      stopHold();
      // Dragging a bubble takes its branches with it, folded ones included.
      glide = null;
      const moving = subtree(gesture.id).map((id) => map.nodes.get(id));
      gesture = {
        kind: 'drag',
        id: gesture.id,
        start: gesture.start,
        moving: moving.map((n) => ({ n, x: n.x, y: n.y })),
        moved: false,
        target: null,
      };
      sheet.classList.add('is-dragging');
    }
    if (gesture.kind === 'drag') {
      const dx = (at.x - gesture.start.x) / view.k;
      const dy = (at.y - gesture.start.y) / view.k;
      for (const m of gesture.moving) {
        m.n.x = Math.round(m.x + dx);
        m.n.y = Math.round(m.y + dy);
      }
      gesture.moved = true;
      const target = map.nodes.get(gesture.id).parentId === null ? null : dropTarget(at, gesture.moving);
      gesture.target = target && target.id !== map.nodes.get(gesture.id).parentId ? target.id : null;
      draw();
      markTarget(gesture.target);
      return;
    }
    if (gesture.kind === 'pan') {
      if (!gesture.moved && Math.hypot(at.x - gesture.start.x, at.y - gesture.start.y) <= SLOP) return;
      gesture.moved = true;
      view.x = gesture.view.x + (at.x - gesture.start.x);
      view.y = gesture.view.y + (at.y - gesture.start.y);
      place();
    }
  });

  // A dragged branch let go on another bubble becomes that bubble's branch.
  // It is put back where it started and then placed beside its new parent
  // the way any new branch is, so it does not land on top of it.
  function reattach(drag) {
    const n = map.nodes.get(drag.id);
    const target = map.nodes.get(drag.target);
    if (!n || !target) return;
    const from = where();
    for (const m of drag.moving) {
      m.n.x = m.x;
      m.n.y = m.y;
    }
    n.parentId = target.id;
    if (target.folded) delete target.folded;
    if (target.parentId !== null) delete n.colour;
    const was = { x: n.x, y: n.y };
    for (const m of drag.moving) measure(m.n);
    placeChild(target, n);
    const dx = n.x - was.x;
    const dy = n.y - was.y;
    for (const m of drag.moving.slice(1)) {
      m.n.x = Math.round(m.n.x + dx);
      m.n.y = Math.round(m.n.y + dy);
    }
    startGlide(from);
  }

  function release(ev) {
    if (!pointers.has(ev.pointerId)) return;
    pointers.delete(ev.pointerId);
    if (!gesture) return;
    const was = gesture;
    if (was.kind === 'pinch') {
      // Lifting one finger of two ends the pinch; the other finger does
      // nothing more until it lifts too.
      if (!pointers.size) gesture = null;
      else gesture = { kind: 'done' };
      return;
    }
    if (pointers.size) return;
    gesture = null;
    // The hold is cancelled by what the press was, not by what is current,
    // which has just been cleared: missing that left the timer running, and
    // every quick click grew a branch half a second later.
    stopHold(was);
    sheet.classList.remove('is-dragging');
    if (ev.type === 'pointercancel') {
      markTarget(null);
      if (was.kind === 'drag' && was.moved) changed();
      drawHandles();
      return;
    }
    if (was.kind === 'press') {
      edit(was.id);
    } else if (was.kind === 'held') {
      // The branch was added when the hold ran out; the editor opens now,
      // on the lift, because a phone will only raise its keyboard for a
      // focus that comes straight from something the finger did.
      edit(was.id, true);
    } else if (was.kind === 'handle') {
      if (was.act === 'child') {
        const child = addBranch(was.id);
        if (child) edit(child.id, true);
      } else if (was.act === 'sibling') {
        const child = addSibling(was.id);
        if (child) edit(child.id, true);
      } else if (was.act === 'fold') {
        toggleFold(was.id);
      }
    } else if (was.kind === 'fold') {
      toggleFold(was.id);
    } else if (was.kind === 'drag') {
      markTarget(null);
      if (was.target) reattach(was);
      else drawHandles();
      if (was.moved) changed();
    } else if (was.kind === 'pan' && !was.moved) {
      // A tap on the paper puts the selection down; two in quick succession
      // fit the map to the screen.
      const at = local(ev);
      const now = performance.now();
      if (lastTap && now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(at.x - lastTap.x, at.y - lastTap.y) < 24) {
        lastTap = null;
        fit();
      } else {
        lastTap = { t: now, x: at.x, y: at.y };
        select(null);
      }
    }
  }
  sheet.addEventListener('pointerup', release);
  sheet.addEventListener('pointercancel', release);

  sheet.addEventListener(
    'wheel',
    (ev) => {
      if (!map) return;
      ev.preventDefault();
      const at = local(ev);
      const k = clampK(view.k * Math.exp(-ev.deltaY * 0.0015));
      view.x = at.x - ((at.x - view.x) * k) / view.k;
      view.y = at.y - ((at.y - view.y) * k) / view.k;
      view.k = k;
      place();
    },
    { passive: false }
  );

  // --- the keyboard ------------------------------------------------------------------

  sheet.addEventListener('focusin', (ev) => {
    const bubble = ev.target.closest?.('.mm-node');
    if (bubble && map && bubble.dataset.id !== selected) select(bubble.dataset.id);
  });

  // The usual keys for a mind map: Tab grows a branch, Enter a bubble beside
  // this one, F2 edits, the arrows walk. Backspace deliberately does nothing,
  // because it is pressed by accident far more often than Delete is.
  const ARROWS = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
  sheet.addEventListener('keydown', (ev) => {
    const bubble = ev.target.closest?.('.mm-node');
    if (!bubble || !map) return;
    const id = bubble.dataset.id;
    if (ARROWS[ev.key]) {
      ev.preventDefault();
      const next = nearest(map.nodes.get(id), ...ARROWS[ev.key]);
      if (next) select(next.id, { focus: true });
    } else if ((ev.key === 'Tab' && !ev.shiftKey) || ev.key === 'Insert' || ev.key === '+') {
      ev.preventDefault();
      const child = addBranch(id);
      if (child) edit(child.id, true);
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      const child = addSibling(id);
      if (child) edit(child.id, true);
    } else if (ev.key === 'F2' || ev.key === ' ') {
      ev.preventDefault();
      edit(id);
    } else if (ev.key === 'Delete') {
      ev.preventDefault();
      removeBubble(id);
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      select(null);
      $('#stage').focus({ preventScroll: true });
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (!map || editing || typing(ev.target) || $('#screen-edit').hidden) return;
    const mod = ev.ctrlKey || ev.metaKey;
    if (!mod) return;
    const key = ev.key.toLowerCase();
    if (key === 'z' && !ev.shiftKey) {
      ev.preventDefault();
      undo();
    } else if ((key === 'z' && ev.shiftKey) || key === 'y') {
      ev.preventDefault();
      redo();
    }
  });

  window.addEventListener('resize', () => {
    if (map) place();
  });

  // --- outlines ------------------------------------------------------------------

  // The map as an indented list, two spaces a level, which pastes into
  // notes, documents and back into another map.
  function outline() {
    const kids = index();
    const lines = [];
    const walk = (n, d) => {
      lines.push('  '.repeat(d) + n.text.replace(/[\n]+/g, ' '));
      for (const k of kids.get(n.id) || []) walk(k, d + 1);
    };
    walk(rootOf(), 0);
    return lines.join('\n');
  }

  function parseOutline(text) {
    const rows = [];
    for (const raw of String(text).split(/[\r]?[\n]/)) {
      if (!raw.trim()) continue;
      const lead = raw.match(/^[ \t]*/)[0].replace(/[\t]/g, '    ').length;
      const words = tidyText(raw.trim().replace(/^([-*+•]|[0-9]+[.)])[ \t]+/, '')).replace(/[\n]/g, ' ');
      if (words) rows.push({ lead, text: words });
    }
    return rows;
  }

  // Pasted lines grow from the selected bubble (or the middle), each line's
  // indent saying which line above it it hangs off.
  function pasteOutline(text) {
    const rows = parseOutline(text);
    if (!rows.length) return;
    if (map.nodes.size + rows.length > limits.nodes) {
      toast(`That would take the map past ${limits.nodes} bubbles.`);
      return;
    }
    const base = map.nodes.get(selected) || rootOf();
    if (base.folded) delete base.folded;
    const from = new Map();
    const stack = [{ lead: -1, node: base }];
    for (const row of rows) {
      while (stack.length > 1 && stack[stack.length - 1].lead >= row.lead) stack.pop();
      const parent = stack[stack.length - 1].node;
      const node = { id: newId(), parentId: parent.id, text: row.text, x: parent.x, y: parent.y };
      map.nodes.set(node.id, node);
      measure(node);
      placeChild(parent, node);
      from.set(node.id, { x: parent.x, y: parent.y });
      stack.push({ lead: row.lead, node });
    }
    startGlide(from);
    changed();
    toast(`Added ${plural(rows.length, 'bubble', 'bubbles')}.`, 'info');
  }

  document.addEventListener('paste', (ev) => {
    if (!map || editing || typing(ev.target) || $('#screen-edit').hidden) return;
    const text = ev.clipboardData?.getData('text/plain');
    if (!text) return;
    ev.preventDefault();
    pasteOutline(text);
  });

  async function copyOutline() {
    const text = outline();
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied as an outline.', 'info');
    } catch {
      toast('Your browser wouldn’t let the page copy that.');
    }
  }

  // --- taking a map away ---------------------------------------------------------

  const fileName = (ext) => {
    const base = ($('#map-title').textContent || '')
      .replace(/[^A-Za-z0-9 _-]+/g, '')
      .trim()
      .replace(/ +/g, '-')
      .slice(0, 60);
    return `${base || 'mind-map'}.${ext}`;
  };

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  // The body face, read into the file, because an SVG that is drawn onto a
  // canvas (which is how the PNG is made) cannot fetch anything at all. The
  // plain design sets the sheet in the system's own sans-serif, which every
  // machine has, so there is nothing to carry.
  const FONT_FILES = {
    latin: '/fonts/eb-garamond-400-latin.woff2',
    ext: '/fonts/eb-garamond-400-latin-ext.woff2',
  };
  const fontCache = new Map();
  function asDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  async function fontData(which) {
    if (!fontCache.has(which)) {
      fontCache.set(
        which,
        fetch(FONT_FILES[which])
          .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('font'))))
          .then(asDataUrl)
      );
    }
    return fontCache.get(which);
  }

  function beyondLatin1(text) {
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) > 255) return true;
    return false;
  }

  async function fontCss(face) {
    if (!/EB Garamond/i.test(face)) return '';
    const all = wire().map((n) => n.text).join(' ');
    const wanted = ['latin', ...(beyondLatin1(all) ? ['ext'] : [])];
    try {
      const urls = await Promise.all(wanted.map(fontData));
      return urls
        .map((u) => `@font-face { font-family: 'EB Garamond'; font-style: normal; font-weight: 400; src: url(${u}) format('woff2'); }`)
        .join('\n');
    } catch {
      return '';
    }
  }

  /** The sheet as a file of its own: the map and nothing else, on its paper. */
  async function exportSvg() {
    // Whatever is mid-glide is drawn where it is going.
    glide = null;
    draw();
    const c = palette();
    const b = bounds();
    const pad = 40;
    const box = { x: Math.floor(b.x - pad), y: Math.floor(b.y - pad), w: Math.ceil(b.w + pad * 2), h: Math.ceil(b.h + pad * 2) };
    const out = el('svg', {
      xmlns: SVG_NS,
      viewBox: `${box.x} ${box.y} ${box.w} ${box.h}`,
      width: box.w,
      height: box.h,
    });
    const css = await fontCss(c.face);
    if (css) {
      const style = el('style');
      style.textContent = css;
      out.appendChild(style);
    }
    out.appendChild($('#defs').cloneNode(true));
    out.appendChild(el('rect', { x: box.x, y: box.y, width: box.w, height: box.h, fill: c.paper }));
    const branches = $('#branches').cloneNode(true);
    const bubbles = $('#bubbles').cloneNode(true);
    for (const layer of [branches, bubbles]) {
      layer.removeAttribute('id');
      for (const ring of layer.querySelectorAll('.mm-ring, .mm-fold[display="none"]')) ring.remove();
      for (const node of layer.querySelectorAll('[tabindex], [data-id], [class]')) {
        for (const name of ['tabindex', 'role', 'aria-label', 'data-id', 'class', 'style']) node.removeAttribute(name);
      }
      out.appendChild(layer);
    }
    const title = el('title');
    title.textContent = $('#map-title').textContent;
    out.insertBefore(title, out.firstChild);
    return { text: new XMLSerializer().serializeToString(out), box };
  }

  async function downloadSvg() {
    const { text } = await exportSvg();
    download(new Blob([text], { type: 'image/svg+xml' }), fileName('svg'));
  }

  async function downloadPng() {
    const { text, box } = await exportSvg();
    const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('That map would not draw as a picture.'));
        img.src = url;
      });
      // Twice the size for a sharp picture, unless that runs past what a
      // browser will make a canvas for.
      const scale = Math.min(2, 8000 / box.w, 8000 / box.h);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(box.w * scale));
      canvas.height = Math.max(1, Math.round(box.h * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('That map would not draw as a picture.');
      download(blob, fileName('png'));
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // Printing shows the whole map, whatever part of it is on screen: the sheet
  // is pointed at the map's own bounds for as long as the print lasts.
  window.addEventListener('beforeprint', () => {
    if (!map || $('#screen-edit').hidden) return;
    glide = null;
    select(null);
    draw();
    const b = bounds();
    const pad = 24;
    sheet.setAttribute('viewBox', `${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}`);
    $('#world').removeAttribute('transform');
  });
  window.addEventListener('afterprint', () => {
    sheet.removeAttribute('viewBox');
    if (map) place();
  });

  // --- the buttons ------------------------------------------------------------------

  document.addEventListener('click', (ev) => {
    if (ev.target.closest('#who')) {
      const menu = $('#who-menu');
      menu.hidden = !menu.hidden;
      $('#who').setAttribute('aria-expanded', String(!menu.hidden));
      return;
    }
    if (!ev.target.closest('#who-menu')) $('#who-menu').hidden = true;
    const menu = $('#export-menu');
    if (menu.open && !ev.target.closest('#export-menu summary')) menu.open = false;
  });

  document.addEventListener('click', async (ev) => {
    const button = ev.target.closest('[data-act]');
    if (!button) return;
    const act = button.dataset.act;
    try {
      if (act === 'signout') {
        await fetch('/api/site/logout', { method: 'POST', credentials: 'same-origin' });
        location.href = '/';
      } else if (act === 'delete-map') {
        const m = maps.find((x) => x.id === button.dataset.id);
        if (!m || !confirm(`Delete “${m.title}”? This can’t be undone.`)) return;
        const got = await api(`maps/${encodeURIComponent(m.id)}`, { method: 'DELETE' });
        maps = got.maps;
        drawList();
      } else if (act === 'copy-map') {
        await api('maps', { method: 'POST', body: { from: button.dataset.id } });
        await loadList();
        toast('Map copied.', 'info');
      } else if (act === 'done') {
        commit();
      } else if (act === 'delete') {
        if (editing) removeBubble(editing.id);
      } else if (act === 'colour') {
        if (editing) setColour(editing.id, button.dataset.colour);
      } else if (act === 'undo') {
        undo();
      } else if (act === 'redo') {
        redo();
      } else if (act === 'fit') {
        fit();
      } else if (act === 'zoom-in') {
        zoomBy(1.25);
      } else if (act === 'zoom-out') {
        zoomBy(0.8);
      } else if (act === 'tidy') {
        tidy();
      } else if (act === 'svg') {
        await downloadSvg();
      } else if (act === 'png') {
        await downloadPng();
      } else if (act === 'outline') {
        await copyOutline();
      } else if (act === 'print') {
        window.print();
      } else if (act === 'keep-mine') {
        await keepMine();
      } else if (act === 'load-theirs') {
        await loadTheirs();
      }
    } catch (err) {
      toast(err.message);
    }
  });

  // A change of design in another tab changes the sheet's colours here too.
  window.addEventListener('storage', () => {
    colours = null;
    if (map) {
      for (const d of drawn.values()) d.key = '';
      draw();
    } else if (!$('#screen-list').hidden) {
      drawList();
    }
  });

  // --- which screen -------------------------------------------------------------------

  function show(which) {
    $('#screen-list').hidden = which !== 'list';
    $('#screen-edit').hidden = which !== 'edit';
    document.body.classList.toggle('mm-editing', which === 'edit');
  }

  async function route() {
    const id = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (map && map.id !== id) {
      if (editing) commit();
      if (map.conflict === 'clash') {
        if (!confirm('This map has changes that weren’t saved. Leave anyway?')) {
          location.hash = map.id;
          return;
        }
        unsaved.delete(map);
      }
      // Leaving a map: whatever is waiting to be saved goes now, and is
      // waited for, so the list below counts it.
      const leaving = map;
      clearTimeout(saveTimer);
      map = null;
      glide = null;
      selected = null;
      clearSheet();
      await save(leaving);
      // Another tab can have saved it in the meantime, and there is no map
      // on screen any more to offer the choice on.
      if (leaving.conflict === 'clash') {
        unsaved.delete(leaving);
        toast('That map was changed in another tab, so the last changes here weren’t saved.');
      }
    }
    if (id) {
      if (!map) await openMap(id);
      return;
    }
    document.title = 'Mind maps · Thievery';
    show('list');
    try {
      await loadList();
    } catch (err) {
      toast(err.message);
    }
  }

  window.addEventListener('hashchange', route);
  route();
  if (location.hash) loadList().catch(() => {});
})();
