<?php

require_once(__DIR__ . '/RestController.php');
require_once(__DIR__ . '/../classes/AccountSchema.php');

/**
 * A stateless relay between the web version and the user's Nextcloud.
 *
 * Browsers cannot reliably talk to a Nextcloud directly (CORS), so the web version sends its
 * requests here and this forwards them. Each account has its own Nextcloud, set by an admin
 * (account.nextcloud_url); the relay only ever talks to the signed-in account's one. Nothing else
 * is stored: the login name and app password travel with every request (headers
 * `X-Nextcloud-User`, `X-Nextcloud-Password`) and live only in the browser that signed in.
 *
 * Guards: https only, public addresses only (unless the account allows its private network,
 * account.integrations_private_network), the resolved address pinned for the request, no redirects,
 * and only the Nextcloud paths below.
 *
 * POST /rest/NextcloudRelay/loginStart                              → { server, loginUrl, poll: { endpoint, token } }
 * POST /rest/NextcloudRelay/loginPoll    { token }                  → { pending: true } | { server, loginName, appPassword }
 * GET  /rest/NextcloudRelay/check                                    → { user, displayName }
 * GET  /rest/NextcloudRelay/list?path=                               → { path, dirs: [name], files: [{ name, size, mtime, type }] }
 * POST /rest/NextcloudRelay/mkdir        { path }                    → { path }
 * POST /rest/NextcloudRelay/uploadStart  { destination }             → { uploadId }
 * PUT  /rest/NextcloudRelay/uploadChunk?uploadId=&index=&destination=  (raw bytes) → { index }
 * POST /rest/NextcloudRelay/uploadFinish { uploadId, destination, size } → { path }
 * POST /rest/NextcloudRelay/share        { path }                    → { token, url }
 * POST /rest/NextcloudRelay/revoke                                   → { message }
 */
class NextcloudRelay extends RestController
{
    private const TIMEOUT = 30;
    private const UPLOAD_TIMEOUT = 300;
    private const MAX_CHUNK_BYTES = 64 * 1024 * 1024;

    // ── Configuration and guards ─────────────────────────────────────────────

    /**
     * The canonical form of a Nextcloud address (https, lower-case host, no trailing slash), or
     * null when it is not a usable https address. No lookups: also used when an admin saves it.
     */
    public static function normalizeServer(string $server): ?string
    {
        $server = trim($server);
        if ($server === '') {
            return null;
        }
        if (!preg_match('#^[a-z][a-z0-9+.-]*://#i', $server)) {
            $server = 'https://' . $server;
        }
        $parts = parse_url($server);
        if (!$parts || strtolower($parts['scheme'] ?? '') !== 'https' || empty($parts['host']) || isset($parts['user']) || isset($parts['query']) || isset($parts['fragment'])) {
            return null;
        }
        $port = isset($parts['port']) ? (int)$parts['port'] : 443;
        $path = rtrim($parts['path'] ?? '', '/');
        return 'https://' . strtolower($parts['host']) . ($port !== 443 ? ':' . $port : '') . $path;
    }

    /**
     * The Nextcloud base URL the relay may talk to, with the address it resolves to, or an error.
     * @return array{base:string, host:string, port:int, ip:string}
     */
    private static function target(Response &$res, string $server, bool $allowPrivate = false): array
    {
        $base = self::normalizeServer($server);
        if ($base === null) {
            $res->error(400, 'The Nextcloud address must be an https:// address');
        }
        $parts = parse_url($base);
        $host = $parts['host'];
        $port = isset($parts['port']) ? (int)$parts['port'] : 443;

        $ips = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : (gethostbynamel($host) ?: []);
        if (!$ips) {
            $res->error(502, 'The Nextcloud address could not be resolved');
        }
        if (!$allowPrivate) {
            foreach ($ips as $ip) {
                if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                    $res->error(403, 'The Nextcloud address points to a private network');
                }
            }
        }

        return ['base' => $base, 'host' => $host, 'port' => $port, 'ip' => $ips[0]];
    }

    /** The signed-in account's Nextcloud, checked like any target. */
    private static function accountTarget(Request &$req, Response &$res): array
    {
        $account = (int)$req->account;
        $row = null;
        if ($account) {
            $stmt = self::prepare('SELECT `nextcloud_url` FROM `account` WHERE `license` = ?');
            $stmt->bind_param('i', $account)->execute()->fetchOne($row)->close();
        }
        if (!$row || empty($row['nextcloud_url'])) {
            $res->error(403, 'No Nextcloud is set up for this account', false);
        }
        return self::target($res, (string)$row['nextcloud_url'], AccountSchema::privateNetworkAllowed($account));
    }

    /** @return array{target: array, user: string, password: string} */
    private static function credentials(Request &$req, Response &$res): array
    {
        $user = $_SERVER['HTTP_X_NEXTCLOUD_USER'] ?? '';
        $password = $_SERVER['HTTP_X_NEXTCLOUD_PASSWORD'] ?? '';
        if ($user === '' || $password === '') {
            $res->error(401, 'Not connected to Nextcloud');
        }
        return ['target' => self::accountTarget($req, $res), 'user' => $user, 'password' => $password];
    }

    /** A path inside the user's files: segments without `..`, each URL-encoded. */
    private static function davPath(Response &$res, string $path): string
    {
        $segments = array_values(array_filter(explode('/', str_replace('\\', '/', $path)), fn ($s) => $s !== ''));
        foreach ($segments as $segment) {
            if ($segment === '.' || $segment === '..') {
                $res->error(400, 'Invalid path');
            }
        }
        return implode('/', array_map('rawurlencode', $segments));
    }

    private static function cleanPath(string $path): string
    {
        return implode('/', array_values(array_filter(explode('/', str_replace('\\', '/', $path)), fn ($s) => $s !== '' && $s !== '.' && $s !== '..')));
    }

    /**
     * One request to the Nextcloud. Returns status, headers and body; transport failures end
     * the request with 502.
     * @return array{status:int, body:string}
     */
    private static function call(
        Response &$res,
        array $target,
        string $method,
        string $path,
        array $headers = [],
        ?string $body = null,
        ?array $auth = null,
        int $timeout = self::TIMEOUT
    ): array {
        $ch = curl_init($target['base'] . $path);
        $options = [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            // Connect to the address that was checked, not to whatever the name resolves to next.
            CURLOPT_RESOLVE => [$target['host'] . ':' . $target['port'] . ':' . $target['ip']],
            CURLOPT_HTTPHEADER => array_merge(['OCS-APIRequest: true'], $headers),
        ];
        if ($auth) {
            $options[CURLOPT_USERPWD] = $auth[0] . ':' . $auth[1];
        }
        if ($body !== null) {
            $options[CURLOPT_POSTFIELDS] = $body;
        }
        curl_setopt_array($ch, $options);
        $response = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        // No curl_close(): it does nothing since PHP 8 and warns in 8.5 — and any warning printed
        // here lands in front of the JSON, which the browser then cannot read.
        unset($ch);
        if ($response === false) {
            $res->error(502, 'Nextcloud could not be reached');
        }
        return ['status' => $status, 'body' => (string)$response];
    }

    /** End with the Nextcloud's own failure, in words the operator can act on. */
    private static function fail(Response &$res, int $status): never
    {
        match (true) {
            $status === 401 => $res->error(401, 'Nextcloud did not accept the sign-in; connect again', false),
            $status === 403 => $res->error(403, 'Nextcloud refused access to this folder', false),
            $status === 404 => $res->error(404, 'Not found on Nextcloud', false),
            $status === 507 => $res->error(507, 'The Nextcloud storage is full', false),
            default => $res->error(502, 'Nextcloud answered with status ' . $status, false),
        };
    }

    // ── Routing ─────────────────────────────────────────────────────────────

    protected function get(Request &$req, Response &$res): never
    {
        match ($req->path->get('0', '', false)) {
            'check' => $this->check($req, $res),
            'list' => $this->listFolder($req, $res),
            default => $res->error(404),
        };
    }

    protected function post(Request &$req, Response &$res): never
    {
        match ($req->path->get('0', '', false)) {
            'loginStart' => $this->loginStart($req, $res),
            'loginPoll' => $this->loginPoll($req, $res),
            'mkdir' => $this->mkdir($req, $res),
            'uploadStart' => $this->uploadStart($req, $res),
            'uploadFinish' => $this->uploadFinish($req, $res),
            'share' => $this->share($req, $res),
            'revoke' => $this->revoke($req, $res),
            default => $res->error(404),
        };
    }

    protected function put(Request &$req, Response &$res): never
    {
        match ($req->path->get('0', '', false)) {
            'uploadChunk' => $this->uploadChunk($req, $res),
            default => $res->error(404),
        };
    }

    // ── Login Flow v2 ────────────────────────────────────────────────────────

    private function loginStart(Request &$req, Response &$res): never
    {
        $target = self::accountTarget($req, $res);
        $answer = self::call($res, $target, 'POST', '/index.php/login/v2', ['User-Agent: Presenter']);
        $data = json_decode($answer['body'], true);
        if ($answer['status'] !== 200 || !is_array($data) || empty($data['login']) || empty($data['poll']['token'])) {
            $res->error(502, 'This address does not look like a Nextcloud', false);
        }
        $res->success([
            'server' => $target['base'],
            'loginUrl' => $data['login'],
            'poll' => ['endpoint' => $data['poll']['endpoint'] ?? '', 'token' => $data['poll']['token']],
        ]);
    }

    private function loginPoll(Request &$req, Response &$res): never
    {
        $target = self::accountTarget($req, $res);
        $token = (string)$req->params->get('token', '', false);
        if ($token === '') {
            $res->error(400, 'Missing login token');
        }
        // Always the poll path of the checked server, whatever endpoint was handed out.
        $answer = self::call(
            $res,
            $target,
            'POST',
            '/index.php/login/v2/poll',
            ['Content-Type: application/x-www-form-urlencoded'],
            http_build_query(['token' => $token])
        );
        if ($answer['status'] === 404) {
            $res->success(['pending' => true]);
        }
        $data = json_decode($answer['body'], true);
        if ($answer['status'] !== 200 || !is_array($data) || empty($data['appPassword'])) {
            self::fail($res, $answer['status']);
        }
        $res->success([
            'server' => $target['base'],
            'loginName' => $data['loginName'],
            'appPassword' => $data['appPassword'],
        ]);
    }

    // ── Files ────────────────────────────────────────────────────────────────

    private function check(Request &$req, Response &$res): never
    {
        $c = self::credentials($req, $res);
        $answer = self::call($res, $c['target'], 'GET', '/ocs/v2.php/cloud/user?format=json', [], null, [$c['user'], $c['password']]);
        $data = json_decode($answer['body'], true);
        if ($answer['status'] !== 200 || !is_array($data)) {
            self::fail($res, $answer['status']);
        }
        $user = $data['ocs']['data'] ?? [];
        $res->success([
            'user' => $user['id'] ?? $c['user'],
            'displayName' => $user['display-name'] ?? $user['displayname'] ?? $c['user'],
            'quota' => $user['quota'] ?? null,
        ]);
    }

    private function filesRoot(array $c): string
    {
        return '/remote.php/dav/files/' . rawurlencode($c['user']) . '/';
    }

    private function listFolder(Request &$req, Response &$res): never
    {
        $c = self::credentials($req, $res);
        $path = (string)$req->query->get('path', '', false);
        $body = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/>'
            . '<d:getlastmodified/><d:getcontenttype/></d:prop></d:propfind>';
        $answer = self::call(
            $res,
            $c['target'],
            'PROPFIND',
            $this->filesRoot($c) . self::davPath($res, $path),
            ['Depth: 1', 'Content-Type: application/xml'],
            $body,
            [$c['user'], $c['password']]
        );
        if ($answer['status'] !== 207) {
            self::fail($res, $answer['status']);
        }

        $xml = @simplexml_load_string($answer['body']);
        if ($xml === false) {
            $res->error(502, 'Nextcloud sent a folder listing that could not be read');
        }
        $xml->registerXPathNamespace('d', 'DAV:');
        $dirs = [];
        $files = [];
        $self = rtrim(self::cleanPath($path), '/');
        foreach ($xml->xpath('//d:response') ?: [] as $entry) {
            $entry->registerXPathNamespace('d', 'DAV:');
            $href = rawurldecode((string)($entry->xpath('d:href')[0] ?? ''));
            $prefix = rawurldecode($this->filesRoot($c));
            $position = strpos($href, $prefix);
            $relative = trim($position === false ? $href : substr($href, $position + strlen($prefix)), '/');
            if ($relative === $self) {
                continue;
            }
            $name = basename($relative);
            $isDir = count($entry->xpath('d:propstat/d:prop/d:resourcetype/d:collection')) > 0;
            if ($isDir) {
                $dirs[] = $name;
                continue;
            }
            $modified = strtotime((string)($entry->xpath('d:propstat/d:prop/d:getlastmodified')[0] ?? ''));
            $files[] = [
                'name' => $name,
                'size' => (int)($entry->xpath('d:propstat/d:prop/d:getcontentlength')[0] ?? 0),
                'mtime' => $modified ? $modified * 1000 : null,
                'type' => (string)($entry->xpath('d:propstat/d:prop/d:getcontenttype')[0] ?? ''),
            ];
        }
        natcasesort($dirs);
        usort($files, fn ($a, $b) => strnatcasecmp($a['name'], $b['name']));
        $res->success(['path' => $self, 'dirs' => array_values($dirs), 'files' => $files]);
    }

    private function mkdir(Request &$req, Response &$res): never
    {
        $c = self::credentials($req, $res);
        $path = (string)$req->params->get('path', '', false);
        if (self::cleanPath($path) === '') {
            $res->error(400, 'Missing folder name');
        }
        $answer = self::call($res, $c['target'], 'MKCOL', $this->filesRoot($c) . self::davPath($res, $path), [], null, [$c['user'], $c['password']]);
        if ($answer['status'] !== 201 && $answer['status'] !== 405) {
            self::fail($res, $answer['status']);
        }
        $res->success(['path' => self::cleanPath($path)]);
    }

    private function destinationHeader(Response &$res, array $c, string $destination): string
    {
        if (self::cleanPath($destination) === '') {
            $res->error(400, 'Missing destination');
        }
        return 'Destination: ' . $c['target']['base'] . $this->filesRoot($c) . self::davPath($res, $destination);
    }

    private function uploadsPath(Response &$res, array $c, string $uploadId): string
    {
        if (!preg_match('/^presenter-[a-z0-9-]{8,64}$/', $uploadId)) {
            $res->error(400, 'Invalid upload id');
        }
        return '/remote.php/dav/uploads/' . rawurlencode($c['user']) . '/' . $uploadId;
    }

    /** Chunked upload (Nextcloud chunking v2): a folder for the chunks, then one chunk per request. */
    private function uploadStart(Request &$req, Response &$res): never
    {
        $c = self::credentials($req, $res);
        $uploadId = 'presenter-' . bin2hex(random_bytes(12));
        $destination = (string)$req->params->get('destination', '', false);
        $answer = self::call(
            $res,
            $c['target'],
            'MKCOL',
            $this->uploadsPath($res, $c, $uploadId),
            [$this->destinationHeader($res, $c, $destination)],
            null,
            [$c['user'], $c['password']]
        );
        if ($answer['status'] !== 201) {
            self::fail($res, $answer['status']);
        }
        $res->success(['uploadId' => $uploadId]);
    }

    private function uploadChunk(Request &$req, Response &$res): never
    {
        $c = self::credentials($req, $res);
        $uploadId = (string)$req->query->get('uploadId', '', false);
        $index = (int)$req->query->get('index', 0, false);
        $destination = (string)$req->query->get('destination', '', false);
        if ($index < 1 || $index > 10000) {
            $res->error(400, 'Invalid chunk number');
        }
        $body = file_get_contents('php://input');
        if ($body === false || $body === '' || strlen($body) > self::MAX_CHUNK_BYTES) {
            $res->error(400, 'Invalid chunk');
        }
        $answer = self::call(
            $res,
            $c['target'],
            'PUT',
            $this->uploadsPath($res, $c, $uploadId) . '/' . str_pad((string)$index, 5, '0', STR_PAD_LEFT),
            [$this->destinationHeader($res, $c, $destination), 'Content-Type: application/octet-stream'],
            $body,
            [$c['user'], $c['password']],
            self::UPLOAD_TIMEOUT
        );
        if ($answer['status'] !== 201 && $answer['status'] !== 204) {
            self::fail($res, $answer['status']);
        }
        $res->success(['index' => $index]);
    }

    private function uploadFinish(Request &$req, Response &$res): never
    {
        $c = self::credentials($req, $res);
        $uploadId = (string)$req->params->get('uploadId', '', false);
        $destination = (string)$req->params->get('destination', '', false);
        $size = (int)$req->params->get('size', 0, false);
        $answer = self::call(
            $res,
            $c['target'],
            'MOVE',
            $this->uploadsPath($res, $c, $uploadId) . '/.file',
            [$this->destinationHeader($res, $c, $destination), 'OC-Total-Length: ' . $size, 'Overwrite: F'],
            null,
            [$c['user'], $c['password']],
            self::UPLOAD_TIMEOUT
        );
        if ($answer['status'] === 412) {
            $res->error(409, 'A file with this name already exists there', false);
        }
        if ($answer['status'] < 200 || $answer['status'] >= 300) {
            self::fail($res, $answer['status']);
        }
        $res->success(['path' => self::cleanPath($destination)]);
    }

    // ── Sharing and signing out ─────────────────────────────────────────────

    /** A read-only public link for the media folder: the existing one, else a new one. */
    private function share(Request &$req, Response &$res): never
    {
        $c = self::credentials($req, $res);
        $path = '/' . self::cleanPath((string)$req->params->get('path', '', false));
        $auth = [$c['user'], $c['password']];

        $existing = self::call(
            $res,
            $c['target'],
            'GET',
            '/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json&reshares=false&path=' . rawurlencode($path),
            [],
            null,
            $auth
        );
        if ($existing['status'] === 200) {
            foreach (json_decode($existing['body'], true)['ocs']['data'] ?? [] as $share) {
                if ((int)($share['share_type'] ?? -1) === 3 && (int)($share['permissions'] ?? 0) === 1 && empty($share['password']) && !empty($share['token'])) {
                    $res->success(['token' => $share['token'], 'url' => $share['url'] ?? '']);
                }
            }
        }

        $created = self::call(
            $res,
            $c['target'],
            'POST',
            '/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json',
            ['Content-Type: application/x-www-form-urlencoded'],
            http_build_query(['path' => $path, 'shareType' => 3, 'permissions' => 1]),
            $auth
        );
        $data = json_decode($created['body'], true)['ocs']['data'] ?? null;
        if ($created['status'] !== 200 || empty($data['token'])) {
            if ($created['status'] === 403) {
                $res->error(403, 'Nextcloud does not allow public links for this folder (maybe a password is required)', false);
            }
            self::fail($res, $created['status']);
        }
        $res->success(['token' => $data['token'], 'url' => $data['url'] ?? '']);
    }

    /** Sign out: the app password stops working on the Nextcloud too. */
    private function revoke(Request &$req, Response &$res): never
    {
        $c = self::credentials($req, $res);
        self::call($res, $c['target'], 'DELETE', '/ocs/v2.php/core/apppassword', [], null, [$c['user'], $c['password']]);
        $res->success(['message' => 'Signed out of Nextcloud']);
    }
}
