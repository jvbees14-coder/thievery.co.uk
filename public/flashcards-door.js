/* Thievery.co.uk — the door to the flashcards room.
 *
 * Two forms and a tab. Neither of them knows anything: the server decides
 * whether a username is free, whether a password will do and whether the pair
 * is right, and this only relays what it says. Getting in reloads the page,
 * because what comes back from /flashcards is a different document once the
 * cookie is set. */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
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
    $('#jo-name').value = pick(ADJECTIVES) + pick(NOUNS);
    ev.currentTarget.classList.add('spun');
    setTimeout(() => ev.currentTarget.classList.remove('spun'), 560);
  });

  // --- submitting ------------------------------------------------------------

  async function post(where, body, button) {
    button.disabled = true;
    say('');
    try {
      const res = await fetch('/api/flashcards/' + where, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        // The whole point of the request is the cookie that comes back.
        credentials: 'same-origin',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        say(payload.error || 'That did not work.');
        return;
      }
      // The cookie is set; asking for the page again gets the room rather than
      // the door.
      location.href = '/flashcards';
    } catch {
      say('The house is not answering. Try again in a moment.');
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
})();
