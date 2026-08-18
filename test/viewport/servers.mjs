/**
 * Brings up the app the suite drives: the fixture backend from `test/mock-backend` and a
 * Vite dev server pointed at it.
 *
 * Both get ports the OS handed out rather than the usual 8000/5173, so a run does not collide
 * with a `npm run dev:web:mock` the developer already has open.
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

/** Poll `url` until it answers anything at all. */
async function waitForHttp(url, { timeout = 60000, label = url } = {}) {
  const started = Date.now();
  let last = 'no response yet';
  for (;;) {
    try {
      await fetch(url);
      return;
    } catch (err) {
      last = err.message;
    }
    if (Date.now() - started > timeout) throw new Error(`${label} did not answer within ${timeout}ms (${last})`);
    await sleep(200);
  }
}

/** Spawn a child, tee its output into `logs`, and return a stop() that actually kills it. */
function child(command, args, { cwd, env, tag, verbose }) {
  const proc = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const logs = [];
  for (const [stream, name] of [
    [proc.stdout, 'out'],
    [proc.stderr, 'err'],
  ]) {
    stream.setEncoding('utf8');
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        if (!line) continue;
        logs.push(`[${tag}:${name}] ${line}`);
        if (verbose) console.log(`    \x1b[90m${tag}: ${line}\x1b[0m`);
      }
    });
  }
  return {
    proc,
    logs,
    async stop() {
      if (proc.exitCode !== null) return;
      proc.kill('SIGTERM');
      await new Promise((resolve) => {
        const t = setTimeout(() => {
          proc.kill('SIGKILL');
          resolve();
        }, 3000);
        proc.on('exit', () => {
          clearTimeout(t);
          resolve();
        });
      });
    },
  };
}

/**
 * Start the mock backend and Vite, and resolve once both answer.
 *
 * `admin` maps to MOCK_ADMIN, which is what unlocks the admin routes — the suite does not
 * visit them, but a screen list that grows later may want it.
 */
export async function startApp({ verbose = false, admin = false } = {}) {
  const backendPort = await freePort();
  const webPort = await freePort();

  const mock = child(process.execPath, [path.join('test', 'mock-backend', 'server.mjs')], {
    cwd: REPO_ROOT,
    env: { MOCK_PORT: String(backendPort), MOCK_ADMIN: admin ? '1' : '0' },
    tag: 'mock',
    verbose,
  });
  await waitForHttp(`http://localhost:${backendPort}/rest/Session`, { label: 'Mock backend' });

  const web = child(
    process.execPath,
    [path.join('node_modules', 'vite', 'bin', 'vite.js'), 'dev', '--config', 'vite.config.ts', '--port', String(webPort), '--strictPort'],
    {
      cwd: REPO_ROOT,
      // The dev proxy target is baked into vite.shared.ts; this is the documented override.
      env: { VITE_DEV_BACKEND: `http://localhost:${backendPort}` },
      tag: 'vite',
      verbose,
    },
  );
  await waitForHttp(`http://localhost:${webPort}/`, { label: 'Vite dev server' });

  return {
    origin: `http://localhost:${webPort}`,
    backendOrigin: `http://localhost:${backendPort}`,
    logs: () => [...mock.logs, ...web.logs],
    async stop() {
      await Promise.all([web.stop(), mock.stop()]);
    },
  };
}
