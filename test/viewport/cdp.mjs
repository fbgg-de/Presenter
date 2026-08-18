/**
 * Minimal Chrome DevTools Protocol client.
 *
 * The repo has no browser-automation dependency and this suite deliberately does not add one:
 * every machine that can build the app already has Chrome or Edge, and `ws` is already a
 * dependency (the relay uses it). What is left is a few hundred lines of CDP plumbing —
 * launch, attach, evaluate, screenshot — which is cheaper to own than a browser download.
 *
 * Only what the viewport suite needs is implemented. It is not a Playwright replacement.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ask the OS for a port nobody is using, so parallel runs never collide. */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Chrome/Edge locations, in preference order. Chrome first: Edge on Windows can be managed
 * by policies (forced extensions, startup pages) that change what a page ends up seeing.
 */
const CANDIDATES = {
  win32: [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'],
};

/** Resolve a browser binary, honouring CHROME_PATH when the guesses are wrong. */
export function findBrowser() {
  if (process.env.CHROME_PATH) {
    if (!existsSync(process.env.CHROME_PATH)) {
      throw new Error(`CHROME_PATH points at a file that does not exist: ${process.env.CHROME_PATH}`);
    }
    return process.env.CHROME_PATH;
  }
  const found = (CANDIDATES[process.platform] ?? []).find((p) => existsSync(p));
  if (!found) {
    throw new Error(`No Chrome or Edge found for platform "${process.platform}".\nSet CHROME_PATH=/path/to/chrome and run again.`);
  }
  return found;
}

/**
 * Launch a headless browser and connect to its DevTools endpoint.
 *
 * The endpoint is discovered by polling `/json/version` on a port we picked, not by parsing
 * stderr: on Windows the process we spawn is a launcher that hands off to the real browser
 * and exits, so its stderr closes before the banner is ever written and its exit code says
 * nothing about whether the browser came up.
 */
export async function launchBrowser({ headless = true, slowMo = 0 } = {}) {
  const binary = findBrowser();
  const profile = mkdtempSync(path.join(tmpdir(), 'presenter-viewport-'));
  const port = await freePort();

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--metrics-recording-only',
    // Deterministic geometry: the suite asserts on pixel positions, and a scrollbar that is
    // 15px wide on one machine and 0 on another moves every right edge it measures.
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--force-prefers-reduced-motion',
    'about:blank',
  ];
  if (headless) args.unshift('--headless=new', '--disable-gpu');

  const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const wsUrl = await waitForDevTools(port, () => stderr);
  const conn = await connect(wsUrl, slowMo);

  return {
    binary,
    conn,
    async newPage(options) {
      return newPage(conn, options);
    },
    async close() {
      try {
        await conn.send('Browser.close');
      } catch {
        // Already gone — the kill below is the backstop.
      }
      conn.dispose();
      if (child.exitCode === null) child.kill();
      await sleep(100);
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        // Windows keeps profile files locked briefly after exit; a stale temp dir is harmless.
      }
    },
  };
}

/** Poll the DevTools HTTP endpoint until it hands back a browser websocket URL. */
async function waitForDevTools(port, stderr, timeout = 30000) {
  const started = Date.now();
  let lastError = 'no response yet';
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      const info = await res.json();
      if (info.webSocketDebuggerUrl) return info.webSocketDebuggerUrl;
      lastError = `/json/version had no webSocketDebuggerUrl: ${JSON.stringify(info)}`;
    } catch (err) {
      lastError = err.message;
    }
    if (Date.now() - started > timeout) {
      throw new Error(`Browser did not open a DevTools endpoint on :${port} within ${timeout}ms (${lastError}).\n${stderr()}`);
    }
    await sleep(150);
  }
}

/** Open the CDP websocket and multiplex commands/events over it. */
function connect(wsUrl, slowMo) {
  const ws = new WebSocket(wsUrl, { maxPayload: 256 * 1024 * 1024 });
  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();
  let closedReason = null;

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id !== undefined) {
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(`${entry.method}: ${msg.error.message}`));
      else entry.resolve(msg.result);
      return;
    }
    for (const fn of listeners) fn(msg);
  });

  ws.on('close', () => {
    closedReason ??= new Error('CDP connection closed');
    for (const [, entry] of pending) entry.reject(closedReason);
    pending.clear();
  });

  const ready = new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  const conn = {
    async send(method, params = {}, sessionId) {
      if (slowMo) await sleep(slowMo);
      const id = nextId++;
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject, method });
        ws.send(JSON.stringify(payload));
      });
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    dispose() {
      closedReason = new Error('CDP connection disposed');
      try {
        ws.close();
      } catch {
        // Nothing to do — the socket is going away either way.
      }
    },
  };

  return ready.then(() => conn);
}

/**
 * Create a tab, attach to it, and return a small page API.
 *
 * The target is attached flat (`flatten: true`), so page commands travel over the same
 * socket tagged with a sessionId rather than needing a second connection.
 */
async function newPage(conn, { device } = {}) {
  const { targetId } = await conn.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await conn.send('Target.attachToTarget', { targetId, flatten: true });

  const send = (method, params) => conn.send(method, params, sessionId);

  const consoleMessages = [];
  const pageErrors = [];
  conn.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.consoleAPICalled') {
      consoleMessages.push({ type: msg.params.type, text: msg.params.args.map(describeRemoteObject).join(' ') });
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      pageErrors.push(d.exception?.description ?? d.text);
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');

  if (device) await applyDevice(send, device);

  const page = {
    sessionId,
    consoleMessages,
    pageErrors,
    send,

    /** Navigate and wait for the load event plus one idle frame. */
    async goto(url, { timeout = 30000 } = {}) {
      const loaded = waitForEvent(conn, sessionId, 'Page.loadEventFired', timeout);
      await send('Page.navigate', { url });
      await loaded;
      await page.raf();
    },

    async reload() {
      const loaded = waitForEvent(conn, sessionId, 'Page.loadEventFired', 30000);
      await send('Page.reload', {});
      await loaded;
      await page.raf();
    },

    /**
     * Evaluate `fn` (a function, serialised and re-parsed in the page) with JSON-able args.
     * Rejects with the page-side error rather than a bare "Object" so failures are readable.
     */
    async evaluate(fn, ...args) {
      const expression = `(${fn.toString()}).apply(null, ${JSON.stringify(args)})`;
      const { result, exceptionDetails } = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      });
      if (exceptionDetails) {
        throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text ?? 'evaluate failed');
      }
      return result.value;
    },

    /** Resolve once `fn(...args)` returns truthy in the page, or throw with `label` in the message. */
    async waitFor(fn, { timeout = 10000, interval = 100, label = 'condition' } = {}, ...args) {
      const started = Date.now();
      for (;;) {
        let value;
        try {
          value = await page.evaluate(fn, ...args);
        } catch (err) {
          // A predicate can run mid-render against a half-built tree; only a timeout is fatal.
          value = false;
          if (Date.now() - started > timeout) throw err;
        }
        if (value) return value;
        if (Date.now() - started > timeout) throw new Error(`Timed out after ${timeout}ms waiting for ${label}`);
        await sleep(interval);
      }
    },

    /** Two animation frames — enough for React to commit and the browser to lay out. */
    async raf() {
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))));
    },

    async screenshot({ fullPage = false } = {}) {
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: fullPage, fromSurface: true });
      return Buffer.from(data, 'base64');
    },

    async close() {
      await conn.send('Target.closeTarget', { targetId });
    },
  };

  return page;
}

/** Apply a device preset: metrics, touch and user agent, so media queries and UA sniffs agree. */
async function applyDevice(send, device) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: device.width,
    height: device.height,
    deviceScaleFactor: device.deviceScaleFactor ?? 1,
    mobile: device.mobile ?? true,
    screenWidth: device.width,
    screenHeight: device.height,
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: device.mobile ?? true, maxTouchPoints: 5 });
  if (device.userAgent) {
    await send('Emulation.setUserAgentOverride', { userAgent: device.userAgent });
  }
  // MUI's `pointer: coarse` / hover queries decide whether hover-only affordances render
  // at all, which changes what is on screen to measure.
  await send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'pointer', value: device.mobile ? 'coarse' : 'fine' },
      { name: 'any-pointer', value: device.mobile ? 'coarse' : 'fine' },
      { name: 'hover', value: device.mobile ? 'none' : 'hover' },
    ],
  });
}

function waitForEvent(conn, sessionId, method, timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error(`Timed out after ${timeout}ms waiting for ${method}`));
    }, timeout);
    const off = conn.on((msg) => {
      if (msg.sessionId === sessionId && msg.method === method) {
        clearTimeout(timer);
        off();
        resolve(msg.params);
      }
    });
  });
}

function describeRemoteObject(obj) {
  if (obj.type === 'string') return obj.value;
  if ('value' in obj) return JSON.stringify(obj.value);
  return obj.description ?? obj.type;
}
