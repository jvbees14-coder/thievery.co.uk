/* Thievery.co.uk Missions: the admin page's sign-in.
 *
 * Posts to the hall's own login route, the same one the front door uses, and
 * reloads: what /missions/admin answers is a different page once the cookie
 * is set. */
(() => {
  'use strict';
  const form = document.querySelector('#ms-signin');
  const error = document.querySelector('#ms-signin-error');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    error.hidden = true;
    const body = { username: form.username.value.trim(), password: form.password.value };
    try {
      const res = await fetch('/api/site/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That did not work. Try again.');
      location.reload();
    } catch (err) {
      error.textContent = err.message === 'Failed to fetch' ? 'No connection. Try again.' : err.message;
      error.hidden = false;
    }
  });
})();
