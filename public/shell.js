/* Thievery.co.uk — the shell's behaviour.
 *
 * Three small things every page shares, loaded with defer from the shared
 * head (server/views.js):
 *
 *   * The bar's scroll edge: a class on the bar once the page has scrolled
 *     under it, so the soft shadow only appears when there is something to
 *     separate.
 *   * The account menu's keys. Each room opens and closes the menu on a click
 *     in its own script; this adds what a menu is expected to do from the
 *     keyboard: Escape closes it and puts focus back on the button, the arrow
 *     keys move between its items, and opening it moves focus into it.
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
