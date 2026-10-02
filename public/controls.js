/* Thievery.co.uk — the controls' behaviour.
 *
 * Loaded with defer from the shared head, after shell.js. Each piece is
 * asked for by an attribute in the markup, and each builds itself on top of
 * an ordinary control that the room's own script goes on reading and setting
 * exactly as it did before, so no room has to know any of this is here:
 *
 *   <select data-segmented>          a segmented control drawn beside the
 *                                    select, which is hidden and stays the
 *                                    real thing: picking an option sets its
 *                                    value and fires 'change' on it.
 *   <input type="number" data-stepper>
 *                                    a minus and a plus beside the number;
 *                                    each press fires 'input' and 'change'.
 *   <input type="search" data-cancel>
 *                                    on a phone, a Cancel that slides in
 *                                    while the field has focus.
 *   <h1 data-large-title>            on a phone, the title moves into the
 *                                    bar once the page has scrolled it away.
 *   data-actions="<selector>"        a long press, or a right click, opens a
 *                                    menu of the buttons inside the element
 *                                    that match the selector. Choosing one
 *                                    clicks the button itself. A button
 *                                    marked .danger or data-menu-danger is
 *                                    drawn in red.
 *   data-swipe="<selector>"          on a touch screen the element can be
 *                                    slid left to uncover the same buttons.
 *
 * A room that redraws its markup gets each piece again for free: anything
 * new on the page is looked at as it arrives.
 */

(function () {
  var haptic = function () {
    if (navigator.vibrate && window.thieveryPref && window.thieveryPref('haptics')) navigator.vibrate(6);
  };

  // A room sets a select's value, or a field's, from a push, and setting a
  // value fires no event. So each one we draw over gets a value of its own
  // that does what the browser's does and then tells us.
  function watchValue(el, then) {
    var proto = Object.getPrototypeOf(el);
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    while (!desc && proto) { proto = Object.getPrototypeOf(proto); desc = proto && Object.getOwnPropertyDescriptor(proto, 'value'); }
    if (!desc) return;
    Object.defineProperty(el, 'value', {
      configurable: true,
      get: function () { return desc.get.call(el); },
      set: function (v) { desc.set.call(el, v); then(); },
    });
  }

  function labelFor(el) {
    if (!el.id) return null;
    var label = document.querySelector('label[for="' + el.id + '"]');
    if (label && !label.id) label.id = el.id + '-label';
    return label;
  }

  // --- the segmented control --------------------------------------------------

  function segmented(select) {
    if (select.dataset.segmentedBuilt) return;
    select.dataset.segmentedBuilt = '1';
    var box = document.createElement('div');
    box.className = 'segmented';
    box.setAttribute('role', 'radiogroup');
    var label = labelFor(select);
    if (label) box.setAttribute('aria-labelledby', label.id);
    var tile = document.createElement('span');
    tile.className = 'segmented-tile';
    tile.setAttribute('aria-hidden', 'true');
    select.insertAdjacentElement('afterend', box);
    select.hidden = true;
    // A label for a hidden select does nothing when pressed, so it is taken
    // to mean the group, and a press on it moves focus there.
    if (label) label.addEventListener('click', function (ev) {
      ev.preventDefault();
      var on = box.querySelector('[aria-checked="true"]') || box.querySelector('button');
      if (on) on.focus();
    });

    var placed = false;
    function place() {
      var on = box.querySelector('[aria-checked="true"]');
      if (!on || !box.offsetWidth) { tile.style.width = on ? tile.style.width : '0'; return; }
      if (!placed) box.classList.add('is-settling');
      tile.style.width = on.offsetWidth + 'px';
      tile.style.transform = 'translateX(' + on.offsetLeft + 'px)';
      if (!placed) { box.getBoundingClientRect(); box.classList.remove('is-settling'); placed = true; }
    }

    function sync() {
      var opts = Array.prototype.slice.call(select.options);
      var buttons = box.querySelectorAll('button');
      var same = buttons.length === opts.length && opts.every(function (o, i) {
        return buttons[i].dataset.value === o.value && buttons[i].textContent === o.textContent;
      });
      if (!same) {
        box.textContent = '';
        box.appendChild(tile);
        opts.forEach(function (o) {
          var b = document.createElement('button');
          b.type = 'button';
          b.setAttribute('role', 'radio');
          b.dataset.value = o.value;
          b.textContent = o.textContent;
          box.appendChild(b);
        });
        buttons = box.querySelectorAll('button');
      }
      var value = select.value;
      Array.prototype.forEach.call(buttons, function (b, i) {
        var on = b.dataset.value === value;
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;
        b.disabled = select.disabled || opts[i].disabled;
      });
      box.classList.toggle('is-disabled', select.disabled);
      place();
    }

    function choose(b) {
      if (!b || b.disabled || b.dataset.value === select.value) return;
      select.value = b.dataset.value;
      haptic();
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    box.addEventListener('click', function (ev) {
      choose(ev.target.closest('button'));
    });
    // The arrow keys move along the group and choose as they go, as they do
    // in a row of radio buttons.
    box.addEventListener('keydown', function (ev) {
      var keys = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
      if (!(ev.key in keys) && ev.key !== 'Home' && ev.key !== 'End') return;
      var list = Array.prototype.filter.call(box.querySelectorAll('button'), function (b) { return !b.disabled; });
      if (!list.length) return;
      ev.preventDefault();
      var at = list.indexOf(document.activeElement);
      var next = ev.key === 'Home' ? 0 : ev.key === 'End' ? list.length - 1
        : (at + keys[ev.key] + list.length) % list.length;
      list[next].focus();
      choose(list[next]);
    });

    watchValue(select, sync);
    select.addEventListener('change', sync);
    new MutationObserver(sync).observe(select, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled'] });
    if (window.ResizeObserver) new ResizeObserver(place).observe(box);
    sync();
  }

  // --- the stepper --------------------------------------------------------------

  var MINUS = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14"/></svg>';
  var PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M12 5v14"/></svg>';

  function stepper(input) {
    if (input.dataset.stepperBuilt) return;
    input.dataset.stepperBuilt = '1';
    var wrap = document.createElement('span');
    wrap.className = 'stepper';
    input.insertAdjacentElement('beforebegin', wrap);
    wrap.appendChild(input);
    var keys = document.createElement('span');
    keys.className = 'stepper-keys';
    var label = labelFor(input);
    var named = label ? label.textContent.trim() : 'the number';
    var down = document.createElement('button');
    down.type = 'button';
    down.innerHTML = MINUS;
    down.setAttribute('aria-label', 'Decrease: ' + named);
    var up = document.createElement('button');
    up.type = 'button';
    up.innerHTML = PLUS;
    up.setAttribute('aria-label', 'Increase: ' + named);
    if (input.id) { down.setAttribute('aria-controls', input.id); up.setAttribute('aria-controls', input.id); }
    keys.appendChild(down);
    keys.appendChild(up);
    wrap.appendChild(keys);

    function bounds() {
      var lo = input.min === '' ? -Infinity : Number(input.min);
      var hi = input.max === '' ? Infinity : Number(input.max);
      return { lo: lo, hi: hi };
    }
    function sync() {
      var b = bounds();
      var v = Number(input.value);
      down.disabled = input.disabled || (Number.isFinite(v) && v <= b.lo);
      up.disabled = input.disabled || (Number.isFinite(v) && v >= b.hi);
    }
    function step(by) {
      var b = bounds();
      var v = Number(input.value);
      if (!Number.isFinite(v)) v = Number.isFinite(b.lo) ? b.lo : 0;
      var next = Math.min(b.hi, Math.max(b.lo, v + by));
      if (next === v && input.value !== '') return;
      input.value = String(next);
      haptic();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    down.addEventListener('click', function () { step(-1); });
    up.addEventListener('click', function () { step(1); });
    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
    watchValue(input, sync);
    new MutationObserver(sync).observe(input, { attributes: true, attributeFilter: ['disabled', 'min', 'max'] });
    sync();
  }

  // --- search with Cancel ----------------------------------------------------------

  function searchCancel(input) {
    if (input.dataset.cancelBuilt) return;
    input.dataset.cancelBuilt = '1';
    var wrap = document.createElement('span');
    wrap.className = 'search-wrap';
    input.insertAdjacentElement('beforebegin', wrap);
    wrap.appendChild(input);
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'search-cancel';
    cancel.textContent = 'Cancel';
    // Only there for a finger on a phone; a keyboard has Escape, and the
    // button is out of the tab order rather than a stop that does nothing
    // on a wide screen.
    cancel.tabIndex = -1;
    wrap.appendChild(cancel);
    input.addEventListener('focus', function () { wrap.classList.add('is-active'); });
    input.addEventListener('blur', function () { wrap.classList.remove('is-active'); });
    // Pressing Cancel would take the focus away from the field before the
    // press landed, and the button would fold up under the finger.
    cancel.addEventListener('pointerdown', function (ev) { ev.preventDefault(); });
    cancel.addEventListener('click', function () {
      if (input.value) {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      input.blur();
    });
  }

  // --- the title in the bar -----------------------------------------------------------

  var bar = document.querySelector('.site-bar');
  function largeTitle(h1) {
    if (!bar || h1.dataset.largeTitleBuilt || !window.IntersectionObserver) return;
    h1.dataset.largeTitleBuilt = '1';
    var small = document.createElement('span');
    small.className = 'site-bar-title';
    small.setAttribute('aria-hidden', 'true');
    bar.appendChild(small);
    var barH = function () { return bar.getBoundingClientRect().height || 60; };
    var io = new IntersectionObserver(function (entries) {
      var e = entries[entries.length - 1];
      // A title on a screen that is hidden has no size, and is not gone.
      var gone = !e.isIntersecting && e.boundingClientRect.height > 0 && e.boundingClientRect.top < barH();
      // Read when it is needed: some titles are filled in after the page loads.
      if (gone) small.textContent = h1.dataset.largeTitle || h1.textContent.trim();
      bar.classList.toggle('has-title', gone);
    }, { rootMargin: '-' + Math.round(barH()) + 'px 0px 0px 0px' });
    io.observe(h1);
  }

  // --- the context menu ---------------------------------------------------------------

  var open = null; // { menu, veil, from, back }

  function actionsOf(el) {
    var sel = el.getAttribute('data-actions');
    if (!sel) return [];
    return Array.prototype.filter.call(el.querySelectorAll(sel), function (b) {
      return (b.tagName === 'BUTTON' || b.tagName === 'A') && !b.disabled && !b.hidden;
    });
  }
  function nameOf(b) {
    return b.getAttribute('data-menu-label') || b.getAttribute('aria-label') || b.textContent.replace(/\s+/g, ' ').trim();
  }
  function isDanger(b) {
    return b.classList.contains('danger') || b.hasAttribute('data-menu-danger');
  }

  function closeMenu(refocus) {
    if (!open) return;
    var o = open;
    open = null;
    o.menu.remove();
    o.veil.remove();
    o.from.classList.remove('ctx-lifted');
    if (refocus && o.back && document.contains(o.back)) o.back.focus();
  }

  function openMenu(el, x, y, byKey) {
    var actions = actionsOf(el);
    if (!actions.length) return false;
    closeMenu(false);
    var veil = document.createElement('div');
    veil.className = 'ctx-veil';
    var menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.setAttribute('role', 'menu');
    menu.tabIndex = -1;
    actions.forEach(function (b) {
      var item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'menuitem');
      item.tabIndex = -1;
      item.textContent = nameOf(b);
      if (isDanger(b)) item.className = 'is-danger';
      item.addEventListener('click', function () {
        closeMenu(false);
        b.click();
      });
      menu.appendChild(item);
    });
    document.body.appendChild(veil);
    document.body.appendChild(menu);
    el.classList.add('ctx-lifted');
    veil.addEventListener('pointerdown', function (ev) { ev.preventDefault(); closeMenu(true); });
    veil.addEventListener('contextmenu', function (ev) { ev.preventDefault(); closeMenu(true); });

    // Beside the press, kept on the screen, and growing out of the corner
    // nearest it.
    var r = menu.getBoundingClientRect();
    var pad = 12;
    var left = Math.min(Math.max(pad, x), window.innerWidth - r.width - pad);
    var top = y + r.height + pad > window.innerHeight ? Math.max(pad, y - r.height) : y;
    top = Math.min(top, window.innerHeight - r.height - pad);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.setProperty('--ctx-origin', (top < y ? 'bottom ' : 'top ') + (left < x - r.width / 2 ? 'right' : 'left'));

    open = { menu: menu, veil: veil, from: el, back: document.activeElement };
    // Opened from the keyboard, focus goes to the first item; opened by a
    // press, to the menu itself, so no ring is drawn until a key is used.
    (byKey ? menu.firstChild : menu).focus({ preventScroll: true });
    haptic();
    return true;
  }

  document.addEventListener('keydown', function (ev) {
    if (!open) return;
    var items = Array.prototype.slice.call(open.menu.children);
    var at = items.indexOf(document.activeElement);
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeMenu(true); }
    else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      items[at < 0 ? (ev.key === 'ArrowDown' ? 0 : items.length - 1) : (at + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    } else if (ev.key === 'Home' || ev.key === 'End') {
      ev.preventDefault();
      items[ev.key === 'Home' ? 0 : items.length - 1].focus();
    } else if (ev.key === 'Tab') { ev.preventDefault(); closeMenu(true); }
  }, true);
  window.addEventListener('resize', function () { closeMenu(false); });
  window.addEventListener('scroll', function () { closeMenu(false); }, { passive: true });

  // A right click, or the keyboard's menu key, or (on Android) a long press.
  document.addEventListener('contextmenu', function (ev) {
    var el = ev.target.closest && ev.target.closest('[data-actions]');
    if (!el || ev.target.closest('input, textarea, select, [contenteditable]')) return;
    if (open && open.from === el) { ev.preventDefault(); return; }
    var x = ev.clientX, y = ev.clientY;
    var byKey = !x && !y;
    if (byKey) { var r = el.getBoundingClientRect(); x = r.left + 16; y = r.top + 16; }
    if (openMenu(el, x, y, byKey)) { ev.preventDefault(); press = null; }
  });

  // A long press with a finger, for the browsers that do not turn one into
  // a contextmenu event (Safari on an iPhone). The thing pressed sinks a
  // little while the finger is held, and the click that follows letting go
  // is not also a tap on it.
  var press = null;
  var suppressUntil = 0;
  document.addEventListener('pointerdown', function (ev) {
    if (ev.pointerType !== 'touch') return;
    var el = ev.target.closest && ev.target.closest('[data-actions]');
    if (!el || ev.target.closest('input, textarea, select, [contenteditable]')) return;
    var x = ev.clientX, y = ev.clientY;
    press = { el: el, x: x, y: y, timer: setTimeout(function () {
      if (!press) return;
      el.classList.remove('ctx-pressing');
      if (openMenu(el, x, y)) suppressUntil = Date.now() + 800;
      press = null;
    }, 500) };
    el.classList.add('ctx-pressing');
  }, { passive: true });
  function cancelPress() {
    if (!press) return;
    clearTimeout(press.timer);
    press.el.classList.remove('ctx-pressing');
    press = null;
  }
  document.addEventListener('pointermove', function (ev) {
    if (press && Math.abs(ev.clientX - press.x) + Math.abs(ev.clientY - press.y) > 10) cancelPress();
  }, { passive: true });
  document.addEventListener('pointerup', cancelPress);
  document.addEventListener('pointercancel', cancelPress);
  document.addEventListener('click', function (ev) {
    if (Date.now() < suppressUntil && !(open && open.menu.contains(ev.target))) {
      ev.preventDefault();
      ev.stopPropagation();
      suppressUntil = 0;
    }
  }, true);

  // --- swipe actions ----------------------------------------------------------------------

  var swiped = null; // the row left open
  var swipe = null;  // the row being slid

  function trayFor(row) {
    var tray = row.querySelector(':scope > .swipe-tray');
    if (tray) return tray;
    tray = document.createElement('div');
    tray.className = 'swipe-tray';
    tray.setAttribute('aria-hidden', 'true');
    var sel = row.getAttribute('data-swipe');
    Array.prototype.forEach.call(row.querySelectorAll(sel), function (b) {
      if ((b.tagName !== 'BUTTON' && b.tagName !== 'A') || b.disabled || b.hidden) return;
      var t = document.createElement('button');
      t.type = 'button';
      t.tabIndex = -1;
      t.textContent = nameOf(b);
      if (isDanger(b)) t.className = 'is-danger';
      t.addEventListener('click', function (ev) {
        ev.stopPropagation();
        shut(row);
        b.click();
      });
      tray.appendChild(t);
    });
    if (row.parentNode) row.parentNode.classList.add('swipe-track');
    row.appendChild(tray);
    return tray;
  }
  function settle(row, x) {
    row.classList.add('is-settling');
    row.style.transform = x ? 'translateX(' + x + 'px)' : '';
    var done = function () { row.classList.remove('is-settling'); row.removeEventListener('transitionend', done); };
    row.addEventListener('transitionend', done);
    setTimeout(done, 400);
  }
  function shut(row) {
    settle(row, 0);
    row.classList.remove('is-swiped');
    if (swiped === row) swiped = null;
  }

  document.addEventListener('pointerdown', function (ev) {
    if (swiped && !swiped.contains(ev.target)) shut(swiped);
    if (ev.pointerType !== 'touch') return;
    var row = ev.target.closest && ev.target.closest('[data-swipe]');
    if (!row || ev.target.closest('input, textarea, select, .swipe-tray')) return;
    swipe = { row: row, id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, from: row === swiped ? -trayFor(row).offsetWidth : 0, dx: 0, on: false };
  }, { passive: true });
  document.addEventListener('pointermove', function (ev) {
    if (!swipe || ev.pointerId !== swipe.id) return;
    var dx = ev.clientX - swipe.x0;
    var dy = ev.clientY - swipe.y0;
    if (!swipe.on) {
      if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) { swipe = null; return; }
      if (Math.abs(dx) < 8) return;
      swipe.on = true;
      swipe.width = trayFor(swipe.row).offsetWidth;
      swipe.row.classList.add('is-swiping');
      cancelPress();
    }
    // Past the buttons it drags with a resistance, as a list does at its end.
    var x = swipe.from + dx;
    if (x > 0) x = x / 4;
    if (x < -swipe.width) x = -swipe.width + (x + swipe.width) / 3;
    swipe.dx = x;
    swipe.row.style.transform = 'translateX(' + x + 'px)';
  }, { passive: true });
  function endSwipe(ev) {
    if (!swipe || ev.pointerId !== swipe.id) return;
    var s = swipe;
    swipe = null;
    if (!s.on) return;
    s.row.classList.remove('is-swiping');
    suppressUntil = Date.now() + 400;
    if (s.dx < -s.width / 2) {
      settle(s.row, -s.width);
      s.row.classList.add('is-swiped');
      if (swiped && swiped !== s.row) shut(swiped);
      swiped = s.row;
      haptic();
    } else {
      shut(s.row);
    }
  }
  document.addEventListener('pointerup', endSwipe);
  document.addEventListener('pointercancel', endSwipe);

  // --- building what is on the page, and what arrives later ----------------------------------

  function build(root) {
    if (!root.querySelectorAll) return;
    var each = function (sel, fn) {
      if (root.matches && root.matches(sel)) fn(root);
      Array.prototype.forEach.call(root.querySelectorAll(sel), fn);
    };
    each('select[data-segmented]', segmented);
    each('input[type="number"][data-stepper]', stepper);
    each('input[type="search"][data-cancel]', searchCancel);
    each('h1[data-large-title]', largeTitle);
  }
  build(document);
  new MutationObserver(function (records) {
    records.forEach(function (r) {
      Array.prototype.forEach.call(r.addedNodes, function (n) { if (n.nodeType === 1) build(n); });
    });
  }).observe(document.body, { childList: true, subtree: true });
})();
