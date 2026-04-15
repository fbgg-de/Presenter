<?php

require_once(__DIR__ . '/RestController.php');

class Shows extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        $account = $req->account;
        $limit = $req->path->getAsInt('0', 10);
        $offset = $req->path->getAsInt('1', 0) * $limit;

        $result = [
            "limit" => $limit,
            "offset" => $offset,
            "account" => $account,
            "shows" => []
        ];

        $stmt = self::prepare('
			SELECT `title`, `order`, `date`, `style_id`
			FROM `shows`
			WHERE `account` = ?
			ORDER BY `date` DESC
			LIMIT ?
			OFFSET ?
		');

        $stmt->bind_param('iii', $account, $limit, $offset)->execute();
        $stmt->fetchAll($rows);
        $stmt->close();

        foreach ($rows as $row) {
            $decoded = json_decode($row['order'], true);
            if ($decoded === null && $row['order'] !== null && $row['order'] !== 'null') {
                require_once(__DIR__ . '/../classes/Logging.php');
                Logging::warning('Shows: json_decode failed for show "' . $row['title'] . '", raw value: ' . substr($row['order'], 0, 200));
            }
            $result["shows"][] = [
                'title' => $row['title'],
                'order' => is_array($decoded) ? $decoded : [],
                'date' => $row['date'],
                'styleId' => $row['style_id'] ? (int)$row['style_id'] : null
            ];
        }

        $res->success($result);
    }

    protected function post(Request &$req, Response &$res): never
    {
        $req->params->check('title')->checkArray('order');

        $account = $req->account;
        $title = $req->params->get('title');
        $order = $req->params->getAsArray('order');

        // Validate order doesn't contain invalid song numbers
        foreach ($order as $item) {
            if (is_numeric($item) && intval($item) === -1) {
                $res->error(400, 'order contains invalid song number');
            }
        }

        // Store order as JSON to support both legacy and new format
        $orderValue = json_encode($order);
        if ($orderValue === false) {
            $res->error(400, 'Failed to encode order as JSON: ' . json_last_error_msg());
        }

        $stmt = self::prepare('
				INSERT INTO `shows` (
					`account`, `title`, `order`
				) VALUES (
					?, ?, ?
				)
				ON DUPLICATE KEY UPDATE `order` = VALUES(`order`), `date` = CURRENT_TIMESTAMP
			');

        $stmt->bind_param('iss', $account, $title, $orderValue)->execute()->close();

        $res->success([
            'message' => 'show "' . $title . '" successfully uploaded'
        ]);
    }

    protected function delete(Request &$req, Response &$res): never
    {
        $req->params->check('title');

        $account = $req->account;
        $title = $req->params->get('title');

        $stmt = self::prepare('
				DELETE FROM `shows`
				WHERE `account` = ?
				AND `title` = ?
			');

        $stmt->bind_param('is', $account, $title)->execute()->close();

        $res->success([
            'message' => 'show "' . $title . '" successfully deleted'
        ]);
    }
}
