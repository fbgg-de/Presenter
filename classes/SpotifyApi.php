<?php

/**
 * Spotify Web API — catalogue search through the Client Credentials flow.
 *
 * Nobody logs in to Spotify: an account's own app credentials (account.spotify_client_id /
 * spotify_client_secret, set in the admin Accounts page) buy a short-lived app token, which is
 * all track search needs. The token is cached in the system temp dir for its lifetime (~1 hour),
 * so a burst of searches costs one token request.
 */
final class SpotifyApi
{
    private const TOKEN_URL = 'https://accounts.spotify.com/api/token';
    private const SEARCH_URL = 'https://api.spotify.com/v1/search';

    /** Apps in Spotify's development mode may not request larger search pages. */
    public const MAX_LIMIT = 10;

    /**
     * Search the catalogue for tracks. Returns normalized tracks, or null when Spotify could not
     * be reached or refused the credentials.
     *
     * @param array{clientId: string, clientSecret: string} $credentials
     */
    public static function searchTracks(array $credentials, string $query, int $limit = self::MAX_LIMIT): ?array
    {
        // No `market`: an account's congregation is not tied to one country, and without it
        // Spotify returns the catalogue as a whole.
        $url = self::SEARCH_URL . '?' . http_build_query([
            'q' => $query,
            'type' => 'track',
            'limit' => max(1, min($limit, self::MAX_LIMIT)),
        ]);

        // A cached token can be revoked before it expires; one retry with a fresh token covers that.
        foreach ([false, true] as $forceRefresh) {
            $token = self::token($credentials, $forceRefresh);
            if ($token === null) {
                return null;
            }

            [$status, $body] = self::request($url, ['Authorization: Bearer ' . $token]);
            if ($status === 401 && !$forceRefresh) {
                continue;
            }
            if ($status !== 200 || !is_array($body)) {
                return null;
            }

            // Spotify occasionally pads `items` with nulls for tracks it cannot return.
            $items = array_filter($body['tracks']['items'] ?? [], fn ($item) => is_array($item) && !empty($item['id']));

            return array_values(array_map([self::class, 'normalizeTrack'], $items));
        }

        return null;
    }

    /** @param array{clientId: string, clientSecret: string} $credentials */
    private static function token(array $credentials, bool $forceRefresh): ?string
    {
        // Keyed by client id, so accounts with different apps never hand each other a token.
        $cacheFile = sys_get_temp_dir() . '/presenter_spotify_token_' . md5($credentials['clientId']) . '.json';

        if (!$forceRefresh && is_file($cacheFile)) {
            $cached = json_decode((string)@file_get_contents($cacheFile), true);
            if (!empty($cached['token']) && ($cached['expiresAt'] ?? 0) > time() + 60) {
                return $cached['token'];
            }
        }

        [$status, $body] = self::request(self::TOKEN_URL, [
            'Authorization: Basic ' . base64_encode($credentials['clientId'] . ':' . $credentials['clientSecret']),
            'Content-Type: application/x-www-form-urlencoded',
        ], 'grant_type=client_credentials');

        if ($status !== 200 || empty($body['access_token'])) {
            return null;
        }

        @file_put_contents($cacheFile, json_encode([
            'token' => $body['access_token'],
            'expiresAt' => time() + (int)($body['expires_in'] ?? 3600),
        ]), LOCK_EX);
        @chmod($cacheFile, 0600);

        return $body['access_token'];
    }

    /** @return array{0: int, 1: mixed} HTTP status and the decoded JSON body (null when undecodable). */
    private static function request(string $url, array $headers, ?string $postBody = null): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_TIMEOUT => 8,
            CURLOPT_HTTPHEADER => array_merge(['Accept: application/json'], $headers),
        ]);
        if ($postBody !== null) {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $postBody);
        }

        $raw = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);

        return [$status, is_string($raw) ? json_decode($raw, true) : null];
    }

    private static function normalizeTrack(array $track): array
    {
        // The smallest cover that still looks sharp at list-avatar size.
        $images = $track['album']['images'] ?? [];
        usort($images, fn ($a, $b) => ($a['width'] ?? 0) <=> ($b['width'] ?? 0));
        $imageUrl = null;
        foreach ($images as $image) {
            if (($image['width'] ?? 0) >= 64) {
                $imageUrl = $image['url'] ?? null;
                break;
            }
        }
        if ($imageUrl === null && count($images) > 0) {
            $imageUrl = end($images)['url'] ?? null;
        }

        return [
            'id' => (string)$track['id'],
            'name' => (string)($track['name'] ?? ''),
            'artists' => implode(', ', array_map(fn ($artist) => $artist['name'] ?? '', $track['artists'] ?? [])),
            'album' => $track['album']['name'] ?? null,
            'imageUrl' => $imageUrl,
            'durationMs' => (int)($track['duration_ms'] ?? 0),
            'url' => $track['external_urls']['spotify'] ?? null,
        ];
    }
}
