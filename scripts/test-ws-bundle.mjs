/**
 * Run the WebSocket suites against the PACKAGED relay instead of its TypeScript source.
 *
 *   npm run test:ws:bundle
 *
 * The normal suites (`test:ws`, `test:ws-monitor`) exercise `ws-server/src/server.ts` through
 * ts-node, which is what you want while developing. This one points them at
 * `ws-server/deploy/dist/server.js` — the single bundled file that actually ships in the
 * release zip — so the thing being released is tested, not just the thing it was built from.
 *
 * That matters because the bundle is not a plain compile: esbuild inlines `ws` and leaves its
 * optional native accelerators external. A bundling mistake would not show up anywhere else.
 *
 * Requires `npm run deploy` in ws-server/ to have produced the bundle first; the publish path
 * does that automatically.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const entry = join('deploy', 'dist', 'server.js');
const bundle = join(repoRoot, 'ws-server', entry);

if (!existsSync(bundle)) {
  console.error(`No bundle at ${bundle}.\nBuild it first:  cd ws-server && npm run deploy`);
  process.exit(1);
}

const suites = [join('test', 'ws-sync', 'run.mjs'), join('test', 'ws-monitor', 'run.mjs')];
let failed = 0;

for (const suite of suites) {
  console.log(`\n\x1b[1m━━ ${suite} against the bundle ━━\x1b[0m`);
  const result = spawnSync(process.execPath, [suite], {
    cwd: repoRoot,
    // The harness spawns the relay with cwd=ws-server/, so the path is relative to that.
    env: { ...process.env, WS_RELAY_ENTRY: entry },
    stdio: 'inherit',
  });
  if (result.status !== 0) failed++;
}

process.exit(failed === 0 ? 0 : 1);
