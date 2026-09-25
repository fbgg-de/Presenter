// No windows or network requests: exercise Chromium's real on-disk cookie store.
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { app, session } = require('electron');
const [profile, modulePath, mode] = process.argv.slice(2);
app.setPath('userData', profile);

app
  .whenReady()
  .then(async () => {
    const { persistCookieChanges } = await import(pathToFileURL(modulePath).href);
    const cookies = session.defaultSession.cookies;
    const flush = persistCookieChanges(cookies);
    const url = 'https://presenter.example.test/';
    if (mode === 'login') {
      await cookies.set({
        url,
        name: 'PHPSESSID',
        value: 'test-session',
        secure: true,
        httpOnly: true,
        sameSite: 'no_restriction',
        expirationDate: Date.now() / 1000 + 3600,
      });
      // Deliberately exit without a shutdown hook: the change listener must persist it.
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } else if (mode === 'reopen') {
      const restored = await cookies.get({ url, name: 'PHPSESSID' });
      assert.equal(restored.length, 1);
      assert.equal(restored[0].value, 'test-session');
      assert.equal(restored[0].hostOnly, true);
      assert.equal(restored[0].httpOnly, true);
      assert.equal(restored[0].sameSite, 'no_restriction');
    } else if (mode === 'logout') {
      await cookies.remove(url, 'PHPSESSID');
      await flush();
    } else if (mode === 'reopen-after-logout') {
      assert.equal((await cookies.get({ url, name: 'PHPSESSID' })).length, 0);
    } else throw new Error('Unknown test mode');
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
