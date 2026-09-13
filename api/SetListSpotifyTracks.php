<?php

require_once(__DIR__ . '/RestController.php');

/**
 * Spotify recordings linked to Set List Entries — several per entry, e.g. the studio and a live
 * version, or the recordings of two different artists.
 *
 * Deliberately not part of GET /rest/SetLists: that loads every list of the account at once, while
 * the links are only needed for the list currently open in the Set List dialog.
 *
 * GET    /rest/SetListSpotifyTracks/{setListId}  → the links of every entry in that list
 * POST   /rest/SetListSpotifyTracks              → { entryId, track: { trackId, name?, artists?, imageUrl? } }
 *                                                  appends a link; linking a track again only refreshes its copy
 * DELETE /rest/SetListSpotifyTracks/{linkId}     → removes one link
 *
 * Name, artists and cover are display copies stored with the id so rows render without asking
 * Spotify; the id is what identifies the recording.
 */
class SetListSpotifyTracks extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        $req->path->checkNumeric(0);
        $setListId = $req->path->getAsInt(0);
        $account = $req->account;

        $stmt = self::prepare('
                SELECT t.`id`, t.`set_list_entry_id`, t.`track_id`, t.`name`, t.`artists`, t.`image_url`
                FROM `set_list_entry_spotify_tracks` t
                INNER JOIN `set_list_entries` e ON e.`id` = t.`set_list_entry_id`
                INNER JOIN `set_lists` l ON l.`id` = e.`set_list_id`
                WHERE l.`id` = ? AND l.`account` = ?
                ORDER BY t.`set_list_entry_id`, t.`sort_order`, t.`id`
            ');
        $stmt->bind_param('ii', $setListId, $account)->execute()->fetchAll($rows)->close();

        $res->success(array_map([self::class, 'toLink'], $rows));
    }

    protected function post(Request &$req, Response &$res): never
    {
        $req->params->checkNumeric('entryId');
        $entryId = $req->params->getAsInt('entryId');
        $account = $req->account;

        $stmt = self::prepare('
                SELECT e.`id`
                FROM `set_list_entries` e
                INNER JOIN `set_lists` l ON l.`id` = e.`set_list_id`
                WHERE e.`id` = ? AND l.`account` = ?
            ');
        $stmt->bind_param('ii', $entryId, $account)->execute()->fetchOne($entry)->close();
        if (!$entry) {
            $res->error(404, 'Set list entry not found');
        }

        $raw = $req->params->get('track', null, false);
        $track = is_object($raw) ? (array)$raw : $raw;
        if (!is_array($track)) {
            $res->error(400, 'track is missing');
        }

        $trackId = trim((string)($track['trackId'] ?? ''));
        // Spotify ids are 22 base-62 characters; anything else would store a dead link.
        if (!preg_match('/^[A-Za-z0-9]{22}$/', $trackId)) {
            $res->error(400, 'Invalid Spotify track id');
        }
        $name = self::text($track['name'] ?? null, 300);
        $artists = self::text($track['artists'] ?? null, 500);
        $imageUrl = self::text($track['imageUrl'] ?? null, 500);
        if ($imageUrl !== null && !str_starts_with($imageUrl, 'https://')) {
            $imageUrl = null;
        }

        $stmt = self::prepare('
                SELECT COALESCE(MAX(`sort_order`), -1) + 1 AS `next`
                FROM `set_list_entry_spotify_tracks` WHERE `set_list_entry_id` = ?
            ');
        $stmt->bind_param('i', $entryId)->execute()->fetchOne($sortRow)->close();
        $sortOrder = (int)($sortRow['next'] ?? 0);

        // Linking a track twice keeps its place and only refreshes the display copy.
        $stmt = self::prepare('
                INSERT INTO `set_list_entry_spotify_tracks`
                    (`set_list_entry_id`, `track_id`, `name`, `artists`, `image_url`, `sort_order`)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `artists` = VALUES(`artists`), `image_url` = VALUES(`image_url`)
            ');
        $stmt->bind_param('issssi', $entryId, $trackId, $name, $artists, $imageUrl, $sortOrder)->execute()->close();

        $stmt = self::prepare('
                SELECT `id`, `set_list_entry_id`, `track_id`, `name`, `artists`, `image_url`
                FROM `set_list_entry_spotify_tracks`
                WHERE `set_list_entry_id` = ? AND `track_id` = ?
            ');
        $stmt->bind_param('is', $entryId, $trackId)->execute()->fetchOne($row)->close();

        $res->success(self::toLink($row));
    }

    protected function delete(Request &$req, Response &$res): never
    {
        $req->path->checkNumeric(0);
        $linkId = $req->path->getAsInt(0);
        $account = $req->account;

        // Scoped through the entry's set list, so an id of another account deletes nothing.
        $stmt = self::prepare('
                DELETE t FROM `set_list_entry_spotify_tracks` t
                INNER JOIN `set_list_entries` e ON e.`id` = t.`set_list_entry_id`
                INNER JOIN `set_lists` l ON l.`id` = e.`set_list_id`
                WHERE t.`id` = ? AND l.`account` = ?
            ');
        $stmt->bind_param('ii', $linkId, $account)->execute()->close();

        $res->success(['id' => $linkId, 'message' => 'Spotify track unlinked']);
    }

    private static function toLink(array $row): array
    {
        return [
            'id' => (int)$row['id'],
            'entryId' => (int)$row['set_list_entry_id'],
            'trackId' => $row['track_id'],
            'name' => $row['name'],
            'artists' => $row['artists'],
            'imageUrl' => $row['image_url'],
        ];
    }

    private static function text(mixed $value, int $max): ?string
    {
        $text = is_scalar($value) ? trim((string)$value) : '';

        return $text === '' ? null : mb_substr($text, 0, $max);
    }
}
