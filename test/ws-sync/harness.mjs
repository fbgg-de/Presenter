/**
 * Test harness for the WebSocket relay: process control, timing helpers and a
 * minimal assertion framework.
 *
 * The relay itself is the REAL server — `ws-server/src/server.ts` is started as a
 * child process via ts-node, so this suite always exercises the current source
 * rather than a checked-in build.
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..');
const WS_SERVER_DIR = path.join(REPO_ROOT, 'ws-server');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ask the OS for a port nobody is using, so parallel runs never collide. */
export function freePort() {
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
 * Start the relay and resolve once it reports it is listening.
 * `ttlSeconds` maps to SYNC_TTL_SECONDS (0 disables selection expiry).
 */
export async function startRelay({ ttlSeconds = 3600, verbose = false } = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, ['-r', 'ts-node/register', path.join('src', 'server.ts')], {
    cwd: WS_SERVER_DIR,
    env: { ...process.env, PORT: String(port), SYNC_TTL_SECONDS: String(ttlSeconds) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const logs = [];
  const capture = (stream, tag) => {
    let buf = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        if (!line) continue;
        logs.push(`[${tag}] ${line}`);
        if (verbose) console.log(`    \x1b[90mrelay: ${line}\x1b[0m`);
      }
    });
  };
  capture(child.stdout, 'out');
  capture(child.stderr, 'err');

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Relay did not start within 20s:\n${logs.join('\n')}`)), 20000);
    const check = () => {
      if (logs.some((l) => l.includes('Listening on port'))) {
        clearTimeout(timer);
        clearInterval(poll);
        resolve();
      }
    };
    const poll = setInterval(check, 50);
    child.on('exit', (code) => {
      clearTimeout(timer);
      clearInterval(poll);
      reject(new Error(`Relay exited early (code ${code}):\n${logs.join('\n')}`));
    });
  });

  return {
    port,
    url: `ws://127.0.0.1:${port}`,
    logs,
    async stop() {
      if (child.exitCode !== null) return;
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        const t = setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 3000);
        child.on('exit', () => {
          clearTimeout(t);
          resolve();
        });
      });
    },
  };
}

/**
 * Wait until every client has been quiet for `quietMs`.
 *
 * Actions here fan out into chains (musician → relay → operator → relay → viewer),
 * so a fixed sleep either flakes or wastes seconds. Waiting for silence settles as
 * soon as the cascade is genuinely finished.
 */
export async function quiesce(clients, { quietMs = 120, maxMs = 4000 } = {}) {
  const started = Date.now();
  for (;;) {
    // Silence is measured from the call, never from a message that predates it —
    // otherwise a quiesce() right after an action returns before the round trip
    // has even left the machine, and every assertion reads the previous state.
    const last = Math.max(started, ...clients.map((c) => c.lastMessageAt));
    if (Date.now() - last >= quietMs) return;
    if (Date.now() - started > maxMs) return;
    await sleep(25);
  }
}

/** Poll a predicate until it is true. Throws with `label` on timeout. */
export async function waitFor(predicate, { timeout = 4000, label = 'condition' } = {}) {
  const started = Date.now();
  for (;;) {
    if (await predicate()) return;
    if (Date.now() - started > timeout) throw new Error(`Timed out waiting for ${label}`);
    await sleep(25);
  }
}

// ── Assertions / reporting ──────────────────────────────────────────────────

export class Reporter {
  constructor() {
    this.scenarios = [];
    this.current = null;
  }

  beginScenario(name, description) {
    this.current = { name, description, checks: [], notes: [], error: null };
    this.scenarios.push(this.current);
    console.log(`\n\x1b[1m▸ ${name}\x1b[0m`);
    if (description) console.log(`  \x1b[90m${description}\x1b[0m`);
  }

  /** A free-text observation printed with the scenario — the "watch" part of the run. */
  note(text) {
    this.current?.notes.push(text);
    console.log(`  \x1b[90m· ${text}\x1b[0m`);
  }

  check(label, ok, detail = '') {
    this.current?.checks.push({ label, ok, detail });
    const mark = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`  ${mark} ${label}${!ok && detail ? `\n      \x1b[31m${detail}\x1b[0m` : ''}`);
    return ok;
  }

  equal(label, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    return this.check(label, a === e, `expected ${e}, got ${a}`);
  }

  fail(label, detail) {
    return this.check(label, false, detail);
  }

  scenarioError(err) {
    if (this.current) this.current.error = err;
    console.log(`  \x1b[31m✗ scenario threw: ${err.message}\x1b[0m`);
  }

  summary() {
    let passed = 0;
    let failed = 0;
    const failures = [];
    for (const s of this.scenarios) {
      for (const c of s.checks) {
        if (c.ok) passed++;
        else {
          failed++;
          failures.push(`${s.name} → ${c.label}${c.detail ? `\n    ${c.detail}` : ''}`);
        }
      }
      if (s.error) {
        failed++;
        failures.push(`${s.name} → threw: ${s.error.message}`);
      }
    }
    console.log('\n' + '─'.repeat(72));
    if (failed === 0) {
      console.log(`\x1b[32m✓ all ${passed} checks passed across ${this.scenarios.length} scenarios\x1b[0m`);
    } else {
      console.log(`\x1b[31m✗ ${failed} failed\x1b[0m, \x1b[32m${passed} passed\x1b[0m across ${this.scenarios.length} scenarios\n`);
      for (const f of failures) console.log(`  \x1b[31m✗\x1b[0m ${f}`);
    }
    console.log('─'.repeat(72));
    return failed;
  }
}
