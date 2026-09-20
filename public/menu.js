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
    const { user, play, collection, battle, rooms } = state;

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
    // The battle tile says what you have done there rather than what is
    // waiting: a room is four characters somebody has to give you, so there
    // is no board of open matches to count. Somebody who has never played is
    // told which kinds of battle they are already ready for, because a
    // collection of three cards is enough for both and that is not obvious.
    $('#tile-battle-figure').textContent = battle.matches
      ? `${plural(battle.cards, 'card', 'cards')} answered · ${Math.round(battle.average)} out of 100 on average` +
        (battle.duels ? ` · ${percent(battle.duelRate, battle.duels)} of duels won` : '')
      : battle.owned
        ? `${plural(battle.owned, 'card', 'cards')} to revise on, or take a house deck`
        : 'House decks are ready — or write a card and revise on your own';

    // A door that is shut says so rather than waiting to be pressed.
    $('#tile-flashcards').classList.toggle('is-shut', !rooms.flashcards);
    $('#nav-flashcards').classList.toggle('is-shut', !rooms.flashcards);
    if (!rooms.flashcards) $('#tile-flashcards-figure').textContent = 'The room is closed for a moment';
    $('#tile-battle').classList.toggle('is-shut', !rooms.battle);
    $('#nav-battle').classList.toggle('is-shut', !rooms.battle);
    if (!rooms.battle) $('#tile-battle-figure').textContent = 'The room is closed for a moment';

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

    renderModes(play);

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

  // The same rounds, split by what kind of game they were.
  //
  // A row with nothing behind it is drawn dim rather than hidden: knowing you
  // have never sat at a six-hand table is worth as much as the rate would be,
  // and a table whose rows come and go is one nobody can read twice.
  const MODES = [
    { key: 'seats.3', name: 'Three hands', note: 'the deduction game as written' },
    { key: 'seats.4', name: 'Four hands', note: 'the usual table' },
    { key: 'seats.5', name: 'Five hands', note: 'dealt power-ups' },
    { key: 'seats.6', name: 'Six hands', note: 'dealt power-ups' },
    { key: 'plain', name: 'Without power-ups', note: 'three and four hands' },
    { key: 'powered', name: 'With power-ups', note: 'five and six hands' },
    { key: 'teams', name: 'Partnerships', note: 'four hands, two teams' },
    { key: 'shared', name: 'Sharing a hand', note: 'somebody else played it too' },
  ];

  const rowFor = (play, key) => (key.startsWith('seats.') ? play.seats[key.slice(6)] : play[key]) || { rounds: 0, wins: 0 };

  function renderModes(play) {
    $('#stats-modes').innerHTML = MODES.map(({ key, name, note }) => {
      const row = rowFor(play, key);
      return `<tr${row.rounds ? '' : ' class="is-empty"'}>
        <th scope="row">${esc(name)}<span>${esc(note)}</span></th>
        <td>${row.rounds.toLocaleString('en-GB')}</td>
        <td>${row.wins.toLocaleString('en-GB')}</td>
        <td>${percent(row.rounds ? row.wins / row.rounds : 0, row.rounds)}</td>
      </tr>`;
    }).join('');

    // The rows are counted by table size, and rounds played before the house
    // started doing that are in the total and in none of them. Saying so is
    // better than letting somebody add the column up and find it short.
    const older = play.rounds - play.attributed;
    const note = $('#stats-modes-note');
    note.hidden = older <= 0;
    if (older > 0) {
      note.textContent =
        `${plural(older, 'round', 'rounds')} played before the house began counting by table are in the total above, and in none of these rows.`;
    }
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
