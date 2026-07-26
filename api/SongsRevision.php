<?php

require_once(__DIR__ . '/RestController.php');

/**
 * SongsRevision — lightweight change-detection endpoint for the song-update poller.
 *
 * Returns only each song's number and last-modified timestamp (no blocks/order
 * payload), so the background poll transfers a few bytes instead of the whole
 * song library. The client re-fetches a song only when its timestamp is newer
 * than the locally cached copy.
 *
 *   GET /rest/SongsRevision  →  { songs: [{ songNumber, date }], count }
 */
class SongsRevision extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        $account = $req->account;

        $stmt = self::prepare('
				SELECT `songnumber` AS `songNumber`, `updated_at` AS `date`
				FROM `songs`
				WHERE `account` = ?
			');
        $stmt->bind_param('i', $account)->execute()->fetchAll($rows)->close();

        // Cast songNumber to int (mysqli returns strings depending on driver config)
        $songs = array_map(static fn ($r) => [
            'songNumber' => (int)$r['songNumber'],
            'date' => $r['date'],
        ], $rows ?? []);

        $res->success([
            'songs' => $songs,
            'count' => count($songs),
        ]);
    }
}
