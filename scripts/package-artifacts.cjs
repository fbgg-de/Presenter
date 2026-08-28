'use strict';

/**
 * Packages the two server-side pieces of a release that electron-builder knows nothing
 * about, and that a Presenter deployment needs alongside the desktop app:
 *
 *   ws-server-<relay version>.zip  — the standalone WebSocket relay, bundled into a single
 *                                    file, with its Dockerfile and redeploy.sh
 *   viewer-<app version>.zip       — the live text viewer (index.php + config template)
 *   redeploy.sh                    — loose as well, to bootstrap a host that has none yet
 *
 * Shared by the two ways these reach a release: the electron-builder hook
 * (scripts/afterAllArtifactBuild.cjs), which attaches them to an app publish, and
 * scripts/publish-artifacts.cjs, which uploads them on their own.
 *
 * The relay zip carries the RELAY's version, not the app's: `docker-compose logs` prints
 * that version on its first line, so it is what a deployed relay is compared against. The
 * viewer has no version of its own and rides on the app's.
 */

const { execFileSync } = require('node:child_process');
const { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync } = require('node:fs');
const { join } = require('node:path');

const repoRoot = join(__dirname, '..');
const wsServerDir = join(repoRoot, 'ws-server');
const viewerDir = join(repoRoot, 'viewer');

/** Version out of a package.json, without failing a release over a missing field. */
function versionOf(dir) {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * archiver lives in ws-server's dependencies, not the app's — zipping is a build concern of
 * the relay, and adding a copy at the root just to pack two PHP files would be waste.
 * packageRelay() runs first and installs it, which is what makes this resolvable.
 */
function loadArchiver() {
  try {
    return require(require.resolve('archiver', { paths: [join(wsServerDir, 'node_modules'), join(repoRoot, 'node_modules')] }));
  } catch (err) {
    throw new Error(`could not load archiver (expected in ws-server/node_modules after the relay build): ${err.message}`);
  }
}

function zipFiles(files, outPath) {
  const { ZipArchive } = loadArchiver();

  rmSync(outPath, { force: true });

  return new Promise((resolve, reject) => {
    const output = createWriteStream(outPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);

    for (const { path, name } of files) archive.file(path, { name });

    archive.finalize();
  });
}

/** The bundled relay zip is tens of KB, and "0.0 MB" reads as a failed build. */
const size = (path) => {
  const bytes = statSync(path).size;
  return bytes < 1_048_576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`;
};

/** Runs ws-server/scripts/deploy.js and copies its output under a versioned name. */
function packageRelay(outDir) {
  // Inherit stdio: the deploy script is chatty and its npm step is the slow part of a
  // release. Swallowing that output would make the publish look hung.
  execFileSync(process.execPath, [join('scripts', 'deploy.js')], { cwd: wsServerDir, stdio: 'inherit' });

  const builtZip = join(wsServerDir, 'ws-server-deploy.zip');
  const builtScript = join(wsServerDir, 'redeploy.sh');

  for (const file of [builtZip, builtScript]) {
    // Fail the release rather than quietly publishing the app without its relay.
    if (!existsSync(file)) throw new Error(`ws-server deploy did not produce ${file}`);
  }

  const version = versionOf(wsServerDir);
  const publishedZip = join(outDir, `ws-server-${version}.zip`);
  // Loose as well as inside the zip: a host being set up for the first time has no copy
  // yet, and cannot get one out of an archive it has no script to unpack.
  const publishedScript = join(outDir, 'redeploy.sh');

  copyFileSync(builtZip, publishedZip);
  copyFileSync(builtScript, publishedScript);

  console.log(`  • ws-server: ws-server-${version}.zip (${size(publishedZip)}) and redeploy.sh`);

  return [publishedZip, publishedScript];
}

/**
 * The live viewer is two PHP files dropped onto a web server. config.php is deliberately
 * absent — it is git-ignored and holds the deployment's own token and relay address, so
 * shipping one would either overwrite a working config or publish a token.
 */
async function packageViewer(outDir) {
  const files = [
    { path: join(viewerDir, 'index.php'), name: 'index.php' },
    { path: join(viewerDir, 'config-example.php'), name: 'config-example.php' },
  ];

  for (const file of files) {
    if (!existsSync(file.path)) throw new Error(`viewer: ${file.path} is missing`);
  }

  const version = versionOf(repoRoot);
  const zipPath = join(outDir, `viewer-${version}.zip`);
  await zipFiles(files, zipPath);

  console.log(`  • viewer: viewer-${version}.zip (${size(zipPath)})`);

  return [zipPath];
}

/**
 * Build every server-side artefact into `outDir` and return their paths.
 * The relay goes first: packaging the viewer borrows archiver from its dependencies.
 */
async function packageArtifacts(outDir) {
  mkdirSync(outDir, { recursive: true });

  return [...packageRelay(outDir), ...(await packageViewer(outDir))];
}

module.exports = { packageArtifacts, versionOf, repoRoot };
