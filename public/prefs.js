/* Thievery.co.uk — the choices that belong to a browser rather than an account.
 *
 * Two of them, both set in the account settings:
 *
 *   * The colour scheme. The Vault (dark, navy and brass) is the default; the
 *     plain design is the same site with a light page, a system sans-serif
 *     and blue for the accent. plain.css holds all of it and does nothing
 *     unless <html> carries data-theme="plain". A page that does not link
 *     plain.css is not changed at all, which is how the card table keeps the
 *     Vault: its cards and banners are the game's own artwork, not a skin.
 *   * Whether the banners animate. A stolen card, a missed guess and the end
 *     of a round are announced by a band that sweeps across the screen, the
 *     screen shakes when a card of yours is taken, and a win rains confetti.
 *     With animations off the banner still says the same thing for the same
 *     length of time, but it is simply there and then gone.
 *
 * Loaded in the <head>, without defer and after the stylesheets, so both
 * attributes are on <html> before the first paint; otherwise every load would
 * flash the Vault for a frame. Kept in localStorage because the card table
 * has no account to keep them against; a browser that refuses storage can
 * still switch, and forgets on the next load. The scheme's key is the one the
 * old corner switch used, so anybody who chose the plain design then still
 * has it.
 *
 * Controls, any number of each on a page:
 *   [data-theme-choice]   a radio whose value is 'vault' or 'plain'
 *   [data-motion-check]   a checkbox, ticked while the banners animate
 *   [data-motion-toggle]  a button; its on/off word is drawn by the stylesheet */

(function () {
  var THEME_KEY = 'thievery-theme';
  var MOTION_KEY = 'thievery-motion';
  var root = document.documentElement;
  var theme = 'vault';
  var still = false;

  try {
    if (localStorage.getItem(THEME_KEY) === 'plain') theme = 'plain';
    still = localStorage.getItem(MOTION_KEY) === 'still';
  } catch (e) { /* private mode */ }

  function themed() {
    return !!document.querySelector('link[href="/plain.css"]');
  }

  function sync() {
    var choices = document.querySelectorAll('[data-theme-choice]');
    for (var i = 0; i < choices.length; i++) choices[i].checked = choices[i].value === theme;
    var toggles = document.querySelectorAll('[data-motion-toggle]');
    for (var j = 0; j < toggles.length; j++) toggles[j].setAttribute('aria-pressed', String(!still));
    var checks = document.querySelectorAll('[data-motion-check]');
    for (var k = 0; k < checks.length; k++) checks[k].checked = !still;
  }

  function applyTheme(value) {
    theme = value === 'plain' ? 'plain' : 'vault';
    var plain = theme === 'plain' && themed();
    if (plain) root.setAttribute('data-theme', 'plain');
    else root.removeAttribute('data-theme');
    // The browser's own controls (a select's list, a checkbox, the scrollbar
    // on a phone) take their colours from these, not from the stylesheet.
    var scheme = document.querySelector('meta[name="color-scheme"]');
    if (scheme) scheme.setAttribute('content', plain ? 'light' : 'dark');
    var tint = document.querySelector('meta[name="theme-color"]');
    if (tint) tint.setAttribute('content', plain ? '#f5f7fa' : '#0a0c14');
  }

  function applyMotion(value) {
    still = !!value;
    if (still) root.setAttribute('data-motion', 'still');
    else root.removeAttribute('data-motion');
  }

  function save(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* forgotten on reload */ }
  }

  applyTheme(theme);
  applyMotion(still);
  document.addEventListener('DOMContentLoaded', sync);

  document.addEventListener('click', function (ev) {
    var toggle = ev.target.closest && ev.target.closest('[data-motion-toggle]');
    if (!toggle) return;
    applyMotion(!still);
    save(MOTION_KEY, still ? 'still' : 'moving');
    sync();
  });
  document.addEventListener('change', function (ev) {
    var el = ev.target;
    if (!el.matches) return;
    if (el.matches('[data-theme-choice]') && el.checked) {
      applyTheme(el.value);
      save(THEME_KEY, theme);
      sync();
    } else if (el.matches('[data-motion-check]')) {
      applyMotion(!el.checked);
      save(MOTION_KEY, still ? 'still' : 'moving');
      sync();
    }
  });

  // A second tab follows the first rather than disagreeing until a reload.
  window.addEventListener('storage', function (ev) {
    if (ev.key === THEME_KEY) applyTheme(ev.newValue);
    else if (ev.key === MOTION_KEY) applyMotion(ev.newValue === 'still');
    else return;
    sync();
  });

  // For the scripts that draw things the stylesheet cannot stop: the confetti.
  window.thieveryStill = function () { return still; };
})();
