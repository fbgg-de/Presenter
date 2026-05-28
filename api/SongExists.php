<?php

require_once(__DIR__ . '/RestController.php');

class SongExists extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        $req->path->checkNumeric(0);
        $songNumber = $req->path->getAsInt(0);

        $account = $req->account;

        $stmt = self::prepare('
				SELECT COUNT(*) AS occurrences, `order`
				FROM `songs`
				where `account` = ? AND `songnumber` = ?
			');

        $stmt->bind_param('ii', $account, $songNumber)->execute()->fetchOne($song)->close();
        $result = [
            'exists' => $song['occurrences'] > 0,
            'order' => $song['order']
        ];

        $res->success($result);
    }
}
