'use strict';

/**
 * Publish ONLY the server-side release artefacts — the WebSocket relay and the live viewer —
 * to the GitHub release for the current app version.
 *
 *   npm run publish:artifacts
 *   npm run publish:artifacts -- --dry-run    # package only, upload nothing
 *
 * The app itself is published by `publish:win` / `publish:mac`, which attach these same
 * files through the electron-builder hook. This script exists for the case where the app
 * has not changed but the relay or the viewer has: shipping a new relay should not require
 * rebuilding and re-uploading a desktop app that is byte-for-byte the same.
 *
 * It reuses electron-builder's own publisher rather than reimplementing GitHub uploads, so
 * the owner, repo, release type and token handling all come from the same place the app
 * publish uses: the `publish:` block of electron-builder.yml and GH_TOKEN. The release for
 * this version is created as a draft if it does not exist yet, and an asset that is already
 * there is replaced.
 *
 * Requires GH_TOKEN (or GITHUB_TOKEN) in the environment, exactly like `publish:win`.
 */

const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const yaml = require('js-yaml');
const { CancellationToken } = require('builder-util-runtime');
const { GitHubPublisher } = require('electron-publish');

const { packageArtifacts, versionOf, repoRoot } = require('./package-artifacts.cjs');

const OUT_DIR = join(repoRoot, 'dist-app');

// Packaging is safe to repeat; uploading creates a GitHub release. --dry-run does the first
// and stops before the second, so the packaging can be checked without touching the repo.
const dryRun = process.argv.slice(2).includes('--dry-run');

/** Read the `publish:` block out of electron-builder.yml so there is one source of truth. */
function githubOptions() {
  const config = yaml.load(readFileSync(join(repoRoot, 'electron-builder.yml'), 'utf8'));
  const publish = config?.publish;

  if (!publish || publish.provider !== 'github') {
    throw new Error('electron-builder.yml has no GitHub publish configuration');
  }

  return publish;
}

async function main() {
  if (!dryRun && !process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
    console.error('GH_TOKEN (or GITHUB_TOKEN) must be set — the same token `publish:win` uses.');
    process.exit(1);
  }

  const version = versionOf(repoRoot);
  const options = githubOptions();

  console.log(`\n  • packaging server-side release artefacts for v${version}…`);
  const artifacts = await packageArtifacts(OUT_DIR);

  if (dryRun) {
    console.log(`\n  DRY RUN — would upload to ${options.owner}/${options.repo} release v${version} (${options.releaseType ?? 'draft'}):`);
    for (const file of artifacts) console.log(`    ${file}`);
    console.log('');
    return;
  }

  const publisher = new GitHubPublisher({ cancellationToken: new CancellationToken(), progress: null }, options, version, {
    publish: 'always',
  });

  console.log(`\n  • uploading to ${options.owner}/${options.repo} release v${version} (${options.releaseType ?? 'draft'})…`);

  // Sequentially: the first upload is what creates the release if it is missing, and racing
  // several uploads against that would have them each try to create it.
  for (const file of artifacts) {
    await publisher.upload({ file, arch: null });
    console.log(`    uploaded ${file}`);
  }

  console.log(`\n✅  ${artifacts.length} artefact(s) published to ${options.owner}/${options.repo} v${version}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
