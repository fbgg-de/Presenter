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
            OIDC_DISCOVERY_URL,
            OIDC_CLIENT_ID,
            OIDC_CLIENT_SECRET,
            implode(' ', OIDC_CLIENT_SCOPES),
            OIDC_REDIRECT_URI,
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
            $provider['scopes'] ?? 'openid email profile',
            OIDC_REDIRECT_URI,
        );
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
     * Get logout URL
     */
    public function getLogoutUrl(?string $idToken = null, ?string $redirectUrl = null): string
    {
        $discovery = $this->getDiscoveryDocument();
        $endSessionEndpoint = $discovery['end_session_endpoint'] ?? null;

        if (!$endSessionEndpoint) {
            // Fallback if no logout endpoint
            return $redirectUrl ?? BASE_URL;
        }

        $params = [];

        if ($idToken) {
            $params['id_token_hint'] = $idToken;
        }

        if ($redirectUrl) {
            $params['post_logout_redirect_uri'] = $redirectUrl;
        }

        if (empty($params)) {
            return $endSessionEndpoint;
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
