<?php
declare(strict_types=1);
/**
 * What the presenter adds to the shared OIDC protocol (classes/OidcProtocol.php) for reliability:
 * several sign-ins in flight at once, one retry for lookups, stale discovery/keys when the
 * provider does not answer, key rotation, and a malformed groups claim that does not fail UserInfo.
 * The shared security checks live in the sibling Infoloop project's tests/oidc.php.
 *
 * Run through test/oidc/run.mjs (it loads OpenSSL for PHP builds without it).
 */
require_once __DIR__ . '/../../classes/OidcProtocol.php';

$failed = 0;
function check(bool $ok, string $label): void
{
    global $failed;
    if ($ok) echo "ok   $label\n";
    else { $failed++; echo "FAIL $label\n"; }
}
function enc(string $v): string { return rtrim(strtr(base64_encode($v), '+/', '-_'), '='); }
function newKey(): array
{
    $options = ['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA];
    if (getenv('OPENSSL_CONF')) $options['config'] = getenv('OPENSSL_CONF');
    $key = openssl_pkey_new($options);
    $rsa = openssl_pkey_get_details($key)['rsa'];
    return [$key, ['kty' => 'RSA', 'kid' => 'k1', 'use' => 'sig', 'alg' => 'RS256', 'n' => enc($rsa['n']), 'e' => enc($rsa['e'])]];
}
function sign($key, array $claims): string
{
    $data = enc(json_encode(['alg' => 'RS256', 'kid' => 'k1'])) . '.' . enc(json_encode($claims));
    openssl_sign($data, $signature, $key, OPENSSL_ALGO_SHA256);
    return $data . '.' . enc($signature);
}

$cache = sys_get_temp_dir() . '/presenter-oidc-test-' . bin2hex(random_bytes(4));
mkdir($cache, 0700, true);

/** A provider answering from memory; `fail` makes the next N requests to a URL fail in transport. */
class FakeProvider extends OidcProtocol
{
    public array $jwk = [];
    public array $user = ['sub' => 'member-1', 'groups' => ['Editor']];
    public array $token = [];
    public array $calls = [];
    public array $fail = [];
    public function __construct(public string $dir)
    {
        parent::__construct('https://idp.test/discovery', 'client', 'secret', 'profile', 'https://app.test/oidc', 'https://idp.test');
    }
    protected function cacheDir(): ?string { return $this->dir; }
    protected function requestOnce(string $url, ?array $form, ?string $bearer): array
    {
        $this->calls[] = $url;
        if (($this->fail[$url] ?? 0) > 0) {
            $this->fail[$url]--;
            throw new OidcTransportException(0, 7);
        }
        if (str_ends_with($url, '/discovery')) return ['issuer' => 'https://idp.test', 'authorization_endpoint' => 'https://idp.test/auth',
            'token_endpoint' => 'https://idp.test/token', 'jwks_uri' => 'https://idp.test/keys', 'userinfo_endpoint' => 'https://idp.test/user'];
        if (str_ends_with($url, '/keys')) return ['keys' => [$this->jwk]];
        if (str_ends_with($url, '/user')) return $this->user;
        return $this->token;
    }
}

[$key, $jwk] = newKey();
$base = ['iss' => 'https://idp.test', 'aud' => 'client', 'sub' => 'member-1', 'iat' => time(), 'exp' => time() + 300];

// ── A lookup that hits a network hiccup is tried again once ──
$p = new FakeProvider($cache);
$p->jwk = $jwk;
$p->fail['https://idp.test/discovery'] = 1;
check($p->metadata()['issuer'] === 'https://idp.test', 'discovery succeeds on the second try after a connect error');
$p = new FakeProvider($cache . '/none-' . bin2hex(random_bytes(2)));
$p->fail['https://idp.test/token'] = 1;
try {
    (fn() => $this->request('https://idp.test/token', ['grant_type' => 'x']))->call($p);
    check(false, 'a POST is not retried');
} catch (OidcTransportException) {
    check(count(array_filter($p->calls, fn($u) => str_ends_with($u, '/token'))) === 1, 'a POST is not retried (its code may be used)');
}

// ── Cached discovery: fresh within the hour; a day-old copy when the provider does not answer ──
$p = new FakeProvider($cache);
$p->jwk = $jwk;
$p->metadata();
check(!in_array('https://idp.test/discovery', $p->calls, true), 'discovery comes from the cache the second time');
foreach (glob($cache . '/*.json') as $file) touch($file, time() - 7200);
$p = new FakeProvider($cache);
$p->fail['https://idp.test/discovery'] = 2;
check($p->metadata()['issuer'] === 'https://idp.test', 'a two-hour-old copy is used while the provider is unreachable');

// ── Key rotation: a cached key that no longer verifies is fetched again ──
$p = new FakeProvider($cache);
$p->jwk = $jwk;
$p->parseIdToken(sign($key, $base)); // caches k1
[$newKey, $newJwk] = newKey();       // the provider rotates, keeping the kid
$p = new FakeProvider($cache);
$p->jwk = $newJwk;
try {
    check($p->parseIdToken(sign($newKey, $base))['sub'] === 'member-1', 'a rotated key is fetched fresh when the cached one fails');
} catch (Throwable $e) {
    check(false, 'a rotated key is fetched fresh when the cached one fails: ' . $e->getMessage());
}

// ── Several sign-ins in flight: each comes back to its own context ──
$_SESSION = [];
$p = new FakeProvider($cache);
$p->jwk = $newJwk;
$p->getAuthorizationUrl('state-a', ['license' => 1, 'redirect' => '/a']);
$p->getAuthorizationUrl('state-b', ['license' => 2, 'redirect' => '/b']);
check((OidcProtocol::pendingTransaction('state-a')['context']['license'] ?? null) === 1, 'the first sign-in keeps its account after a second one started');
$nonce = OidcProtocol::pendingTransaction('state-a')['nonce'];
$p->token = ['access_token' => 'access', 'token_type' => 'Bearer', 'expires_in' => 300, 'id_token' => sign($newKey, $base + ['nonce' => $nonce])];
$_GET = ['state' => 'state-a'];
try {
    $p->getToken('code');
    check(true, 'the first sign-in completes although a second one started later');
} catch (Throwable $e) {
    check(false, 'the first sign-in completes although a second one started later: ' . $e->getMessage());
}
check(OidcProtocol::pendingTransaction('state-a') === null, 'a completed sign-in is used up');
check((OidcProtocol::pendingTransaction('state-b')['context']['license'] ?? null) === 2, 'the other sign-in is still pending');
for ($i = 0; $i < 8; $i++) $p->getAuthorizationUrl('s' . $i);
check(count($_SESSION['oidc_transactions']) === 5 && OidcProtocol::pendingTransaction('s7') !== null, 'at most five sign-ins are kept, the newest');

// ── A malformed groups claim does not fail UserInfo ──
$p = new FakeProvider($cache);
$p->user = ['sub' => 'member-1', 'groups' => 'Editor'];
check(($p->getUserInfo('access')['groups'] ?? null) === 'Editor', 'a groups claim sent as one string is left for the caller to judge');

array_map('unlink', glob($cache . '/*') ?: []);
@rmdir($cache);
echo $failed ? "$failed failing\n" : "all passing\n";
exit($failed ? 1 : 0);
