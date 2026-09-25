import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';
import { build } from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'presenter-cookies-'));
await build({
  entryPoints: ['src/main/sessionCookies.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: join(dir, 'cookies.mjs'),
});
const { migrateSessionCookies, persistCookieChanges } = await import(pathToFileURL(join(dir, 'cookies.mjs')).href);
const origin = 'https://presenter.example.test';
const base = {
  name: 'PHPSESSID',
  value: 'old',
  domain: 'presenter.example.test',
  path: '/',
  hostOnly: true,
  secure: true,
  httpOnly: true,
  sameSite: 'no_restriction',
  expirationDate: Date.now() / 1000 + 3600,
};

class CookieStore extends EventEmitter {
  constructor(current = []) {
    super();
    this.current = current;
    this.disk = [];
    this.writes = [];
    this.flushes = 0;
  }
  async get() {
    return this.current;
  }
  async set(cookie) {
    this.writes.push(cookie);
    this.current.push({ ...cookie, domain: cookie.domain ?? new URL(cookie.url).hostname, hostOnly: !cookie.domain });
    this.emit('changed');
  }
  async flushStore() {
    this.flushes++;
    this.disk = structuredClone(this.current);
  }
}
const snapshot = (name, cookies) => {
  const file = join(dir, `${name}.json`);
  writeFileSync(file, JSON.stringify(cookies));
  return file;
};

// A newer native login must survive migration of a stale backup.
const current = new CookieStore([{ ...base, value: 'new-login' }]);
const stale = snapshot('stale', [base]);
await migrateSessionCookies(current, stale, origin);
assert.equal(current.current[0].value, 'new-login');
assert.equal(current.writes.length, 0);
assert.equal(existsSync(stale), false);

// Import host-only once, preserve flags/expiry, exclude IdP/subdomain/expired cookies.
const imported = new CookieStore();
const legacy = snapshot('legacy', [
  { ...base, domain: '.presenter.example.test', hostOnly: false, value: 'duplicate' },
  base,
  { ...base, domain: 'idp.example.test' },
  { ...base, domain: 'idp.presenter.example.test' },
  { ...base, name: 'expired', expirationDate: 1 },
  { ...base, name: 'session-only', expirationDate: undefined },
]);
await migrateSessionCookies(imported, legacy, origin);
assert.equal(imported.writes.length, 1);
assert.equal(imported.writes[0].domain, undefined);
assert.equal(imported.writes[0].value, 'old');
for (const field of ['secure', 'httpOnly', 'sameSite', 'expirationDate']) assert.equal(imported.writes[0][field], base[field]);

// No backend configuration must not cause provider cookies to be restored.
const unknown = new CookieStore();
await migrateSessionCookies(unknown, snapshot('unknown', [base]), '');
assert.equal(unknown.writes.length, 0);

// Login is durable before shutdown; rotation replaces it; logout cannot replay the backup.
const live = new CookieStore();
const flush = persistCookieChanges(live);
live.current = [{ ...base, value: 'signed-in' }];
live.emit('changed');
await wait(350);
assert.equal(live.disk[0].value, 'signed-in');
live.current = [{ ...base, value: 'rotated' }];
live.emit('changed');
await flush(); // Closing immediately drains the pending write.
assert.equal(live.disk[0].value, 'rotated');
live.current = [];
live.emit('changed');
await flush();
const reopened = new CookieStore(live.disk);
await migrateSessionCookies(reopened, stale, origin);
assert.deepEqual(reopened.current, []);

// A temporary disk failure must not poison all subsequent flushes.
let fail = true;
const originalFlush = live.flushStore.bind(live);
live.flushStore = async () => {
  if (fail) {
    fail = false;
    throw new Error('disk unavailable');
  }
  await originalFlush();
};
await assert.rejects(flush(), /disk unavailable/);
await flush();
console.log('Session cookie regression checks passed.');

if (process.argv.includes('--electron')) {
  const require = createRequire(import.meta.url);
  const electron = require('electron');
  const profile = join(dir, 'profile');
  mkdirSync(profile);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  for (const mode of ['login', 'reopen', 'logout', 'reopen-after-logout']) {
    const result = spawnSync(electron, ['test/session-cookies/electron.cjs', profile, join(dir, 'cookies.mjs'), mode], {
      env,
      encoding: 'utf-8',
      timeout: 20000,
      windowsHide: true,
    });
    assert.equal(result.status, 0, `${mode}: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  }
  console.log('Electron process restart and logout checks passed.');
}
