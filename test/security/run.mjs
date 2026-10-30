/**
 * npm run test:security — runs test/security/checks.php (CSRF guard, relay ticket scopes).
 * Skips when PHP is not installed.
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

if (spawnSync('php', ['-v']).status !== 0) {
  console.log('skip: php is not available');
  process.exit(0);
}
const run = spawnSync('php', [resolve('test/security/checks.php')], { stdio: 'inherit' });
process.exit(run.status ?? 1);
