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
 * Usage (from the ws-server/ directory):
 *   node scripts/deploy.js                  # zip without docker-compose.yml
 *   node scripts/deploy.js --with-compose   # include it (first-time bootstrap)
 *
 * Output: ws-server-deploy.zip  +  redeploy.sh (upload both to the target)
 */

const { execSync } = require('node:child_process');
const { cpSync, chmodSync, mkdirSync, rmSync, writeFileSync, existsSync, statSync, createWriteStream } = require('node:fs');
const { join, dirname } = require('node:path');
const { ZipArchive } = require('archiver');

const root = dirname(__dirname); // ws-server/
const deployDir = join(root, 'deploy');
const tmpNmDir = join(root, '.tmp-prod-nm');
const zipPath = join(root, 'ws-server-deploy.zip');

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
  // ── 1. Install all dependencies (dev + prod) for the TypeScript build ──────

  log('\n==> Installing dependencies…', 'cyan');
  run('npm install');

  // ── 2. Compile TypeScript ──────────────────────────────────────────────────

  log('\n==> Compiling TypeScript…', 'cyan');
  run('npm run build');

  const builtFile = join(root, 'dist', 'server.js');
  if (!existsSync(builtFile)) {
    console.error('ERROR: dist/server.js not found after build.');
    process.exit(1);
  }

  // ── 3. Production-only node_modules in a temp dir ─────────────────────────

  log('\n==> Installing production dependencies…', 'cyan');
  rmrf(tmpNmDir);
  mkdirSync(tmpNmDir);
  cpSync(join(root, 'package.json'), join(tmpNmDir, 'package.json'));
  cpSync(join(root, 'package-lock.json'), join(tmpNmDir, 'package-lock.json'));
  run('npm ci --omit=dev', tmpNmDir);

  // ── 4. Assemble deploy/ folder ─────────────────────────────────────────────

  log('\n==> Assembling deploy folder…', 'cyan');
  rmrf(deployDir);
  mkdirSync(join(deployDir, 'dist'), { recursive: true });

  cpSync(builtFile, join(deployDir, 'dist', 'server.js'));
  cpSync(join(root, 'package.json'), join(deployDir, 'package.json'));
  cpSync(join(tmpNmDir, 'node_modules'), join(deployDir, 'node_modules'), { recursive: true });
  if (withCompose) {
    cpSync(join(root, 'docker-compose.yml'), join(deployDir, 'docker-compose.yml'));
  }

  // Simple Dockerfile — COPYs pre-built files, no npm install in Docker
  writeFileSync(
    join(deployDir, 'Dockerfile'),
    [
      'FROM node:22-alpine',
      '',
      'WORKDIR /app',
      '',
      '# Pre-built artefacts are copied directly — no build step needed.',
      'COPY package.json      ./',
      'COPY node_modules/     ./node_modules/',
      'COPY dist/             ./dist/',
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

  rmrf(tmpNmDir);

  const sizeMB = (statSync(zipPath).size / 1_048_576).toFixed(1);
  log(`\n✅  ws-server-deploy.zip  (${sizeMB} MB)`, 'green');
  log(`✅  redeploy.sh`, 'green');
  log(
    [
      '',
      withCompose
        ? 'This zip INCLUDES docker-compose.yml — it will overwrite the one on the target.'
        : 'This zip does NOT include docker-compose.yml, so the target keeps its own settings.',
      '',
      'Updating an existing deployment:',
      '  1. Upload ws-server-deploy.zip and redeploy.sh next to the running',
      '     deployment (the folder holding docker-compose.yml)',
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
