<?php
declare(strict_types=1);
/**
 * Server-side guards against other websites and guessed accounts:
 * - Cors::isSameSiteWrite refuses writes started by another site (CSRF), `Origin: null` included
 * - relay tickets (MonitorToken scope `client`) and monitor tokens never pass for each other
 *
 * Run through test/security/run.mjs.
 */
const BASE_URL = 'https://presenter.example/';
const CORS_ALLOWED_ORIGINS = ['http://localhost:5173', 'null'];
const OIDC = ['client_secret' => 'secret'];
const DB = ['password' => 'db'];
require_once __DIR__ . '/../../classes/Cors.php';
require_once __DIR__ . '/../../classes/MonitorToken.php';

$failed = 0;
function check(bool $ok, string $label): void
{
    global $failed;
    if ($ok) echo "ok   $label\n";
    else { $failed++; echo "FAIL $label\n"; }
}
function write(string $method, ?string $origin, string $host): bool
{
    $_SERVER = ['REQUEST_METHOD' => $method, 'HTTP_HOST' => $host] + ($origin === null ? [] : ['HTTP_ORIGIN' => $origin]);
    return Cors::isSameSiteWrite();
}

check(!write('POST', 'https://evil.example', 'presenter.example'), 'a post from another site is refused');
check(!write('POST', 'null', 'presenter.example'), 'Origin: null is refused even when configured');
check(write('POST', 'https://presenter.example', 'presenter.example'), 'same-origin post passes');
check(write('PUT', 'https://presenter.example', 'internal:8080'), 'same-origin behind a proxy passes via BASE_URL');
check(write('POST', 'http://localhost:5173', 'localhost:8000'), 'configured dev origin passes');
check(write('POST', null, 'presenter.example'), 'no Origin (desktop app) passes');
check(write('GET', 'https://evil.example', 'presenter.example'), 'reads are left to CORS');

$ticket = MonitorToken::issue(7, 'client', 3600);
check((MonitorToken::verify($ticket, ['client'])['account'] ?? null) === 7, 'a relay ticket resolves to its account');
check(MonitorToken::verify($ticket) === null, 'a relay ticket is not a monitor token');
check(MonitorToken::verify(MonitorToken::issue(7), ['client']) === null, 'a monitor token is not a relay ticket');
check(MonitorToken::verify($ticket . 'x', ['client']) === null, 'a tampered ticket is refused');
check(MonitorToken::verify(MonitorToken::issue(7, 'client', -1), ['client']) === null, 'an expired ticket is refused');

// error.log is writable without a login, so it lives in its own guarded folder and stays bounded.
require_once __DIR__ . '/../../classes/Logging.php';
$path = new ReflectionProperty(Logging::class, 'filename');
$path->setValue(null, null);
check(str_ends_with(strtr(Logging::file(), '\\', '/'), '/logs/error.log'), 'the log defaults to logs/error.log');

$dir = sys_get_temp_dir() . '/presenter-logs-' . bin2hex(random_bytes(4));
define('LOG_DIR', $dir . '/');
$path->setValue(null, null);
$log = Logging::file();
check($log === $dir . '/error.log', 'LOG_DIR moves it (trailing slash or not)');

Logging::append("first
");
check(is_file($log) && file_get_contents($log) === "first
", 'the folder is created on the first write');
check(trim((string) @file_get_contents($dir . '/.htaccess')) === 'Require all denied', 'and guards itself with its own .htaccess');

file_put_contents($log, str_repeat('x', Logging::MAX_BYTES + 1));
Logging::append("new
");
check(file_get_contents($log) === "new
", 'a full log rotates and starts over');
check(Logging::rotatedFile() === $dir . '/error.1.log', 'the previous log is error.1.log');
check(filesize($dir . '/error.1.log') === Logging::MAX_BYTES + 1, 'and keeps the full previous log');
Logging::append("more
");
check(file_get_contents($log) === "new
more
", 'below the cap it appends');
Logging::error('via the normal API');
check(str_contains(file_get_contents($log), '[ERROR]') && str_contains(file_get_contents($log), 'via the normal API'), 'Logging::error writes through the same file');
foreach (['error.log', 'error.1.log', '.htaccess'] as $name) {
    @unlink($dir . '/' . $name);
}
@rmdir($dir);

echo $failed ? "$failed failed\n" : "all passed\n";
exit($failed ? 1 : 0);
