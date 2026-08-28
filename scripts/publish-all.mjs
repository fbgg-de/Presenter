/**
 * Publish a complete release: the server-side artefacts, then the desktop app for each
 * platform.
 *
 *   npm run publish                        # artefacts + every platform this host can build
 *   npm run publish -- --targets=win       # just one
 *   npm run publish -- --targets=artifacts,mac
 *   npm run publish -- --dry-run           # show what would happen, upload nothing
 *
 * Ordering matters. The artefacts go first and only once: `publish:win` and `publish:mac`
 * each attach them on their own, so running both would rebuild the relay twice and upload
 * the same assets twice. This script uploads them up front and sets PRESENTER_SKIP_ARTIFACTS
 * for the platform builds that follow.
 *
 * The renderer build is shared too — `electron-vite build` output is platform-independent,
 * so it runs once here rather than once per platform script.
 *
 * ── macOS ────────────────────────────────────────────────────────────────────────────────
 * A macOS build can only be produced ON macOS: the DMG target needs Apple's tooling, and
 * signing and notarisation need a Mac besides. On any other host the mac target is skipped
 * with a notice rather than failing the whole release — publish Windows from Windows, then
 * run `npm run publish -- --targets=mac` on a Mac against the same version, and both land in
 * the same draft release.
 *
 * Requires GH_TOKEN (or GITHUB_TOKEN), exactly like the individual publish scripts.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const electronBuilderCli = require.resolve('electron-builder/cli.js');

const ALL_TARGETS = ['artifacts', 'win', 'mac'];
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');

/** `--targets=win,mac`, defaulting to everything. */
function requestedTargets() {
  const arg = argv.find((a) => a.startsWith('--targets='));
  if (!arg) return ALL_TARGETS;

  const targets = arg
    .slice('--targets='.length)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const unknown = targets.filter((t) => !ALL_TARGETS.includes(t));
  if (unknown.length > 0) {
    console.error(`Unknown target(s): ${unknown.join(', ')}. Valid: ${ALL_TARGETS.join(', ')}`);
    process.exit(1);
  }

  return targets;
}

/** Run a command, returning true on success. Output is inherited — a publish is a live log. */
function run(label, command, args, env = {}) {
  console.log(`\n\x1b[1m━━ ${label} ━━\x1b[0m`);

  if (dryRun) {
    console.log(`  (dry run) ${command} ${args.join(' ')}`);
    return true;
  }

  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit', env: { ...process.env, ...env } });
  return result.status === 0;
}

const targets = requestedTargets();
const results = [];

if (!dryRun && !process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
  console.error('GH_TOKEN (or GITHUB_TOKEN) must be set before publishing.');
  process.exit(1);
}

// Decided before anything runs: a platform that cannot be built here must not drag the
// shared renderer build along with it.
const platforms = [
  { target: 'win', flag: '--win', label: 'Windows', buildable: true },
  {
    target: 'mac',
    flag: '--mac',
    label: 'macOS',
    buildable: process.platform === 'darwin',
    reason: `cannot build macOS artifacts on ${process.platform}`,
  },
].filter((p) => targets.includes(p.target));

// ── Shared renderer build ───────────────────────────────────────────────────
if (platforms.some((p) => p.buildable)) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  if (!run('build (shared by all platforms)', npm, ['run', 'build'])) {
    console.error('\nBuild failed — nothing was published.');
    process.exit(1);
  }
}

// ── Server-side artefacts ───────────────────────────────────────────────────
if (targets.includes('artifacts')) {
  const args = [join('scripts', 'publish-artifacts.cjs'), ...(dryRun ? ['--dry-run'] : [])];
  // Not routed through run(): a dry run should still package, just not upload, and
  // publish-artifacts.cjs knows how to do that.
  console.log('\n\x1b[1m━━ ws-server + viewer ━━\x1b[0m');
  const result = spawnSync(process.execPath, args, { cwd: repoRoot, stdio: 'inherit' });
  results.push({ target: 'artifacts', ok: result.status === 0 });
}

// The platform builds must not redo the artefacts — see the note at the top.
const skipArtifacts = targets.includes('artifacts') ? { PRESENTER_SKIP_ARTIFACTS: '1' } : {};

// ── Desktop app, per platform ───────────────────────────────────────────────
for (const platform of platforms) {
  if (!platform.buildable) {
    results.push({ target: platform.target, skipped: platform.reason });
    continue;
  }

  const ok = run(platform.label, process.execPath, [electronBuilderCli, platform.flag, '--publish=always'], skipArtifacts);
  results.push({ target: platform.target, ok });
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(72)}`);
if (dryRun) console.log('  DRY RUN — nothing was built or uploaded\n');

let failed = 0;
for (const result of results) {
  if (result.skipped) {
    console.log(`  \x1b[33m•\x1b[0m ${result.target.padEnd(10)} skipped — ${result.skipped}`);
  } else if (result.ok) {
    console.log(`  \x1b[32m✓\x1b[0m ${result.target.padEnd(10)} ${dryRun ? 'would publish' : 'published'}`);
  } else {
    console.log(`  \x1b[31m✗\x1b[0m ${result.target.padEnd(10)} FAILED`);
    failed++;
  }
}

if (results.some((r) => r.target === 'mac' && r.skipped)) {
  console.log('\n  Run `npm run publish -- --targets=mac` on a Mac to add the macOS build');
  console.log('  to the same draft release. Do not bump the version in between.');
}

console.log(`${'─'.repeat(72)}\n`);

process.exit(failed === 0 ? 0 : 1);
