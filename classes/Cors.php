<?php

/**
 * Emits CORS headers and handles preflight OPTIONS requests.
 * Also provides session cookie configuration for cross-origin requests.
 *
 * Call Cors::handle() at the very top of rest.php / oidc.php, before any
 * output or session_start().
 * Call Cors::configureSession() immediately before session_start() so that
 * the session cookie is sent correctly across origins.
 *
 * Allowed origins are configured via CORS_ALLOWED_ORIGINS in config.php.
 * If the constant is not defined (legacy configs) the class does nothing.
 */
class Cors
{
    public static function handle(): void
    {
        if (!defined('CORS_ALLOWED_ORIGINS')) {
            return;
        }

        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

        if (self::isAllowedOrigin($origin)) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Access-Control-Allow-Credentials: true');
            header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
            header('Access-Control-Allow-Headers: Content-Type, Accept, Authorization, X-Requested-With');
            header('Access-Control-Max-Age: 86400'); // cache preflight for 24 h
        }

        // Respond immediately to preflight requests
        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }

    /**
     * Configure the PHP session cookie for cross-origin use.
     * Must be called BEFORE session_start().
     *
     * When the request comes from a cross-origin allowed by CORS_ALLOWED_ORIGINS,
     * the session cookie is set to SameSite=None; Secure so the browser will
     * include it in cross-origin fetch/XHR requests (credentials: 'include').
     *
     * Without this, the default SameSite=Lax blocks the cookie on cross-origin
     * API calls even though CORS headers allow the request itself.
     *
     * The Secure flag is always set to true when the connection is over HTTPS.
     * iOS Safari 16+ (and modern browsers in general) will not reliably store or
     * send cookies that lack the Secure flag on HTTPS pages — particularly when
     * the cookie was set during a cross-site redirect chain (such as an OIDC
     * callback from an external identity provider).  Without Secure=true the
     * session cookie is silently dropped and every subsequent API call returns 401.
     */
    public static function configureSession(): void
    {
        if (!defined('CORS_ALLOWED_ORIGINS')) {
            return;
        }

        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        $isCrossOrigin = self::isAllowedOrigin($origin);

        // Always set Secure=true when the connection arrives over HTTPS.
        // Detect HTTPS directly and also honour common reverse-proxy headers.
        $isHttps = self::isHttps();

        // Keep the session alive for 30 days so users stay logged in across restarts.
        $lifetime = 30 * 24 * 60 * 60; // 30 days in seconds
        ini_set('session.gc_maxlifetime', (string)$lifetime);

        if ($isCrossOrigin) {
            // SameSite=None; Secure is required for cross-origin fetch requests
            // (credentials: 'include') to send the session cookie.
            // Without this the default SameSite=Lax blocks the cookie on XHR.
            session_set_cookie_params([
                'lifetime' => $lifetime,
                'path'     => '/',
                'domain'   => '',
                'secure'   => true,  // SameSite=None mandates Secure=true
                'httponly' => true,
                'samesite' => 'None',
            ]);
        } else {
            // Same-origin — Lax is the safe default; still persist 30 days.
            // Set Secure=true on HTTPS so iOS Safari (ITP) reliably stores and
            // sends the cookie after the OIDC redirect chain.
            session_set_cookie_params([
                'lifetime' => $lifetime,
                'path'     => '/',
                'domain'   => '',
                'secure'   => $isHttps,
                'httponly' => true,
                'samesite' => 'Lax',
            ]);
        }
    }

    /**
     * Returns true when the current request arrived over HTTPS.
     * Checks the standard $_SERVER['HTTPS'] flag and common reverse-proxy
     * headers (X-Forwarded-Proto, X-Forwarded-SSL) so it works whether the
     * PHP process terminates TLS directly or sits behind nginx/Apache.
     */
    private static function isHttps(): bool
    {
        if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
            return true;
        }
        if (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') {
            return true;
        }
        if (!empty($_SERVER['HTTP_X_FORWARDED_SSL']) && $_SERVER['HTTP_X_FORWARDED_SSL'] === 'on') {
            return true;
        }
        // Fallback: trust BASE_URL if defined (set to https:// in production config)
        if (defined('BASE_URL') && str_starts_with(BASE_URL, 'https://')) {
            return true;
        }
        return false;
    }

    private static function isAllowedOrigin(string $origin): bool
    {
        if (!$origin || !defined('CORS_ALLOWED_ORIGINS')) {
            return false;
        }

        $allowed = CORS_ALLOWED_ORIGINS;

        // Auto-include the WS_HOST origin so it doesn't need to be listed twice.
        // The WS server shares the same host/origin as the frontend when routed
        // through the same reverse proxy.
        if (defined('WS_HOST') && is_array(WS_HOST) && !empty(WS_HOST['host'])) {
            $wsScheme = !empty(WS_HOST['wss']) ? 'https' : 'http';
            $wsPort   = (int)(WS_HOST['port'] ?? 443);
            $wsHost   = WS_HOST['host'];
            // Only include port in origin when it's non-standard
            $isDefaultPort = ($wsScheme === 'https' && $wsPort === 443)
                          || ($wsScheme === 'http'  && $wsPort === 80);
            $wsOrigin = $wsScheme . '://' . $wsHost . ($isDefaultPort ? '' : ':' . $wsPort);
            if (!in_array($wsOrigin, $allowed, true)) {
                $allowed[] = $wsOrigin;
            }
        }

        return in_array($origin, $allowed, true);
    }
}
