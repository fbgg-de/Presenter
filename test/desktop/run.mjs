/**
 * The desktop app, for real: Electron started from the build with a throwaway profile, driven over
 * DevTools (windows) and the inspector (main process). Guards what only shows up in Electron:
 *
 * - a fresh profile whose server cannot be reached lands on the login page — the routed "/login"
 *   under file:// used to nest `next=` forever in a blank window
 * - a crashed window reloads by itself; an output keeps the display awake
 * - an output hides while its screen is unplugged and comes back when the screen returns
 * - saved credentials go to a sign-in form once; a form that comes back (wrong password) is not
 *   submitted again — the old double run posted twice, and a loop can lock the ChurchTools account
 * - reloads go through a vetoed unload and a person closing the window is asked (the Live guard),
 *   but Startup Manager's stop (taskkill → WM_CLOSE) and Windows shutting down quit without asking
 *   — a question there would stall the stop or the system shutdown
 *
 *   npm run test:desktop            (builds first — electron-vite build)
 *   node test/desktop/run.mjs --no-build
 *
 * Needs a desktop session (the windows really open). No backend: the server is unreachable on purpose.
 */
import { execFileSync, execSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ELECTRON = createRequire(join(ROOT, 'package.json'))('electron');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const QUIT_MARK = '__desktop_test_will_quit__';

if (!process.argv.includes('--no-build')) execSync('npx electron-vite build', { cwd: ROOT, stdio: 'ignore' });

/** A DevTools connection: send() answers or rejects, on() sees events. */
async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error(`cannot connect to ${url}`));
  });
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    const waiting = pending.get(msg.id);
    if (!waiting) return listeners.forEach((listener) => listener(msg));
    pending.delete(msg.id);
    msg.error ? waiting.reject(new Error(msg.error.message)) : waiting.resolve(msg.result);
  };
  return {
    send: (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        pending.set(++id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params, sessionId }));
        setTimeout(() => reject(new Error(`${method} timed out`)), 20000);
      }),
    on: (listener) => listeners.add(listener),
    close: () => ws.close(),
  };
}

/** Start the app; `main(code)` runs in the main process (require works while it runs). */
async function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'presenter-desktop-'));
  const child = spawn(ELECTRON, ['--inspect=0', '--remote-debugging-port=0', `--user-data-dir=${profile}`, ROOT], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  const urls = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`the app did not start:\n${log.slice(-1500)}`)), 30000);
    const read = (chunk) => {
      log += chunk;
      const browser = /DevTools listening on (ws:\/\/\S+)/.exec(log)?.[1];
      const main = /Debugger listening on (ws:\/\/\S+)/.exec(log)?.[1];
      if (browser && main) {
        clearTimeout(timer);
        resolve({ browser, main });
      }
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
  });
  const browser = await connect(urls.browser);
  const inspector = await connect(urls.main);
  await inspector.send('Runtime.enable');
  // A graceful quit reports will-quit; the shutdown's hard-exit fallback (app.exit) does not, so an exit counts too.
  let quit = false;
  child.on('exit', () => (quit = true));
  inspector.on((msg) => {
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.args?.[0]?.value === QUIT_MARK) quit = true;
  });
  const evaluate = async (send, code, extra) => {
    const result = await send('Runtime.evaluate', {
      expression: `(async () => { ${code} })()`,
      awaitPromise: true,
      returnByValue: true,
      ...extra,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const main = (code) => evaluate(inspector.send, code, { includeCommandLineAPI: true });
  await main(`require('electron').app.on('will-quit', () => console.log('${QUIT_MARK}'))`);
  // Unpackaged, the app docks DevTools into its window, which squeezes the page to a phone layout.
  await main(`const { app, webContents } = require('electron');
    const shut = (wc) => { wc.on('devtools-opened', () => setTimeout(() => wc.closeDevTools(), 0)); if (wc.isDevToolsOpened()) wc.closeDevTools(); };
    webContents.getAllWebContents().forEach(shut); app.on('web-contents-created', (_e, wc) => shut(wc));`);

  const sessions = new Map();
  /** Run JS in the window whose URL contains `match`. */
  const page = async (match, code) => {
    const { targetInfos } = await browser.send('Target.getTargets');
    const target = targetInfos.find((t) => t.type === 'page' && t.url.includes(match));
    if (!target) throw new Error(`no window with "${match}" in its URL`);
    if (!sessions.has(target.targetId)) {
      const { sessionId } = await browser.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
      sessions.set(target.targetId, sessionId);
    }
    const sessionId = sessions.get(target.targetId);
    return { sessionId, value: code === undefined ? undefined : await evaluate((m, p) => browser.send(m, p, sessionId), code) };
  };
  const stop = () => {
    browser.close();
    inspector.close();
    try {
      if (process.platform === 'win32') execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
      else child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {
      /* Windows can hold the profile a moment longer; it is only a temp folder */
    }
  };
  return { main, page, browser, stop, pid: child.pid, hasQuit: () => quit };
}

async function waitFor(check, what, timeout = 15000) {
  const until = Date.now() + timeout;
  for (;;) {
    const value = await check().catch(() => undefined);
    if (value) return value;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await sleep(250);
  }
}

let failed = 0;
const test = async (name, run) => {
  try {
    await run();
    console.log(`ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${name}\n     ${err.message.split('\n')[0]}`);
  }
};
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};

const OUTPUT = `{ name: 'Beamer', displayMode: 'normal', positionX: 100, positionY: 100, width: 640, height: 360,
  fullscreen: false, frameless: true, alwaysOnTop: false, hideMouse: false, frozen: false }`;
/**
 * Close the main window the way a person does: the title-bar X (and Alt+F4) sends the system close
 * command, WM_SYSCOMMAND/SC_CLOSE, which is how Presenter tells a person from Startup Manager.
 */
async function personCloses(app) {
  const findWindow = `require('electron').BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('login.html'))`;
  if (process.platform !== 'win32') return app.main(`${findWindow}.close()`);
  const hwnd = await app.main(`return ${findWindow}.getNativeWindowHandle().readBigUInt64LE(0).toString()`);
  execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    `Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool PostMessage(System.IntPtr h, uint m, System.IntPtr w, System.IntPtr l);';` +
      ` [void][W.U]::PostMessage([System.IntPtr]${hwnd}, 0x0112, [System.IntPtr]0xF060, [System.IntPtr]::Zero)`,
  ]);
}

const mainWindowUrl = `return require('electron').BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('presentation.html'))?.webContents.getURL()`;

// ── Run 1 ───────────────────────────────────────────────────────────────────────────────────
let app = await launch();
try {
  await test('an unreachable server at start shows the login page, not a redirect loop', async () => {
    const url = await waitFor(async () => {
      const current = await app.main(mainWindowUrl);
      return current?.includes('login.html') && current;
    }, 'the login page');
    await sleep(1500); // a loop would have moved on by now
    const settled = await app.main(mainWindowUrl);
    assert(settled === url && /login\.html\?next=index\.html$/.test(url), `window is on ${settled?.slice(0, 120)}`);
  });

  await test('a crashed window reloads by itself', async () => {
    await app.main(`const wc = require('electron').BrowserWindow.getAllWindows()[0].webContents;
      const gone = new Promise((resolve) => wc.once('render-process-gone', resolve));
      wc.forcefullyCrashRenderer(); await gone;`);
    await waitFor(
      () =>
        app.main(`const wc = require('electron').BrowserWindow.getAllWindows()[0].webContents; return !wc.isCrashed() && !wc.isLoading()`),
      'the reload',
    );
  });

  await test('an output window keeps the display awake', async () => {
    await app.page('login.html', `return window.api.createPresentationWindow(${OUTPUT})`);
    await waitFor(() => app.page('presentation.html').then(() => true), 'the output window');
    const { sessionId } = await app.page('presentation.html');
    // Record lock requests from the next load on, then reload the output.
    await app.browser.send('Page.enable', {}, sessionId);
    await app.browser.send(
      'Page.addScriptToEvaluateOnNewDocument',
      {
        source: `window.__locks = []; const request = navigator.wakeLock.request.bind(navigator.wakeLock);
          navigator.wakeLock.request = (type) => request(type).then((lock) => (window.__locks.push(lock.type), lock));`,
      },
      sessionId,
    );
    await app.browser.send('Page.reload', {}, sessionId);
    const locks = await waitFor(async () => (await app.page('presentation.html', 'return window.__locks')).value?.join(','), 'a wake lock');
    assert(locks === 'screen', `locks: ${locks}`);
  });

  await test('an output hides while its screen is unplugged and comes back when it returns', async () => {
    const outputVisible = `return require('electron').BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('presentation.html')).isVisible()`;
    const screenAt = `{ id: 999, bounds: { x: 0, y: 0, width: 1000, height: 800 } }`;
    assert((await app.main(outputVisible)) === true, 'output not visible to begin with');
    await app.main(`require('electron').screen.emit('display-removed', {}, ${screenAt})`);
    assert((await app.main(outputVisible)) === false, 'output still shown after its screen went away');
    await app.main(`require('electron').screen.emit('display-added', {}, ${screenAt})`);
    assert((await app.main(outputVisible)) === true, 'output not back after its screen returned');
    const bounds = await app.main(
      `return require('electron').BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('presentation.html')).getBounds()`,
    );
    assert(Math.abs(bounds.x - 100) <= 2 && Math.abs(bounds.y - 100) <= 2, `output at ${bounds.x},${bounds.y}`);
  });

  await test('saved credentials are submitted once, and never again when the form comes back', async () => {
    // A provider that turns every sign-in down: the same form again, like ChurchTools on a wrong password.
    const posts = [];
    const form = `<form method="post" action="/login"><input type="email" name="username" required>
      <input type="password" name="password" required><button type="submit">Sign in</button></form>`;
    const idp = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        if (req.method === 'POST') posts.push(body);
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(`<!doctype html><title>Sign in</title>${form}`);
      });
    });
    await new Promise((resolve) => idp.listen(0, '127.0.0.1', resolve));
    const loginUrl = await app.main(mainWindowUrl);
    try {
      await app.page(
        'login.html',
        `await window.api.storeCredentials('test@example.test', 'desktop-test'); window.api.setAutoLogin(true); return true`,
      );
      await app.main(
        `require('electron').BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('login.html')).loadURL('http://127.0.0.1:${idp.address().port}/login')`,
      );
      await waitFor(async () => posts.length > 0, 'the automatic submit');
      await sleep(6000); // a loop resubmits every second or so
      assert(posts.length === 1, `${posts.length} submits`);
      assert(posts[0].includes('username=test%40example.test'), `submitted ${posts[0]}`);
    } finally {
      idp.close();
      await app.main(
        `require('electron').BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('presentation.html')).loadURL(${JSON.stringify(loginUrl)})`,
      );
      await waitFor(async () => (await app.main(mainWindowUrl))?.includes('login.html'), 'the login page again');
    }
  });

  await test('a reload goes through a vetoed unload; closing the window is held', async () => {
    const veto = `window.__before = 1; addEventListener('beforeunload', (e) => e.preventDefault()); return true`;
    await app.page('login.html', veto);
    await app.main(
      `require('electron').BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('login.html')).webContents.reload()`,
    );
    await waitFor(async () => (await app.page('login.html', 'return typeof window.__before')).value === 'undefined', 'the reload');
    await app.page('login.html', veto);
    await personCloses(app);
    await sleep(1500);
    const windows = await app.main(`return require('electron').BrowserWindow.getAllWindows().length`);
    assert(windows === 2 && !app.hasQuit(), `windows left: ${windows}, quit: ${app.hasQuit()}`);
  });
} finally {
  app.stop();
}

// ── Closes that are not a person's must never ask, even with the Live guard up ───────────────
const quitsWithoutAsking = (name, close) =>
  test(name, async () => {
    const run = await launch();
    try {
      await waitFor(async () => (await run.main(mainWindowUrl))?.includes('login.html'), 'the login page');
      await run.page('login.html', `return window.api.createPresentationWindow(${OUTPUT})`);
      await waitFor(() => run.page('presentation.html').then(() => true), 'the output window');
      await run.page('login.html', `addEventListener('beforeunload', (e) => e.preventDefault()); return true`);
      await close(run);
      await waitFor(async () => run.hasQuit(), 'the app to quit', 10000);
    } finally {
      run.stop();
    }
  });

if (process.platform === 'win32') {
  // Exactly Startup Manager's graceful stop: taskkill without /F posts WM_CLOSE to the window.
  await quitsWithoutAsking("Startup Manager's stop (WM_CLOSE) quits without asking", (run) =>
    execSync(`taskkill /PID ${run.pid}`, { stdio: 'ignore' }),
  );
}
await quitsWithoutAsking('Windows shutting down is not held up by the Live guard', (run) =>
  run.main(`const { BrowserWindow } = require('electron');
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('login.html'));
    win.emit('query-session-end', { preventDefault() {} });
    setTimeout(() => win.close(), 50);`),
);

console.log(failed === 0 ? '\nAll desktop checks passed' : `\n${failed} desktop check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
