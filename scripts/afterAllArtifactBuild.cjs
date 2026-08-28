'use strict';

/**
 * electron-builder `afterAllArtifactBuild` hook.
 *
 * Packages the WebSocket relay and the live viewer and hands them back to electron-builder,
 * which uploads them to the same GitHub release as the app. See scripts/package-artifacts.cjs
 * for what is produced and why each piece is versioned the way it is.
 *
 * Why they belong in the release: the relay speaks a protocol the app depends on, and the
 * two version independently. Attaching them by hand meant a release could ship an app that
 * expects a newer relay than the zip beside it — the admin WebSocket tab is exactly that
 * kind of feature (it needs relay >= 1.2.0 and simply stays empty against an older one).
 */

const { packageArtifacts } = require('./package-artifacts.cjs');

/**
 * Whether this electron-builder run intends to publish.
 *
 * The hook runs on every build, but packaging the relay is slow — it installs dependencies
 * and bundles. electron-builder would ignore the returned files on a non-publishing run
 * anyway; this gate is about not paying for the work at all during `build:win` or
 * `build:unpack`.
 *
 * Read from the CLI arguments because the hook runs inside the electron-builder process, so
 * `process.argv` is the invocation itself. `PRESENTER_PUBLISH_ARTIFACTS=1` forces it on for
 * a one-off — rebuilding just these artefacts to attach to a release by hand.
 */
function publishRequested() {
  if (process.env.PRESENTER_PUBLISH_ARTIFACTS === '1') return true;

  const argv = process.argv;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let value = null;

    if (arg === '--publish' || arg === '-p') value = argv[i + 1];
    else if (arg.startsWith('--publish=')) value = arg.slice('--publish='.length);

    // `never` is the one value that means "build only".
    if (value != null && value !== 'never') return true;
  }

  return false;
}

module.exports = async function afterAllArtifactBuild(buildResult) {
  // Set by `npm run publish`, which uploads the artefacts once up front and then builds each
  // platform. Without it the relay would be rebuilt and re-uploaded for every platform.
  if (process.env.PRESENTER_SKIP_ARTIFACTS === '1') {
    console.log('  • ws-server and viewer already published for this release — skipping');
    return [];
  }

  if (!publishRequested()) {
    console.log('  • not publishing — skipping ws-server and viewer packaging');
    return [];
  }

  console.log('\n  • packaging server-side release artefacts…');

  const artifacts = await packageArtifacts(buildResult.outDir);

  console.log('');

  return artifacts;
};
