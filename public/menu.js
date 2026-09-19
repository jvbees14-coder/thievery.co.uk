/* Thievery.co.uk — the front hall, as you see it.
 *
 * The page arrives as an empty shell and one call fills it, exactly as the
 * flashcards room does: the server says what is true and the page is drawn
 * from it, so there is no second copy of anybody's figures in here to drift.
 *
 * The two panels — the record and the account — are addresses rather than
 * state: #stats and #account. That way the back button does what it looks
 * like it should, and a link to somebody's own record is a link. */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  let state = null; // the last snapshot

  // --- talking to the house --------------------------------------------------

  async function api(path, { method = 'GET', body = null } = {}) {
    const res = await fetch('/api/site/' + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      // A session that has expired underneath us is not an error worth a
      // message; the door is the answer.
      if (res.status === 401) location.href = '/';
      throw new Error(payload.error || 'That did not work.');
    }
    return payload;
  }

  let toastTimer = 0;
  function toast(message, kind = 'info') {
    const el = $('#toast');
    el.textContent = message;
    el.className = 'toast' + (kind === 'info' ? ' info' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 4200);
  }

  // Everything that can fail goes through here, so a thrown message always
  // lands in front of the person who caused it rather than in the console.
  const guard = (fn) => async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      toast(err.message || 'That did not work.');
    }
  };

  // --- saying numbers out loud -----------------------------------------------

  const plural = (n, one, many) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
  // A rate with nothing behind it is not nought per cent, it is nothing, and
  // printing "0%" over an empty record reads as a losing streak rather than
  // as a fresh account.
  const percent = (rate, of) => (of ? `${Math.round(rate * 100)}%` : '—');

  function figure(value, label, note) {
    return `<div class="menu-figure">
      <b>${esc(value)}</b>
      <span>${esc(label)}</span>
      ${note ? `<i>${esc(note)}</i>` : ''}
    </div>`;
  }

  // --- drawing ---------------------------------------------------------------

  function render() {
    const { user, play, collection, polls, rooms } = state;

    $('#hello').textContent = user.displayName;
    $('#who').textContent = user.displayName;

    // --- the tiles
    $('#tile-table-figure').textContent = play.rounds
      ? `${plural(play.rounds, 'round', 'rounds')} played · ${plural(play.wins, 'win', 'wins')}`
      : 'No rounds on the ledger yet';
    $('#tile-flashcards-figure').textContent = collection.count
      ? `${plural(collection.count, 'card', 'cards')} · worth ${collection.worth.toLocaleString('en-GB')}`
      : 'Three cards are waiting to be looked at';
    $('#tile-stats-figure').textContent = play.rounds
      ? `${percent(play.rate, play.rounds)} of them won · best run of ${play.best}`
      : 'Sit down at a table and it starts counting';
    $('#tile-account-figure').textContent = `Signed in as ${user.username}`;
    // The board's tile says which side of its one rule you are on, because
    // being told that on the menu is better than being told it by a form.
    $('#tile-polls-figure').textContent = !polls.open
      ? 'Nothing on the board yet'
      : polls.mayAsk
        ? `${plural(polls.open, 'question', 'questions')} · you may ask one`
        : `${plural(polls.open, 'question', 'questions')} · answer one to earn an ask`;

    // A door that is shut says so rather than waiting to be pressed.
    $('#tile-flashcards').classList.toggle('is-shut', !rooms.flashcards);
    $('#nav-flashcards').classList.toggle('is-shut', !rooms.flashcards);
    if (!rooms.flashcards) $('#tile-flashcards-figure').textContent = 'The room is closed for a moment';
    $('#tile-polls').classList.toggle('is-shut', !rooms.polls);
    $('#nav-polls').classList.toggle('is-shut', !rooms.polls);
    if (!rooms.polls) $('#tile-polls-figure').textContent = 'The board is closed for a moment';

    // --- the record
    $('#stats-lede').textContent = play.rounds
      ? `Counting since ${new Date(play.first).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`
      : 'Nothing counted yet. Play a round at the table and this fills itself in.';

    $('#stats-figures').innerHTML = [
      figure(play.rounds.toLocaleString('en-GB'), 'Rounds played'),
      figure(play.wins.toLocaleString('en-GB'), 'Rounds won'),
      figure(percent(play.rate, play.rounds), 'Win rate'),
      figure(play.best.toLocaleString('en-GB'), 'Best run', play.streak ? `${play.streak} on the go` : 'no run going'),
      figure(play.tables.toLocaleString('en-GB'), 'Tables sat at'),
      figure(collection.worth.toLocaleString('en-GB'), 'Collection worth', plural(collection.count, 'card', 'cards')),
    ].join('');

    const bots = play.rounds - play.versus;
    const botWins = play.wins - play.versusWins;
    $('#stats-people').textContent = play.versus
      ? `${plural(play.versus, 'round', 'rounds')}, ${plural(play.versusWins, 'won', 'won')} — ${percent(play.versusRate, play.versus)}.`
      : 'None yet. A table with somebody else at it counts here.';
    $('#stats-bots').textContent = bots
      ? `${plural(bots, 'round', 'rounds')}, ${plural(botWins, 'won', 'won')} — ${percent(bots ? botWins / bots : 0, bots)}.`
      : 'None yet. A table of bots counts here.';

    // --- the account
    $('#account-lede').textContent = `Opened ${new Date(user.created).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`;
    $('#ac-name').value = user.displayName;
    $('#ac-user').placeholder = user.username;
  }

  // --- which panel is open ---------------------------------------------------

  function show() {
    const at = location.hash.replace('#', '');
    // Both panels are reachable from the menu under the name, which is left
    // hanging open otherwise: a hash change is a move, and a move closes it.
    $('#who-menu').hidden = true;
    for (const id of ['stats', 'account']) $('#' + id).hidden = at !== id;
    // The tiles are the hall. They go when a panel is open, so the page is
    // one thing at a time rather than a grid with a form under it.
    $('.menu-grid').hidden = at === 'stats' || at === 'account';
    $('.menu-hello').hidden = !!at;
    $('.menu-lede').hidden = !!at;
    if (at) window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', show);

  // --- the account forms -----------------------------------------------------

  function say(message) {
    const el = $('#account-error');
    el.textContent = message;
    el.hidden = !message;
  }

  $('#account-name').addEventListener(
    'submit',
    guard(async (ev) => {
      ev.preventDefault();
      say('');
      state = await api('account', { method: 'POST', body: { displayName: $('#ac-name').value } });
      render();
      toast('That is what the table calls you now.', 'info');
    })
  );

  $('#account-keys').addEventListener(
    'submit',
    guard(async (ev) => {
      ev.preventDefault();
      say('');
      const body = { currentPassword: $('#ac-now').value };
      if ($('#ac-user').value.trim()) body.username = $('#ac-user').value.trim();
      if ($('#ac-new').value) body.password = $('#ac-new').value;
      if (!body.username && !body.password) return say('Nothing to change.');
      try {
        state = await api('account', { method: 'POST', body });
      } catch (err) {
        return say(err.message);
      }
      $('#ac-now').value = '';
      $('#ac-new').value = '';
      $('#ac-user').value = '';
      render();
      toast('Saved.', 'info');
    })
  );

  // --- the bar ---------------------------------------------------------------

  document.addEventListener('click', (ev) => {
    if (ev.target.closest('#who')) {
      const menu = $('#who-menu');
      menu.hidden = !menu.hidden;
      $('#who').setAttribute('aria-expanded', String(!menu.hidden));
      return;
    }
    if (!ev.target.closest('#who-menu')) $('#who-menu').hidden = true;
  });

  document.addEventListener(
    'click',
    guard(async (ev) => {
      const button = ev.target.closest('button[data-act]');
      if (!button) return;
      if (button.dataset.act === 'signout') {
        await api('logout', { method: 'POST' });
        location.href = '/';
      }
    })
  );

  // --- off we go -------------------------------------------------------------

  guard(async () => {
    state = await api('me');
    render();
    show();
  })();
})();
