<?php

require_once(__DIR__ . '/RestController.php');

class SongsAll extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        $account = $req->account;
        $order = $req->path->get(0, 'lexicographic');

        $stmt = match ($order) {
            'numeric' => self::prepare('
						SELECT `songnumber` AS `songNumber`, `title`, `authors`,
							JSON_LENGTH(JSON_KEYS(`order`)) AS `orderCount`
						FROM `songs`
						WHERE `account` = ?
						ORDER BY `songnumber`
					'),
            default => self::prepare('
						SELECT `songnumber` AS `songNumber`, `title`, `authors`,
							JSON_LENGTH(JSON_KEYS(`order`)) AS `orderCount`
						FROM `songs`
						WHERE `account` = ?
						ORDER BY `title`
					')
        };

        $stmt->bind_param('i', $account)->execute()->fetchAll($result)->close();

        // Ensure orderCount is an integer
        foreach ($result as &$row) {
            $row['orderCount'] = (int) ($row['orderCount'] ?? 0);
        }

        $res->success($result);
    }
}
