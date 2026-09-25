/**
 * Nextcloud in the web version: media paths inside the media folder turn into public-link
 * addresses (and only in the browser, only with a media folder), paths inside the user's files,
 * and the relay's guards: only the account's Nextcloud, https, public unless the account allows
 * its private network.
 *
 *   node test/nextcloud/run.mjs
 */
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const dir = mkdtempSync(join(tmpdir(), 'nextcloud-'));
let failed = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) {
    failed++;
    console.log(`FAIL ${name}\n  got  ${a}\n  want ${b}`);
  } else {
    console.log(`ok   ${name}`);
  }
};

// A browser-like global with storage, without the desktop bridge.
const store = new Map();
globalThis.window = { addEventListener() {} };
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

await build({
  entryPoints: ['src/renderer/src/utils/mediaUrl.ts'],
  bundle: true,
  format: 'esm',
  outfile: join(dir, 'media-url.mjs'),
  platform: 'node',
  alias: { '@': resolve('src/renderer/src'), react: resolve('node_modules/react') },
});
const M = await import(pathToFileURL(join(dir, 'media-url.mjs')).href);
await build({
  entryPoints: ['src/renderer/src/nextcloud/connection.ts'],
  bundle: true,
  format: 'esm',
  outfile: join(dir, 'connection.mjs'),
  platform: 'node',
  alias: { '@': resolve('src/renderer/src'), react: resolve('node_modules/react') },
});
// mediaUrl bundles its own copy of the connection module, so the tests set the connection
// through storage and a fresh import, the way a reload would.
const connection = {
  server: 'https://cloud.example.com/',
  loginName: 'anna',
  appPassword: 'secret',
  root: 'Gemeinde/Medien',
  share: { token: 'Ab12Cd', url: 'https://cloud.example.com/s/Ab12Cd' },
};

// ── Without a connection ──
eq(
  'without Nextcloud a media path goes to the local media server',
  M.resolveMediaUrl('Worship/clouds.mp4'),
  'http://127.0.0.1:9100/Worship/clouds.mp4',
);

// ── With a connection ──
store.set('presenter_nextcloud_connection', JSON.stringify(connection));
const M2 = await import(pathToFileURL(join(dir, 'media-url.mjs')).href + '?connected');
const C = await import(pathToFileURL(join(dir, 'connection.mjs')).href + '?connected');
eq(
  'a media path plays from the public link download',
  M2.resolveMediaUrl('Worship/Ostern 2026/clouds loop.mp4'),
  'https://cloud.example.com/s/Ab12Cd/download?path=%2FWorship%2FOstern+2026&files=clouds+loop.mp4',
);
eq(
  'a file at the top of the media folder',
  M2.resolveMediaUrl('logo.png'),
  'https://cloud.example.com/s/Ab12Cd/download?path=%2F&files=logo.png',
);
eq('web addresses still pass through', M2.resolveMediaUrl('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg');
eq(
  'paths inside the media folder become paths in the user files',
  C.nextcloudPath(C.getNextcloud(), '/Worship/a.mp4'),
  'Gemeinde/Medien/Worship/a.mp4',
);
eq('without a media folder link nothing resolves through Nextcloud', C.nextcloudMediaActive({ ...connection, share: undefined }), false);
globalThis.window.api = {};
eq('the desktop app never uses it', C.nextcloudMediaActive(C.getNextcloud()), false);
delete globalThis.window.api;
C.setNextcloud(null);
eq('disconnecting forgets it in this browser', store.has('presenter_nextcloud_connection'), false);

// ── The relay's guards (PHP) ──
const php = spawnSync('php', ['-v'], { encoding: 'utf8' });
if (php.status !== 0) {
  console.log('skip relay guards: php is not available');
} else {
  const harness = join(dir, 'guards.php');
  writeFileSync(
    harness,
    `<?php
// Just enough of the app to load the relay class without a database.
class DB {}
abstract class RestController extends DB {}
interface Rest {}
class Response {
  public function error(int $code = 500, string $message = '', bool $log = true): never { throw new RuntimeException($code . ' ' . $message); }
  public function success(array $json = []): never { throw new RuntimeException('200'); }
}
class Request {}
$source = file_get_contents(${JSON.stringify(resolve('api/NextcloudRelay.php'))});
$source = preg_replace("#require_once\\\\(.*?\\\\);#", '', $source);
eval('?>' . $source);
$target = new ReflectionMethod('NextcloudRelay', 'target');
$davPath = new ReflectionMethod('NextcloudRelay', 'davPath');
$allowPrivate = getenv('NEXTCLOUD_PRIVATE') === '1';
$results = [];
$res = new Response();
foreach (json_decode($argv[1], true) as $address) {
  try { $results[] = $target->invokeArgs(null, [&$res, $address, $allowPrivate])['base']; }
  catch (RuntimeException $e) { $results[] = explode(' ', $e->getMessage())[0]; }
}
foreach (['Worship/Ostern 2026/a b.mp4', '../etc/passwd'] as $path) {
  try { $results[] = $davPath->invokeArgs(null, [&$res, $path]); }
  catch (RuntimeException $e) { $results[] = explode(' ', $e->getMessage())[0]; }
}
foreach (['Cloud.Example.com/nextcloud/', 'http://cloud.example.com', 'https://cloud.example.com:8443', 'https://cloud.example.com/?x=1', ''] as $address) {
  $results[] = NextcloudRelay::normalizeServer($address);
}
echo json_encode($results);
`,
  );
  const run = (addresses, allowPrivate = false) => {
    const out = spawnSync('php', [harness, JSON.stringify(addresses)], {
      encoding: 'utf8',
      env: { ...process.env, NEXTCLOUD_PRIVATE: allowPrivate ? '1' : '0' },
    });
    try {
      return JSON.parse(out.stdout);
    } catch {
      return out.stdout + out.stderr;
    }
  };
  const results = run(['http://1.1.1.1', 'https://127.0.0.1', 'https://10.0.0.5/nextcloud', 'https://1.1.1.1/cloud/', '1.1.1.1']);
  eq('http, loopback and private addresses are refused; https public ones are fine, with or without scheme', results.slice(0, 5), [
    '400',
    '403',
    '403',
    'https://1.1.1.1/cloud',
    'https://1.1.1.1',
  ]);
  eq('paths are encoded per segment and cannot climb out', results.slice(5, 7), ['Worship/Ostern%202026/a%20b.mp4', '400']);
  eq('an admin-entered address is stored in one canonical https form', results.slice(7), [
    'https://cloud.example.com/nextcloud',
    null,
    'https://cloud.example.com:8443',
    null,
    null,
  ]);
  eq('an account can allow its Nextcloud in a private network', run(['https://10.0.0.5'], true)[0], 'https://10.0.0.5');
  eq(
    'the relay reads the Nextcloud from the account, not from the browser',
    /HTTP_X_NEXTCLOUD_SERVER/.test(readFileSync(resolve('api/NextcloudRelay.php'), 'utf8')),
    false,
  );
}

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
