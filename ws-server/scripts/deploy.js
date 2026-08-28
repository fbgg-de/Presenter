#!/usr/bin/env node
'use strict';

/**
 * deploy.js
 *
 * Builds the WS relay server and packages it into a self-contained zip
 * ready to upload to a Synology (or any other server) and run with
 * `docker compose up -d` — no npm install or TypeScript compilation
 * needed on the target machine.
 *
 * The relay is bundled into a SINGLE file with esbuild, so the zip carries no
 * node_modules at all: its one runtime dependency (ws) is inlined. That makes the
 * archive a fraction of its former size, removes the production-install step from
 * this script, and means the target never has to resolve a dependency tree — which
 * is exactly the part that used to fail on locked-down NAS boxes.
 *
 * redeploy.sh is shipped inside the zip as well as beside it, so upgrading a
 * deployment also brings any later changes to the deploy procedure itself.
 *
 * Usage (from the ws-server/ directory):
 *   node scripts/deploy.js                  # zip without docker-compose.yml
 *   node scripts/deploy.js --with-compose   # include it (first-time bootstrap)
 *
 * Output: ws-server-deploy.zip  +  redeploy.sh
 *         (redeploy.sh is also inside the zip; upload it separately only the first time)
 */

const { execSync } = require('node:child_process');
const { cpSync, chmodSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, statSync, createWriteStream } = require('node:fs');
const { join, dirname } = require('node:path');

const root = dirname(__dirname); // ws-server/
const deployDir = join(root, 'deploy');
const zipPath = join(root, 'ws-server-deploy.zip');
const bundlePath = join(deployDir, 'dist', 'server.js');

/**
 * docker-compose.yml carries the TARGET host's settings — BACKEND_URL, the published
 * port, SYNC_TTL_SECONDS. Shipping it in the zip means every redeploy silently
 * overwrites them with whatever happens to be in the repo, so it is left out unless
 * explicitly asked for. Pass --with-compose when bootstrapping a host that has no
 * compose file yet.
 */
const withCompose = process.argv.slice(2).includes('--with-compose');

// ── Helpers ────────────────────────────────────────────────────────────────

function run(cmd, cwd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { cwd: cwd ?? root, stdio: 'inherit' });
}

function rmrf(p) {
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
}

function log(msg, color) {
  const codes = { cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', reset: '\x1b[0m' };
  console.log((codes[color] ?? '') + msg + codes.reset);
}

(async () => {
  // ── 1. Dependencies ───────────────────────────────────────────────────────
  // ws-server is a yarn workspace of the repo root, so its dependencies live in the root
  // node_modules and are installed by `yarn install` there — installing again from here
  // would fight that. Fail early with a clear message instead of a confusing "cannot find
  // module" from tsc or esbuild.

  log('\n==> Checking dependencies…', 'cyan');
  // Plain resolution from this file, which is exactly the lookup tsc and esbuild will do:
  // up through ws-server/node_modules (normally absent under the workspace) into the root
  // install. An explicit `paths` would be worse than useless — Node still falls back to this
  // module’s own ancestry, so the check could never fail.
  for (const bin of ['typescript', 'esbuild', 'archiver']) {
    try {
      require.resolve(bin);
    } catch {
      console.error(`ERROR: ${bin} is not installed. Run \`yarn install\` in the repo root.`);
      process.exit(1);
    }
  }

  // ── 2. Type-check ──────────────────────────────────────────────────────────
  // esbuild strips types without checking them, so the compiler still has to run —
  // just for its diagnostics, not for its output.

  log('\n==> Type-checking…', 'cyan');
  run('npx tsc --noEmit');

  // ── 3. Bundle into a single file ───────────────────────────────────────────

  log('\n==> Bundling…', 'cyan');
  rmrf(deployDir);
  mkdirSync(join(deployDir, 'dist'), { recursive: true });

  // bufferutil and utf-8-validate are ws's OPTIONAL native accelerators. They cannot be
  // bundled (they are prebuilt binaries) and must not be, either — ws requires them inside
  // a try/catch and falls back to its JavaScript implementations when they are missing.
  // Marking them external leaves those requires in place, where they fail harmlessly.
  run(
    [
      'npx esbuild src/server.ts',
      '--bundle',
      '--platform=node',
      '--target=node22',
      '--format=cjs',
      '--external:bufferutil',
      '--external:utf-8-validate',
      `--outfile=${JSON.stringify(bundlePath)}`,
    ].join(' '),
  );

  if (!existsSync(bundlePath)) {
    console.error('ERROR: dist/server.js not found after bundling.');
    process.exit(1);
  }

  // ── 4. Assemble deploy/ folder ─────────────────────────────────────────────

  log('\n==> Assembling deploy folder…', 'cyan');

  // A minimal package.json, not the source one: the dependencies are inlined in the
  // bundle, and listing them here would invite someone to run npm install on the target
  // and wonder why nothing changes. The relay reads its version out of this file at
  // startup and prints it on the first log line, which is why it ships at all.
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  writeFileSync(
    join(deployDir, 'package.json'),
    JSON.stringify(
      {
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
        private: true,
        main: 'dist/server.js',
        scripts: { start: 'node dist/server.js' },
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  // Ship the deploy script inside the archive too, so an upgrade carries any later
  // changes to the deploy procedure with it. redeploy.sh re-execs from a temp copy
  // before unpacking, which is what makes replacing itself safe.
  cpSync(join(__dirname, 'redeploy.sh'), join(deployDir, 'redeploy.sh'));

  if (withCompose) {
    cpSync(join(root, 'docker-compose.yml'), join(deployDir, 'docker-compose.yml'));
  }

  // Dockerfile — COPYs the bundle, no npm install and no node_modules in the image.
  writeFileSync(
    join(deployDir, 'Dockerfile'),
    [
      'FROM node:22-alpine',
      '',
      'WORKDIR /app',
      '',
      '# The relay is a single bundled file — no dependency install, in Docker or anywhere.',
      'COPY package.json ./',
      'COPY dist/        ./dist/',
      '',
      'EXPOSE 9001',
      '',
      'ENV PORT=9001',
      '',
      'USER node',
      '',
      'CMD ["node", "dist/server.js"]',
      '',
    ].join('\n'),
    'utf8',
  );

  // ── 5. Create zip (cross-platform via archiver) ────────────────────────────

  log('\n==> Creating zip…', 'cyan');
  rmrf(zipPath);

  // Required here rather than at the top: see the dependency check above.
  const { ZipArchive } = require('archiver');

  await new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);

    // Add deploy/ contents at the zip root, preserving all subdirectories
    archive.directory(deployDir, false);
    archive.finalize();
  });

  // ── 6. Redeploy helper, next to the zip so both get uploaded together ──────

  const redeployPath = join(root, 'redeploy.sh');
  cpSync(join(__dirname, 'redeploy.sh'), redeployPath);
  // Best effort — a no-op on Windows, and SFTP tends to drop the bit anyway, which
  // is why the hint below also offers `bash redeploy.sh`.
  try {
    chmodSync(redeployPath, 0o755);
  } catch {
    /* ignore */
  }

  // ── 7. Report ──────────────────────────────────────────────────────────────

  // Bundled, the zip is tens of KB — reporting it in MB would print a bare "0.0".
  const bytes = statSync(zipPath).size;
  const size = bytes < 1_048_576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`;
  log(`\n✅  ws-server-deploy.zip  (${size})`, 'green');
  log(`✅  redeploy.sh`, 'green');
  log(
    [
      '',
      withCompose
        ? 'This zip INCLUDES docker-compose.yml — it will overwrite the one on the target.'
        : 'This zip does NOT include docker-compose.yml, so the target keeps its own settings.',
      '',
      'Updating an existing deployment:',
      '  1. Upload ws-server-deploy.zip next to the running deployment (the folder',
      '     holding docker-compose.yml). redeploy.sh is already there from last time —',
      '     upload it too only for a first deployment.',
      '  2. Run:  sudo ./redeploy.sh        (or: sudo bash redeploy.sh)',
      '',
      'First-time setup on a fresh host:',
      '  1. Re-run with --with-compose, or copy ws-server/docker-compose.yml over by hand',
      '  2. Edit docker-compose.yml — set BACKEND_URL to your presenter URL',
      '  3. Extract the zip beside it and run:  docker compose up -d',
      '',
    ].join('\n'),
    'yellow',
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
