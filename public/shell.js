/* Thievery.co.uk — the shell's behaviour.
 *
 * The small things every page shares, loaded with defer from the shared
 * head (server/views.js):
 *
 *   * The bar's scroll edge: a class on the bar once the page has scrolled
 *     under it, so the soft shadow only appears when there is something to
 *     separate.
 *   * The account menu's keys. Each room opens and closes the menu on a click
 *     in its own script; this adds what a menu is expected to do from the
 *     keyboard: Escape closes it and puts focus back on the button, the arrow
 *     keys move between its items, and opening it moves focus into it.
 *   * Sheets: the ways every one of them can be closed.
 *   * The tab bar's lens on a phone, which can be slid from room to room,
 *     and the glint on the bar that follows it.
 *   * window.thieveryToast, the one way a page says something passing: a
 *     short line near the bottom of the screen, read out by a screen reader,
 *     and, if it carries an action such as Undo, left up until it is used or
 *     closed, or for at least eight seconds, paused while it is pointed at
 *     or focused.
 */

(function () {
  // --- the scroll edge ------------------------------------------------------

  var bar = document.querySelector('.site-bar');
  if (bar) {
    var ticking = false;
    var mark = function () {
      ticking = false;
      bar.classList.toggle('is-scrolled', window.scrollY > 4);
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(mark); }
    }, { passive: true });
    mark();
  }

  // --- the account menu -------------------------------------------------------

  var who = document.getElementById('who');
  var menu = document.getElementById('who-menu');
  function items() {
    return Array.prototype.filter.call(menu.querySelectorAll('a, button'), function (el) {
      return !el.hidden && el.offsetParent !== null;
    });
  }
  if (who && menu) {
    // The rooms toggle `hidden` on a click; this notices it opening and takes
    // focus in, but only when it was opened from the keyboard, so a mouse
    // user is not left with a ring on the first item.
    var byKey = false;
    who.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') byKey = true;
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        if (menu.hidden) who.click();
        var list = items();
        if (list[0]) list[0].focus();
      }
    });
    new MutationObserver(function () {
      if (!menu.hidden && byKey) {
        var list = items();
        if (list[0]) list[0].focus();
      }
      byKey = false;
    }).observe(menu, { attributes: true, attributeFilter: ['hidden'] });

    document.addEventListener('keydown', function (ev) {
      if (menu.hidden) return;
      if (ev.key === 'Escape') {
        menu.hidden = true;
        who.setAttribute('aria-expanded', 'false');
        who.focus();
        return;
      }
      if (!menu.contains(document.activeElement)) return;
      var list = items();
      var at = list.indexOf(document.activeElement);
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        var next = (at + (ev.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
        list[next].focus();
      } else if (ev.key === 'Home' || ev.key === 'End') {
        ev.preventDefault();
        list[ev.key === 'Home' ? 0 : list.length - 1].focus();
      } else if (ev.key === 'Tab') {
        menu.hidden = true;
        who.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // --- sheets -----------------------------------------------------------------

  // A <dialog class="sheet"> is opened by whoever owns it, with showModal().
  // What every sheet shares is how it goes away: its close button (anything
  // marked data-close-sheet), a press on the veil outside it, Escape (the
  // browser's own), and on a phone a drag down from the grip. Each of those
  // goes through requestClose(), so a sheet holding unsaved work can refuse by
  // cancelling the 'sheet:close' event and ask first.
  function requestClose(dialog) {
    var ev = new CustomEvent('sheet:close', { cancelable: true });
    if (dialog.dispatchEvent(ev)) dialog.close();
  }
  window.thieveryCloseSheet = requestClose;

  document.addEventListener('click', function (ev) {
    var closer = ev.target.closest && ev.target.closest('[data-close-sheet]');
    if (closer) {
      var d = closer.closest('dialog');
      if (d) requestClose(d);
      return;
    }
    var t = ev.target;
    if (t && t.tagName === 'DIALOG' && t.classList.contains('sheet') && t.open) {
      var r = t.getBoundingClientRect();
      var outside = ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom;
      if (outside) requestClose(t);
    }
  });
  document.addEventListener('cancel', function (ev) {
    var t = ev.target;
    if (t && t.tagName === 'DIALOG' && t.classList.contains('sheet')) {
      ev.preventDefault();
      requestClose(t);
    }
  }, true);

  var drag = null;
  document.addEventListener('pointerdown', function (ev) {
    var grip = ev.target.closest && ev.target.closest('.sheet-grip');
    if (!grip) return;
    var d = grip.closest('dialog');
    drag = { d: d, y: ev.clientY, dy: 0 };
    grip.setPointerCapture(ev.pointerId);
  });
  document.addEventListener('pointermove', function (ev) {
    if (!drag) return;
    drag.dy = Math.max(0, ev.clientY - drag.y);
    drag.d.style.transform = 'translateY(' + drag.dy + 'px)';
  });
  document.addEventListener('pointerup', function () {
    if (!drag) return;
    var d = drag.d;
    var far = drag.dy > 90;
    drag = null;
    d.style.transform = '';
    if (far) requestClose(d);
  });

  // --- the tab bar's lens -----------------------------------------------------

  // On a phone the current room's lens can be picked up and slid along the
  // tab bar, as on an iPhone: it follows the finger, takes the width of
  // whichever tab it is over, and letting go over another tab goes there.
  // A tap is still a tap. It only becomes a slide once the finger has moved
  // sideways further than it has moved up or down, so scrolling the page
  // from the bar still scrolls. On a page with no tab of its own there is no
  // lens, and one is made for the slide.
  //
  // The lens is moved out of its tab and into the bar for the slide, and is
  // positioned against the bar. If the slide ends on another tab it is left
  // there, so the view transition to the next page starts from where the
  // finger let go; otherwise it springs back and goes home.
  var nav = document.querySelector('.menu-nav');
  var narrow = window.matchMedia('(max-width: 900px)');
  if (nav) {
    var tabs = Array.prototype.slice.call(nav.querySelectorAll('.menu-nav-link'));
    var home = nav.querySelector('.menu-nav-lens');
    var homeFace = home ? home.parentNode : null;
    var slide = null;
    var slidAt = 0;

    var faceOf = function (tab) { return tab.querySelector('.menu-nav-face'); };
    var glint = function (x) {
      nav.style.setProperty('--glint-x', Math.round(x - nav.getBoundingClientRect().left) + 'px');
    };
    var glintHome = function () {
      if (!narrow.matches || !home || slide) return;
      var r = home.getBoundingClientRect();
      if (r.width) glint(r.left + r.width / 2);
    };
    glintHome();
    window.addEventListener('resize', glintHome);

    var tabAt = function (x) {
      for (var i = 0; i < tabs.length; i++) {
        var r = tabs[i].getBoundingClientRect();
        if (x >= r.left && x < r.right) return tabs[i];
      }
      return x < tabs[0].getBoundingClientRect().left ? tabs[0] : tabs[tabs.length - 1];
    };

    // Puts the lens, centred on x, at the size of the given tab's face, and
    // never past either end of the bar's run of tabs.
    var place = function (lens, x, tab) {
      var n = nav.getBoundingClientRect();
      var f = faceOf(tab).getBoundingClientRect();
      var lo = tabs[0].getBoundingClientRect().left;
      var hi = tabs[tabs.length - 1].getBoundingClientRect().right;
      var left = Math.min(Math.max(x - f.width / 2, lo), hi - f.width);
      var ox = n.left + nav.clientLeft;
      var oy = n.top + nav.clientTop;
      lens.style.left = (left - ox) + 'px';
      lens.style.top = (f.top - oy) + 'px';
      lens.style.width = f.width + 'px';
      lens.style.height = f.height + 'px';
    };

    var over = function (tab) {
      if (tab === slide.over) return;
      if (slide.over) slide.over.classList.remove('is-over');
      tab.classList.add('is-over');
      slide.over = tab;
      if (navigator.vibrate && window.thieveryPref && window.thieveryPref('haptics')) navigator.vibrate(6);
    };

    var begin = function (x) {
      var lens = home;
      if (!lens) {
        lens = document.createElement('span');
        lens.className = 'menu-nav-lens';
        lens.setAttribute('aria-hidden', 'true');
      }
      // Where it is now, so it moves off from there rather than appearing.
      var start = home ? home.getBoundingClientRect() : null;
      nav.appendChild(lens);
      if (start) place(lens, start.left + start.width / 2, tabAt(start.left + start.width / 2));
      lens.getBoundingClientRect();
      slide.lens = lens;
      nav.classList.add('is-sliding');
      try { nav.setPointerCapture(slide.id); } catch (e) { /* already gone */ }
      move(x);
    };

    var move = function (x) {
      var tab = tabAt(x);
      over(tab);
      place(slide.lens, x, tab);
      glint(x);
    };

    // Back to how the page was drawn: the lens in its own tab, or gone.
    var putBack = function (lens) {
      lens.removeAttribute('style');
      if (home && lens === home) homeFace.insertBefore(home, homeFace.firstChild);
      else lens.remove();
      glintHome();
    };

    var finish = function (go) {
      var s = slide;
      slide = null;
      nav.classList.remove('is-sliding');
      if (s.over) s.over.classList.remove('is-over');
      if (!go || !s.over) { putBack(s.lens); return; }
      var f = faceOf(s.over).getBoundingClientRect();
      place(s.lens, f.left + f.width / 2, s.over);
      glint(f.left + f.width / 2);
      if (s.over.getAttribute('aria-current') === 'page') {
        setTimeout(function () { putBack(s.lens); }, 260);
      } else {
        var to = s.over.href;
        setTimeout(function () { window.location.href = to; }, 140);
      }
    };

    nav.addEventListener('pointerdown', function (ev) {
      if (!narrow.matches || slide || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
      slide = { id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, lens: null, over: null };
    });
    nav.addEventListener('pointermove', function (ev) {
      if (!slide || ev.pointerId !== slide.id) return;
      if (!slide.lens) {
        var dx = Math.abs(ev.clientX - slide.x0);
        var dy = Math.abs(ev.clientY - slide.y0);
        if (dy > 8 && dy >= dx) { slide = null; return; }
        if (dx < 8 || dx < dy) return;
        begin(ev.clientX);
        return;
      }
      move(ev.clientX);
    });
    nav.addEventListener('pointerup', function (ev) {
      if (!slide || ev.pointerId !== slide.id) return;
      if (!slide.lens) { slide = null; return; }
      slidAt = Date.now();
      finish(true);
    });
    nav.addEventListener('pointercancel', function (ev) {
      if (!slide || ev.pointerId !== slide.id) return;
      if (!slide.lens) { slide = null; return; }
      finish(false);
    });
    // A press on a link that then moves is, to the browser, the start of
    // dragging the link somewhere else, and that cancels the slide.
    nav.addEventListener('dragstart', function (ev) {
      if (narrow.matches) ev.preventDefault();
    });
    // The click that follows a slide is not a tap on whatever tab the finger
    // happened to start on.
    nav.addEventListener('click', function (ev) {
      if (Date.now() - slidAt < 500) { ev.preventDefault(); ev.stopPropagation(); }
    }, true);
    // Coming back to this page from the next one can bring it back exactly as
    // it was left, lens and all, so put the lens home.
    window.addEventListener('pageshow', function (ev) {
      if (!ev.persisted) return;
      var stray = nav.querySelector(':scope > .menu-nav-lens');
      if (stray) putBack(stray);
    });
  }

  // --- toasts -----------------------------------------------------------------

  var shelf = null;
  function ensureShelf() {
    if (shelf) return shelf;
    shelf = document.createElement('div');
    shelf.className = 'toaster';
    shelf.setAttribute('role', 'status');
    shelf.setAttribute('aria-live', 'polite');
    document.body.appendChild(shelf);
    return shelf;
  }

  /**
   * thieveryToast({ text, tone, action, onAction, onClose, ms })
   *   text      what happened, in a few words
   *   tone      'info' (default), 'good' or 'bad'
   *   action    a button label, such as 'Undo'
   *   onAction  called if the button is pressed
   *   onClose   called when the toast goes, whichever way it went
   *   ms        how long it stays; at least 8000 when there is an action
   * Returns a function that closes it early.
   */
  window.thieveryToast = function (opts) {
    opts = opts || {};
    var box = ensureShelf();
    var el = document.createElement('div');
    el.className = 'toast-item' + (opts.tone ? ' is-' + opts.tone : '');
    var text = document.createElement('span');
    text.className = 'toast-text';
    text.textContent = opts.text || '';
    el.appendChild(text);

    var done = false;
    var timer = null;
    var left = Math.max(opts.action ? 8000 : 4000, opts.ms || 0);
    var started = 0;

    function close(acted) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      el.classList.add('is-leaving');
      setTimeout(function () { el.remove(); }, 200);
      if (opts.onClose) opts.onClose(!!acted);
    }
    function run() {
      started = Date.now();
      timer = setTimeout(function () { close(false); }, left);
    }
    function pause() {
      if (done || !timer) return;
      clearTimeout(timer);
      timer = null;
      left = Math.max(1500, left - (Date.now() - started));
    }
    function resume() {
      if (done || timer) return;
      run();
    }

    if (opts.action) {
      var act = document.createElement('button');
      act.type = 'button';
      act.className = 'toast-action';
      act.textContent = opts.action;
      act.addEventListener('click', function () {
        if (opts.onAction) opts.onAction();
        close(true);
      });
      el.appendChild(act);
    }
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'toast-close';
    x.setAttribute('aria-label', 'Dismiss');
    x.title = 'Dismiss';
    x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    x.addEventListener('click', function () { close(false); });
    el.appendChild(x);

    el.addEventListener('mouseenter', pause);
    el.addEventListener('mouseleave', resume);
    el.addEventListener('focusin', pause);
    el.addEventListener('focusout', resume);

    box.appendChild(el);
    run();
    return function () { close(false); };
  };
})();
