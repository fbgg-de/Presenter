/**
 * Section name → colour kind (utils/sectionColor.ts).
 *
 *   node test/section-color/run.mjs
 *
 * The order of the patterns is the failure mode: "Pre-Chorus" must not come out as a chorus,
 * "Vorrefrain" not as a refrain.
 */
import { build } from 'esbuild';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

const dir = mkdtempSync(join(tmpdir(), 'section-color-'));
await build({ entryPoints: ['src/renderer/src/utils/sectionColor.ts'], bundle: true, format: 'esm', outdir: dir, platform: 'node' });
const { sectionKind } = await import(pathToFileURL(join(dir, 'sectionColor.js')).href);

const cases = {
  'Verse 1': 'verse',
  'Strophe 2a': 'verse',
  Vers: 'verse',
  Chorus: 'chorus',
  'Refrain 2x': 'chorus',
  'Pre-Chorus': 'prechorus',
  PreChorus: 'prechorus',
  Vorrefrain: 'prechorus',
  Bridge: 'bridge',
  Brücke: 'bridge',
  Intro: 'intro',
  Ending: 'outro',
  Schluss: 'outro',
  Zwischenspiel: 'interlude',
  Tag: 'tag',
  'Johannes 3,16': null,
  '': null,
  undefined: null,
};

let failed = 0;
for (const [name, want] of Object.entries(cases)) {
  const got = sectionKind(name === 'undefined' ? undefined : name);
  if (got !== want) {
    failed++;
    console.error(`✗ ${JSON.stringify(name)}: got ${got}, want ${want}`);
  }
}
console.log(failed ? `${failed} failed` : `✓ ${Object.keys(cases).length} section names`);
process.exit(failed ? 1 : 0);
