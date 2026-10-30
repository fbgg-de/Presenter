/**
 * npm run test:php-api — the real PHP backend over HTTP, under PHP's built-in dev server.
 *
 * Runs on a throwaway copy of rest.php / oidc.php / api / classes with its own config.php, so it
 * never touches the developer's config, logs or data. No database is needed: sessions are seeded
 * as files in the copy's cache/sessions (the same store the app uses), and the database points at
 * a closed port — which is exactly what the "Database error" path needs.
 *
 * Covers what the class-level suites cannot: routing and the auth gate in rest.php, the CSRF and
 * CORS guards on real requests, the anonymous log write with its rotation and the admin log view,
 * relay tickets issued and validated over HTTP, database faults answered without leaking SQL,
 * and SVG icon uploads (validation, per-account folders, the CSP that keeps scripts from running).
 * Every response is also checked for stray PHP warnings, which would corrupt the JSON.
 *
 * Skips when PHP is not installed.
 */
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import { startRelay } from '../ws-sync/harness.mjs';

const modules = spawnSync('php', ['-m'], { encoding: 'utf8' });
if (modules.status !== 0) {
  console.log('skip: php is not available');
  process.exit(0);
}
const hasMysqli = /^mysqli$/m.test(modules.stdout);

let failed = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? `  — ${detail}` : ''}`);
};
const section = (name) => console.log(`\n${name}`);

// ── A throwaway backend ─────────────────────────────────────────────────────

const port = await new Promise((done) => {
  const probe = createServer().listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => done(port));
  });
});
const base = `http://127.0.0.1:${port}`;
const root = mkdtempSync(join(tmpdir(), 'presenter-php-api-'));
for (const entry of ['rest.php', 'oidc.php', 'dev-router.php', 'api', 'classes']) cpSync(entry, join(root, entry), { recursive: true });

// The sample config with test values. DEVELOPMENT stays on: display_errors puts any warning into the
// response body, and the checks below fail on it. 'null' is listed on purpose — it must be refused anyway.
const config = readFileSync('config-sample.php', 'utf8')
  .replace("const DOMAIN = 'localhost';", `const DOMAIN = '127.0.0.1:${port}';`)
  .replace(/const CORS_ALLOWED_ORIGINS = \[[^\]]*\];/, "const CORS_ALLOWED_ORIGINS = ['http://localhost:5173', 'null'];")
  .replace("'password' => 'password',", "'password' => 'test-db-secret',")
  .replace("'client_secret'  => 'client_secret',", "'client_secret'  => 'test-client-secret',");
writeFileSync(join(root, 'config.php'), config);

// Port 1 is closed: every database call fails the way an unreachable server does.
const server = spawn('php', ['-d', 'mysqli.default_port=1', '-S', `127.0.0.1:${port}`, 'dev-router.php'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog = [];
server.stdout.on('data', (d) => serverLog.push(String(d)));
server.stderr.on('data', (d) => serverLog.push(String(d)));

/** Stop the server, then delete the copy — Windows keeps the folder locked while php runs in it. */
async function finish(code) {
  if (server.exitCode === null) {
    server.kill();
    await new Promise((done) => server.once('exit', done));
  }
  const rel = resolve(root).slice(resolve(tmpdir()).length);
  if (rel.includes('presenter-php-api-') && !rel.includes('..')) {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  process.exit(code);
}

for (let i = 0; ; i++) {
  try {
    await fetch(`${base}/rest/Session`);
    break;
  } catch {
    if (i > 50) {
      console.log('FAIL php dev server did not start\n' + serverLog.join(''));
      await finish(1);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** PHP's session encoding (`name|serialized`) for strings, ints and plain objects. */
const ser = (v) =>
  typeof v === 'number'
    ? `i:${v};`
    : typeof v === 'string'
      ? `s:${Buffer.byteLength(v)}:"${v}";`
      : `a:${Object.keys(v).length}:{${Object.entries(v)
          .map(([k, x]) => ser(k) + ser(x))
          .join('')}}`;

/** Seed a signed-in session the way oidc.php leaves one, and return its cookie. */
function signIn({ account, admin = false }) {
  const id = randomBytes(16).toString('hex');
  const later = Math.floor(Date.now() / 1000) + 3600;
  const vars = {
    authType: admin ? 'oidc_admin' : 'oidc',
    account,
    oidc_subject: `test-${account}`,
    oidc_session_expires: later,
    oidc_tokens: { expires_at: later },
    ...(admin ? { admin_sub: 'test-admin' } : {}),
  };
  const dir = join(root, 'cache', 'sessions');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `sess_${id}`),
    Object.entries(vars)
      .map(([k, v]) => `${k}|${ser(v)}`)
      .join(''),
  );
  return `PHPSESSID=${id}`;
}

const stray = /<br \/>|<b>(Warning|Notice|Deprecated|Fatal error)|^(Warning|Notice|Deprecated|Fatal error):/m;

/** A request; every response is checked for PHP warnings and the nosniff header on the way. */
async function call(method, path, { cookie, origin, json, body, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    redirect: 'manual',
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(origin ? { Origin: origin } : {}),
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: json ? JSON.stringify(json) : body,
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if (stray.test(text)) check(`no PHP warning in ${method} ${path}`, false, text.slice(0, 300));
  if (path.startsWith('/rest/') && res.headers.get('x-content-type-options') !== 'nosniff') {
    check(`nosniff on ${method} ${path}`, false);
  }
  return { status: res.status, headers: res.headers, text, data };
}

// ── Syntax ──────────────────────────────────────────────────────────────────
// Most endpoints are never requested here, so every PHP file is at least parsed.

section('Syntax');
const phpFiles = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', '*.php'], { encoding: 'utf8' })
  .stdout.split(/\r?\n/)
  .filter(Boolean);
const lintErrors = [];
for (let i = 0; i < phpFiles.length; i += 8) {
  await Promise.all(
    phpFiles.slice(i, i + 8).map(
      (file) =>
        new Promise((done) => {
          const lint = spawn('php', ['-l', file], { stdio: ['ignore', 'pipe', 'pipe'] });
          let out = '';
          lint.stdout.on('data', (d) => (out += d));
          lint.stderr.on('data', (d) => (out += d));
          lint.on('close', (code) => (code === 0 || lintErrors.push(out.trim()), done()));
        }),
    ),
  );
}
check(`all ${phpFiles.length} PHP files parse`, phpFiles.length > 50 && lintErrors.length === 0, lintErrors.join(' / '));

const user = signIn({ account: 41001 });
const otherUser = signIn({ account: 41002 });
const admin = signIn({ account: 0, admin: true });
const logFile = join(root, 'logs', 'error.log');
const readLog = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8') : '');

// ── Routing and the auth gate ───────────────────────────────────────────────

section('Routing and the auth gate');
for (const path of ['/rest/Shows', '/rest/SongsAll', '/rest/WsTicket', '/rest/AdminAccounts', '/rest/NoSuchThing']) {
  check(`unauthenticated ${path} → 401`, (await call('GET', path)).status === 401);
}
const session = await call('GET', '/rest/Session');
check('Session answers signed-out callers', session.status === 200 && session.data !== null, session.text.slice(0, 200));
const installers = await call('GET', '/rest/Installers');
check(
  'the installer list answers signed-out callers (sign-in page banner)',
  installers.status === 200 && Array.isArray(installers.data?.installers),
);
check('a signed-in session is recognised', (await call('GET', '/rest/WsTicket', { cookie: user })).status === 200);
check('unknown endpoint → 404', (await call('GET', '/rest/NoSuchThing', { cookie: user })).status === 404);
check('the abstract base classes are not callable', (await call('GET', '/rest/RestController', { cookie: user })).status === 404);
const traversal = await call('GET', '/rest/..%2Fconfig', { cookie: user });
check('a path-traversal name finds nothing', traversal.status === 404 && !traversal.text.includes('test-db-secret'));

// ── CSRF and CORS ───────────────────────────────────────────────────────────

section('CSRF and CORS');
const log = (origin, message) => call('POST', '/rest/Log', { origin, json: { message, severity: 'INFO', source: 'php-api-test' } });
check('a write from another site → 403', (await log('https://evil.example', 'from evil')).status === 403);
check('a write from Origin: null → 403 (even though configured)', (await log('null', 'from null')).status === 403);
check('a same-origin write passes', (await log(base, 'same origin')).status === 200);
check('a configured dev origin passes', (await log('http://localhost:5173', 'dev origin')).status === 200);
check('a write without Origin (desktop app) passes', (await log(undefined, 'no origin')).status === 200);
check('refused writes never reach the log', !readLog().includes('from evil') && !readLog().includes('from null'));
const preflight = (origin) => call('OPTIONS', '/rest/Shows', { origin, headers: { 'Access-Control-Request-Method': 'PUT' } });
const allowed = await preflight('http://localhost:5173');
check(
  'preflight from a configured origin is answered with credentials',
  allowed.status === 204 &&
    allowed.headers.get('access-control-allow-origin') === 'http://localhost:5173' &&
    allowed.headers.get('access-control-allow-credentials') === 'true',
);
check('no CORS headers for Origin: null', (await preflight('null')).headers.get('access-control-allow-origin') === null);
check('no CORS headers for another site', (await preflight('https://evil.example')).headers.get('access-control-allow-origin') === null);

// ── The log ─────────────────────────────────────────────────────────────────

section('The log');
check('logs/ guards itself with its own .htaccess', readFileSync(join(root, 'logs', '.htaccess'), 'utf8').trim() === 'Require all denied');
await log(undefined, 'line one\nline two');
check('a multi-line report becomes one line', readLog().includes('line one | line two'));
await log(undefined, 'x'.repeat(5000));
check('an oversized report is truncated', readLog().includes('…[truncated]') && !readLog().includes('x'.repeat(4500)));
const noise = await log(undefined, "TypeError: undefined is not an object (evaluating 'window.__firefox__.reader')");
check('browser-extension noise is answered but not written', noise.data?.message === 'ignored' && !readLog().includes('__firefox__'));
writeFileSync(logFile, 'x'.repeat(5 * 1024 * 1024 + 1));
await log(undefined, 'after rotation');
check(
  'a full log rotates to error.1.log over HTTP',
  existsSync(join(root, 'logs', 'error.1.log')) && readLog().includes('after rotation') && readLog().length < 1000,
);
check('the log view needs a session', (await call('GET', '/rest/Log')).status === 401);
check('the log view needs an admin', (await call('GET', '/rest/Log', { cookie: user })).status === 403);
const view = await call('GET', '/rest/Log', { cookie: admin });
check('an admin reads the log', view.status === 200 && view.text.includes('after rotation'), view.text.slice(0, 200));
check('clearing needs an admin', (await call('DELETE', '/rest/Log', { cookie: user })).status === 403);
const cleared = await call('DELETE', '/rest/Log', { cookie: admin });
check('an admin clears both log files', cleared.status === 200 && !existsSync(logFile) && !existsSync(join(root, 'logs', 'error.1.log')));

// ── Relay tickets ───────────────────────────────────────────────────────────

section('Relay tickets');
const issued = await call('GET', '/rest/WsTicket', { cookie: user });
const ticket = issued.data?.ticket;
check('a signed-in account gets a ticket', typeof ticket === 'string' && issued.data.expires > Date.now() / 1000);
const resolved = await call('GET', `/rest/ValidateWsTicket?ticket=${encodeURIComponent(ticket)}`);
check('the relay resolves it to that account without a session', resolved.status === 200 && resolved.data?.account === 41001);
check('a tampered ticket → 403', (await call('GET', `/rest/ValidateWsTicket?ticket=${encodeURIComponent(ticket + 'x')}`)).status === 403);
check(
  'a ticket is not a monitor token',
  (await call('GET', `/rest/ValidateMonitorToken?token=${encodeURIComponent(ticket)}`)).status === 403,
);
check('the admin session (account 0) gets no ticket', (await call('GET', '/rest/WsTicket', { cookie: admin })).status === 403);

// ── Database faults ─────────────────────────────────────────────────────────

section('Database faults');
if (!hasMysqli) {
  console.log('skip: the mysqli extension is not loaded');
} else {
  for (const [label, path, cookie] of [
    ['public Accounts list', '/rest/Accounts', undefined],
    ['signed-in Shows', '/rest/Shows', user],
  ]) {
    const res = await call('GET', path, { cookie });
    check(
      `${label}: 500 "Database error", nothing leaked`,
      res.status === 500 && res.data?.message === 'Database error' && !/mysql|sql|SELECT|test-db-secret/i.test(res.text),
      `${res.status} ${res.text.slice(0, 200)}`,
    );
  }
  check('the real reason is in the log', /\[ERROR\].*(Accounts|Shows)/.test(readLog()));
}

// ── Relay end to end ────────────────────────────────────────────────────────
// The real relay asking this real backend — the rest of the relay suites use a stand-in.

section('Relay end to end');
const relay = await startRelay({ backendUrl: base, allowAccountAuth: false });
try {
  const relayAuth = (auth) =>
    new Promise((done) => {
      const ws = new WebSocket(relay.url);
      ws.on('open', () => ws.send(JSON.stringify({ action: 'auth', ...auth, client: { role: 'remote' } })));
      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'auth_ok') {
          ws.close();
          done({ ok: true, account: msg.account });
        }
      });
      ws.on('close', (code) => done({ ok: false, code }));
    });
  const fresh = (await call('GET', '/rest/WsTicket', { cookie: user })).data?.ticket;
  const viaTicket = await relayAuth({ account: 1, ticket: fresh });
  check("a real ticket gets in, on the ticket's account", viaTicket.ok && viaTicket.account === 41001, JSON.stringify(viaTicket));
  check('a guessed account number is refused', (await relayAuth({ account: 41001 })).code === 4002);
  check('a forged ticket is refused', (await relayAuth({ account: 41001, ticket: 'forged.ticket' })).code === 4003);
} finally {
  await relay.stop();
}

// ── SVG icons ───────────────────────────────────────────────────────────────

section('SVG icons');
const upload = (cookie, name, content) => {
  const form = new FormData();
  form.append('file', new Blob([content], { type: 'image/svg+xml' }), name);
  form.append('name', 'Test icon');
  return call('POST', '/rest/PdfIcons', { cookie, body: form });
};
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><circle r="4"/></svg>';
check('a non-SVG file is refused', (await upload(user, 'evil.html', svg)).status === 400);
check('a .svg without <svg> is refused', (await upload(user, 'fake.svg', '<html><script>alert(1)</script></html>')).status === 400);
const stored = await upload(user, 'icon.svg', svg);
check('an SVG is stored', stored.status === 200 && typeof stored.data?.filename === 'string', stored.text.slice(0, 200));
const served = await call('GET', `/rest/PdfIcons/${encodeURIComponent(stored.data?.filename ?? '')}`, { cookie: user });
const csp = served.headers.get('content-security-policy') ?? '';
check('it is served as SVG', served.status === 200 && served.headers.get('content-type') === 'image/svg+xml');
check('its scripts cannot run when opened directly', csp.includes("default-src 'none'") && csp.includes('sandbox'), csp);
const listed = (await call('GET', '/rest/PdfIcons', { cookie: user })).data ?? [];
const othersList = (await call('GET', '/rest/PdfIcons', { cookie: otherUser })).data ?? [];
check(
  'the owner lists it',
  listed.some((i) => i.filename === stored.data?.filename),
);
check('another account does not see it', !othersList.some((i) => i.filename === stored.data?.filename));
check(
  'another account cannot fetch it',
  (await call('GET', `/rest/PdfIcons/${encodeURIComponent(stored.data?.filename ?? '')}`, { cookie: otherUser })).status === 404,
);
const escaped = await call('GET', `/rest/PdfIcons/${encodeURIComponent('../../config.php')}`, { cookie: user });
check('a traversal path serves nothing', escaped.status === 404 && !escaped.text.includes('test-db-secret'));

console.log(failed ? `\n${failed} failed` : '\nall passed');
await finish(failed ? 1 : 0);
