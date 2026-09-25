<?php

/**
 * Requests the server makes to addresses an account entered itself (ChurchTools and the like).
 *
 * Such an address must not turn the server into a way into its own network, so every request —
 * and every redirect it is sent on — is checked the same way:
 *   - https only (no other protocols, no credentials in the URL);
 *   - the host must resolve to public addresses only, unless the server admin allowed the
 *     account's integrations into a private network (account.integrations_private_network);
 *   - the checked address is pinned for the connection (CURLOPT_RESOLVE), so a second DNS answer
 *     cannot point it somewhere else;
 *   - redirects are followed here, one at a time, each target checked again (at most 5).
 */
final class OutboundHttp
{
    private const MAX_REDIRECTS = 5;

    /**
     * Whether a URL may be requested, and how to pin it: the CURLOPT_RESOLVE entry, or a reason.
     * @return array{ok:true, resolve:string}|array{ok:false, reason:string}
     */
    public static function check(string $url, bool $allowPrivate): array
    {
        $parts = parse_url($url);
        if (!$parts || strtolower($parts['scheme'] ?? '') !== 'https' || empty($parts['host']) || isset($parts['user']) || isset($parts['pass'])) {
            return ['ok' => false, 'reason' => 'not an https address'];
        }
        $host = strtolower(trim($parts['host'], '[]'));
        $port = isset($parts['port']) ? (int)$parts['port'] : 443;
        $ips = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : (gethostbynamel($host) ?: []);
        if (!$ips) {
            return ['ok' => false, 'reason' => 'address could not be resolved'];
        }
        if (!$allowPrivate) {
            foreach ($ips as $ip) {
                if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                    return ['ok' => false, 'reason' => 'address is in a private network'];
                }
            }
        }
        $ip = str_contains($ips[0], ':') ? '[' . $ips[0] . ']' : $ips[0];
        return ['ok' => true, 'resolve' => $host . ':' . $port . ':' . $ip];
    }

    /** The absolute URL a Location header points to, relative to the URL that answered. */
    public static function resolveLocation(string $base, string $location): string
    {
        $location = trim($location);
        if (preg_match('#^[a-z][a-z0-9+.-]*://#i', $location)) {
            return $location;
        }
        $parts = parse_url($base);
        $origin = ($parts['scheme'] ?? 'https') . '://' . ($parts['host'] ?? '') . (isset($parts['port']) ? ':' . $parts['port'] : '');
        if (str_starts_with($location, '//')) {
            return ($parts['scheme'] ?? 'https') . ':' . $location;
        }
        if (str_starts_with($location, '/')) {
            return $origin . $location;
        }
        if (str_starts_with($location, '?')) {
            return $origin . ($parts['path'] ?? '/') . $location;
        }
        $dir = preg_replace('#/[^/]*$#', '/', $parts['path'] ?? '/');
        return $origin . $dir . $location;
    }

    /**
     * Run a curl request with the checks above. `$options` are ordinary curl options including
     * CURLOPT_URL; redirect-following, protocols and address pinning are set here.
     *
     * @return array{body: string|false, status: int, error: string, contentType: string, url: string}
     */
    public static function exec(array $options, bool $allowPrivate): array
    {
        $url = (string)($options[CURLOPT_URL] ?? '');
        for ($hop = 0; $hop <= self::MAX_REDIRECTS; $hop++) {
            $check = self::check($url, $allowPrivate);
            if (!$check['ok']) {
                return ['body' => false, 'status' => 0, 'error' => 'Refused ' . $url . ': ' . $check['reason'], 'contentType' => '', 'url' => $url];
            }

            $location = null;
            $ch = curl_init();
            curl_setopt_array($ch, [
                CURLOPT_URL => $url,
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
                CURLOPT_RESOLVE => [$check['resolve']],
                CURLOPT_HEADERFUNCTION => function ($handle, string $line) use (&$location) {
                    if (stripos($line, 'location:') === 0) {
                        $location = trim(substr($line, 9));
                    }
                    return strlen($line);
                },
            ] + $options + [CURLOPT_RETURNTRANSFER => true]);
            // Options passed in must not undo the checks.
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
            curl_setopt($ch, CURLOPT_URL, $url);

            $body = curl_exec($ch);
            $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $error = curl_error($ch);
            $contentType = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
            // Closing writes the cookie jar, which the next hop (or request) reads.
            unset($ch);

            if (in_array($status, [301, 302, 303, 307, 308], true) && $location) {
                $url = self::resolveLocation($url, $location);
                // Like a browser: 303 (and 301/302 after a POST) continue as a plain GET.
                $method = strtoupper((string)($options[CURLOPT_CUSTOMREQUEST] ?? (!empty($options[CURLOPT_POST]) ? 'POST' : 'GET')));
                if ($status === 303 || ($method === 'POST' && $status !== 307 && $status !== 308)) {
                    unset($options[CURLOPT_POST], $options[CURLOPT_POSTFIELDS], $options[CURLOPT_CUSTOMREQUEST]);
                    $options[CURLOPT_HTTPGET] = true;
                }
                continue;
            }
            return ['body' => $body, 'status' => $status, 'error' => $error, 'contentType' => $contentType, 'url' => $url];
        }
        return ['body' => false, 'status' => 0, 'error' => 'Too many redirects', 'contentType' => '', 'url' => $url];
    }
}
