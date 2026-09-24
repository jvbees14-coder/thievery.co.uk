/* Thievery.co.uk — the choices that belong to a browser rather than an account.
 *
 * There is one: whether the banners animate. A stolen card, a missed guess
 * and the end of a round are announced by a band that sweeps across the
 * screen with the words slammed onto it, the screen shakes when a card of
 * yours is taken, and a win rains confetti. With animations off the banner
 * still says the same thing for the same length of time, but it is simply
 * there and then gone, and the shake and the confetti do not happen.
 *
 * Loaded in the <head>, without defer, so the attribute is on <html> before
 * the first paint. It is kept in localStorage because the card table has no
 * account to keep it against; a browser that refuses storage can still
 * switch, and forgets on the next load.
 *
 * Two kinds of control drive it, and there may be any number of each on a
 * page: a button carrying data-motion-toggle, whose on/off word is drawn by
 * the stylesheet from the attribute, and a checkbox carrying
 * data-motion-check, which is ticked while the animations are on. */

(function () {
  var KEY = 'thievery-motion';
  var root = document.documentElement;
  var still = false;

  try { still = localStorage.getItem(KEY) === 'still'; } catch (e) { /* private mode */ }

  function sync() {
    var toggles = document.querySelectorAll('[data-motion-toggle]');
    for (var i = 0; i < toggles.length; i++) toggles[i].setAttribute('aria-pressed', String(!still));
    var checks = document.querySelectorAll('[data-motion-check]');
    for (var j = 0; j < checks.length; j++) checks[j].checked = !still;
  }

  function apply(value) {
    still = !!value;
    if (still) root.setAttribute('data-motion', 'still');
    else root.removeAttribute('data-motion');
    sync();
  }

  function choose(value) {
    apply(value);
    try { localStorage.setItem(KEY, still ? 'still' : 'moving'); } catch (e) { /* forgotten on reload */ }
  }

  apply(still);
  document.addEventListener('DOMContentLoaded', sync);

  document.addEventListener('click', function (ev) {
    var toggle = ev.target.closest && ev.target.closest('[data-motion-toggle]');
    if (toggle) choose(!still);
  });
  document.addEventListener('change', function (ev) {
    if (ev.target.matches && ev.target.matches('[data-motion-check]')) choose(!ev.target.checked);
  });

  // A second tab follows the first rather than disagreeing until a reload.
  window.addEventListener('storage', function (ev) {
    if (ev.key === KEY) apply(ev.newValue === 'still');
  });

  // For the scripts that draw things the stylesheet cannot stop: the confetti.
  window.thieveryStill = function () { return still; };
})();
