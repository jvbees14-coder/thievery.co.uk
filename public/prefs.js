/* Thievery.co.uk — the choices that belong to a browser rather than an account.
 *
 * Light or dark is not one of them any more. It is the device's choice, read
 * by the stylesheet (tokens.css) and never overridden here, so the site looks
 * the way everything else on that screen does.
 *
 * What is left is three switches, each kept in localStorage because the card
 * table has no account to keep them against:
 *
 *   * Banner animations. A stolen card, a missed guess and the end of a round
 *     are announced by a band that sweeps across the screen, the screen shakes
 *     when a card of yours is taken, and a win rains confetti. Off, the banner
 *     says the same thing for the same length of time and simply appears.
 *     Nobody has to find the switch if their device already asks for less
 *     motion: until they choose, that is the answer.
 *   * Larger cards, at the card table.
 *   * Vibration, at the card table, on a phone that can.
 *
 * Loaded in the <head>, without defer and after the stylesheets, so the
 * attributes are on <html> before the first paint.
 *
 * Controls, any number of each on a page:
 *   [data-motion-check]   a checkbox, ticked while the banners animate
 *   [data-motion-toggle]  a button; its on/off word is drawn by the stylesheet
 *   [data-pref-check]     a checkbox for one of the others, by name:
 *                         data-pref-check="cards" or "haptics" */

(function () {
  var MOTION_KEY = 'thievery-motion';
  var KEYS = { cards: 'thievery-cards', haptics: 'thievery-haptics' };
  var root = document.documentElement;
  var still = false;
  var prefs = { cards: false, haptics: false };

  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* forgotten on reload */ }
  }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  var chosen = read(MOTION_KEY);
  still = chosen ? chosen === 'still' : !!(reduce && reduce.matches);
  prefs.cards = read(KEYS.cards) === 'large';
  prefs.haptics = read(KEYS.haptics) === 'on';

  // The old light-or-dark switch left its answer behind. It means nothing now.
  try { localStorage.removeItem('thievery-theme'); } catch (e) { /* nothing to tidy */ }

  function apply() {
    if (still) root.setAttribute('data-motion', 'still');
    else root.removeAttribute('data-motion');
    if (prefs.cards) root.setAttribute('data-cards', 'large');
    else root.removeAttribute('data-cards');
  }

  function sync() {
    var toggles = document.querySelectorAll('[data-motion-toggle]');
    for (var j = 0; j < toggles.length; j++) toggles[j].setAttribute('aria-pressed', String(!still));
    var checks = document.querySelectorAll('[data-motion-check]');
    for (var k = 0; k < checks.length; k++) checks[k].checked = !still;
    var others = document.querySelectorAll('[data-pref-check]');
    for (var i = 0; i < others.length; i++) others[i].checked = !!prefs[others[i].getAttribute('data-pref-check')];
  }

  function setMotion(value) {
    still = !!value;
    save(MOTION_KEY, still ? 'still' : 'moving');
    apply();
    sync();
  }

  apply();
  document.addEventListener('DOMContentLoaded', sync);

  // Somebody who has not chosen follows their device as it changes.
  if (reduce && reduce.addEventListener) {
    reduce.addEventListener('change', function () {
      if (read(MOTION_KEY)) return;
      still = reduce.matches;
      apply();
      sync();
    });
  }

  document.addEventListener('click', function (ev) {
    var toggle = ev.target.closest && ev.target.closest('[data-motion-toggle]');
    if (toggle) setMotion(!still);
  });
  document.addEventListener('change', function (ev) {
    var el = ev.target;
    if (!el.matches) return;
    if (el.matches('[data-motion-check]')) {
      setMotion(!el.checked);
    } else if (el.matches('[data-pref-check]')) {
      var name = el.getAttribute('data-pref-check');
      if (!(name in prefs)) return;
      prefs[name] = el.checked;
      save(KEYS[name], name === 'cards' ? (el.checked ? 'large' : 'normal') : (el.checked ? 'on' : 'off'));
      apply();
      sync();
    }
  });

  // A second tab follows the first rather than disagreeing until a reload.
  window.addEventListener('storage', function (ev) {
    if (ev.key === MOTION_KEY) still = ev.newValue === 'still';
    else if (ev.key === KEYS.cards) prefs.cards = ev.newValue === 'large';
    else if (ev.key === KEYS.haptics) prefs.haptics = ev.newValue === 'on';
    else return;
    apply();
    sync();
  });

  // For the scripts that draw things the stylesheet cannot stop: the confetti.
  window.thieveryStill = function () { return still; };
  // And for the table, which buzzes only if asked to.
  window.thieveryPref = function (name) { return !!prefs[name]; };
})();
