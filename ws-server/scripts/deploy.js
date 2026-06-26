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
 *   node scripts/deploy.js
 *
 * Output: ws-server-deploy.zip
 */

const { execSync } = require('node:child_process');
const { cpSync, mkdirSync, rmSync, writeFileSync, existsSync, statSync, createWriteStream } = require('node:fs');
const { join, dirname } = require('node:path');
const { ZipArchive } = require('archiver');

const root = dirname(__dirname); // ws-server/
const deployDir = join(root, 'deploy');
const tmpNmDir = join(root, '.tmp-prod-nm');
const zipPath = join(root, 'ws-server-deploy.zip');

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
  cpSync(join(root, 'docker-compose.yml'), join(deployDir, 'docker-compose.yml'));
  cpSync(join(tmpNmDir, 'node_modules'), join(deployDir, 'node_modules'), { recursive: true });

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

  // ── 6. Report ──────────────────────────────────────────────────────────────

  rmrf(tmpNmDir);

  const sizeMB = (statSync(zipPath).size / 1_048_576).toFixed(1);
  log(`\n✅  ws-server-deploy.zip  (${sizeMB} MB)`, 'green');
  log(
    [
      '',
      'Next steps:',
      '  1. Edit deploy/docker-compose.yml — set BACKEND_URL to your presenter URL',
      '  2. Upload ws-server-deploy.zip to the Synology and extract it',
      '  3. Run:  docker compose up -d',
      '',
    ].join('\n'),
    'yellow',
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
