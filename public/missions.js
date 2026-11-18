/* Thievery.co.uk Missions: the rider's page.
 *
 * Three states, and the page works out which from the browser and from what
 * it kept last time:
 *
 *   - an iPhone in Safari, which cannot be sent notifications until the page
 *     is opened from the Home Screen: the steps, with a way to join anyway;
 *   - not joined yet: a name, a crew if there are any, and Join;
 *   - joined: the latest mission large, the ones before it small.
 *
 * What the browser keeps is one entry, `thievery-missions`, holding the
 * rider's token (their only proof of who they are; there is no account).
 * On an iPhone the Home Screen copy keeps its own storage, apart from
 * Safari's, so somebody who joins in Safari and then from the icon is two
 * riders; the steps say to join from the icon for that reason.
 *
 * Notification permission is asked for in the Join tap itself, before
 * anything is awaited, because iOS only asks inside a tap. */
(() => {
  'use strict';

  const KEY = 'thievery-missions';
  const $ = (s) => document.querySelector(s);

  const kept = {
    get() {
      try {
        return JSON.parse(localStorage.getItem(KEY)) || {};
      } catch {
        return {};
      }
    },
    set(v) {
      try {
        localStorage.setItem(KEY, JSON.stringify(v));
      } catch {}
    },
    clear() {
      try {
        localStorage.removeItem(KEY);
      } catch {}
    },
  };

  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const canPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (standalone) document.documentElement.classList.add('ms-standalone');

  let hello = null;
  let me = null;
  let reg = null;
  let busy = false;

  // --- talking to the server ------------------------------------------------

  async function api(path, body) {
    const init = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    let res;
    try {
      res = await fetch('/api/missions/' + path, init);
    } catch {
      throw new Error('No signal. Try again when you have some.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'That did not work. Try again.'), { status: res.status });
    return data;
  }

  function problem(text) {
    $('#ms-problem').textContent = text || '';
    $('#ms-problem').hidden = !text;
  }

  // --- notifications ----------------------------------------------------------

  function keyBytes(b64) {
    const std = b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4);
    return Uint8Array.from(atob(std), (c) => c.charCodeAt(0));
  }

  function sameKey(sub, b64) {
    const have = sub.options && sub.options.applicationServerKey;
    if (!have) return true;
    const a = new Uint8Array(have);
    const b = keyBytes(b64);
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }

  async function worker() {
    if (!canPush) return null;
    if (!reg) reg = await navigator.serviceWorker.register('/missions/sw.js', { scope: '/missions' });
    return reg;
  }

  // The browser's subscription, made if it can be and `allowed` says the
  // permission is there. Null if notifications are off for any reason.
  async function subscription() {
    if (!canPush || !hello || !hello.publicKey || Notification.permission !== 'granted') return null;
    const r = await worker();
    await navigator.serviceWorker.ready;
    let sub = await r.pushManager.getSubscription();
    // A subscription made under an old site key will never be delivered to.
    if (sub && !sameKey(sub, hello.publicKey)) {
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
    if (!sub) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(hello.publicKey) });
    return sub.toJSON();
  }

  // Must be the first thing a tap does: iOS only shows the question inside
  // the tap, and an await before it is enough to lose that.
  function askPermission() {
    if (!canPush || !hello || !hello.publicKey) return Promise.resolve('unavailable');
    if (Notification.permission !== 'default') return Promise.resolve(Notification.permission);
    return Notification.requestPermission();
  }

  function blockedHelp() {
    if (isIOS) return 'Open Settings, then Notifications, then Missions, and turn on Allow Notifications. Then come back here.';
    if (isAndroid) return 'Tap the icon beside the address (or press and hold the Missions icon, then App info), open Notifications and allow them. Then reload this page.';
    return 'Allow notifications for this site in your browser’s site settings, then reload this page.';
  }

  // --- drawing ----------------------------------------------------------------

  function ago(at) {
    const mins = Math.round((Date.now() - at) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const t = new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const sameDay = new Date(at).toDateString() === new Date().toDateString();
    return sameDay ? `At ${t}` : `${new Date(at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${t}`;
  }

  function show(id, on) {
    $(id).hidden = !on;
  }

  function drawOut() {
    show('#ms-in', false);
    const iphoneInSafari = isIOS && !standalone && !canPush;
    show('#ms-home-screen', iphoneInSafari && !kept.get().anyway);
    show('#ms-join', !iphoneInSafari || !!kept.get().anyway);
    show('#ms-no-push', !iphoneInSafari && (!canPush || !hello.publicKey));
    const crews = hello.crews || [];
    show('#ms-crew-field', crews.length > 0);
    const select = $('#ms-crew');
    select.length = 1;
    for (const c of crews) select.add(new Option(c.name, c.id));
    if (hello.crew) {
      select.value = hello.crew.id;
      $('#ms-join-crew').textContent = `You’ve been invited to ${hello.crew.name}.`;
      show('#ms-join-crew', true);
    }
    const name = kept.get().name;
    if (name && !$('#ms-name').value) $('#ms-name').value = name;
  }

  let lastSeenAt = 0;
  function drawIn() {
    show('#ms-home-screen', false);
    show('#ms-join', false);
    show('#ms-in', true);
    $('#ms-lede').textContent = 'Keep your phone where you can hear it.';
    $('#ms-me-name').textContent = me.name;
    $('#ms-me-crews').textContent = me.crews.length ? ` (${me.crews.join(', ')})` : '';

    const perm = canPush ? Notification.permission : 'unavailable';
    const pill = $('#ms-pill');
    pill.className = 'ms-pill ' + (me.notifications ? 'is-on' : 'is-off');
    pill.textContent = me.notifications ? 'Notifications on' : 'Notifications off';
    show('#ms-blocked', perm === 'denied');
    $('#ms-blocked-text').textContent = blockedHelp();
    const couldTurnOn = canPush && hello.publicKey && perm !== 'denied' && !me.notifications;
    show('#ms-turn-on', couldTurnOn);

    const [latest, ...earlier] = me.inbox;
    const slip = $('#ms-latest');
    if (latest) {
      slip.classList.remove('is-empty');
      $('#ms-latest-from').textContent = latest.solo ? `${latest.set}: just you` : latest.set;
      $('#ms-latest-text').textContent = latest.text;
      $('#ms-latest-when').textContent = ago(latest.at);
      const fresh = Date.now() - latest.at < 15 * 60000;
      show('#ms-stamp', fresh);
      if (lastSeenAt && latest.at > lastSeenAt) {
        slip.classList.remove('is-arriving');
        void slip.offsetWidth;
        slip.classList.add('is-arriving');
        if (window.thieveryPref && window.thieveryPref('haptics') && navigator.vibrate) navigator.vibrate([60, 40, 60]);
      }
      lastSeenAt = latest.at;
    } else {
      slip.classList.add('is-empty');
      $('#ms-latest-from').textContent = 'No missions yet';
      $('#ms-latest-text').textContent = 'Nothing to do but look innocent. The first one could arrive any minute.';
      $('#ms-latest-when').textContent = '';
      show('#ms-stamp', false);
    }

    const list = $('#ms-earlier-list');
    list.replaceChildren(
      ...earlier.map((item) => {
        const li = document.createElement('li');
        const text = document.createElement('p');
        text.className = 'ms-earlier-text';
        text.textContent = item.text;
        const meta = document.createElement('p');
        meta.className = 'ms-earlier-meta';
        meta.textContent = `${item.solo ? item.set + ': just you' : item.set} · ${ago(item.at)}`;
        li.append(text, meta);
        return li;
      })
    );
    show('#ms-earlier', earlier.length > 0);
  }

  // --- what happens -------------------------------------------------------------

  async function refresh({ resubscribe = false } = {}) {
    const { token } = kept.get();
    if (!token) return drawOut();
    const body = { token };
    // Every check-in sends the browser's current subscription when it has
    // one, so a phone whose subscription was renewed by the browser, or lost,
    // puts itself right without anybody doing anything.
    if (resubscribe) {
      try {
        const sub = await subscription();
        if (sub) body.subscription = sub;
      } catch {}
    }
    try {
      const data = await api('me', body);
      me = data.me;
      if (data.publicKey !== undefined) hello.publicKey = data.publicKey;
      problem('');
      drawIn();
    } catch (err) {
      if (err.status === 401) {
        kept.set({ name: kept.get().name });
        me = null;
        drawOut();
        problem('This phone isn’t signed up any more. Join again.');
      } else if (me) {
        drawIn();
      } else {
        problem(err.message);
      }
    }
  }

  async function join(ev) {
    ev.preventDefault();
    const asking = askPermission();
    if (busy) return;
    const name = $('#ms-name').value.trim();
    if (!name) {
      problem('Put a name in so the organiser knows who you are.');
      $('#ms-name').focus();
      return;
    }
    busy = true;
    $('#ms-join-btn').disabled = true;
    try {
      await asking;
      let sub = null;
      try {
        sub = await subscription();
      } catch {}
      const data = await api('join', { name, crew: $('#ms-crew').value || null, subscription: sub });
      kept.set({ token: data.token, name });
      me = data.me;
      problem('');
      drawIn();
    } catch (err) {
      problem(err.message);
    } finally {
      busy = false;
      $('#ms-join-btn').disabled = false;
    }
  }

  async function turnOn() {
    const asking = askPermission();
    const perm = await asking;
    if (perm !== 'granted') return drawIn();
    await refresh({ resubscribe: true });
    if (!me.notifications) problem('Notifications could not be turned on. Try again in a minute.');
  }

  async function leave() {
    const { token } = kept.get();
    const button = $('#ms-leave');
    if (button.dataset.sure !== 'yes') {
      button.dataset.sure = 'yes';
      button.textContent = 'Tap again to leave';
      setTimeout(() => {
        button.dataset.sure = '';
        button.textContent = 'Leave';
      }, 4000);
      return;
    }
    try {
      await api('leave', { token });
    } catch (err) {
      if (err.status !== 401) return problem(err.message);
    }
    try {
      const sub = reg && (await reg.pushManager.getSubscription());
      if (sub) await sub.unsubscribe();
    } catch {}
    kept.set({ name: me && me.name });
    me = null;
    button.dataset.sure = '';
    button.textContent = 'Leave';
    $('#ms-lede').textContent = 'You’ve left. Join again whenever you like.';
    drawOut();
  }

  async function boot() {
    try {
      // A crew's join link is /missions?crew=<its slug>.
      const crew = new URLSearchParams(location.search).get('crew');
      hello = await api('hello' + (crew ? '?crew=' + encodeURIComponent(crew) : ''));
    } catch (err) {
      $('#ms-loading').hidden = true;
      return problem(err.message);
    }
    $('#ms-loading').hidden = true;
    if (canPush) worker().catch(() => {});
    await refresh({ resubscribe: true });

    $('#ms-join-form').addEventListener('submit', join);
    $('#ms-turn-on-btn').addEventListener('click', turnOn);
    $('#ms-leave').addEventListener('click', leave);
    $('#ms-anyway').addEventListener('click', () => {
      kept.set({ ...kept.get(), anyway: true });
      drawOut();
      $('#ms-name').focus();
    });

    // Fresh news: when the page comes back into view, when the service
    // worker says a push arrived, and once a minute while it is on screen.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && me) refresh();
    });
    if (canPush) navigator.serviceWorker.addEventListener('message', (e) => e.data && e.data.type === 'mission' && me && refresh());
    setInterval(() => {
      if (document.visibilityState === 'visible' && me) refresh();
    }, 60000);
  }

  boot();
})();
