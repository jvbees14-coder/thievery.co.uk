/* Thievery.co.uk — the front hall, as you see it.
 *
 * The page arrives as an empty shell and one call fills it, exactly as the
 * flashcards room does: the server says what is true and the page is drawn
 * from it, so there is no second copy of anybody's figures in here to drift.
 *
 * The two panels — the record and the account — are addresses rather than
 * state: #stats and #account. That way the back button does what it looks
 * like it should, and a link to somebody's own record is a link.
 *
 * The admin has a third, #members, which is the whole site's list of
 * accounts. It is drawn only for the admin and its addresses answer 404 to
 * anybody else, so hiding it here is tidiness rather than the lock. */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  let state = null; // the last snapshot
  let members = null; // the admin's list of accounts, once it has been fetched

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

  const day = (ts) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  function when(ts) {
    const secs = Math.round((Date.now() - ts) / 1000);
    if (secs < 60) return 'just now';
    if (secs < 3600) return plural(Math.floor(secs / 60), 'minute', 'minutes') + ' ago';
    if (secs < 86400) return plural(Math.floor(secs / 3600), 'hour', 'hours') + ' ago';
    if (secs < 2592000) return plural(Math.floor(secs / 86400), 'day', 'days') + ' ago';
    return day(ts);
  }

  function figure(value, label, note) {
    return `<div class="menu-figure">
      <b>${esc(value)}</b>
      <span>${esc(label)}</span>
      ${note ? `<i>${esc(note)}</i>` : ''}
    </div>`;
  }

  // --- drawing ---------------------------------------------------------------

  function render() {
    const { user, play, collection, battle, switchhead, rooms } = state;

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
    // Today's ten gets its own line: what the deck is, and whether this
    // account has played it yet.
    const daily = battle.daily;
    $('#tile-battle-daily').hidden = !daily || !daily.deck || !rooms.battle;
    if (daily && daily.deck) {
      $('#tile-battle-daily').textContent = daily.yours
        ? `Today’s ten, ${daily.deck.name}: ${daily.yours.points} — ${ordinal(daily.yours.place)} of ${daily.entrants}`
        : `Today’s ten is ${daily.deck.name}. Not played yet.`;
    }
    // Switchhead's tile says how it has gone for you, and what is left of
    // it is the same shut notice as the others.
    $('#tile-switchhead-figure').textContent = switchhead.games
      ? `${plural(switchhead.games, 'game', 'games')} · ${plural(switchhead.wins, 'win', 'wins')} · ${switchhead.heads} as the Switchhead`
      : 'Open a room and share the code';
    $('#tile-switchhead').classList.toggle('is-shut', !rooms.switchhead);
    $('#nav-switchhead').classList.toggle('is-shut', !rooms.switchhead);
    if (!rooms.switchhead) $('#tile-switchhead-figure').textContent = 'The room is closed for a moment';
    $('#tile-battle').classList.toggle('is-shut', !rooms.battle);
    $('#nav-battle').classList.toggle('is-shut', !rooms.battle);
    if (!rooms.battle) $('#tile-battle-figure').textContent = 'The room is closed for a moment';

    // --- the admin's door
    for (const id of ['#tile-members', '#nav-members', '#who-members']) $(id).hidden = !user.admin;

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
    renderBattle(battle);
    renderSwitchhead(switchhead);

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

  const ordinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n.toLocaleString('en-GB') + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  // The battle room's record: the figures, which deck you are best at, and
  // every deck you have been dealt from.
  function renderBattle(b) {
    $('#battle-figures').innerHTML = [
      figure(b.matches.toLocaleString('en-GB'), 'Matches', `${plural(b.solo, 'on your own', 'on your own')}`),
      figure(b.cards.toLocaleString('en-GB'), 'Cards answered'),
      figure(b.cards ? Math.round(b.average).toLocaleString('en-GB') : '—', 'Average mark', 'out of 100'),
      figure(percent(b.duelRate, b.duels), 'Duels won', plural(b.duels, 'duel', 'duels')),
      figure(b.cards ? b.best.toLocaleString('en-GB') : '—', 'Best card'),
    ].join('');

    $('#battle-best').textContent = b.bestDeck
      ? `Your best deck is ${b.bestDeck.name}, at ${Math.round(b.bestDeck.average)} out of 100 on average.`
      : b.cards
        ? `Answer ${b.bestDeckMin} cards on one deck and the house will say which you are best at.`
        : 'Nothing answered yet. A match in the battle room fills this in.';

    $('#battle-table').hidden = !b.decks.length;
    $('#battle-decks').innerHTML = b.decks
      .map(
        (d) => `<tr>
          <th scope="row">${esc(d.name)}</th>
          <td>${d.matches.toLocaleString('en-GB')}</td>
          <td>${d.cards.toLocaleString('en-GB')}</td>
          <td>${d.cards ? Math.round(d.average) : '—'}</td>
        </tr>`
      )
      .join('');
  }

  // Switchhead's record. First and last are the two ends worth a figure each;
  // the table size says what they were won against.
  function renderSwitchhead(sh) {
    $('#switchhead-figures').innerHTML = [
      figure(sh.games.toLocaleString('en-GB'), 'Games played'),
      figure(sh.wins.toLocaleString('en-GB'), 'Out first', percent(sh.winRate, sh.games)),
      figure(sh.heads.toLocaleString('en-GB'), 'The Switchhead', percent(sh.headRate, sh.games)),
      figure(sh.best.toLocaleString('en-GB'), 'Best run', sh.streak ? `${sh.streak} without being it` : 'games without being it'),
      figure(sh.pickups.toLocaleString('en-GB'), 'Piles picked up'),
      figure(sh.burns.toLocaleString('en-GB'), 'Piles burnt'),
    ].join('');
    $('#switchhead-note').textContent = sh.games
      ? `At tables of ${(sh.seats / sh.games).toFixed(1)} players on average. The goal turned over ${plural(sh.flips, 'time', 'times')} across them.`
      : 'Nothing played yet. A game of Switchhead fills this in.';
  }

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
    // #members/<id> is one account inside the members panel; the panel is
    // the part before the slash.
    const [at, which] = location.hash.replace('#', '').split('/');
    // The panels are reachable from the menu under the name, which is left
    // hanging open otherwise: a hash change is a move, and a move closes it.
    $('#who-menu').hidden = true;
    // Somebody who is not the admin and types #members in by hand is shown
    // the hall, not an empty panel that would only fail when it asked.
    const panel = at === 'members' && !(state && state.user.admin) ? '' : at;
    for (const id of ['stats', 'account', 'members']) $('#' + id).hidden = panel !== id;
    // The tiles are the hall. They go when a panel is open, so the page is
    // one thing at a time rather than a grid with a form under it.
    $('.menu-grid').hidden = ['stats', 'account', 'members'].includes(panel);
    $('.menu-hello').hidden = !!panel;
    $('.menu-lede').hidden = !!panel;
    if (panel === 'members') openMembers(which);
    if (panel) window.scrollTo(0, 0);
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

  // --- the members panel -----------------------------------------------------
  //
  // The same handlers as the flashcards room's panel, reached through the
  // hall's own address, so the rules about who may be renamed or suspended
  // are written once. The cards somebody holds are left to that panel: this
  // one is about the account.

  const adminApi = (id, opts) => api('admin/users' + (id ? '/' + encodeURIComponent(id) : ''), opts);

  const loadMembers = async () => {
    members = (await adminApi('')).users;
    drawMembers();
  };

  function drawMembers() {
    const total = members.length;
    const off = members.filter((u) => u.disabled).length;
    $('#tile-members-figure').textContent = `${plural(total, 'account', 'accounts')}${off ? ` · ${off} suspended` : ''}`;
    $('#members-lede').textContent =
      `${plural(total, 'account', 'accounts')} on the books${off ? `, ${off} of them suspended` : ''}. Pick one to change it.`;

    const term = $('#members-search').value.trim().toLowerCase();
    const list = members.filter(
      (u) => !term || u.username.includes(term) || u.displayName.toLowerCase().includes(term)
    );
    $('#members-list').innerHTML = list.length
      ? list
          .map((u) => `
            <a class="fc-acct${u.admin ? ' is-admin' : ''}${u.disabled ? ' is-off' : ''}" href="#members/${encodeURIComponent(u.id)}">
              <span class="fc-acct-main">
                <span class="fc-acct-name">${esc(u.displayName)} <span class="fc-acct-meta">@${esc(u.username)}</span>${u.admin ? ' &starf;' : ''}${u.disabled ? ' &mdash; suspended' : ''}</span>
                <span class="fc-acct-meta">opened ${day(u.created)} &middot; seen ${when(u.lastSeen)} &middot; ${plural(u.cards, 'card', 'cards')}</span>
              </span>
              <span class="fc-acct-worth">${u.worth.toLocaleString('en-GB')}</span>
            </a>`)
          .join('')
      : '<p class="menu-note">Nobody by that name.</p>';
  }

  $('#members-search').addEventListener('input', () => members && drawMembers());

  const openMembers = guard(async (id) => {
    $('#members-all').hidden = !!id;
    $('#member').hidden = !id;
    if (!id) {
      $('#member').innerHTML = '';
      return loadMembers();
    }
    drawMember(await adminApi(id));
  });

  function drawMember(detail) {
    const a = detail.account;
    const facts = [
      `Opened ${day(a.created)}`,
      `last seen ${when(a.lastSeen)}`,
      plural(a.sessions, 'signed-in device', 'signed-in devices'),
      plural(detail.cards.length, 'card', 'cards'),
      plural(detail.play.rounds, 'round', 'rounds') + ' at the table',
    ].join(' · ');

    // Nothing here is filled in by the browser. Its password manager sees a
    // username box beside a password box and helpfully offers the admin's own
    // login, which on somebody else's account is a rename to a name that is
    // already taken and a password nobody asked for.
    //
    // The whole block is replaced on every draw, so the listeners below go
    // with the old one rather than piling up.
    const fresh = document.createElement('div');
    fresh.id = 'member';
    fresh.innerHTML = `
      <p class="menu-member-back"><a href="#members">&larr; every account</a></p>
      <div class="menu-member">
        <div class="menu-member-head">
          <h3>${esc(a.displayName)}</h3>
          <span class="fc-acct-meta">@${esc(a.username)}${a.admin ? ' &starf; the admin' : ''}${a.disabled ? ' &mdash; suspended' : ''}</span>
        </div>
        <p class="menu-member-facts">${esc(facts)}</p>

        <form id="member-form" class="menu-form" autocomplete="off">
          <div class="field">
            <label for="mb-display">Display name</label>
            <input id="mb-display" maxlength="24" value="${esc(a.displayName)}" autocomplete="off" data-lpignore="true" data-1p-ignore required />
          </div>
          <div class="field">
            <label for="mb-user">Username</label>
            <input id="mb-user" maxlength="20" value="${esc(a.username)}" autocomplete="off" data-lpignore="true" data-1p-ignore autocapitalize="none" spellcheck="false"${a.admin ? ' disabled' : ''} />
            <p class="hint">${a.admin ? 'The admin account is named by THIEVERY_ADMIN_USERNAME, not from here.' : 'What they sign in with. Tell them if you change it.'}</p>
          </div>
          <div class="field">
            <label for="mb-pass">Set a new password <span class="opt">optional</span></label>
            <input id="mb-pass" type="password" maxlength="200" autocomplete="new-password" data-lpignore="true" data-1p-ignore />
            <p class="hint">At least 10 characters. Setting one signs the account out everywhere.</p>
          </div>
          <div class="field">
            <label for="mb-note">Your note <span class="opt">never shown to them</span></label>
            <textarea id="mb-note" rows="2" maxlength="500">${esc(a.note)}</textarea>
          </div>
          ${a.admin ? '' : `<label class="fc-check"><input id="mb-off" type="checkbox"${a.disabled ? ' checked' : ''} /> Suspended &mdash; cannot sign in</label>`}
          <p id="member-error" class="door-error" hidden></p>
          <div class="fc-actions">
            <button class="btn primary" type="submit">Save</button>
            <button class="btn ghost" data-act="mb-signout" type="button">Sign out everywhere</button>
          </div>
        </form>

        <p class="hint">Their cards are in the <a class="linkish" href="/flashcards">flashcards room&rsquo;s panel</a>.</p>

        ${a.admin ? '' : `
          <div class="menu-form">
            <h4 class="fc-h4">Close the account</h4>
            <p class="menu-note">Deletes the account, every card it holds and its record at the table. There is no undoing it.</p>
            <div class="fc-actions">
              <button class="btn danger" data-act="mb-delete" type="button">Close @${esc(a.username)}</button>
            </div>
          </div>`}
      </div>`;
    $('#member').replaceWith(fresh);

    const say = (message) => {
      const el = $('#member-error');
      el.textContent = message;
      el.hidden = !message;
    };

    $('#member-form').addEventListener('submit', guard(async (ev) => {
      ev.preventDefault();
      say('');
      const body = { displayName: $('#mb-display').value, note: $('#mb-note').value };
      if (!a.admin) {
        const name = $('#mb-user').value.trim();
        if (name.toLowerCase() !== a.username) body.username = name;
        body.disabled = $('#mb-off').checked;
      }
      if ($('#mb-pass').value) body.password = $('#mb-pass').value;
      let saved;
      try {
        saved = await adminApi(a.id, { method: 'POST', body });
      } catch (err) {
        // Said beside the button that was pressed, not only in a toast that
        // is gone in four seconds: this is the form that has to be put right.
        say(err.message);
        return;
      }
      // The admin's own name is in the bar and the greeting.
      if (a.id === state.user.id) {
        state = await api('me');
        render();
      }
      members = null; // the list is stale now; it is fetched again on the way back
      drawMember(saved);
      toast(body.password ? 'Saved, and signed out everywhere.' : 'Saved.', 'info');
    }));

    let armed = false; // closing an account takes two presses
    fresh.addEventListener('click', guard(async (ev) => {
      const button = ev.target.closest('button[data-act]');
      if (!button) return;
      if (button.dataset.act === 'mb-signout') {
        drawMember(await adminApi(a.id, { method: 'POST', body: { signOut: true } }));
        toast(`@${a.username} is signed out everywhere.`, 'info');
      }
      if (button.dataset.act === 'mb-delete') {
        if (!armed) {
          armed = true;
          button.textContent = `Press again to close @${a.username} for good`;
          return;
        }
        await adminApi(a.id, { method: 'DELETE' });
        toast(`@${a.username} is closed.`, 'info');
        location.hash = '#members';
      }
    }));
  }

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
    // The tile's figure, for the admin. The panel fetches it for itself if
    // it was the address the page arrived at.
    if (state.user.admin && !members) await loadMembers();
  })();
})();
