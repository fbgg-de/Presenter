/**
 * Client error-reporting noise filter test.
 *
 *   node test/error-noise/run.mjs
 *   npm run test:noise
 *
 * Mobile browsers inject extension content scripts into every page, and their failures arrive
 * through `window.onerror` indistinguishable from the app's own. `utils/errorNoise.ts` decides
 * what gets reported to the server log; this pins that decision down in both directions, because
 * both failure modes are bad and only one of them is visible:
 *
 *   - too permissive → the log fills with third-party faults and buries real ones
 *   - too aggressive → a genuine crash is silently dropped and nobody ever learns about it
 *
 * The cases below are taken verbatim from a production log (a Brave/iOS session) plus the real
 * application errors that appeared alongside them and must survive the filter.
 *
 * The module is compiled with esbuild rather than imported directly, so this exercises exactly
 * what the early-capture script bundles — see vite.plugin.error-fallback.ts.
 */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const result = await build({
  entryPoints: [join(repoRoot, 'src', 'renderer', 'src', 'utils', 'errorNoise.ts')],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'browser',
});

const outFile = join(mkdtempSync(join(tmpdir(), 'error-noise-')), 'errorNoise.mjs');
writeFileSync(outFile, result.outputFiles[0].text);

const { isThirdPartyNoise } = await import(pathToFileURL(outFile).href);

/** [message, at, shouldBeDropped] */
const cases = [
  // ── Extension noise, verbatim from the log ────────────────────────────────
  ["TypeError: undefined is not an object (evaluating 'window.__firefox__.reader')", 'https://presenter.efsh.de/:1:19', true],
  ["ReferenceError: Can't find variable: __firefox__", 'https://presenter.efsh.de/:1:12', true],
  ["ReferenceError: Can't find variable: DarkReader", 'https://presenter.efsh.de/:1:11', true],
  [
    "TypeError: undefined is not an object (evaluating 'window.ethereum.selectedAddress = undefined')",
    'https://presenter.efsh.de/:1:16',
    true,
  ],
  [
    "TypeError: undefined is not an object (evaluating 'window.__firefox__.playlistLongPressed_AC556214149143C39D7C8970A41C9161')",
    'https://presenter.efsh.de/:1:19',
    true,
  ],
  [
    "TypeError: undefined is not an object (evaluating 'window.__firefox__.refresh_youtube_quality_5FBEDF15F9524D868D19E5F7996CFDDA')",
    'https://presenter.efsh.de/login:1:19',
    true,
  ],
  // Chrome/Brave on iOS inject __gCrWeb rather than __firefox__; same class, different vendor.
  ["ReferenceError: Can't find variable: __gCrWeb", 'https://presenter.efsh.de/control:1:9', true],
  ['Script error.', null, true],
  ['Script error.', ':0:0', true],
  ['Some failure', 'chrome-extension://abcdef/inject.js:1:1', true],
  ['Some failure', 'safari-web-extension://abcdef/inject.js:1:1', true],

  // ── Real application errors that MUST still be reported ───────────────────
  ['Failed to load video', 'http://127.0.0.1:9100/KiTa%20Familiengottesdienst.mp4', false],
  ['Failed to load img', 'http://127.0.0.1:9100/25-09-04%2022-29-53%201280.jpg', false],
  ["TypeError: Cannot read properties of undefined (reading 'blocks')", 'https://presenter.efsh.de/assets/index-a1b2.js:42:7', false],
  ['ChunkLoadError: Loading chunk 12 failed', 'https://presenter.efsh.de/assets/chunk.js:1:1', false],
  ['Unhandled rejection', null, false],
  ['Unknown error', null, false],
  // Mentions a script but is ours, and is not the bare cross-origin message:
  ['Script failed to initialise the presentation window', 'https://presenter.efsh.de/presentation.html:10:3', false],
];

let failed = 0;

for (const [message, at, expected] of cases) {
  const actual = isThirdPartyNoise(message, at);
  const ok = actual === expected;
  if (!ok) failed++;
  const mark = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`  ${mark} ${expected ? 'drop' : 'keep'}  ${message.slice(0, 80)}`);
}

console.log('\n' + '─'.repeat(72));
if (failed === 0) {
  console.log(`\x1b[32m✓ all ${cases.length} cases correct\x1b[0m`);
} else {
  console.log(`\x1b[31m✗ ${failed} of ${cases.length} wrong\x1b[0m`);
}
console.log('─'.repeat(72));

process.exit(failed === 0 ? 0 : 1);
