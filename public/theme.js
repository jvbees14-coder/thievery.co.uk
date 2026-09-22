/* Thievery.co.uk — which of the two designs the page is drawn in.
 *
 * The Vault is the house style and the default. The plain design is the same
 * site with the deco taken off: a light page, a system sans-serif and blue for
 * the accent, for anybody who would rather revise in something that looks
 * like a piece of software than a heist film. plain.css holds all of it, and
 * does nothing unless <html> carries data-theme="plain".
 *
 * This is loaded in the <head>, without defer, on purpose: it has to set the
 * attribute before the first paint, or every page load would flash the Vault
 * for a frame before settling. It is a choice about one browser, so it lives
 * in localStorage rather than in the stored document — and a browser that
 * refuses localStorage still gets to switch, it just forgets on the next load.
 *
 * Anything carrying data-theme-toggle is a switch, and every one of them is
 * named after the design it will change *to*, which is the one worth reading.
 * There are two kinds. One carries data-word: a chip in the corner of the bar
 * that turns over, whose name is written on the attribute for the hover label
 * and on aria-label for anybody who cannot see it. The other is an ordinary
 * entry in the account menu, whose name is its own text.
 *
 * Until a browser has chosen for the first time, the chip carries is-new and
 * nudges every few seconds. A switch nobody notices is a switch nobody has;
 * one that goes on waving after it has been used is a different fault, so the
 * first flip takes the class off for good. */

(function () {
  var KEY = 'thievery-theme';
  var root = document.documentElement;
  var current = 'vault';
  var chosen = false;

  try {
    var saved = localStorage.getItem(KEY);
    if (saved === 'plain' || saved === 'vault') { current = saved; chosen = true; }
  } catch (e) { /* private mode */ }

  function label() {
    var word = current === 'plain' ? 'Vault design' : 'Plain design';
    var switches = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < switches.length; i++) {
      var sw = switches[i];
      if (sw.hasAttribute('data-word')) {
        sw.setAttribute('data-word', word);
        sw.setAttribute('aria-label', word);
        if (chosen) sw.classList.remove('is-new');
        else sw.classList.add('is-new');
      } else {
        sw.textContent = word;
      }
      sw.setAttribute('aria-pressed', String(current === 'plain'));
    }
  }

  function apply(theme) {
    current = theme === 'plain' ? 'plain' : 'vault';
    if (current === 'plain') root.setAttribute('data-theme', 'plain');
    else root.removeAttribute('data-theme');
    // The browser's own controls — a select's list, a checkbox, the scrollbar
    // on a phone — take their colours from these, not from the stylesheet.
    var scheme = document.querySelector('meta[name="color-scheme"]');
    if (scheme) scheme.setAttribute('content', current === 'plain' ? 'light' : 'dark');
    var tint = document.querySelector('meta[name="theme-color"]');
    if (tint) tint.setAttribute('content', current === 'plain' ? '#f5f7fa' : '#0a0c14');
    label();
  }

  apply(current);
  document.addEventListener('DOMContentLoaded', label);

  document.addEventListener('click', function (ev) {
    var flip = ev.target.closest && ev.target.closest('[data-theme-toggle]');
    if (!flip) return;
    chosen = true;
    apply(current === 'plain' ? 'vault' : 'plain');
    try { localStorage.setItem(KEY, current); } catch (e) { /* forgotten on reload */ }
  });

  // A second tab open on the site follows the first rather than disagreeing
  // with it until somebody reloads.
  window.addEventListener('storage', function (ev) {
    if (ev.key !== KEY) return;
    chosen = ev.newValue === 'plain' || ev.newValue === 'vault';
    apply(ev.newValue);
  });
})();
