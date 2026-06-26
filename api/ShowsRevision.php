<?php

require_once(__DIR__ . '/RestController.php');

/**
 * ShowsRevision — lightweight change-detection endpoint for the show-update poller.
 *
 * Returns only each show's title and last-modified date (no `order` JSON), so the
 * 30 s background poll transfers a few bytes instead of every show's full payload.
 * The client fetches the full show only when a date actually changes.
 *
 *   GET /rest/ShowsRevision  →  { shows: [{ title, date }], count }
 */
class ShowsRevision extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        $account = $req->account;

        $stmt = self::prepare('
				SELECT `title`, `date`
				FROM `shows`
				WHERE `account` = ?
				ORDER BY `date` DESC
			');
        $stmt->bind_param('i', $account)->execute()->fetchAll($rows)->close();

        $res->success([
            'shows' => $rows,
            'count' => count($rows),
        ]);
    }
}
