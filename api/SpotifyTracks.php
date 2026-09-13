<?php

require_once(__DIR__ . '/RestController.php');
require_once(__DIR__ . '/../classes/SpotifyApi.php');

/**
 * Spotify track search, used to link a set list entry to a recording.
 *
 * GET /rest/SpotifyTracks?q=…               → free-text search, as typed by the user
 * GET /rest/SpotifyTracks?title=…&artist=…  → suggestions for a song from the library
 *
 * Suggestions run two searches and merge them, strict first. A song's `authors` are its
 * songwriters, not necessarily who recorded it — a strict `artist:` filter therefore often finds
 * nothing (or only the writer's own recording), so the title-only results follow to cover the
 * versions other artists recorded.
 */
class SpotifyTracks extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        $credentials = $this->credentials((int)$req->account);
        // Not configured for this account — fail quietly without logging, like the Bible API.
        if ($credentials === null) {
            $res->error(503, 'Spotify is not configured for this account', false);
        }

        $q = trim((string)$req->query->get('q', '', false));
        if ($q !== '') {
            $tracks = SpotifyApi::searchTracks($credentials, mb_substr($q, 0, 200));
            if ($tracks === null) {
                $res->error(502, 'Spotify search failed');
            }
            $res->success(['tracks' => $tracks]);
        }

        $title = self::cleanTitle((string)$req->query->get('title', '', false));
        if ($title === '') {
            $res->success(['tracks' => []]);
        }
        $artist = self::firstArtist((string)$req->query->get('artist', '', false));

        $searches = [];
        if ($artist !== '') {
            $searches[] = "track:\"{$title}\" artist:\"{$artist}\"";
        }
        $searches[] = "track:\"{$title}\"";

        $tracks = [];
        $anySucceeded = false;
        foreach ($searches as $query) {
            $found = SpotifyApi::searchTracks($credentials, $query);
            if ($found === null) {
                continue;
            }
            $anySucceeded = true;
            foreach ($found as $track) {
                $tracks[$track['id']] ??= $track;
            }
        }

        if (!$anySucceeded) {
            $res->error(502, 'Spotify search failed');
        }

        $res->success(['tracks' => array_values($tracks)]);
    }

    /** The account's Spotify app credentials, or null when none are configured. */
    private function credentials(int $account): ?array
    {
        if (!$account) {
            return null;
        }

        try {
            $stmt = self::prepare('SELECT `spotify_client_id`, `spotify_client_secret` FROM `account` WHERE `license` = ?');
            $stmt->bind_param('i', $account)->execute()->fetchOne($row)->close();
        } catch (\Throwable $e) {
            // The columns arrive with migration 25.
            return null;
        }

        if (!$row || empty($row['spotify_client_id']) || empty($row['spotify_client_secret'])) {
            return null;
        }

        return ['clientId' => $row['spotify_client_id'], 'clientSecret' => $row['spotify_client_secret']];
    }

    /**
     * Quotes would end the field filter early, and bracketed suffixes ("(Live)", "[feat. …]")
     * rarely match the recording's own title. A title that is nothing but brackets keeps them.
     */
    private static function cleanTitle(string $title): string
    {
        $title = trim(str_replace('"', '', $title));
        $stripped = trim(preg_replace('/\s*[\(\[][^\)\]]*[\)\]]/u', '', $title) ?? '');

        return mb_substr($stripped !== '' ? $stripped : $title, 0, 150);
    }

    /** The first writer of an "A, B & C" authors line — Spotify's artist filter takes one name. */
    private static function firstArtist(string $authors): string
    {
        $first = preg_split('/\s*(?:[,;&|\/]|\band\b|\bund\b)\s*/iu', trim($authors))[0] ?? '';

        return mb_substr(trim(str_replace('"', '', $first)), 0, 100);
    }
}
