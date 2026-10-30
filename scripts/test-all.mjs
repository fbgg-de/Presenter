/**
 * npm test — every `test:*` suite that runs headless on a bare checkout, one after another,
 * with a summary at the end. New suites join automatically; list one in SKIP when it needs
 * a desktop session, a browser or a prior build.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SKIP = new Set([
  'test:desktop', // opens real Electron windows from a build
  'test:screens', // headless Chrome/Edge + mock servers
  'test:ws:bundle', // needs the relay bundle from `npm run deploy` in ws-server
]);

const scripts = Object.keys(JSON.parse(readFileSync('package.json', 'utf8')).scripts);
const suites = scripts.filter((name) => name.startsWith('test:') && !SKIP.has(name));
const failed = [];

for (const suite of suites) {
  console.log(`\n\x1b[1m▶ ${suite}\x1b[0m`);
  const { status } = spawnSync('npm', ['run', '-s', suite], { stdio: 'inherit', shell: true });
  if (status !== 0) failed.push(suite);
}

console.log(`\n${suites.length - failed.length}/${suites.length} suites passed${failed.length ? ` — failed: ${failed.join(', ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
