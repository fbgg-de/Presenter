<?php

/**
 * Short-lived, stateless tokens that let the admin panel attach to the WebSocket relay
 * as a message monitor.
 *
 * Stateless on purpose: the token is an HMAC over its own claims, so minting and
 * validating need no table, no migration and no cleanup job for expired rows. The relay
 * cannot verify it itself (it has no database and no config), so it posts the token back
 * to /rest/ValidateMonitorToken, which calls verify() here.
 *
 * The signing key is derived from secrets that any working install already has. There is
 * deliberately no new config constant to forget: an install that can talk to its IdP and
 * its database can mint monitor tokens, and one that cannot has bigger problems.
 *
 * Lifetime is minutes, not hours — the token is handed out the moment an admin opens the
 * WebSocket tab and is spent immediately on the relay handshake.
 */
class MonitorToken
{
    /** How long a freshly minted token stays valid, in seconds. */
    public const TTL = 120;

    /**
     * Derive the HMAC key from existing server-side secrets.
     *
     * Both parts are already required for the app to run and neither ever reaches a
     * client. Hashing them together means the raw secrets are not recoverable from a
     * leaked token, and rotating either one invalidates outstanding tokens — which is
     * the behaviour you want anyway.
     */
    private static function key(): string
    {
        $parts = [
            defined('OIDC') && is_array(OIDC) ? (string) (OIDC['client_secret'] ?? '') : '',
            defined('DB') && is_array(DB) ? (string) (DB['password'] ?? '') : '',
            defined('BASE_URL') ? (string) BASE_URL : '',
        ];

        return hash('sha256', 'presenter-ws-monitor|' . implode('|', $parts), true);
    }

    private static function b64UrlEncode(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    private static function b64UrlDecode(string $encoded): string|false
    {
        return base64_decode(strtr($encoded, '-_', '+/'), true);
    }

    /**
     * Mint a token.
     *
     * @param int|null $account Account the holder may watch, or null for an unrestricted
     *                          (server admin) token that may watch and switch to any account.
     */
    public static function issue(?int $account): string
    {
        $claims = json_encode([
            'scope'   => $account === null ? 'admin' : 'account',
            'account' => $account,
            'exp'     => time() + self::TTL,
            // Makes two tokens minted in the same second differ, so one cannot be mistaken
            // for a replay of the other in a log.
            'nonce'   => bin2hex(random_bytes(8)),
        ], JSON_THROW_ON_ERROR);

        $payload   = self::b64UrlEncode($claims);
        $signature = self::b64UrlEncode(hash_hmac('sha256', $payload, self::key(), true));

        return $payload . '.' . $signature;
    }

    /**
     * Verify a token and return its claims, or null when it is malformed, forged or expired.
     *
     * @return array{scope: string, account: int|null}|null
     */
    public static function verify(string $token): ?array
    {
        $parts = explode('.', $token);

        if (count($parts) !== 2) {
            return null;
        }

        [$payload, $signature] = $parts;

        $expected = self::b64UrlEncode(hash_hmac('sha256', $payload, self::key(), true));

        // Constant-time: the signature is attacker-supplied and compared against a secret-derived value.
        if (!hash_equals($expected, $signature)) {
            return null;
        }

        $raw = self::b64UrlDecode($payload);

        if ($raw === false) {
            return null;
        }

        $claims = json_decode($raw, true);

        if (!is_array($claims) || !isset($claims['exp']) || !isset($claims['scope'])) {
            return null;
        }

        if ((int) $claims['exp'] < time()) {
            return null;
        }

        if ($claims['scope'] === 'admin') {
            return ['scope' => 'admin', 'account' => null];
        }

        if ($claims['scope'] === 'account' && isset($claims['account'])) {
            return ['scope' => 'account', 'account' => (int) $claims['account']];
        }

        return null;
    }
}
