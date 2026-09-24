/* Thievery.co.uk — mind maps, as you see them.
 *
 * Two screens: the list of your maps, and one map open on a sheet you can
 * pan and zoom. Everything is drawn here as SVG and everything is exported
 * from here too; the server stores the tree and checks its shape, and that
 * is all it does.
 *
 * Three things worth knowing before changing anything.
 *
 * **One press means three things.** A bubble that is pressed and let go
 * quickly is being edited; one that is pressed and held is growing a branch;
 * one that is pressed and moved is being dragged. The pointer handlers below
 * are the only place that tells them apart, and they use pointer events so a
 * finger and a mouse go down the same road.
 *
 * **Only a new branch is placed.** When a branch is added it goes wherever
 * there is room near its parent, and nothing else on the sheet moves. That
 * is what lets a bubble somebody dragged stay where they put it. Tidy is the
 * one thing that lays out the whole map, and it asks first.
 *
 * **What is drawn is what is exported.** Every colour and every face is
 * written on the elements as attributes rather than left to the stylesheet,
 * so a copy of the sheet taken out of the page still looks like the sheet.
 * The one thing that cannot travel that way is the font, which is why the
 * export fetches it and writes it into the file. */
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

  // How long a press has to last to count as a hold, and how far a pointer
  // can wander before a press is a drag instead.
  const HOLD_MS = 450;
  const SLOP = 6;
  const SAVE_AFTER_MS = 800;
  const RETRY_MS = 5000;

  // Bubble sizes. The middle is bigger and wraps wider.
  const FACE = {
    root: { size: 22, line: 28, wrap: 240, padX: 22, padY: 14 },
    node: { size: 17, line: 21, wrap: 200, padX: 16, padY: 10 },
  };
  const MIN_W = 64;

  let limits = { maps: 50, nodes: 250, text: 80 };
  let maps = [];

  // The map open, if there is one.
  let map = null; // { id, rev, nodes: Map<id, node> }
  const view = { x: 0, y: 0, k: 1 };

  // --- small things ------------------------------------------------------------

  let toastTimer = null;
  function toast(message, kind = '') {
    const el = $('#toast');
    el.textContent = message;
    el.className = 'toast' + (kind === 'info' ? ' info' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.hidden = true;
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

  // The colours the sheet is drawn in, read off the stylesheet's tokens each
  // time it is drawn, so the plain design and the Vault each get their own.
  function palette() {
    const css = getComputedStyle(document.documentElement);
    const get = (name) => css.getPropertyValue(name).trim();
    return {
      paper: get('--mm-paper'),
      rootFill: get('--mm-root'),
      rootInk: get('--mm-root-ink'),
      fill: get('--mm-bubble'),
      ink: get('--mm-ink'),
      branches: [0, 1, 2, 3, 4, 5].map((i) => get(`--mm-c${i}`)),
      face: getComputedStyle($('#sheet')).fontFamily,
    };
  }

  // --- the list of maps --------------------------------------------------------

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

  function drawList() {
    $('#map-count').textContent = maps.length ? `${maps.length} of ${limits.maps}` : '';
    $('#map-none').hidden = maps.length > 0;
    $('#map-list').innerHTML = maps
      .map(
        (m) => `<li class="mm-item">
          <a class="mm-item-name" href="#${esc(m.id)}">${esc(m.title)}</a>
          <span class="mm-item-meta">${plural(m.count, 'bubble', 'bubbles')} &middot; ${esc(when(m.updated))}</span>
          <button class="btn small ghost" type="button" data-act="delete-map" data-id="${esc(m.id)}">Delete</button>
        </li>`
      )
      .join('');
  }

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
    limits = got.limits || limits;
    map = { id: got.map.id, rev: got.map.rev, nodes: new Map() };
    for (const n of got.map.nodes) map.nodes.set(n.id, { ...n });
    conflict = false;
    dirty = false;
    setState('Saved');
    show('edit');
    // Measured in the wrong face, every bubble is the wrong size, so the
    // face is waited for first (and again, below, if it arrives late).
    await document.fonts.ready.catch(() => {});
    remeasure();
    fit();
  }

  function remeasure() {
    if (!map) return;
    for (const n of map.nodes.values()) measure(n);
    draw();
  }
  document.fonts?.addEventListener?.('loadingdone', remeasure);

  const rootOf = () => [...map.nodes.values()].find((n) => n.parentId === null);
  const childrenOf = (id) => [...map.nodes.values()].filter((n) => n.parentId === id);

  function subtree(id) {
    const out = [];
    const queue = [id];
    while (queue.length) {
      const at = queue.shift();
      out.push(at);
      for (const c of childrenOf(at)) queue.push(c.id);
    }
    return out;
  }

  function depthOf(node) {
    let d = 0;
    for (let at = node; at.parentId !== null; at = map.nodes.get(at.parentId)) d++;
    return d;
  }

  // Which of the middle's branches a bubble hangs off, for its colour.
  function branchIndex(node) {
    let at = node;
    while (at.parentId !== null && map.nodes.get(at.parentId).parentId !== null) at = map.nodes.get(at.parentId);
    if (at.parentId === null) return -1;
    const firsts = childrenOf(at.parentId);
    return firsts.indexOf(at);
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
    const face = node.parentId === null ? FACE.root : FACE.node;
    const lines = wrap(node.text, face);
    const widest = Math.max(0, ...lines.map((l) => width(l, face)));
    node._lines = lines;
    node._w = Math.max(MIN_W, Math.ceil(widest) + face.padX * 2);
    node._h = Math.max(1, lines.length) * face.line + face.padY * 2;
  }

  // --- drawing -------------------------------------------------------------------

  function draw() {
    const colours = palette();
    const branches = $('#branches');
    const bubbles = $('#bubbles');
    // Read before the bubbles are thrown away and drawn again, or the focus
    // goes with them.
    const focused = document.activeElement?.closest?.('.mm-node')?.dataset.id;
    branches.textContent = '';
    bubbles.textContent = '';
    const nodes = [...map.nodes.values()];

    for (const n of nodes) {
      if (n.parentId === null) continue;
      const p = map.nodes.get(n.parentId);
      const colour = colours.branches[branchIndex(n) % colours.branches.length];
      const mid = (p.x + n.x) / 2;
      const d = `M${p.x} ${p.y} C${mid} ${p.y} ${mid} ${n.y} ${n.x} ${n.y}`;
      branches.appendChild(
        el('path', {
          d,
          fill: 'none',
          stroke: colour,
          'stroke-width': p.parentId === null ? 4 : 2.5,
          'stroke-linecap': 'round',
          class: 'mm-branch',
        })
      );
    }

    for (const n of nodes) {
      const isRoot = n.parentId === null;
      const face = isRoot ? FACE.root : FACE.node;
      const colour = isRoot ? colours.rootFill : colours.branches[branchIndex(n) % colours.branches.length];
      const g = el('g', {
        class: 'mm-node' + (isRoot ? ' is-root' : ''),
        'data-id': n.id,
        tabindex: 0,
        role: 'button',
        'aria-label': n.text || 'Empty bubble',
        transform: `translate(${n.x} ${n.y})`,
      });
      const w = n._w;
      const h = n._h;
      const r = Math.min(h / 2, 22);
      g.appendChild(
        el('rect', {
          class: 'mm-ring',
          x: -w / 2 - 5,
          y: -h / 2 - 5,
          width: w + 10,
          height: h + 10,
          rx: r + 5,
          fill: 'none',
          stroke: colour,
          'stroke-width': 3,
          pathLength: 100,
        })
      );
      g.appendChild(
        el('rect', {
          class: 'mm-bubble',
          x: -w / 2,
          y: -h / 2,
          width: w,
          height: h,
          rx: r,
          fill: isRoot ? colours.rootFill : colours.fill,
          stroke: colour,
          'stroke-width': isRoot ? 0 : 2,
        })
      );
      const text = el('text', {
        'text-anchor': 'middle',
        'font-size': face.size,
        'font-family': colours.face,
        fill: isRoot ? colours.rootInk : colours.ink,
      });
      const lines = n._lines.length ? n._lines : [''];
      // The first baseline sits so the block of lines is centred on the
      // bubble; 0.35em is about where a lower-case x has its middle.
      const top = -((lines.length - 1) * face.line) / 2;
      lines.forEach((line, i) => {
        const span = el('tspan', { x: 0, y: top + i * face.line, dy: '0.35em' });
        span.textContent = line;
        text.appendChild(span);
      });
      g.appendChild(text);
      bubbles.appendChild(g);
    }

    place();
    $('#map-title').textContent = (rootOf()?.text || '').replace(/[\n]/g, ' ');
    document.title = `${$('#map-title').textContent || 'Mind map'} · Mind maps · Thievery`;
    if (focused) bubbles.querySelector(`[data-id="${focused}"]`)?.focus({ preventScroll: true });
  }

  // Only the pan and zoom, for when nothing on the sheet itself has changed.
  function place() {
    $('#world').setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
    if (editing) placeEditor();
  }

  function bounds(nodes = [...map.nodes.values()]) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of nodes) {
      x0 = Math.min(x0, n.x - n._w / 2);
      y0 = Math.min(y0, n.y - n._h / 2);
      x1 = Math.max(x1, n.x + n._w / 2);
      y1 = Math.max(y1, n.y + n._h / 2);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function fit() {
    const stage = $('#stage').getBoundingClientRect();
    const b = bounds();
    const pad = 48;
    const k = Math.min(1.25, (stage.width - pad * 2) / b.w, (stage.height - pad * 2) / b.h);
    view.k = Math.max(0.15, k);
    view.x = stage.width / 2 - (b.x + b.w / 2) * view.k;
    view.y = stage.height / 2 - (b.y + b.h / 2) * view.k;
    place();
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
    // Placed at the size of a short phrase rather than of an empty bubble,
    // so that typing into it does not immediately push it into a neighbour.
    const child = { id: newId(), parentId, text: '', x: parent.x, y: parent.y, _lines: [], _w: 130, _h: 41 };
    placeChild(parent, child);
    map.nodes.set(child.id, child);
    measure(child);
    draw();
    return child;
  }

  // Every bubble in rings round the middle: each branch of the middle gets a
  // slice of the circle in proportion to how much hangs off it, and each ring
  // is further out than the one inside it.
  function tidy() {
    const root = rootOf();
    const leaves = new Map();
    const count = (id) => {
      const kids = childrenOf(id);
      const n = kids.length ? kids.reduce((s, k) => s + count(k.id), 0) : 1;
      leaves.set(id, n);
      return n;
    };
    const total = count(root.id);
    let deepest = 0;
    for (const n of map.nodes.values()) deepest = Math.max(deepest, depthOf(n));
    if (!deepest) return;
    const widest = Math.max(...[...map.nodes.values()].filter((n) => n !== root).map((n) => n._w));
    // Rings are spaced for an ordinary bubble; only the first has to clear
    // the middle, which is the widest thing on the sheet.
    const step = Math.max(190, (total * 62) / (2 * Math.PI * deepest));
    const first = Math.max(step, root._w / 2 + widest / 2 + 40);
    const ring = (d) => first + (d - 1) * step;

    root.x = 0;
    root.y = 0;
    const lay = (id, from, to, d) => {
      let at = from;
      for (const kid of childrenOf(id)) {
        const share = ((to - from) * leaves.get(kid.id)) / leaves.get(id);
        const mid = at + share / 2;
        kid.x = Math.round(Math.cos(mid) * ring(d));
        kid.y = Math.round(Math.sin(mid) * ring(d));
        lay(kid.id, at, at + share, d + 1);
        at += share;
      }
    };
    lay(root.id, -Math.PI / 2, (Math.PI * 3) / 2, 1);
    draw();
    fit();
    changed();
  }

  // --- editing a bubble ----------------------------------------------------------

  let editing = null; // { id, fresh, before }

  function placeEditor() {
    const n = map.nodes.get(editing.id);
    const box = $('#editor');
    const w = Math.max(220, n._w * view.k + 20);
    box.style.width = `${w}px`;
    box.style.left = `${view.x + n.x * view.k - w / 2}px`;
    box.style.top = `${view.y + n.y * view.k - 30}px`;
  }

  function edit(id, fresh = false) {
    if (editing) commit();
    const n = map.nodes.get(id);
    if (!n) return;
    editing = { id, fresh, before: n.text };
    const area = $('#editor-text');
    area.value = n.text;
    area.maxLength = limits.text;
    $('#editor-delete').hidden = n.parentId === null;
    $('#editor').hidden = false;
    placeEditor();
    area.focus();
    area.select();
  }

  function closeEditor() {
    const id = editing?.id;
    editing = null;
    $('#editor').hidden = true;
    if (id) $('#bubbles').querySelector(`[data-id="${id}"]`)?.focus({ preventScroll: true });
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
    const fresh = editing.fresh;
    if (!n) return closeEditor();
    if (!text) {
      if (n.parentId === null) {
        toast('The bubble in the middle needs some words.');
        closeEditor();
        return;
      }
      if (childrenOf(n.id).length) {
        toast('Use Delete to remove a bubble that has branches.');
        closeEditor();
        return;
      }
      map.nodes.delete(n.id);
      closeEditor();
      draw();
      if (!fresh) changed();
      return;
    }
    const was = n.text;
    n.text = text;
    measure(n);
    closeEditor();
    draw();
    if (text !== was || fresh) changed();
  }

  function cancel() {
    if (!editing) return;
    const n = map.nodes.get(editing.id);
    if (editing.fresh && n) {
      map.nodes.delete(n.id);
      closeEditor();
      draw();
      return;
    }
    closeEditor();
  }

  function removeBubble(id) {
    const n = map.nodes.get(id);
    if (!n || n.parentId === null) return;
    const going = subtree(id);
    if (going.length > 1 && !confirm(`Delete this bubble and the ${plural(going.length - 1, 'bubble', 'bubbles')} branching off it?`)) return;
    const parentId = n.parentId;
    for (const g of going) map.nodes.delete(g);
    if (editing) {
      editing = null;
      $('#editor').hidden = true;
    }
    draw();
    $('#bubbles').querySelector(`[data-id="${parentId}"]`)?.focus({ preventScroll: true });
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
  // A click on Done or Delete must not blur the text first, or the blur
  // would commit and close the editor before the button heard anything.
  $('#editor').addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('button')) ev.preventDefault();
  });
  $('#editor-text').addEventListener('blur', () => {
    if (editing) commit();
  });

  // --- saving --------------------------------------------------------------------

  let dirty = false;
  let saving = false;
  let conflict = false;
  let saveTimer = null;

  function setState(text) {
    $('#save-state').textContent = text;
  }

  function changed() {
    if (conflict) return;
    dirty = true;
    setState('Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, SAVE_AFTER_MS);
  }

  function wire() {
    return [...map.nodes.values()].map((n) => ({ id: n.id, parentId: n.parentId, text: n.text, x: n.x, y: n.y }));
  }

  async function save() {
    if (!map || conflict || !dirty) return;
    if (saving) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, SAVE_AFTER_MS);
      return;
    }
    saving = true;
    dirty = false;
    const sending = map;
    try {
      const got = await api(`maps/${encodeURIComponent(sending.id)}`, {
        method: 'POST',
        body: { nodes: wire(), rev: sending.rev },
      });
      sending.rev = got.rev;
      if (map === sending && !dirty) setState('Saved');
    } catch (err) {
      if (err.status === 409) {
        conflict = true;
        setState('Not saved');
        toast(err.message);
      } else if (err.status === 400 || err.status === 404) {
        // Something the server will refuse however often it is asked.
        conflict = true;
        setState('Not saved');
        toast(err.message);
      } else {
        dirty = true;
        setState('Not saved yet. Trying again…');
        clearTimeout(saveTimer);
        saveTimer = setTimeout(save, RETRY_MS);
      }
    } finally {
      saving = false;
    }
  }

  window.addEventListener('beforeunload', (ev) => {
    if (map && (dirty || saving) && !conflict) {
      ev.preventDefault();
      ev.returnValue = '';
    }
  });

  // --- the pointer ------------------------------------------------------------------

  const sheet = $('#sheet');
  const pointers = new Map();
  let gesture = null;

  function local(ev) {
    const r = sheet.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function stopHold(g = gesture) {
    if (g?.timer) clearTimeout(g.timer);
    sheet.querySelector('.mm-node.is-holding')?.classList.remove('is-holding');
  }

  sheet.addEventListener('contextmenu', (ev) => ev.preventDefault());

  sheet.addEventListener('pointerdown', (ev) => {
    if (!map || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
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

    const bubble = ev.target.closest('.mm-node');
    if (bubble) {
      const id = bubble.dataset.id;
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
      gesture = { kind: 'pan', start: at, view: { ...view } };
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
      // Dragging a bubble takes its branches with it.
      const moving = subtree(gesture.id).map((id) => map.nodes.get(id));
      gesture = {
        kind: 'drag',
        start: gesture.start,
        moving: moving.map((n) => ({ n, x: n.x, y: n.y })),
        moved: false,
      };
    }
    if (gesture.kind === 'drag') {
      const dx = (at.x - gesture.start.x) / view.k;
      const dy = (at.y - gesture.start.y) / view.k;
      for (const m of gesture.moving) {
        m.n.x = Math.round(m.x + dx);
        m.n.y = Math.round(m.y + dy);
      }
      gesture.moved = true;
      draw();
      return;
    }
    if (gesture.kind === 'pan') {
      view.x = gesture.view.x + (at.x - gesture.start.x);
      view.y = gesture.view.y + (at.y - gesture.start.y);
      place();
    }
  });

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
    if (ev.type === 'pointercancel') return;
    if (was.kind === 'press') {
      edit(was.id);
    } else if (was.kind === 'held') {
      // The branch was added when the hold ran out; the editor opens now,
      // on the lift, because a phone will only raise its keyboard for a
      // focus that comes straight from something the finger did.
      edit(was.id, true);
    } else if (was.kind === 'drag' && was.moved) {
      changed();
    }
  }
  sheet.addEventListener('pointerup', release);
  sheet.addEventListener('pointercancel', release);

  const clampK = (k) => Math.min(3, Math.max(0.15, k));

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

  // The keyboard: Enter edits, Insert (or +) adds a branch, Delete removes.
  sheet.addEventListener('keydown', (ev) => {
    const bubble = ev.target.closest?.('.mm-node');
    if (!bubble || !map) return;
    const id = bubble.dataset.id;
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      edit(id);
    } else if (ev.key === 'Insert' || ev.key === '+') {
      ev.preventDefault();
      const child = addBranch(id);
      if (child) edit(child.id, true);
    } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault();
      removeBubble(id);
    }
  });

  window.addEventListener('resize', () => {
    if (map) place();
  });

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
    const colours = palette();
    const b = bounds();
    const pad = 40;
    const box = { x: Math.floor(b.x - pad), y: Math.floor(b.y - pad), w: Math.ceil(b.w + pad * 2), h: Math.ceil(b.h + pad * 2) };
    const out = el('svg', {
      xmlns: SVG_NS,
      viewBox: `${box.x} ${box.y} ${box.w} ${box.h}`,
      width: box.w,
      height: box.h,
    });
    const css = await fontCss(colours.face);
    if (css) {
      const style = el('style');
      style.textContent = css;
      out.appendChild(style);
    }
    out.appendChild(el('rect', { x: box.x, y: box.y, width: box.w, height: box.h, fill: colours.paper }));
    const branches = $('#branches').cloneNode(true);
    const bubbles = $('#bubbles').cloneNode(true);
    for (const layer of [branches, bubbles]) {
      layer.removeAttribute('id');
      for (const ring of layer.querySelectorAll('.mm-ring')) ring.remove();
      for (const node of layer.querySelectorAll('[tabindex]')) {
        node.removeAttribute('tabindex');
        node.removeAttribute('role');
        node.removeAttribute('aria-label');
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
      } else if (act === 'done') {
        commit();
      } else if (act === 'delete') {
        if (editing) removeBubble(editing.id);
      } else if (act === 'fit') {
        fit();
      } else if (act === 'tidy') {
        if (confirm('Tidy the map? Every bubble is put back in rings round the middle, including ones you moved.')) tidy();
      } else if (act === 'svg') {
        await downloadSvg();
      } else if (act === 'png') {
        await downloadPng();
      } else if (act === 'print') {
        window.print();
      }
    } catch (err) {
      toast(err.message);
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
      // Leaving a map: whatever is waiting to be saved goes now.
      if (editing) commit();
      clearTimeout(saveTimer);
      await save();
      map = null;
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
