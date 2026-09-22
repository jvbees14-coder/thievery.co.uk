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
 * Anything carrying data-theme-toggle is a switch. Its words are rewritten to
 * name the design it will change *to*, which is the one worth reading. */

(function () {
  var KEY = 'thievery-theme';
  var root = document.documentElement;
  var current = 'vault';

  try { if (localStorage.getItem(KEY) === 'plain') current = 'plain'; } catch (e) { /* private mode */ }

  function label() {
    var plain = current === 'plain';
    var switches = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < switches.length; i++) {
      switches[i].textContent = plain ? 'Vault design' : 'Plain design';
      switches[i].setAttribute('aria-pressed', String(plain));
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
    apply(current === 'plain' ? 'vault' : 'plain');
    try { localStorage.setItem(KEY, current); } catch (e) { /* forgotten on reload */ }
  });

  // A second tab open on the site follows the first rather than disagreeing
  // with it until somebody reloads.
  window.addEventListener('storage', function (ev) {
    if (ev.key === KEY) apply(ev.newValue);
  });
})();
