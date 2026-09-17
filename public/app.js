/* Thievery.co.uk — the table as you see it.
 *
 * Everything on screen is drawn from the last snapshot the room sent you, and
 * a snapshot only ever contains what you are allowed to know. Your own hand,
 * anything face up, and whatever your partner has shown you: nothing else is
 * in here to be found. */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  // Anything the table is waiting on trails off in dots that count up.
  const DOTS = '<span class="dots"><i>.</i><i>.</i><i>.</i></span>';
  // How many hands a table can be dealt and how the 26 cards fall at each.
  // The room sends both when a socket opens, because they are the deal and
  // the deal is the server's to describe; what is written here is only what
  // to draw with before the first message lands, and if the two ever disagree
  // the wire wins.
  let SEAT_COUNTS = [3, 4, 5, 6];
  let SPLIT_LABEL = { 3: '9/9/8', 4: '7/7/6/6', 5: '6/5/5/5/5', 6: '5/5/4/4/4/4' };
  // How hard the house plays a hand nobody wanted.
  const BOT_LEVELS = ['novice', 'sharp', 'ruthless'];
  const BOT_LEVEL_LABEL = { novice: 'Novice', sharp: 'Sharp', ruthless: 'Ruthless' };
  const BOT_LEVEL_HINT = {
    novice: 'Guesses inside the rule, but never shops around &mdash; kind to a beginner',
    sharp: 'Reads the row: a hidden card is fenced in by the ones either side',
    ruthless: 'Counts the whole table. It will take every card you let it',
  };

  // Aliases, dealt out like a hand: an adjective and a noun, run together.
  const ADJECTIVES = [
    'Lucky', 'Silent', 'Golden', 'Velvet', 'Crooked', 'Midnight', 'Brazen', 'Nimble', 'Shady', 'Dapper',
    'Reckless', 'Slippery', 'Cunning', 'Gilded', 'Sly', 'Swift', 'Bold', 'Wicked', 'Dashing', 'Smooth',
    'Quiet', 'Sharp', 'Rogue', 'Hidden', 'Masked', 'Polished', 'Restless', 'Grand', 'Loose', 'Wild',
    'Copper', 'Ivory', 'Feral', 'Idle', 'Sudden', 'Broken', 'Iron', 'Hollow', 'Lonely', 'Marble',
  ];
  const NOUNS = [
    'Horse', 'Fox', 'Magpie', 'Raven', 'Jack', 'Queen', 'Ace', 'Spade', 'Diamond', 'Bandit',
    'Burglar', 'Ferret', 'Weasel', 'Badger', 'Otter', 'Falcon', 'Panther', 'Cobra', 'Viper', 'Mongoose',
    'Crow', 'Hound', 'Wolf', 'Marten', 'Lynx', 'Heron', 'Stoat', 'Mole', 'Gecko', 'Shark',
    'Sparrow', 'Hawk', 'Jackal', 'Lantern', 'Cipher', 'Keyhole', 'Domino', 'Whisper', 'Shadow', 'Dealer',
  ];
  const pickOne = (a) => a[Math.floor(Math.random() * a.length)];
  const randomAlias = () => pickOne(ADJECTIVES) + pickOne(NOUNS);
  const ordinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  // A name already ending in an s takes the apostrophe and nothing after it.
  // The same rule the log uses, for the same reason: it is on screen constantly
  // and "Fingers's" reads as a typo.
  const possessive = (name) => `${name}${/s$/i.test(String(name)) ? "'" : "'s"}`;

  // --- state ---------------------------------------------------------------
  let ws = null;
  let state = null; // last server snapshot
  let session = loadJSON('thievery:session'); // { code, name, token }
  let pendingJoin = null; // create/join message waiting for the socket to open
  let halted = false; // stop reconnecting (superseded by another tab)
  let retry = 0;
  let renderedRound = null;
  let renderedSeat = null;
  const ui = { target: null, arrange: null, swapPick: null, openMenu: null, leaveArmed: false, pu: null };
  let catalog = null; // the power-up catalog, sent once when the socket opens
  let leaveArmTimer = 0;

  // A refresh or a dropped connection puts you straight back in your seat.
  // Each tab is its own player, though; and if the browser is closed entirely,
  // joining again with the same room code and the same name still finds it.
  function loadJSON(key) {
    try {
      return JSON.parse(sessionStorage.getItem(key) || 'null');
    } catch {
      return null;
    }
  }
  function saveSession(s) {
    session = s;
    try {
      if (s) sessionStorage.setItem('thievery:session', JSON.stringify(s));
      else sessionStorage.removeItem('thievery:session');
    } catch {}
  }

  // --- networking ----------------------------------------------------------
  function connect() {
    if (halted) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);
    ws.onopen = () => {
      retry = 0;
      $('#conn').hidden = true;
      if (pendingJoin) {
        ws.send(JSON.stringify(pendingJoin));
        pendingJoin = null;
      } else if (session) {
        ws.send(JSON.stringify({ type: 'join', code: session.code, name: session.name, token: session.token }));
      }
    };
    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      handleMessage(msg);
    };
    ws.onclose = () => {
      ws = null;
      if (halted) return;
      if (session || pendingJoin) $('#conn').hidden = false;
      const delay = Math.min(8000, 400 * 2 ** retry++);
      setTimeout(connect, delay);
    };
    ws.onerror = () => {};
  }

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    else toast('Not connected — trying to reconnect…');
  }

  function joinWith(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    else {
      pendingJoin = msg;
      if (!ws) connect();
    }
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case 'state': {
        const hadState = !!state;
        state = msg;
        saveSession({ code: msg.room.code, name: msg.you.name, token: msg.you.token });
        if (!hadState) history.replaceState(null, '', `/?code=${msg.room.code}`);
        announceEvents(msg);
        render();
        break;
      }
      case 'catalog':
        // Static, and sent once rather than with every snapshot.
        catalog = Object.fromEntries(msg.powerUps.map((p) => [p.id, p]));
        if (Array.isArray(msg.seatCounts) && msg.seatCounts.length) SEAT_COUNTS = msg.seatCounts;
        if (msg.splits) SPLIT_LABEL = Object.fromEntries(Object.entries(msg.splits).map(([n, split]) => [n, split.join('/')]));
        if (state) render();
        break;
      case 'error':
        toast(msg.message);
        if (!state) {
          // Our (re)join was rejected: the room is gone, full or started.
          saveSession(null);
          render();
        }
        break;
      case 'superseded':
        halted = true;
        state = null;
        render();
        toast('You opened this room in another tab. This tab is now inactive.');
        break;
      case 'kicked':
        saveSession(null);
        state = null;
        render();
        toast('The host removed you from the room.');
        break;
    }
  }

  // --- banners -------------------------------------------------------------
  // The moments that matter to you and nobody else: your guess landed, your
  // guess missed, one of your cards was taken, or the round is over. Banners
  // follow whichever seat you are looking at, and history is never replayed
  // when you come back to a room.
  let seenLog = 0;
  let seenRound = null;
  const RANK_WORDS = { 1: 'an Ace', 8: 'an 8', 11: 'a Jack', 12: 'a Queen', 13: 'a King' };
  const rankWord = (r) => RANK_WORDS[r] || `a ${r}`;

  function announceEvents(msg) {
    const g = msg.game;
    if (!g) {
      seenLog = 0;
      dismissBanner();
      return;
    }
    if (msg.room.round !== seenRound) {
      seenRound = msg.room.round;
      seenLog = 0;
      dismissBanner(); // a new deal clears last round's result off the screen
    }
    const fresh = g.logTotal - seenLog;
    const firstLook = seenLog === 0;
    seenLog = g.logTotal;
    if (firstLook || fresh <= 0) return;
    const me = msg.you.seat;
    const who = (s) => g.names[s];
    for (const entry of g.log.slice(-fresh)) {
      const ev = entry.event;
      if (!ev) continue;
      if (ev.type === 'result') {
        if (ev.winners.includes(me)) banner('win', 'Heist complete', entry.text);
        else if (ev.losers.includes(me)) banner('lose', 'Busted', entry.text);
        continue;
      }
      if (ev.type !== 'guess') continue;
      const nth = ordinal(ev.target.idx + 1);
      if (ev.by === me) {
        if (ev.correct) {
          const last = g.phase === 'ended';
          banner('good', 'Stolen', `${possessive(who(ev.target.seat))} ${nth} card was ${ev.card}. ${last ? 'That was the last one!' : 'Guess again.'}`);
        } else {
          banner('bad', 'Missed', `${possessive(who(ev.target.seat))} ${nth} card is not ${rankWord(ev.rank)}. The turn passes.`);
        }
      } else if (ev.correct && ev.target.seat === me) {
        banner('exposed', 'Exposed', `${who(ev.by)} took your ${nth} card: ${ev.card}.`);
        document.body.classList.remove('shake');
        void document.body.offsetWidth;
        document.body.classList.add('shake');
      }
    }
  }

  const bannerQueue = [];
  let bannerBusy = false;
  let bannerTimer = 0;
  let bannerShownAt = 0;
  let awaitingKey = false;
  let keyHandler = null;
  const BANNER_MS = 4600; // how long a banner about a single guess stays up
  const BANNER_MIN_MS = 1500; // and the least it gets before the next one cuts in
  const RESULT_GRACE_MS = 800; // ignore a key that was already on its way down
  const RESULT_OUT_MS = 600; // how long the end-of-round banner takes to leave
  const isResult = (b) => b.kind === 'win' || b.kind === 'lose';

  function banner(kind, title, sub) {
    // A streak of hits must not pile up: only the newest pending guess banner
    // survives, and the round result always plays last.
    const results = bannerQueue.filter(isResult);
    const next = { kind, title, sub };
    bannerQueue.length = 0;
    if (isResult(next)) bannerQueue.push(...results, next);
    else bannerQueue.push(next, ...results);
    if (awaitingKey) {
      releaseKey(); // fresher news outranks a result still waiting to be read
      return nextBanner();
    }
    if (!bannerBusy) return nextBanner();
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(nextBanner, Math.max(0, BANNER_MIN_MS - (performance.now() - bannerShownAt)));
  }

  function nextBanner() {
    clearTimeout(bannerTimer);
    releaseKey();
    const el = $('#banner');
    const b = bannerQueue.shift();
    if (!b) {
      bannerBusy = false;
      el.hidden = true;
      el.className = 'banner';
      return;
    }
    bannerBusy = true;
    bannerShownAt = performance.now();
    el.hidden = true;
    el.className = `banner ${b.kind}`;
    // The arrive-hold-leave animation is timed to the life of the banner, so
    // the stylesheet is told what that is rather than guessing it.
    el.style.setProperty('--banner-life', `${BANNER_MS}ms`);
    el.innerHTML =
      `<div class="banner-inner"><div class="banner-title">${esc(b.title)}</div><div class="banner-sub">${esc(b.sub)}</div></div>` +
      (isResult(b) ? '<div class="banner-hint">Press any key</div>' : '');
    void el.offsetWidth; // restart the CSS animation
    el.hidden = false;
    if (b.kind === 'win') confetti();
    // The end of a round arrives the same way as everything else, then simply
    // stays: it is yours to read for as long as you like.
    if (isResult(b)) armKey();
    else bannerTimer = setTimeout(nextBanner, BANNER_MS);
  }

  function armKey() {
    awaitingKey = true;
    const ready = performance.now() + RESULT_GRACE_MS;
    keyHandler = (e) => {
      if (e.type === 'keydown' && (e.metaKey || e.ctrlKey || e.altKey)) return;
      if (performance.now() < ready) return;
      dismissBanner();
    };
    addEventListener('keydown', keyHandler);
    addEventListener('pointerdown', keyHandler);
  }
  function releaseKey() {
    if (!keyHandler) return;
    removeEventListener('keydown', keyHandler);
    removeEventListener('pointerdown', keyHandler);
    keyHandler = null;
    awaitingKey = false;
  }
  function dismissBanner() {
    if (!awaitingKey) return;
    releaseKey();
    $('#banner').classList.add('dismiss');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(nextBanner, RESULT_OUT_MS);
  }

  // Brass ticker-tape, diamonds and suit glyphs rain down on a winner.
  function confetti() {
    const c = $('#confetti');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = c.getContext('2d');
    c.width = innerWidth;
    c.height = innerHeight;
    c.hidden = false;
    const colors = ['#d4af5a', '#f1d382', '#f4ecd8', '#8e1f2e', '#b02a3c', '#d4af5a'];
    const suits = ['♠', '♥', '♦', '♣'];
    const parts = Array.from({ length: 220 }, () => {
      const kind = Math.random();
      return {
        x: Math.random() * c.width,
        y: -30 - Math.random() * c.height * 0.8,
        w: 6 + Math.random() * 8,
        h: 10 + Math.random() * 12,
        vx: (Math.random() - 0.5) * 1.6,
        vy: 2.2 + Math.random() * 3.6,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.25,
        sway: Math.random() * Math.PI * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: kind < 0.2 ? 'suit' : kind < 0.45 ? 'diamond' : 'tape',
        glyph: suits[Math.floor(Math.random() * suits.length)],
      };
    });
    const start = performance.now();
    const life = 5200;
    function frame(t) {
      const age = t - start;
      ctx.clearRect(0, 0, c.width, c.height);
      const fade = age > life - 900 ? Math.max(0, (life - age) / 900) : 1;
      ctx.globalAlpha = fade;
      for (const p of parts) {
        p.sway += 0.05;
        p.x += p.vx + Math.sin(p.sway) * 0.8;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > c.height + 30) {
          p.y = -30;
          p.x = Math.random() * c.width;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === 'tape') {
          // A slight squash as it tumbles sells the 3D flutter.
          ctx.scale(1, Math.abs(Math.cos(p.rot * 2)) * 0.8 + 0.2);
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        } else if (p.shape === 'diamond') {
          ctx.beginPath();
          ctx.moveTo(0, -p.h / 2);
          ctx.lineTo(p.w / 2, 0);
          ctx.lineTo(0, p.h / 2);
          ctx.lineTo(-p.w / 2, 0);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.font = `${p.h + 6}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(p.glyph, 0, 0);
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      if (age < life) requestAnimationFrame(frame);
      else {
        ctx.clearRect(0, 0, c.width, c.height);
        c.hidden = true;
      }
    }
    requestAnimationFrame(frame);
  }

  // --- unsolicited offers --------------------------------------------------
  //
  // Somebody at the table signed their name with a mark, and now the rest of
  // the room is being advertised at. One arrives every ten seconds, lands
  // somewhere at random, and sits there until it is clicked. Whether they are
  // coming for you is decided by the room server, which never says who is
  // behind them.
  const ADS = [
    { seller: 'cucumber-hire.example', head: 'Cucumber for rent!', lines: ['Only £6.70 per day'] },
    { seller: 'oil-direct.example', head: 'Lightly used baby oil', lines: ['Only £167 a bottle'] },
    { seller: 'whsmiths-therapy.example', head: 'Redeem code G4Y', lines: ['for 50% off all in-store WHSmiths therapy'] },
    { seller: 'sunraygardens.example', head: 'If you see suspicious activity in Sunray Gardens Forest,', lines: ['please ignore it'] },
    { seller: 'joyousmeals.example', head: "New McDonald's Joyous Meal Offer:", lines: ['Gay Burger with a side of extra Sexual Sauce'] },
    { seller: 'thievery.co.uk', head: 'Thievery.co.uk Employee of the fortnight and two days:', lines: ['Squire Forsteringson'] },
    { seller: 'lost-property.example', head: 'Missing WHSmith Package', lines: ['If found please call +698844206767', 'Any shape or size will do'] },
    {
      seller: 'amdram.example',
      head: 'Actors needed for amateur production of West Side Story.',
      lines: ['Applicants must bring own tie, sunglasses and fur coat.'],
    },
  ];
  const POPUP_EVERY_MS = 10000; // the gap between one offer and the next
  const POPUP_MAX = 12; // even a pile-up has its limits

  let popupTimer = 0;

  // Called after every render: starts the offers when the room says they are
  // coming for you, and sweeps them away the moment they are not.
  function syncPopups() {
    const wanted = !!(state && state.you && state.you.prank);
    if (wanted) {
      if (!popupTimer) queuePopup();
      return;
    }
    clearTimeout(popupTimer);
    popupTimer = 0;
    $('#popups').textContent = '';
  }

  function queuePopup() {
    popupTimer = setTimeout(() => {
      popupTimer = 0;
      showPopup();
      syncPopups();
    }, POPUP_EVERY_MS);
  }

  function showPopup() {
    const layer = $('#popups');
    if (layer.childElementCount >= POPUP_MAX) return; // they can wait their turn
    const ad = pickOne(ADS);
    const el = document.createElement('div');
    el.className = 'popup';
    el.innerHTML = `
      <div class="popup-bar">
        <span class="popup-host">${esc(ad.seller)}</span>
        <span class="popup-x" aria-hidden="true">&#10005;</span>
      </div>
      <div class="popup-body">
        <p class="popup-head">${esc(ad.head)}</p>
        ${ad.lines.map((l) => `<p class="popup-line">${esc(l)}</p>`).join('')}
      </div>`;
    el.title = 'Close';
    layer.appendChild(el);
    placePopup(el);
  }

  // Dropped anywhere it fits, never hanging off the edge of the screen.
  function placePopup(el) {
    const pad = 8;
    const x = pad + Math.random() * Math.max(0, innerWidth - el.offsetWidth - pad * 2);
    const y = pad + Math.random() * Math.max(0, innerHeight - el.offsetHeight - pad * 2);
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
  }

  // One click anywhere on an offer is enough to be rid of it.
  $('#popups').addEventListener('click', (e) => {
    const el = e.target.closest('.popup');
    if (el) el.remove();
  });

  // Turning a phone on its side must not push them off the screen.
  addEventListener('resize', () => {
    for (const el of document.querySelectorAll('.popup')) {
      const maxX = Math.max(8, innerWidth - el.offsetWidth - 8);
      const maxY = Math.max(8, innerHeight - el.offsetHeight - 8);
      el.style.left = `${Math.min(parseFloat(el.style.left) || 8, maxX)}px`;
      el.style.top = `${Math.min(parseFloat(el.style.top) || 8, maxY)}px`;
    }
    // The switches are measured in pixels, so a new window width means they
    // have to be measured again.
    settleSwitches();
  });

  // --- the deal ------------------------------------------------------------
  // A round opens with the cards flying out of a deck above the table, one to
  // each player in turn, exactly as they would be dealt by hand. Anything that
  // happens mid-deal joins the deal already in progress rather than starting
  // it over.
  const DEAL_STEP = 55; // ms between cards
  const DEAL_FLIGHT = 600; // ms each card takes
  let dealStart = 0;

  function animateDeal() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const table = $('#app .table');
    if (!table) return;
    const rows = [...table.querySelectorAll('.seat-row')];
    const tr = table.getBoundingClientRect();
    const ox = tr.left + tr.width / 2;
    const oy = tr.top - 30;
    const elapsed = performance.now() - dealStart;
    let last = 0;
    rows.forEach((row, r) => {
      row.querySelectorAll('.card').forEach((card, i) => {
        const k = i * rows.length + r; // round the table: everyone's first card, then everyone's second
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--dx', `${ox - (rect.left + rect.width / 2)}px`);
        card.style.setProperty('--dy', `${oy - (rect.top + rect.height / 2)}px`);
        card.style.animationDelay = `${k * DEAL_STEP - elapsed}ms`;
        card.classList.add('dealt');
        last = Math.max(last, k);
      });
    });
    table.style.setProperty('--deal-total', `${last * DEAL_STEP + DEAL_FLIGHT - elapsed}ms`);
    table.classList.add('dealing');
  }

  // --- helpers -------------------------------------------------------------
  let toastTimer;
  function toast(text, kind = '') {
    const el = $('#toast');
    el.textContent = text;
    el.className = `toast ${kind}`;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 3500);
  }

  function copyText(text) {
    navigator.clipboard?.writeText(text).then(
      () => toast('Copied', 'info'),
      () => toast(text, 'info'),
    );
  }

  // A phone has a share sheet, and it is a better answer than the clipboard:
  // the code goes straight into whatever they were going to paste it into.
  // A desktop keeps the clipboard, where sharing usually means a browser
  // dialogue nobody asked for — hence the pointer test rather than a bare
  // feature test.
  const CAN_SHARE = !!navigator.share && matchMedia('(hover: none)').matches;

  function shareRoom() {
    const url = `${location.origin}/?code=${state.room.code}`;
    if (!CAN_SHARE) return copyText(url);
    navigator
      .share({ title: 'Thievery.co.uk', text: `Come and play — the room code is ${state.room.code}`, url })
      .catch(() => {}); // cancelling a share sheet is not an error worth saying
  }

  // --- the table is waiting on you -----------------------------------------
  //
  // A tab at the back of the pile has no way of knowing its turn has come
  // round, and people put phones in pockets. The title carries the news, and
  // only while the page is out of sight: a tab somebody is looking at does not
  // need to be shouted at.
  const BASE_TITLE = document.title;
  let titleTimer = 0;
  let titleFlipped = false;

  function syncTitle() {
    const g = state && state.game;
    const yours = g && g.phase === 'play' && g.turn === state.you.seat && !document.hasFocus();
    if (!yours) {
      if (titleTimer) clearInterval(titleTimer);
      titleTimer = 0;
      titleFlipped = false;
      if (document.title !== BASE_TITLE) document.title = BASE_TITLE;
      return;
    }
    if (titleTimer) return;
    document.title = '● Your turn — Thievery';
    titleFlipped = true;
    titleTimer = setInterval(() => {
      titleFlipped = !titleFlipped;
      document.title = titleFlipped ? '● Your turn — Thievery' : BASE_TITLE;
    }, 1300);
  }

  addEventListener('focus', syncTitle);
  addEventListener('blur', syncTitle);

  function leaveRoom() {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'leave' }));
    saveSession(null);
    state = null;
    ui.openMenu = null;
    ui.leaveArmed = false;
    dismissBanner();
    history.replaceState(null, '', '/');
    render();
  }

  // --- rendering -----------------------------------------------------------
  function render() {
    const home = $('#home');
    const app = $('#app');
    if (!state) {
      home.hidden = false;
      app.innerHTML = '';
      syncPopups(); // nothing follows you out of a room
      syncTitle();
      return;
    }
    home.hidden = true;
    // Per-seat UI state (pending guess, card arrangement) must not survive a
    // new round or, in test mode, switching to a different seat.
    if (state.room.round !== renderedRound || state.you.seat !== renderedSeat) {
      if (state.room.round !== renderedRound && state.game && state.game.phase === 'arrange') dealStart = performance.now();
      renderedRound = state.room.round;
      renderedSeat = state.you.seat;
      ui.target = null;
      ui.arrange = null;
      ui.openMenu = null;
    }
    app.innerHTML = state.game ? renderGame() : renderLobby();
    settleSwitches();
    syncPopups();
    if (state.game && dealStart && performance.now() - dealStart < 26 * DEAL_STEP + DEAL_FLIGHT) animateDeal();
    syncTitle();
    const log = $('#log');
    if (log) log.scrollTop = log.scrollHeight;
  }

  // A switch. The brass tile slides to whichever option is on; the slide is
  // started here rather than left to the markup, so it still runs after the
  // screen has been redrawn around it.
  const switchPos = new Map();
  function seg(name, opts, active, disabled = false) {
    const i = Math.max(0, active);
    return `<div class="seg ${disabled ? 'locked' : ''}" data-seg="${name}" data-i="${i}" style="--seg-n:${opts.length}">${opts
      .map((o, k) => `<button class="${k === i ? 'on' : ''}" ${o.attrs} ${disabled || o.off ? 'disabled' : ''}>${o.label}</button>`)
      .join('')}</div>`;
  }
  // Where the tile belongs, taken off the button itself. The options are all
  // the same width wherever there is room for them to be, but on a narrow
  // screen a long label keeps its own width, and then a fraction of the box
  // would leave the tile lying across the gap between two words.
  function placeTile(el, i) {
    const btn = el.children[i];
    if (!btn) return;
    el.style.setProperty('--seg-i', i);
    el.style.setProperty('--seg-x', `${btn.offsetLeft}px`);
    el.style.setProperty('--seg-w', `${btn.offsetWidth}px`);
  }
  function settleSwitches() {
    document.querySelectorAll('.seg[data-seg]').forEach((el) => {
      const key = el.dataset.seg;
      const to = Number(el.dataset.i) || 0;
      const from = switchPos.has(key) ? switchPos.get(key) : to;
      switchPos.set(key, to);
      placeTile(el, from);
      if (from === to) return;
      requestAnimationFrame(() => requestAnimationFrame(() => placeTile(el, to)));
    });
  }

  // A menu, in the same brass and ink as everything around it.
  function dropdown(name, opts, value, disabled = false) {
    const open = ui.openMenu === name && !disabled;
    const cur = opts.find((o) => o.value === value) || opts[0];
    const options = opts
      .map(
        (o) => `<li class="dd-opt ${o.value === value ? 'on' : ''}" role="option" aria-selected="${o.value === value}"
            data-action="dd-pick" data-dd="${name}" data-value="${esc(o.value)}">${esc(o.label)}</li>`,
      )
      .join('');
    return `
      <div class="dropdown ${open ? 'open' : ''}" data-dd="${name}">
        <button class="dd-btn" type="button" data-action="dd-toggle" data-dd="${name}" ${disabled ? 'disabled' : ''}
                aria-haspopup="listbox" aria-expanded="${open}">
          <span class="dd-value">${esc(cur ? cur.label : '')}</span><span class="dd-caret"></span>
        </button>
        ${open ? `<ul class="dd-menu" role="listbox">${options}</ul>` : ''}
      </div>`;
  }

  function topbar(extra = '') {
    const code = state.room.code;
    return `
      <div class="topbar">
        <div class="brand">
          <button type="button" class="logo-btn ${ui.leaveArmed ? 'armed' : ''}" data-action="logo-leave" title="Leave this room">
            <span class="wordmark">Thievery<em>.co.uk</em></span>
          </button>
          <small>Round ${state.room.round || '–'}</small>
        </div>
        <div class="codebox">
          <span class="muted">Room</span>
          <span class="code">${esc(code)}</span>
          <button class="btn small" data-action="copy-link">${CAN_SHARE ? 'Share invite' : 'Copy invite link'}</button>
          ${extra}
        </div>
      </div>
      ${testBar()}`;
  }

  // Playing on your own: pick which seat to act as.
  function testBar() {
    if (!state.room.test) return '';
    const me = state.you.seat;
    const g = state.game;
    const seats = state.room.players
      .slice()
      .sort((a, b) => a.seat - b.seat)
      .map((p) => {
        const turn = g && g.phase === 'play' && g.turn === p.seat;
        return `<button class="btn small ${p.seat === me ? 'primary' : ''}" data-action="test-switch" data-seat="${p.seat}">
          ${p.seat + 1}. ${esc(p.name)}${turn ? ' ●' : ''}
        </button>`;
      });
    return `
      <div class="testbar">
        <span class="pill bad">Test mode</span>
        <span class="muted">Acting as:</span>
        ${seats.join('')}
      </div>`;
  }

  function tallyPanel() {
    const rows = Object.values(state.tally || {}).sort((a, b) => b.wins - a.wins);
    if (!rows.length) return '';
    return `
      <div class="panel">
        <h3>Wins this session</h3>
        <div class="tally">
          ${rows.map((r) => `<div><span>${esc(r.name)}</span><span class="wins">${r.wins}</span></div>`).join('')}
        </div>
      </div>`;
  }

  function handTotal(r) {
    return (r.hands || []).reduce((a, n) => a + (n || 0), 0);
  }

  const playersAt = (r, seat) => r.players.filter((p) => p.seat === seat);
  // A hand with two people at it takes a plural verb.
  const isAre = (seat) => (playersAt(state.room, seat).length > 1 ? 'are' : 'is');
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  // -- lobby --
  // The table is a row of hands, not a row of people. The first three or four
  // arrivals take a hand each; anybody after that joins somebody already
  // seated, and the two of them play that hand together.
  function renderLobby() {
    const r = state.room;
    const me = state.you;
    const isHost = r.hostId === me.id;
    const teamsOn = r.seats === 4 && r.teams;
    // Bots do not take up a person's place: they hand their hand back rather
    // than keep anybody out, so the room is only full of people. Anybody who
    // arrived mid-round is holding a place rather than a hand, and is counted
    // for the room but seated nowhere until the next deal.
    const queue = r.players.filter((p) => p.waiting);
    const folk = r.players.filter((p) => !p.bot && !p.waiting);
    const full = folk.length >= r.maxPlayers;
    // Where the next person through the door will end up.
    const nextSeat = full ? -1 : folk.length % r.seats;

    // A bot holds its hand and nothing else: it cannot be moved around the
    // table, so it gets no arrows and takes no part in a swap.
    const occupant = (p) => {
      const isMe = p.id === me.id;
      const i = folk.indexOf(p);
      const above = folk[i - 1];
      const below = folk[i + 1];
      const pills = [
        isMe ? '<span class="pill">You</span>' : '',
        p.id === r.hostId ? '<span class="pill accent">Host</span>' : '',
        p.bot ? `<span class="pill bot">${BOT_LEVEL_LABEL[r.botLevel] || 'Bot'}</span>` : '',
      ].join(' ');
      const movable = isHost && !p.bot;
      return `
        <div class="occupant ${ui.swapPick === p.id ? 'selected' : ''} ${movable ? 'pick' : ''}"
             ${movable ? `data-action="pick-swap" data-id="${p.id}"` : ''}>
          <span class="dot ${p.bot ? 'bot' : p.connected ? '' : 'off'}"></span>
          <span class="name">${esc(p.name)} ${pills}</span>
          ${
            movable
              ? `<span class="order">
                  <button class="btn small ghost" data-action="move" data-a="${p.id}" data-b="${above?.id || ''}" ${above ? '' : 'disabled'} title="Move up">&#9650;</button>
                  <button class="btn small ghost" data-action="move" data-a="${p.id}" data-b="${below?.id || ''}" ${below ? '' : 'disabled'} title="Move down">&#9660;</button>
                </span>`
              : ''
          }
          ${isHost && !isMe ? `<button class="btn small ghost" data-action="kick" data-id="${p.id}" title="${p.bot ? 'Send it home' : 'Remove'}">&#10005;</button>` : ''}
        </div>`;
    };

    const seats = [];
    for (let i = 0; i < r.seats; i++) {
      const here = playersAt(r, i);
      const badges = [
        teamsOn ? `<span class="pill team-${i % 2}">Team ${i % 2 === 0 ? 'A' : 'B'}</span>` : '',
        r.firstSeat === i ? '<span class="pill accent">Leads</span>' : '',
        here.length > 1 ? '<span class="pill">Shared</span>' : '',
      ].join(' ');
      const hand = r.customDeal
        ? isHost
          ? `<input class="hand" type="number" min="1" max="24" value="${r.hands?.[i] ?? ''}" data-change="hand-size" data-seat="${i}" title="Cards dealt to hand ${i + 1}" />`
          : `<span class="pill">${r.hands?.[i] ?? '?'} cards</span>`
        : '';
      // An open half of a seat is only called out where the next arrival will
      // actually land, so the list does not read as a row of gaps — and a hand
      // the house is holding is handed over rather than shared.
      let open = '';
      const sharingNext = i === nextSeat && here.length && !here.some((p) => p.bot);
      if (!here.length) {
        open = `<div class="occupant open">
            <span>Waiting for a player${DOTS}</span>
            ${isHost ? `<button class="btn small" data-action="add-bot" data-seat="${i}">Deal the house in</button>` : ''}
          </div>`;
      } else if (sharingNext) {
        open = `<div class="occupant open"><span>The next to join shares this hand${DOTS}</span></div>`;
      } else if (i === nextSeat) {
        open = `<div class="occupant open"><span>The next to join takes this hand back off the house${DOTS}</span></div>`;
      }
      seats.push(`
        <li class="${here.length ? '' : 'empty'}">
          <span class="seat">${i + 1}</span>
          <div class="occupants">${here.map(occupant).join('')}${open}</div>
          ${badges}
          ${hand}
        </li>`);
    }

    const ready = r.players.length >= r.seats;
    const short = r.seats - r.players.length;
    const spare = r.maxPlayers - folk.length;
    const host = r.players.find((p) => p.id === r.hostId);

    return `
      ${topbar('<button class="btn small ghost" data-action="leave">Leave</button>')}
      <div class="lobby">
        <div style="display:flex;flex-direction:column;gap:18px">
          ${
            me.waiting
              ? `<div class="panel waiting-note">
                   <h2>You are in &mdash; dealt next round</h2>
                   <p class="panel-note lead">
                     A round is already being played and its cards are dealt, so there is no hand to give you
                     until it finishes. You have a place at this table and will be dealt in the moment it does.
                     Nothing of the round in progress is sent to you in the meantime.
                   </p>
                 </div>`
              : ''
          }
          <div class="panel big-code">
            <div class="muted" style="margin-bottom:8px">Share this code</div>
            <span class="code">${esc(r.code)}</span>
            <p>Friends can join at <b>${esc(location.host)}</b> with this code, or use the invite link.</p>
          </div>
          <div class="panel">
            <h2>Players <span class="muted">(${r.players.length}/${r.maxPlayers})</span><span class="panel-sub">hand order is the order of play</span></h2>
            <ul class="players">${seats.join('')}</ul>
            <p class="panel-note">
              ${r.seats} hands are dealt. The first ${r.seats} players get one each; anyone after that joins a player already seated, and the pair share that hand &mdash; they see the same cards, and either of them can guess when their turn comes.
            </p>
            ${
              r.powerUps
                ? `<p class="panel-note">
                     At ${r.seats} hands the same 26 cards are spread ${SPLIT_LABEL[r.seats]}, so every row is short and there is far less to fence a hidden card in with. That is why this size is dealt with <b>power-ups</b> &mdash; one drawn at the start of each of your turns, three in hand at most &mdash; to hand back the reading the short rows take away, and to give the table a way to cut somebody's run short. There is no switching them off at this size.
                   </p>
                   <p class="panel-note">
                     Five and six are still ${r.seats} hands rather than ${r.seats} people: everyone can have a hand of their own, and anyone past the ${r.seats === 5 ? 'fifth' : 'sixth'} doubles up exactly as they would at a smaller table. A shared hand shares its power-ups too.
                   </p>`
                : ''
            }
            ${
              queue.length
                ? `<p class="panel-note">Waiting for the next deal: ${queue.map((p) => esc(p.name)).join(', ')}. They have places here and take hands when this round ends.</p>`
                : ''
            }
            <p class="panel-note">
              A hand nobody has taken can go to the house instead, so one or two of you can still play a full table. Bots never share a hand, and give theirs up the moment a person arrives to want it.
            </p>
            ${
              r.customDeal
                ? `<p class="panel-note">Hand sizes: ${handTotal(r)} of 26 cards${handTotal(r) === 26 ? '' : ' (must add up to 26)'}.</p>`
                : ''
            }
            ${
              isHost
                ? `<p class="panel-note">Use the arrows to change the order of play, or click two players to swap them &mdash; that is also how you choose who shares with whom.${
                    teamsOn ? ' Hands 1 &amp; 3 are Team A, 2 &amp; 4 are Team B.' : ''
                  }</p>`
                : ''
            }
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:18px">
          <div class="panel settings">
            <h2>Settings</h2>
            <div class="setting">
              <div><div class="label">Hands</div><div class="hint">${
                r.powerUps
                  ? `${SPLIT_LABEL[r.seats]} &middot; dealt with power-ups &middot; room for ${r.seats * 2} players`
                  : `26 cards between them &middot; room for ${r.seats * 2} players`
              }</div></div>
              ${seg(
                'seats',
                SEAT_COUNTS.map((m) => ({ label: m, attrs: `data-action="seats" data-seats="${m}"` })),
                SEAT_COUNTS.indexOf(r.seats),
                !isHost,
              )}
            </div>
            <div class="setting">
              <div><div class="label">Partnerships</div><div class="hint">${
                r.seats === 4 ? 'Hands 1 &amp; 3 play against hands 2 &amp; 4' : 'Only at a table of four hands'
              }</div></div>
              ${seg(
                'teams',
                [
                  { label: 'Solo', attrs: 'data-action="teams" data-teams="0"' },
                  { label: 'Teams', attrs: 'data-action="teams" data-teams="1"' },
                ],
                teamsOn ? 1 : 0,
                !(isHost && r.seats === 4),
              )}
            </div>
            <div class="setting">
              <div><div class="label">Deal</div><div class="hint">${
                r.customDeal ? 'You choose how many cards each hand gets' : `A random ${SPLIT_LABEL[r.seats]} split every round`
              }</div></div>
              ${seg(
                'deal',
                [
                  { label: 'Random', attrs: 'data-action="deal" data-custom="0"' },
                  { label: 'Custom', attrs: 'data-action="deal" data-custom="1"' },
                ],
                r.customDeal ? 1 : 0,
                !isHost,
              )}
            </div>
            <div class="setting">
              <div><div class="label">The house</div><div class="hint">${BOT_LEVEL_HINT[r.botLevel]}</div></div>
              ${seg(
                'botLevel',
                BOT_LEVELS.map((l) => ({ label: BOT_LEVEL_LABEL[l], attrs: `data-action="bot-level" data-level="${l}"` })),
                BOT_LEVELS.indexOf(r.botLevel),
                !isHost,
              )}
            </div>
            <div class="setting">
              <div><div class="label">First to play</div><div class="hint">${
                r.firstSeat !== null ? 'The same hand leads every round' : 'Chosen at random, then round the table'
              }</div></div>
              ${dropdown(
                'first',
                [
                  { value: '', label: 'Rotate' },
                  ...Array.from({ length: r.seats }, (_, i) => ({
                    value: String(i),
                    label: `${i + 1}. ${playersAt(r, i).map((p) => p.name).join(' & ') || 'Empty'}`,
                  })),
                ],
                r.firstSeat === null || r.firstSeat === undefined ? '' : String(r.firstSeat),
                !isHost,
              )}
            </div>
            ${
              isHost
                ? `<div class="lobby-actions">
                    <button class="btn" data-action="shuffle">Shuffle seats</button>
                    <button class="btn primary" data-action="start" ${ready ? '' : 'disabled'}>Start game</button>
                  </div>
                  <div class="panel-note">${
                    ready
                      ? spare > 0
                        ? `Ready when you are &mdash; or hold on: ${plural(spare, 'more player')} can still join${
                            folk.length < r.players.length ? ', the first of them taking a hand back off the house' : ' and share a hand'
                          }.`
                        : 'The table is full. Deal them in.'
                      : `Waiting for ${plural(short, 'more player')}, or deal the house into ${
                          short === 1 ? 'the empty hand' : 'the empty hands'
                        }${DOTS}`
                  }</div>`
                : `<div class="panel-note lead">${esc(host?.name || 'The host')} will start the game${
                    ready ? '' : ` once ${plural(r.seats, 'player')} are here`
                  }.</div>`
            }
          </div>
          ${tallyPanel()}
        </div>
      </div>`;
  }

  // -- game --
  function renderGame() {
    const g = state.game;
    const me = state.you.seat;
    const order = [];
    for (let k = 1; k <= g.numSeats; k++) order.push((me + k) % g.numSeats); // me last (bottom)

    return `
      ${topbar(g.phase === 'ended' ? '<button class="btn small ghost" data-action="leave">Leave</button>' : '')}
      <div class="game">
        <div class="table ${ui.target ? 'picking' : ''}">${order.map((si) => seatRow(si)).join('')}</div>
        <div class="side">
          <div class="panel action ${g.phase === 'ended' && g.result.winners.includes(me) ? 'celebrate' : ''}">${actionPanel()}</div>
          ${powerPanel()}
          ${tallyPanel()}
          <div class="panel">
            <h3>Log</h3>
            <div class="log" id="log">
              ${g.log.map((e) => `<div class="${e.kind || ''} ${e.priv ? 'priv' : ''}">${esc(e.text)}</div>`).join('')}
            </div>
          </div>
        </div>
      </div>`;
  }

  function stepLabel(g) {
    return { show: 'being shown a card', guess: 'guessing' }[g.step] || '';
  }

  // Whose turn comes after this one. A hand with nothing left to hide has no
  // turn of its own any more and is skipped, exactly as the rules skip it.
  function nextUp(g) {
    if (g.phase !== 'play') return null;
    for (let k = 1; k <= g.numSeats; k++) {
      const s = (g.turn + k) % g.numSeats;
      if (g.seats[s].cards.some((c) => !c.faceUp)) return s;
    }
    return null;
  }

  function seatRow(si) {
    const g = state.game;
    const me = state.you.seat;
    const s = g.seats[si];
    const mine = si === me;
    const here = playersAt(state.room, si);
    const active = g.phase === 'play' && g.turn === si;
    const down = s.cards.filter((c) => !c.faceUp).length;

    const badges = [];
    if (mine) badges.push('<span class="pill">You</span>');
    // At five and six hands the order of play is worth stating rather than
    // counting: a row outlined as active says whose turn it is and nothing
    // about whose it is about to be.
    if (!active && si === nextUp(g)) badges.push('<span class="pill next">Next</span>');
    if (g.teams) badges.push(`<span class="pill team-${s.team}">Team ${s.team === 0 ? 'A' : 'B'}</span>`);
    if (g.teams && g.partnerSeat === si) badges.push('<span class="pill accent">Partner</span>');
    if (here.length > 1) badges.push('<span class="pill">Shared hand</span>');
    if (here.some((p) => p.bot)) badges.push(`<span class="pill bot">${BOT_LEVEL_LABEL[state.room.botLevel] || 'Bot'} bot</span>`);
    // A hand with two players at it is only unattended once both have gone.
    const away = here.filter((p) => !p.connected && !p.bot);
    if (here.length && away.length === here.length) badges.push('<span class="pill bad">Offline</span>');
    else for (const p of away) badges.push(`<span class="pill bad">${esc(p.name)} offline</span>`);
    const pu = g.powerUps;
    if (pu && pu.shielded[si]) badges.push('<span class="pill watch">Stakeout</span>');
    if (pu && pu.forcedAll[si] !== null && pu.forcedAll[si] !== undefined) {
      badges.push(`<span class="pill watch">Sent after ${esc(g.names[pu.forcedAll[si]])}</span>`);
    }
    const ended = g.phase === 'ended';
    const won = ended && g.result.winners.includes(si);
    const lost = ended && g.result.losers.includes(si);
    if (won) badges.push('<span class="pill accent">Winner</span>');

    let status = '';
    const house = here.some((p) => p.bot);
    if (g.phase === 'arrange') status = s.locked ? 'Locked in' : mine ? 'Arrange your cards' : `Arranging${DOTS}`;
    else if (g.phase === 'play') status = active ? (house && g.step === 'guess' ? `Thinking${DOTS}` : stepLabel(g)) : `${down} face down`;
    else status = `${down} face down`;

    let cards;
    if (g.phase === 'arrange' && mine && !s.locked) {
      cards = arrangeCards(s.cards);
    } else {
      cards = s.cards.map((c, ci) => cardEl(c, si, ci, cardOpts(si, ci, c))).join('');
    }

    return `
      <div class="seat-row ${active ? 'active' : ''} ${mine ? 'me' : ''} ${won ? 'winner' : ''} ${lost ? 'loser' : ''}">
        <div class="seat-head">
          <span class="faint">${si + 1}</span>
          <span class="name">${esc(g.names[si])}</span>
          ${badges.join(' ')}
          <span class="status">${status}</span>
        </div>
        <div class="cards indexed">${cards}</div>
      </div>`;
  }

  // --- what a card cannot be -----------------------------------------------
  //
  // Every miss is said out loud at the table and written into the log, and
  // there is exactly one card of each rank in each colour. Between them that
  // rules certain ranks out of certain cards for everybody, and the house has
  // always played on it — `readTable` in bot.js gathers up precisely this.
  // A person had to scroll the log for it, which in practice meant guessing a
  // rank the whole table already knew was wrong.
  //
  // The fence is deliberately *not* in here. Working out what the cards either
  // side of a hidden one allow is the game itself; doing that for people would
  // leave them nothing to play.

  // Which ranks have already missed at this exact card, as their labels.
  function missesAt(seat, idx) {
    return (state.game.misses || [])
      .filter(([s, i]) => s === seat && i === idx)
      .map(([, , rank]) => RANKS[rank - 1]);
  }

  // And the whole of it, as rank numbers, for the card being guessed at.
  function ruledOut(target) {
    const g = state.game;
    const out = new Set();
    const card = g.seats[target.seat] && g.seats[target.seat].cards[target.idx];
    if (!card) return out;
    // Somebody has shown us this one, or we cased it. Then we know, and every
    // other rank is out.
    if (card.rank) {
      for (let r = 1; r <= 13; r++) if (r !== card.rank) out.add(r);
      return out;
    }
    for (const [seat, idx, rank] of g.misses || []) {
      if (seat === target.seat && idx === target.idx) out.add(rank);
    }
    // One card of each rank in each colour: a card of this colour whose rank
    // we can already see is a rank this card cannot be. Our own hand counts,
    // and so does anything a partner has shown us.
    g.seats.forEach((s, si) => {
      s.cards.forEach((c, ci) => {
        if (si === target.seat && ci === target.idx) return;
        if (c.rank && c.color === card.color) out.add(c.rank);
      });
    });
    return out;
  }

  function cardOpts(si, ci, c) {
    const g = state.game;
    const me = state.you.seat;
    const opts = { mine: si === me, index: true };
    // Carried on every face-down card that is not ours, whosever turn it is:
    // it is the table's knowledge, not the active player's.
    if (!opts.mine && !c.faceUp && g.phase !== 'arrange') {
      const no = missesAt(si, ci);
      if (no.length) opts.ruled = no;
    }
    if (g.phase !== 'play' || c.faceUp) return opts;
    const myTurn = g.turn === me;
    // A power-up waiting on a card takes over the table: only the cards it
    // could legally be pointed at light up.
    const want = ui.pu ? puWants() : null;
    if (want === 'card') {
      // A vault cannot be cracked through a stakeout, so that hand does not
      // light up: the server refuses it either way, and a lit card that comes
      // back as an error message is a card that should not have been lit.
      const watched = ui.pu.id === 'vault_crack' && g.powerUps && g.powerUps.shielded[si];
      if (si !== me && !watched) opts.selectable = true;
      return opts;
    }
    if (want === 'ownCard') {
      if (si === me) opts.selectable = true;
      return opts;
    }
    if (ui.pu) return opts;
    if (g.step === 'show' && g.partnerSeat === g.turn && si === me) opts.selectable = true;
    if (g.step === 'guess' && myTurn && g.seats[si].team !== g.seats[me].team) {
      const pu = g.powerUps;
      // A hand under a stakeout is nobody's to shoot at until it plays again,
      // and a hand that has been sent somewhere may only shoot there. Both
      // are refused by the server either way; leaving the cards lit would only
      // invite a click that comes back as an error.
      const watched = pu && pu.shielded[si];
      const sentElsewhere = pu && pu.forced !== null && pu.forced !== undefined && pu.forced !== si;
      if (!watched && !sentElsewhere) {
        opts.selectable = true;
        if (ui.target && ui.target.seat === si && ui.target.idx === ci) opts.selected = true;
      }
    }
    return opts;
  }

  function cardEl(c, si, ci, opts = {}) {
    const cls = ['card', c.color || 'unknown', c.faceUp ? 'faceup' : 'down'];
    if (opts.mine) cls.push('mine');
    if (opts.draggable) cls.push('draggable');
    if (opts.dragging) cls.push('dragging');
    if (c.shown) cls.push('shown');
    if (opts.selectable) cls.push('selectable');
    if (opts.selected) cls.push('selected');
    if (opts.target) cls.push('target');
    const rank = c.rank ? RANKS[c.rank - 1] : '';
    const ruled = opts.ruled && opts.ruled.length
      ? `<span class="ruled" title="Ruled out already: ${esc(opts.ruled.join(', '))}">${opts.ruled.length}</span>`
      : '';
    const title = c.shown
      ? 'Shown to you by your partner'
      : opts.ruled && opts.ruled.length
        ? `Not ${opts.ruled.join(', not ')}`
        : '';
    // A card you can act on has to be reachable from a keyboard as well as
    // from a pointer, so it is announced as a button and can be tabbed to.
    // The label is what a card actually is to somebody who cannot see it: a
    // colour, a place in the row, and whatever the table has ruled out.
    const reachable = opts.selectable || opts.draggable;
    const label = c.faceUp
      ? `${rank} of ${c.color}, face up`
      : `${opts.mine || c.shown ? `${rank}, ` : ''}${c.color || 'unknown'} card, position ${ci + 1}${
          opts.ruled && opts.ruled.length ? `, ruled out: ${opts.ruled.join(', ')}` : ''
        }`;
    return `<div class="${cls.join(' ')}" data-action="card" data-seat="${si}" data-idx="${ci}" ${opts.draggable ? `data-id="${c.id}"` : ''}
      ${reachable ? 'role="button" tabindex="0"' : ''} aria-label="${esc(label)}" title="${esc(title)}">
      <span class="rank">${rank}</span><i class="gloss"></i>${ruled}${opts.index ? `<span class="idx">${ci + 1}</span>` : ''}
    </div>`;
  }

  function arrangeCards(cards) {
    if (!ui.arrange) ui.arrange = cards.map((c) => c.id);
    const byId = new Map(cards.map((c) => [c.id, c]));
    return ui.arrange
      .map((id, i) => cardEl(byId.get(id), state.you.seat, i, { mine: true, index: true, draggable: true, dragging: id === drag.id && drag.active }))
      .join('');
  }

  // Aces go anywhere, everything else ascending — the same rule the table uses.
  function legalOrder(ids, byId) {
    const nonAces = ids.map((id) => byId.get(id)).filter((c) => c.rank !== 1);
    for (let i = 1; i < nonAces.length; i++) if (nonAces[i].rank < nonAces[i - 1].rank) return false;
    return true;
  }

  // --- the feel of a card --------------------------------------------------
  // A card you can act on leans towards the pointer and catches the light.
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function setTilt(el, px, py) {
    el.style.setProperty('--ry', `${((px - 0.5) * 30).toFixed(1)}deg`);
    el.style.setProperty('--rx', `${((0.5 - py) * 30).toFixed(1)}deg`);
    el.style.setProperty('--gx', `${(px * 100).toFixed(0)}%`);
    el.style.setProperty('--gy', `${(py * 100).toFixed(0)}%`);
  }
  function clearTilt(el) {
    for (const p of ['--rx', '--ry', '--gx', '--gy']) el.style.removeProperty(p);
  }
  $('#app').addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || drag.id) return;
    const el = e.target.closest('.card.selectable, .card.draggable, .card.selected');
    if (!el) return;
    const r = el.getBoundingClientRect();
    setTilt(el, clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1));
  });
  $('#app').addEventListener(
    'pointerout',
    (e) => {
      const el = e.target.closest('.card');
      if (el && !el.contains(e.relatedTarget)) clearTilt(el);
    },
    true,
  );

  // --- dragging a card into place (mouse or finger) -------------------------
  const drag = { id: null, el: null, clone: null, active: false, startX: 0, startY: 0, offX: 0, offY: 0, lastX: 0, lastY: 0, settle: 0 };

  function startDrag() {
    const r = drag.el.getBoundingClientRect();
    const clone = drag.el.cloneNode(true);
    clone.classList.add('drag-clone');
    clone.classList.remove('dragging');
    clone.querySelector('.idx')?.remove();
    clone.style.width = `${r.width}px`;
    clone.style.height = `${r.height}px`;
    document.body.appendChild(clone);
    drag.clone = clone;
    drag.active = true;
    render();
  }

  function moveClone(e) {
    const clone = drag.clone;
    clone.style.left = `${e.clientX - drag.offX}px`;
    clone.style.top = `${e.clientY - drag.offY}px`;
    // The card swings with the motion, like it's being carried, then settles.
    const vx = e.clientX - drag.lastX;
    const vy = e.clientY - drag.lastY;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    clone.style.setProperty('--ry', `${clamp(vx * 2.2, -35, 35).toFixed(1)}deg`);
    clone.style.setProperty('--rx', `${clamp(-vy * 2.2, -35, 35).toFixed(1)}deg`);
    clearTimeout(drag.settle);
    drag.settle = setTimeout(() => {
      if (drag.clone) {
        drag.clone.style.setProperty('--ry', '0deg');
        drag.clone.style.setProperty('--rx', '0deg');
      }
    }, 90);
  }

  function reorderAt(x, y) {
    const g = state.game;
    const cards = g.seats[state.you.seat].cards;
    const byId = new Map(cards.map((c) => [c.id, c]));
    const els = [...document.querySelectorAll('.seat-row.me .card.draggable')].filter((el) => el.dataset.id !== drag.id);
    if (!els.length) return;
    // The card lands beside whichever neighbour it is nearest, on the side the
    // pointer is on.
    let nearest = null;
    let best = Infinity;
    let before = false;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = Math.hypot(x - cx, (y - cy) * 2);
      if (d < best) {
        best = d;
        nearest = el;
        before = x < cx;
      }
    }
    const others = ui.arrange.filter((id) => id !== drag.id);
    const slot = others.indexOf(nearest.dataset.id) + (before ? 0 : 1);
    const next = [...others];
    next.splice(slot, 0, drag.id);
    if (next.join() === ui.arrange.join()) return;
    if (!legalOrder(next, byId)) return; // a spot the rules forbid: the row just doesn't move
    ui.arrange = next;
    render();
  }

  function endDrag() {
    if (!drag.id) return;
    drag.clone?.remove();
    const wasActive = drag.active;
    drag.id = null;
    drag.el = null;
    drag.clone = null;
    drag.active = false;
    if (wasActive) render();
  }

  $('#app').addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.card.draggable');
    if (!el || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const r = el.getBoundingClientRect();
    drag.id = el.dataset.id;
    drag.el = el;
    drag.active = false;
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    drag.offX = e.clientX - r.left;
    drag.offY = e.clientY - r.top;
    e.preventDefault();
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag.id) return;
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 5) return;
      startDrag();
    }
    moveClone(e);
    reorderAt(e.clientX, e.clientY);
  });
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  // --- power-ups -----------------------------------------------------------
  //
  // Five and six hands are dealt with these; smaller tables never see any of
  // this. Playing one is a little conversation: pick it, then nominate
  // whatever it needs — a card, a rank, a hand, somebody to send somewhere —
  // and it goes the moment the last of those is answered. `ui.pu` is where
  // that half-finished conversation lives.

  const puCard = (id) => catalog && catalog[id];

  // What the power-up being played still wants nominated, in order.
  function puWants() {
    if (!ui.pu) return null;
    const card = puCard(ui.pu.id);
    if (!card) return null;
    return card.targets.find((t) => ui.pu.picked[t] === undefined) || null;
  }

  function puBegin(id) {
    const card = puCard(id);
    if (!card) return;
    ui.pu = { id, picked: {} };
    // Nothing to nominate: it goes straight out.
    if (!card.targets.length) return puSend();
    render();
  }

  function puPick(what, value) {
    if (!ui.pu) return;
    ui.pu.picked[what] = value;
    if (!puWants()) return puSend();
    render();
  }

  function puSend() {
    const { id, picked } = ui.pu;
    const opts = {};
    if (picked.card) opts.target = picked.card;
    if (picked.ownCard !== undefined) opts.idx = picked.ownCard;
    if (picked.rank !== undefined) opts.rank = picked.rank;
    if (picked.hand !== undefined) opts.hand = picked.hand;
    if (picked.player !== undefined) opts.player = picked.player;
    ui.pu = null;
    send({ type: 'powerup', id, opts });
    render();
  }

  // The hands somebody can be pointed at, as buttons. Used for both 'hand'
  // and 'player', because a player is named here by the hand they are at.
  function handButtons(what, { allowSelf = false, exclude = [] } = {}) {
    const g = state.game;
    const me = state.you.seat;
    const pu = g.powerUps;
    const list = [];
    for (let si = 0; si < g.numSeats; si++) {
      if (!allowSelf && si === me) continue;
      if (exclude.includes(si)) continue;
      // Why this hand is not on offer, if it is not. A pickpocket is the only
      // one of these the rules can refuse outright, and offering a hand that
      // will come back as an error is offering nothing.
      let no = null;
      if (what === 'hand' && ui.pu && ui.pu.id === 'pickpocket') {
        if (pu && pu.shielded[si]) no = 'Under a stakeout until they play again';
        else if (!g.seats[si].cards.some((c) => !c.faceUp)) no = 'Every card in that hand is face up';
      }
      list.push(
        `<button class="btn small" data-action="pu-hand" data-what="${what}" data-seat="${si}"
                 ${no ? `disabled title="${esc(no)}"` : ''}>${esc(g.names[si])}</button>`,
      );
    }
    return `<div class="actions-row wrap">${list.join('')}</div>`;
  }

  // The side panel: what this hand is carrying, and what it may play now.
  function powerPanel() {
    const g = state.game;
    if (!g.powered || !g.powerUps || !catalog) return '';
    const p = g.powerUps;
    const me = state.you.seat;
    const myTurn = g.turn === me && g.step === 'guess' && g.phase === 'play';

    const held = p.kit.map((id) => {
      const c = puCard(id);
      if (!c) return '';
      // The alarm is the one you can pull when it is not your turn.
      const playable =
        g.phase === 'play' && (id === 'alarm_trip' ? p.chain > 0 : myTurn && !ui.pu);
      const chosen = ui.pu && ui.pu.id === id;
      return `
        <button class="pu ${c.tier} ${playable ? '' : 'idle'} ${chosen ? 'chosen' : ''}"
                data-action="pu-play" data-id="${id}" ${playable ? '' : 'disabled'}>
          <span class="pu-tier">${esc(c.tierLabel)}</span>
          <span class="pu-name">${esc(c.name)}</span>
          <span class="pu-blurb">${esc(c.blurb)}</span>
        </button>`;
    }).join('');

    const empty = '<p class="sub">Nothing in hand. You draw one at the start of your turn.</p>';
    const chain = p.chain > 1
      ? `<p class="pu-chain">${esc(g.names[g.turn])} ${plural(p.chain, 'card')} into a run.</p>`
      : '';

    return `
      <div class="panel powerups">
        <h3>Power-ups <span class="faint">${p.kit.length}/${p.limit}</span></h3>
        ${chain}
        ${p.kit.length ? `<div class="pu-hand">${held}</div>` : empty}
        ${p.spare ? `<p class="sub">${plural(p.spare, 'wrong guess')} will not end your turn.</p>` : ''}
      </div>`;
  }

  // What the action panel says while a power-up is waiting on a nomination.
  function puPrompt() {
    const g = state.game;
    const card = puCard(ui.pu.id);
    const want = puWants();
    const cancel = '<div class="actions-row"><button class="btn ghost" data-action="pu-cancel">Put it back</button></div>';
    const head = `<p class="prompt">${esc(card.name)}</p>`;

    if (want === 'card') {
      return `${head}<p class="sub">Click any face-down card that is not your own.</p>${cancel}`;
    }
    if (want === 'ownCard') {
      return `${head}<p class="sub">Click one of your own face-down cards to show it.</p>${cancel}`;
    }
    if (want === 'rank') {
      return `${head}<p class="sub">Name the rank to listen for.</p>${rankButtons()}${cancel}`;
    }
    if (want === 'player') {
      const already = ui.pu.picked.hand === undefined ? [] : [ui.pu.picked.hand];
      return `${head}<p class="sub">${ui.pu.id === 'tip_off' ? 'Who should see it?' : 'Whose next guess are you sending?'}</p>${handButtons('player', { exclude: already })}${cancel}`;
    }
    if (want === 'hand') {
      const already = ui.pu.picked.player === undefined ? [] : [ui.pu.picked.player];
      const what = { pickpocket: 'Whose pocket?', stakeout: 'Which hand are you watching?', misdirection: 'Send them after which hand?' }[ui.pu.id];
      return `${head}<p class="sub">${esc(what || 'Pick a hand.')}</p>${handButtons('hand', { allowSelf: ui.pu.id === 'misdirection', exclude: already })}${cancel}`;
    }
    return `${head}${cancel}`;
  }

  // The row of ranks. Given a card, the ones the table has already ruled out
  // are shown struck through and refused; a power-up asking for a rank gets
  // the plain row, because "how many Jacks are left" is a fair question
  // whatever has already missed where.
  function rankButtons(target = null) {
    const out = target ? ruledOut(target) : new Set();
    return `<div class="ranks">${RANKS.map((r, i) => {
      const rank = i + 1;
      if (!out.has(rank)) return `<button data-action="rank" data-rank="${rank}">${r}</button>`;
      return `<button class="out" disabled title="Already ruled out">${r}</button>`;
    }).join('')}</div>`;
  }

  function actionPanel() {
    const g = state.game;
    const me = state.you.seat;
    const n = (s) => `<b>${esc(g.names[s])}</b>`;
    // The same, possessive. Taken from the name rather than from the markup,
    // which ends in a tag and never in an s.
    const nOwn = (s) => `<b>${esc(possessive(g.names[s]))}</b>`;
    const isHost = state.room.hostId === state.you.id;
    // Two people, one hand: worth saying out loud, because neither of them has
    // to wait for the other.
    const mate = playersAt(state.room, me).find((p) => p.id !== state.you.id);
    const shared = mate
      ? `<p class="sub">You and <b>${esc(mate.name)}</b> share this hand. You both see the same cards, and either of you can play it.</p>`
      : '';

    if (g.phase === 'arrange') {
      if (g.seats[me].locked) {
        const waiting = g.seats.map((s, i) => (s.locked ? null : g.names[i])).filter(Boolean);
        return `<p class="prompt">Locked in.</p><p class="sub">Waiting for ${esc(waiting.join(', '))}${DOTS}</p>${shared}`;
      }
      return `
        <p class="prompt">Arrange your cards</p>
        <p class="sub">Drag your cards into ascending order. Two cards of the same rank can go either way round, and an ace may sit anywhere; the row refuses any position the rules do not allow. Everyone will see your colours, never your ranks.</p>
        ${shared}
        <div class="actions-row">
          <button class="btn primary" data-action="lock">Lock in</button>
          <button class="btn ghost" data-action="reset-order">Reset</button>
        </div>`;
    }

    if (g.phase === 'ended') {
      const r = g.result;
      const cls = r.winners.includes(me) ? 'win' : r.losers.includes(me) ? 'lose' : '';
      const headline = r.winners.includes(me) ? 'You win' : r.losers.includes(me) ? 'Busted' : 'Round over';
      return `
        <div class="result ${cls}">
          ${cls === 'win' ? '<p class="ornament">◆ ◇ ◆</p>' : ''}
          <p class="headline">${headline}</p>
          <p class="muted">${esc(r.text)}</p>
          ${cls === 'win' ? '<p class="ornament">◆ ◇ ◆</p>' : ''}
        </div>
        ${
          isHost
            ? `<div class="actions-row">
                <button class="btn primary" data-action="new-round">New round</button>
                <button class="btn" data-action="to-lobby">Back to lobby</button>
              </div>`
            : `<p class="sub" style="text-align:center;margin-top:10px">Waiting for the host to start a new round${DOTS}</p>`
        }`;
    }

    // phase === 'play'
    // A power-up half-played owns the panel until it is finished or put back.
    if (ui.pu) return puPrompt();

    // Nobody is at the hand the table is waiting on. Left alone this is where
    // an evening ends: everybody sits looking at a row that will not move
    // until a dead phone comes back or the room expires.
    const atTurn = playersAt(state.room, g.turn);
    const turnAway = g.turn !== me && atTurn.length > 0 && atTurn.every((p) => !p.connected && !p.bot);
    if (turnAway) {
      return `
        <p class="prompt">${n(g.turn)} ${isAre(g.turn)} offline</p>
        <p class="sub">The table is waiting on a hand nobody is at. Passing it costs them only the go &mdash; no card turns over and nothing is given away.</p>
        ${
          isHost
            ? '<div class="actions-row"><button class="btn" data-action="pass-turn">Pass their turn</button></div>'
            : '<p class="sub">The host can pass it.</p>'
        }`;
    }

    let body = '';
    const myTurn = g.turn === me;
    if (g.step === 'show') {
      const partner = g.partnerSeat;
      const activePartner = (g.turn + 2) % g.numSeats;
      const partnerAway = playersAt(state.room, activePartner).every((p) => !p.connected);
      if (partner === g.turn) {
        body = `
          <p class="prompt">Show ${n(g.turn)} one of your cards</p>
          <p class="sub">Click a face-down card in your row. Only your partner sees its rank.</p>
          <div class="actions-row"><button class="btn" data-action="skip-show">Show nothing</button></div>`;
      } else if (myTurn) {
        body = `<p class="prompt">Waiting for ${n(activePartner)} to show you a card${DOTS}</p>`;
        if (partnerAway) {
          body += `<div class="actions-row"><button class="btn" data-action="skip-show">Partner is offline — skip</button></div>`;
        }
      } else {
        body = `<p class="prompt">${n(activePartner)} ${isAre(activePartner)} showing ${n(g.turn)} a card${DOTS}</p>`;
      }
    } else if (g.step === 'guess') {
      if (myTurn) {
        if (ui.target) {
          const gone = missesAt(ui.target.seat, ui.target.idx);
          body = `
            <p class="prompt">${nOwn(ui.target.seat)} ${ordinal(ui.target.idx + 1)} card is a…</p>
            ${rankButtons(ui.target)}
            ${gone.length ? `<p class="sub">The table has already heard it is not ${esc(gone.join(', not '))}.</p>` : ''}
            <div class="actions-row"><button class="btn ghost" data-action="cancel-target">Pick a different card</button></div>`;
        } else {
          const pu = g.powerUps;
          const sent = pu && pu.forced !== null && pu.forced !== undefined
            ? `<p class="sub accent">This guess has to go at ${n(pu.forced)}.</p>`
            : '';
          const spare = pu && pu.spare
            ? `<p class="sub accent">${plural(pu.spare, 'wrong guess')} will not end your turn.</p>`
            : '';
          body = `
            <p class="prompt">Your turn: guess a card</p>
            <p class="sub">Click one of ${g.teams ? "your opponents'" : "the other hands'"} face-down cards, then name a rank. Get it right and you go again; get it wrong and the turn simply passes.</p>
            ${sent}${spare}${shared}`;
        }
      } else {
        const house = playersAt(state.room, g.turn).some((p) => p.bot);
        body = `<p class="prompt">${n(g.turn)} ${isAre(g.turn)} ${house ? 'thinking' : 'guessing'}${DOTS}</p>`;
      }
    }

    return body;
  }

  // --- actions -------------------------------------------------------------
  function onCardClick(seat, idx) {
    const g = state.game;
    if (!g || g.phase !== 'play') return;
    const me = state.you.seat;
    const card = g.seats[seat].cards[idx];
    if (!card || card.faceUp) return;
    const want = ui.pu ? puWants() : null;
    if (want === 'card') {
      if (seat === me) return toast('Pick a card that is not your own.');
      return puPick('card', { seat, idx });
    }
    if (want === 'ownCard') {
      if (seat !== me) return toast('Pick one of your own cards.');
      return puPick('ownCard', idx);
    }
    if (ui.pu) return;
    if (g.step === 'show' && g.partnerSeat === g.turn && seat === me) {
      send({ type: 'show', idx });
    } else if (g.step === 'guess' && g.turn === me && g.seats[seat].team !== g.seats[me].team) {
      const pu = g.powerUps;
      if (pu && pu.shielded[seat]) return toast(`${g.names[seat]} is under a stakeout.`);
      if (pu && pu.forced !== null && pu.forced !== undefined && pu.forced !== seat) {
        return toast(`This guess has to go at ${g.names[pu.forced]}.`);
      }
      ui.target = { seat, idx };
      render();
    }
  }

  function act(action, d) {
    if (ui.openMenu && action !== 'dd-toggle' && action !== 'dd-pick') ui.openMenu = null;
    switch (action) {
      case 'copy-link':
        return shareRoom();
      case 'leave':
        return leaveRoom();
      case 'logo-leave': {
        // Walking out mid-round is worth asking about twice; in a lobby or
        // between rounds the wordmark is simply the way out.
        const playing = state.game && state.game.phase !== 'ended';
        if (playing && !ui.leaveArmed) {
          ui.leaveArmed = true;
          clearTimeout(leaveArmTimer);
          leaveArmTimer = setTimeout(() => {
            ui.leaveArmed = false;
            render();
          }, 4000);
          toast('Leaving in the middle of a round — click the wordmark again to confirm', 'info');
          return render();
        }
        clearTimeout(leaveArmTimer);
        ui.leaveArmed = false;
        return leaveRoom();
      }
      case 'dd-toggle':
        ui.openMenu = ui.openMenu === d.dd ? null : d.dd;
        return render();
      case 'dd-pick':
        ui.openMenu = null;
        if (d.dd === 'first') send({ type: 'lobby:first', seat: d.value === '' ? null : Number(d.value) });
        return render();
      case 'seats':
        return send({ type: 'lobby:seats', seats: Number(d.seats) });
      case 'add-bot':
        return send({ type: 'lobby:bot', seat: Number(d.seat) });
      case 'bot-level':
        return send({ type: 'lobby:botLevel', level: d.level });
      case 'teams':
        return send({ type: 'lobby:teams', teams: d.teams === '1' });
      case 'shuffle':
        return send({ type: 'lobby:shuffle' });
      case 'pick-swap': {
        if (state.room.hostId !== state.you.id) return;
        if (!ui.swapPick) ui.swapPick = d.id;
        else if (ui.swapPick === d.id) ui.swapPick = null;
        else {
          send({ type: 'lobby:swap', a: ui.swapPick, b: d.id });
          ui.swapPick = null;
        }
        return render();
      }
      case 'move':
        if (!d.b) return;
        return send({ type: 'lobby:swap', a: d.a, b: d.b });
      case 'deal':
        return send({ type: 'lobby:deal', custom: d.custom === '1' });
      case 'kick':
        return send({ type: 'lobby:kick', id: d.id });
      case 'start':
        return send({ type: 'lobby:start' });
      case 'card':
        return onCardClick(Number(d.seat), Number(d.idx));
      case 'reset-order':
        ui.arrange = null;
        return render();
      case 'lock':
        return send({ type: 'arrange:lock', order: ui.arrange });
      case 'skip-show':
        return send({ type: 'show:skip' });
      case 'rank': {
        const rank = Number(d.rank);
        // The same row of ranks answers a guess and a power-up that wants one.
        if (ui.pu && puWants() === 'rank') return puPick('rank', rank);
        if (ui.target) {
          send({ type: 'guess', target: ui.target, rank });
          ui.target = null;
        }
        return;
      }
      case 'cancel-target':
        ui.target = null;
        return render();
      case 'pass-turn':
        return send({ type: 'turn:pass' });

      case 'pu-play':
        // Picking up a second one puts the first back.
        if (ui.pu && ui.pu.id === d.id) { ui.pu = null; return render(); }
        ui.target = null;
        return puBegin(d.id);
      case 'pu-hand':
        return puPick(d.what, Number(d.seat));
      case 'pu-cancel':
        ui.pu = null;
        return render();
      case 'test-switch':
        return send({ type: 'test:switch', seat: Number(d.seat) });
      case 'new-round':
        return send({ type: 'newRound' });
      case 'to-lobby':
        return send({ type: 'toLobby' });
    }
  }

  $('#app').addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (!el || !state) return;
    if (el.dataset.change === 'hand-size') send({ type: 'lobby:handSize', seat: Number(el.dataset.seat), size: Number(el.value) });
  });
  // Typing a hand size into a hand's row must not count as picking that row.
  $('#app').addEventListener(
    'click',
    (e) => {
      if (e.target.matches('input')) e.stopPropagation();
    },
    true,
  );
  // Anywhere else on the page closes an open menu.
  document.addEventListener(
    'click',
    (e) => {
      if (!ui.openMenu) return;
      if (e.target.closest(`.dropdown[data-dd="${ui.openMenu}"]`)) return;
      ui.openMenu = null;
      render();
    },
    true,
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.openMenu) {
      ui.openMenu = null;
      render();
    }
  });

  $('#app').addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || !state) return;
    // Buttons nested inside a clickable <li> (kick inside pick-swap) win.
    e.stopPropagation();
    act(el.dataset.action, el.dataset);
  });

  // A card is a div rather than a button, because it has to be draggable and a
  // button fights that. So the two keys a button would answer to are wired up
  // by hand, and the whole game can be played without a pointer.
  $('#app').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    const el = e.target.closest && e.target.closest('.card[role="button"]');
    if (!el || !state) return;
    e.preventDefault();
    act('card', el.dataset);
  });

  // --- home screen ---------------------------------------------------------
  const nameInput = $('#name');
  const codeInput = $('#code');
  const rerollBtn = $('#reroll');
  // Turn up without a name and the house deals you one. The roller next to the
  // box deals another; type over either and it is yours.
  nameInput.value = localStorage.getItem('thievery:name') || randomAlias();
  rerollBtn.addEventListener('click', () => {
    nameInput.value = randomAlias();
    rerollBtn.classList.remove('spun');
    void rerollBtn.offsetWidth;
    rerollBtn.classList.add('spun');
    nameInput.focus();
  });
  const urlCode = new URLSearchParams(location.search).get('code') || location.pathname.replace('/', '');
  if (urlCode && /^[A-Za-z0-9]{4}$/.test(urlCode)) codeInput.value = urlCode.toUpperCase();

  function getName() {
    const name = nameInput.value.trim();
    if (!name) {
      toast('Enter a display name first');
      nameInput.focus();
      return null;
    }
    try {
      localStorage.setItem('thievery:name', name);
    } catch {}
    return name;
  }
  $('#create').addEventListener('click', () => {
    const name = getName();
    if (name) joinWith({ type: 'create', name });
  });
  $('#join').addEventListener('click', () => {
    const name = getName();
    const code = codeInput.value.trim().toUpperCase();
    if (!name) return;
    if (code.length !== 4) {
      toast('Room codes are 4 characters');
      codeInput.focus();
      return;
    }
    joinWith({ type: 'join', code, name });
  });
  codeInput.addEventListener('keydown', (e) => e.key === 'Enter' && $('#join').click());
  nameInput.addEventListener('keydown', (e) => e.key === 'Enter' && (codeInput.value ? $('#join') : $('#create')).click());

  // --- boot ----------------------------------------------------------------
  // A room you were already in is rejoined without being asked, unless the
  // link in the address bar points somewhere else.
  if (session && urlCode && session.code !== urlCode.toUpperCase()) saveSession(null);
  render();
  connect();
})();
