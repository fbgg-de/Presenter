/**
 * The presenter's OIDC reliability checks (test/oidc/protocol.php): parallel sign-ins, retries,
 * stale discovery, key rotation, malformed groups. PHP builds without OpenSSL loaded (a bare
 * Windows install) get it from their own ext folder.
 *
 *   node test/oidc/run.mjs
 */
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const probe = spawnSync('php', ['-r', 'echo PHP_BINARY, "\\n", extension_loaded("openssl") ? 1 : 0;'], { encoding: 'utf8' });
if (probe.status !== 0) {
  console.log('skip: php is not available');
  process.exit(0);
}
const [binary, openssl] = probe.stdout.trim().split('\n');
const args = [];
const env = { ...process.env };
const home = dirname(binary);
if (openssl !== '1') args.push('-d', `extension_dir=${join(home, 'ext')}`, '-d', 'extension=openssl');
// Windows builds cannot generate keys without their bundled config, loaded from php.ini or not.
const conf = join(home, 'extras', 'ssl', 'openssl.cnf');
if (existsSync(conf) && !env.OPENSSL_CONF) env.OPENSSL_CONF = conf;
const run = spawnSync('php', [...args, resolve('test/oidc/protocol.php')], { encoding: 'utf8', env });
process.stdout.write(run.stdout);
process.stderr.write(run.stderr);
process.exit(run.status ?? 1);
