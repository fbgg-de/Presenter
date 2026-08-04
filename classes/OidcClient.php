<?php

require_once(__DIR__ . '/../config.php');

/**
 * OIDC Client
 *
 * Instance-based OpenID Connect client. Each instance is configured
 * for a specific provider (discovery URL, client credentials, scopes).
 *
 * Use the factory methods to create instances:
 *   OidcClient::fromGlobalConfig()  — admin flow (reads config.php constants)
 *   OidcClient::fromProvider($row)  — tenant flow (reads oidc_providers DB row)
 */
class OidcClient
{
    private string $discoveryUrl;
    private string $clientId;
    private string $clientSecret;
    private string $scopes;
    private string $redirectUri;
    private ?array $discoveryDocument = null;

    public function __construct(string $discoveryUrl, string $clientId, string $clientSecret, string $scopes, string $redirectUri)
    {
        $this->discoveryUrl = $discoveryUrl;
        $this->clientId = $clientId;
        $this->clientSecret = $clientSecret;
        $this->scopes = $scopes;
        $this->redirectUri = $redirectUri;
    }

    /**
     * Create an OidcClient from the global config.php constants (admin flow).
     */
    public static function fromGlobalConfig(): self
    {
        return new self(
            OIDC['discovery_url'],
            OIDC['client_id'],
            OIDC['client_secret'],
            self::normalizeScopes(implode(' ', OIDC['scopes'])),
            OIDC['redirect_uri'],
        );
    }

    /**
     * Create an OidcClient from an oidc_providers DB row (tenant flow).
     */
    public static function fromProvider(array $provider): self
    {
        return new self(
            $provider['discovery_url'],
            $provider['client_id'],
            $provider['client_secret'],
            self::normalizeScopes($provider['scopes'] ?? 'openid email profile'),
            OIDC['redirect_uri'],
        );
    }

    /**
     * Guarantee `openid` is requested. Without it the provider runs a plain OAuth2 flow and
     * returns no id_token — which then makes RP-initiated logout impossible, because
     * providers require `id_token_hint` to honour `post_logout_redirect_uri`. Per-account
     * provider rows carry a free-text scope list, so this is easy to get wrong in the DB.
     */
    private static function normalizeScopes(string $scopes): string
    {
        $list = preg_split('/\s+/', trim($scopes), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        if (!in_array('openid', $list, true)) {
            array_unshift($list, 'openid');
        }
        return implode(' ', $list);
    }

    /**
     * Get the OpenID Connect discovery document
     */
    private function getDiscoveryDocument(): array
    {
        if ($this->discoveryDocument !== null) {
            return $this->discoveryDocument;
        }

        $ch = curl_init($this->discoveryUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        unset($ch);

        if ($httpCode !== 200 || !$response) {
            throw new Exception('Failed to fetch discovery document');
        }

        $this->discoveryDocument = json_decode($response, true);

        if (!$this->discoveryDocument) {
            throw new Exception('Invalid discovery document');
        }

        return $this->discoveryDocument;
    }

    /**
     * Use a refresh token to obtain a new set of tokens without user interaction.
     * Returns the new token array on success, or throws on failure.
     */
    public function refreshToken(string $refreshToken): array
    {
        $discovery = $this->getDiscoveryDocument();
        $tokenEndpoint = $discovery['token_endpoint'] ?? null;

        if (!$tokenEndpoint) {
            throw new Exception('Token endpoint not found in discovery document');
        }

        $params = [
            'grant_type'    => 'refresh_token',
            'refresh_token' => $refreshToken,
            'client_id'     => $this->clientId,
            'client_secret' => $this->clientSecret,
        ];

        $ch = curl_init($tokenEndpoint);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($params));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/x-www-form-urlencoded']);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if ($httpCode !== 200 || !$response) {
            throw new Exception('Token refresh failed (HTTP ' . $httpCode . ')');
        }

        $tokens = json_decode($response, true);
        if (!$tokens || empty($tokens['access_token'])) {
            throw new Exception('Invalid token refresh response');
        }

        return $tokens;
    }

    /**
     * Attempt a silent token refresh using the refresh_token stored in $_SESSION['oidc_tokens'].
     * Updates $_SESSION['oidc_tokens'] on success. Returns true if refreshed, false if not needed
     * or not possible.
     *
     * Call this early in each authenticated request (e.g. from rest.php) so sessions are kept
     * alive automatically without requiring the user to log in again every day.
     *
     * @param int $refreshBeforeExpireSeconds  Refresh when fewer than this many seconds remain.
     */
    public static function tryRefreshSession(int $refreshBeforeExpireSeconds = 300): bool
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            return false;
        }

        $tokens    = $_SESSION['oidc_tokens'] ?? null;
        $authType  = $_SESSION['authType'] ?? null;

        if (!$tokens || !$authType) {
            return false; // No active OIDC session
        }

        $expiresAt    = $tokens['expires_at'] ?? 0;
        $refreshToken = $tokens['refresh_token'] ?? null;

        // Not yet close enough to expiry — nothing to do
        if (time() < ($expiresAt - $refreshBeforeExpireSeconds)) {
            return false;
        }

        if (!$refreshToken) {
            return false; // No refresh token available
        }

        try {
            // Re-create the correct OidcClient instance
            $isAdmin    = ($authType === 'oidc_admin');
            $providerId = $_SESSION['oidc_provider_id'] ?? null;

            if ($isAdmin || !$providerId) {
                $oidc = self::fromGlobalConfig();
            } else {
                // Load the provider from DB
                require_once(__DIR__ . '/../classes/DB.php');
                DB::prepare('SELECT * FROM `oidc_providers` WHERE `id` = ? AND `enabled` = 1 LIMIT 1')
                  ->bind_param('i', $providerId)
                  ->execute()
                  ->fetchOne($provider)
                  ->close();

                if (!$provider) {
                    return false;
                }

                $oidc = self::fromProvider($provider);
            }

            $newTokens = $oidc->refreshToken($refreshToken);

            // Update session with new tokens
            $_SESSION['oidc_tokens'] = [
                'access_token'  => $newTokens['access_token'],
                'id_token'      => $newTokens['id_token'] ?? $tokens['id_token'] ?? null,
                'refresh_token' => $newTokens['refresh_token'] ?? $refreshToken, // keep old one if not rotated
                'expires_at'    => time() + ($newTokens['expires_in'] ?? 3600),
            ];

            return true;
        } catch (\Throwable $e) {
            // Refresh failed — log but don't break the request; the existing session may still be valid
            error_log('[OidcClient] Token refresh failed: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Get authorization URL for OIDC login
     */
    public function getAuthorizationUrl(string $state): string
    {
        $discovery = $this->getDiscoveryDocument();
        $authEndpoint = $discovery['authorization_endpoint'] ?? null;

        if (!$authEndpoint) {
            throw new Exception('Authorization endpoint not found in discovery document');
        }

        $params = [
          'client_id' => $this->clientId,
          'redirect_uri' => $this->redirectUri,
          'response_type' => 'code',
          'scope' => $this->scopes,
          'state' => $state,
        ];

        return $authEndpoint . '?' . http_build_query($params);
    }

    /**
     * Exchange authorization code for tokens
     */
    public function getToken(string $code): array
    {
        $discovery = $this->getDiscoveryDocument();
        $tokenEndpoint = $discovery['token_endpoint'] ?? null;

        if (!$tokenEndpoint) {
            throw new Exception('Token endpoint not found in discovery document');
        }

        $params = [
          'grant_type' => 'authorization_code',
          'code' => $code,
          'redirect_uri' => $this->redirectUri,
          'client_id' => $this->clientId,
          'client_secret' => $this->clientSecret,
        ];

        $ch = curl_init($tokenEndpoint);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($params));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
          'Content-Type: application/x-www-form-urlencoded',
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        unset($ch);

        if ($httpCode !== 200 || !$response) {
            throw new Exception('Token exchange failed');
        }

        $tokens = json_decode($response, true);

        if (!$tokens || !isset($tokens['access_token'])) {
            throw new Exception('Invalid token response');
        }

        return $tokens;
    }

    /**
     * Get user info from userinfo endpoint
     */
    public function getUserInfo(string $accessToken): array
    {
        $discovery = $this->getDiscoveryDocument();
        $userinfoEndpoint = $discovery['userinfo_endpoint'] ?? null;

        if (!$userinfoEndpoint) {
            throw new Exception('Userinfo endpoint not found in discovery document');
        }

        $ch = curl_init($userinfoEndpoint);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
          'Authorization: Bearer ' . $accessToken,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        unset($ch);

        if ($httpCode !== 200 || !$response) {
            throw new Exception('Failed to fetch user info');
        }

        $userinfo = json_decode($response, true);

        if (!$userinfo) {
            throw new Exception('Invalid userinfo response');
        }

        return $userinfo;
    }

    /**
     * Parse and validate ID token (JWT) with signature verification
     */
    public function parseIdToken(string $idToken): array
    {
        $payload = null;
        $ok = $this->validateJwt($idToken, $payload);
        if (!$ok || !is_array($payload)) {
            throw new Exception('ID token validation failed');
        }
        return $payload;
    }

    /**
     * Build the RP-initiated logout URL.
     *
     * `post_logout_redirect_uri` is only ever sent TOGETHER with `id_token_hint`. The two
     * are independent in the spec but most providers — SimpleSAMLphp's OIDC module among
     * them — reject the redirect without the hint:
     *
     *   "id_token_hint is mandatory when post_logout_redirect_uri is included."
     *
     * The hint can legitimately be missing (a session established before id_tokens were
     * stored, a provider that returns none, or a refresh that dropped it), so rather than
     * producing a request the provider refuses, we drop the redirect and let the provider
     * show its own signed-out page. The local session is destroyed either way.
     */
    public function getLogoutUrl(?string $idToken = null, ?string $redirectUrl = null): string
    {
        $discovery = $this->getDiscoveryDocument();
        $endSessionEndpoint = $discovery['end_session_endpoint'] ?? null;

        if (!$endSessionEndpoint) {
            // Fallback if no logout endpoint
            return $redirectUrl ?? BASE_URL;
        }

        if (!$idToken) {
            require_once(__DIR__ . '/Logging.php');
            Logging::warning('OIDC logout without id_token_hint — omitting post_logout_redirect_uri; '
                . 'the provider will show its own signed-out page instead of returning to the app.');
            return $endSessionEndpoint;
        }

        $params = ['id_token_hint' => $idToken];
        if ($redirectUrl) {
            $params['post_logout_redirect_uri'] = $redirectUrl;
        }

        return $endSessionEndpoint . '?' . http_build_query($params);
    }



    private function validateJwt($jwt, &$payloadOut = null)
    {
        $discovery = $this->getDiscoveryDocument();
        $jwksEndpoint = $discovery['jwks_uri'] ?? null;

        if (!$jwksEndpoint) {
            throw new Exception('JWKS endpoint not found in discovery document');
        }

        // Split JWT
        $parts = explode('.', $jwt);
        if (count($parts) !== 3) {
            return false;
        }

        list($headerB64, $payloadB64, $signatureB64) = $parts;
        $header = self::base64url_decode($headerB64);
        $payload = self::base64url_decode($payloadB64);
        $signature = self::base64url_decode($signatureB64);

        if ($header === false || $payload === false || $signature === false) {
            return false;
        }

        $headerArr = json_decode($header, true);
        $payloadArr = json_decode($payload, true);

        if (!is_array($headerArr) || !is_array($payloadArr)) {
            return false;
        }
        if (!isset($headerArr['alg'])) {
            return false;
        }

        // Algorithm switch for extensibility
        switch ($headerArr['alg']) {
            case 'RS256':
                if (!isset($headerArr['kid'])) {
                    return false;
                }
                $kid = $headerArr['kid'];
                $jwks = self::fetchJWKS($jwksEndpoint);
                if (!$jwks) {
                    return false;
                }
                $jwk = self::findKeyByKid($jwks, $kid);
                if (!$jwk) {
                    return false;
                }
                $pem = self::rsaJwkToPem($jwk);
                if (!$pem) {
                    return false;
                }
                $data = $headerB64 . '.' . $payloadB64;
                $ok = openssl_verify($data, $signature, $pem, OPENSSL_ALGO_SHA256);
                if ($ok !== 1) {
                    return false;
                }
                break;
            case 'HS256':
                // Example: HMAC SHA-256 validation (not implemented)
                return false;
            case 'ES256':
                // Example: ECDSA SHA-256 validation (not implemented)
                return false;
            default:
                // Unsupported algorithm
                return false;
        }

        // Validate claims
        $now = time();
        if (isset($payloadArr['exp']) && $now > $payloadArr['exp']) {
            return false;
        }
        if (isset($payloadArr['nbf']) && $now < $payloadArr['nbf']) {
            return false;
        }
        if (isset($payloadArr['iat']) && $now < $payloadArr['iat']) {
            return false;
        }
        if ($payloadOut !== null) {
            $payloadOut = $payloadArr;
        }

        return true;
    }


    // Fetch JWKS from URL
    private static function fetchJWKS($jwksUrl)
    {
        $ch = curl_init($jwksUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        unset($ch);
        if ($httpCode !== 200 || !$response) {
            return null;
        }
        $jwks = json_decode($response, true);
        if (!is_array($jwks) || !isset($jwks['keys'])) {
            return null;
        }
        return $jwks['keys'];
    }

    // Find key by kid
    private static function findKeyByKid($keys, $kid)
    {
        foreach ($keys as $key) {
            if (isset($key['kid']) && $key['kid'] === $kid) {
                return $key;
            }
        }

        return null;
    }

    // Convert RSA key (n, e) to PEM
    private static function rsaJwkToPem($jwk)
    {
        if (!isset($jwk['n']) || !isset($jwk['e'])) {
            return null;
        }

        $modulus = self::base64url_decode($jwk['n']);
        $exponent = self::base64url_decode($jwk['e']);
        if ($modulus === false || $exponent === false) {
            return null;
        }

        $modulus = self::encodeLengthPrefixed($modulus);
        $exponent = self::encodeLengthPrefixed($exponent);
        $rsaPubKey = "\x30" . self::encodeLength(strlen($modulus) + strlen($exponent)) . $modulus . $exponent;
        $algoOid = "\x30\x0d\x06\x09\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01\x05\x00";
        $bitString = "\x03" . self::encodeLength(strlen($rsaPubKey) + 1) . "\x00" . $rsaPubKey;
        $spki = "\x30" . self::encodeLength(strlen($algoOid) + strlen($bitString)) . $algoOid . $bitString;

        return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($spki), 64, "\n") . "-----END PUBLIC KEY-----\n";
    }

    // Helper: base64url decode
    private static function base64url_decode($data)
    {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $padlen = 4 - $remainder;
            $data .= str_repeat('=', $padlen);
        }
        $data = strtr($data, '-_', '+/');

        return base64_decode($data);
    }

    // Helper: encode ASN.1 length
    private static function encodeLength($length)
    {
        if ($length < 0x80) {
            return chr($length);
        }

        $lenBytes = '';
        while ($length > 0) {
            $lenBytes = chr($length & 0xff) . $lenBytes;
            $length >>= 8;
        }

        return chr(0x80 | strlen($lenBytes)) . $lenBytes;
    }

    // Helper: encode ASN.1 INTEGER
    private static function encodeLengthPrefixed($data)
    {
        if (ord($data[0]) > 0x7f) {
            $data = "\x00" . $data;
        }

        return "\x02" . self::encodeLength(strlen($data)) . $data;
    }
}
