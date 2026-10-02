/* Thievery.co.uk — the door.
 *
 * Two forms and a tab, used by both doors onto the site: the front hall at
 * "/" and the flashcards room's own page. Neither of them knows anything: the
 * server decides whether a username is free, whether a password will do and
 * whether the pair is right, and this only relays what it says.
 *
 * Which door it is, is written on the card itself — data-api is where the
 * forms post and data-next is where a successful sign-in lands. Getting in
 * reloads the page rather than rendering anything, because what comes back
 * from that address is a different document once the cookie is set. */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const card = $('.door-card');
  const API = card.dataset.api || '/api/site';
  const NEXT = card.dataset.next || '/';
  const error = $('#door-error');

  // The same aliases the table deals out, so an account opened here is named
  // in the same voice as a player at a room.
  const ADJECTIVES = [
    'Lucky', 'Silent', 'Golden', 'Velvet', 'Crooked', 'Midnight', 'Brazen', 'Nimble', 'Shady', 'Dapper',
    'Reckless', 'Slippery', 'Cunning', 'Gilded', 'Sly', 'Swift', 'Bold', 'Wicked', 'Dashing', 'Smooth',
  ];
  const NOUNS = [
    'Horse', 'Fox', 'Magpie', 'Raven', 'Jack', 'Queen', 'Ace', 'Spade', 'Diamond', 'Bandit',
    'Burglar', 'Ferret', 'Weasel', 'Badger', 'Otter', 'Falcon', 'Panther', 'Cobra', 'Cipher', 'Keyhole',
  ];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  function say(message) {
    error.textContent = message;
    error.hidden = !message;
  }

  // --- tabs ------------------------------------------------------------------

  for (const tab of document.querySelectorAll('.door-tab')) {
    tab.addEventListener('click', () => {
      say('');
      for (const t of document.querySelectorAll('.door-tab')) {
        const on = t === tab;
        t.classList.toggle('is-on', on);
        t.setAttribute('aria-selected', String(on));
      }
      $('#signin').hidden = tab.dataset.pane !== 'signin';
      $('#join').hidden = tab.dataset.pane !== 'join';
    });
  }

  $('#jo-roll').addEventListener('click', (ev) => {
    // Held on to, because currentTarget is gone by the time the timer fires.
    const button = ev.currentTarget;
    $('#jo-name').value = pick(ADJECTIVES) + pick(NOUNS);
    button.classList.add('spun');
    setTimeout(() => button.classList.remove('spun'), 560);
  });

  // --- checking as you go ------------------------------------------------------

  // The server has the last word on all of this; these only say, next to the
  // field and in time to fix it, what the server would say afterwards. A name
  // is checked as it is typed, because a rule about characters is easiest to
  // follow while you are typing them. A password is checked when you leave
  // the field, because being told it is too short after two letters helps
  // nobody.
  function checker(input, test, message, when) {
    if (!input) return () => true;
    const note = document.createElement('p');
    note.className = 'field-error';
    note.id = `${input.id}-error`;
    note.hidden = true;
    input.closest('.field').appendChild(note);
    const hint = input.closest('.field').querySelector('.hint');
    if (hint && !hint.id) hint.id = `${input.id}-hint`;
    const describe = (bad) =>
      input.setAttribute('aria-describedby', [hint && hint.id, bad && note.id].filter(Boolean).join(' '));
    const run = (force) => {
      const bad = (force || input.value !== '') && !test(input.value);
      note.textContent = bad ? message : '';
      note.hidden = !bad;
      if (hint) hint.hidden = bad;
      input.setAttribute('aria-invalid', String(bad));
      describe(bad);
      return !bad;
    };
    input.addEventListener(when, () => run(false));
    describe(false);
    return run;
  }
  const userOk = checker(
    $('#jo-user'),
    (v) => /^[a-z0-9](?:[a-z0-9_.-]{1,18})[a-z0-9]$/i.test(v.trim()),
    'Use 3 to 20 letters, numbers, dots, dashes or underscores, starting and ending with a letter or number.',
    'input'
  );
  const passOk = checker($('#jo-pass'), (v) => v.length >= 6, 'Use at least 6 characters.', 'blur');

  // --- submitting ------------------------------------------------------------

  async function post(where, body, button) {
    button.disabled = true;
    say('');
    try {
      const res = await fetch(`${API}/${where}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        // The whole point of the request is the cookie that comes back.
        credentials: 'same-origin',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        say(payload.error || 'Something went wrong. Try again.');
        return;
      }
      // The cookie is set; asking for the page again gets what is behind the
      // door rather than the door.
      location.href = NEXT;
    } catch {
      say('Couldn’t reach the server. Try again in a moment.');
    } finally {
      button.disabled = false;
    }
  }

  $('#signin').addEventListener('submit', (ev) => {
    ev.preventDefault();
    post('login', { username: $('#si-user').value, password: $('#si-pass').value }, ev.target.querySelector('button'));
  });

  $('#join').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const okUser = userOk(true);
    const okPass = passOk(true);
    if (!okUser || !okPass) {
      (okUser ? $('#jo-pass') : $('#jo-user')).focus();
      return;
    }
    post(
      'register',
      {
        username: $('#jo-user').value,
        password: $('#jo-pass').value,
        displayName: $('#jo-name').value || $('#jo-user').value,
      },
      ev.target.querySelector('button')
    );
  });

  // Arrived here straight from closing an account: say it was done.
  if (new URLSearchParams(location.search).has('closed')) {
    history.replaceState(null, '', location.pathname);
    document.addEventListener('DOMContentLoaded', () => {
      if (window.thieveryToast) window.thieveryToast({ text: 'Your account is closed, and everything in it is deleted.', ms: 8000 });
    });
  }
})();
