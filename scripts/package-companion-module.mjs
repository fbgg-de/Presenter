/**
 * Bundle the Bitfocus Companion module (companion-modules/presenter) into a zip that can be
 * extracted into Companion's developer modules folder on any machine.
 *
 * Adapted from the Streamer project's script of the same name. The module is bundled to one
 * file with esbuild, so the zip carries no `node_modules`. Two things make that work: `ws` is
 * CommonJS and calls `require('events')`, which ESM output lacks, so the banner installs a real
 * `require`; and esbuild must not find a stray Yarn PnP manifest (`.pnp.cjs`) above the repo —
 * if the build dies on "Could not resolve @companion-module/base", look upwards for one.
 *
 *   npm run package:companion            → dist-app/companion-module-efsh-presenter-<version>.zip
 *
 * Also called from package-artifacts.cjs, so a published release carries the zip.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const moduleDir = join(root, 'companion-modules', 'presenter');

const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: 'inherit' });

/** Yarn through the bundle the repo pins — `yarn` on PATH is a `.cmd` Node cannot spawn without a shell. */
function runYarn(args, cwd) {
  const configured = /^yarnPath:\s*(.+)$/m.exec(readFileSync(join(root, '.yarnrc.yml'), 'utf8'));
  const bundle = configured && join(root, configured[1].trim());
  if (!bundle || !existsSync(bundle)) throw new Error('Could not find the Yarn release bundle referenced by .yarnrc.yml.');
  run(process.execPath, [bundle, ...args], cwd);
}

/** Zip a directory including itself. PowerShell on Windows, `zip` elsewhere — never GNU tar, which writes a tar named .zip. */
function zipDirectory(parent, folderName, destination) {
  if (process.platform === 'win32') {
    run('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${join(parent, folderName)}' -DestinationPath '${destination}' -Force`], parent);
    return;
  }
  run('zip', ['-r', '-q', destination, folderName], parent);
}

export async function packageCompanionModule(outputDir = join(root, 'dist-app')) {
  const manifest = JSON.parse(readFileSync(join(moduleDir, 'companion', 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(join(moduleDir, 'package.json'), 'utf8'));
  console.log(`Packaging ${manifest.id} ${manifest.version}`);

  const esbuild = join(moduleDir, 'node_modules', 'esbuild', 'bin', 'esbuild');
  if (!existsSync(esbuild)) runYarn(['install'], moduleDir);

  // Staged outside the repo, so a half-built bundle never looks like a source folder to Companion.
  const stage = join(tmpdir(), `companion-module-${manifest.id}-${Date.now()}`);
  const payload = join(stage, 'presenter');
  mkdirSync(join(payload, 'dist'), { recursive: true });

  run(
    process.execPath,
    [
      esbuild,
      join(moduleDir, 'src', 'main.ts'),
      '--bundle',
      '--platform=node',
      '--format=esm',
      '--target=node22',
      `--outfile=${join(payload, 'dist', 'main.js')}`,
      "--banner:js=import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);",
    ],
    moduleDir,
  );

  cpSync(join(moduleDir, 'companion'), join(payload, 'companion'), { recursive: true });
  const { name, version, type, main, license } = pkg;
  writeFileSync(join(payload, 'package.json'), JSON.stringify({ name, version, type, main, license, private: true }, null, 2) + '\n');
  writeFileSync(
    join(payload, 'INSTALL.txt'),
    [
      `${manifest.name} ${manifest.version} — Bitfocus Companion module`,
      '',
      'A ready-to-load Companion module; no build step needed.',
      '',
      '  1. Extract this "presenter" folder somewhere permanent, e.g. C:\\companion-modules\\presenter',
      '  2. In the Companion launcher, open the settings cog and set "Developer modules path" to the',
      '     PARENT folder (C:\\companion-modules), not to this one.',
      '  3. Restart Companion — the launcher reads that setting only at startup.',
      '  4. Add a connection, search for "Presenter", and point it at the machine running the',
      '     Presenter desktop app (port 9001).',
      '',
    ].join('\n'),
  );

  mkdirSync(outputDir, { recursive: true });
  const zipPath = join(outputDir, `companion-module-${manifest.id}-${manifest.version}.zip`);
  rmSync(zipPath, { force: true });
  zipDirectory(stage, 'presenter', zipPath);
  rmSync(stage, { recursive: true, force: true });

  console.log(`Wrote ${zipPath} (${(statSync(zipPath).size / 1024).toFixed(0)} KB)`);
  return zipPath;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await packageCompanionModule();
}
