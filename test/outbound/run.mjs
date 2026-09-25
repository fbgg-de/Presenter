/**
 * The guard for requests to addresses an account entered itself (classes/OutboundHttp.php, used by
 * the ChurchTools client): https only, public addresses unless the admin allowed a private network,
 * relative redirects resolved against the answering URL, and refused targets never contacted.
 *
 *   node test/outbound/run.mjs
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

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

const php = spawnSync('php', ['-v'], { encoding: 'utf8' });
if (php.status !== 0) {
  console.log('skip: php is not available');
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), 'outbound-'));
const harness = join(dir, 'outbound.php');
writeFileSync(
  harness,
  `<?php
require ${JSON.stringify(resolve('classes/OutboundHttp.php'))};
$out = [];
$check = fn (string $url, bool $private = false) => ($r = OutboundHttp::check($url, $private))['ok'] ? $r['resolve'] : $r['reason'];
$out['check'] = [
  $check('http://1.1.1.1/api/'),
  $check('https://user:pw@1.1.1.1/'),
  $check('https://127.0.0.1/'),
  $check('https://10.1.2.3/api/'),
  $check('https://192.168.0.10:8443/'),
  $check('https://10.1.2.3/api/', true),
  $check('https://1.1.1.1/api/'),
  $check('ftp://1.1.1.1/'),
];
$loc = fn (string $base, string $location) => OutboundHttp::resolveLocation($base, $location);
$out['location'] = [
  $loc('https://ct.example.org/api/files/1', 'https://cdn.example.net/x.pdf'),
  $loc('https://ct.example.org/api/files/1', '/index.php?q=public/filedownload'),
  $loc('https://ct.example.org:8443/api/files/1', 'download?id=1'),
  $loc('https://ct.example.org/api/files/1', '//other.example.net/y'),
  $loc('https://ct.example.org/api/files/1', '?page=2'),
];
// Refused before any connection is made: the answer carries the reason, no body.
if (extension_loaded('curl')) {
  $refused = OutboundHttp::exec([CURLOPT_URL => 'https://127.0.0.1:9/secret'], false);
  $out['exec'] = [$refused['body'], $refused['status'], str_contains($refused['error'], 'private network')];
} else {
  $out['exec'] = 'skip';
}
echo json_encode($out);
`,
);

const run = spawnSync('php', [harness], { encoding: 'utf8' });
let result;
try {
  result = JSON.parse(run.stdout);
} catch {
  console.log('FAIL harness\n' + run.stdout + run.stderr);
  process.exit(1);
}

eq('only public https addresses pass, pinned to the checked address', result.check, [
  'not an https address',
  'not an https address',
  'address is in a private network',
  'address is in a private network',
  'address is in a private network',
  '10.1.2.3:443:10.1.2.3',
  '1.1.1.1:443:1.1.1.1',
  'not an https address',
]);
eq('redirect targets resolve against the answering URL', result.location, [
  'https://cdn.example.net/x.pdf',
  'https://ct.example.org/index.php?q=public/filedownload',
  'https://ct.example.org:8443/api/files/download?id=1',
  'https://other.example.net/y',
  'https://ct.example.org/api/files/1?page=2',
]);
if (result.exec === 'skip') console.log('skip a refused address is never requested: php has no curl extension');
else eq('a refused address is never requested', result.exec, [false, 0, true]);

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
