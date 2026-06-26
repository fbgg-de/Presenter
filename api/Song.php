<?php

require_once(__DIR__ . '/RestController.php');

class Song extends RestController
{
    public const string SEPARATOR_ORDER = ',';
    public const string SEPARATOR_BLOCK = ' # ';
    public const string SEPARATOR_BLOCK_ESCAPE = '{#}';

    public const string UNKNOWN_AUTHOR = 'UNKNOWN';
    public const string UNKNOWN_COPYRIGHT = '';

    protected function get(Request &$req, Response &$res): never
    {
        $req->path->checkNumeric(0);

        $account = $req->account;
        $songNumber = $req->path->getAsInt(0);

        $row = $this->fetchSongData($account, $songNumber);

        if (!$row) {
            $res->error(400, 'Could not find Song #' . $songNumber);
        }

        $result = $this->formatSongRow($account, $songNumber, $row);
        $res->success($result);
    }

    private function fetchSongData(int $account, int $songNumber): ?array
    {
        $stmt = self::prepare('
				SELECT `title`, `initialOrder`, `order`, `authors`, `copyright`, `background`, `css`, `style_id`, `ccli_number`, `song_key`
				FROM `songs`
				WHERE `songnumber` = ?
				AND `account` = ?
			');

        $stmt->bind_param('ii', $songNumber, $account)->execute();
        $stmt->fetchOne($row);
        $stmt->close();

        return $row;
    }

    private function formatSongRow(int $account, int $songNumber, array $row): array
    {
        $orderValue = json_decode($row['order'], true);

        return [
          'account' => $account,
          'songNumber' => $songNumber,
          'title' => $row['title'],
          'initialOrder' => explode(self::SEPARATOR_ORDER, $row['initialOrder']),
          'order' => $orderValue,
          'blocks' => $this->fetchBlocks($account, $songNumber),
          'authors' => $row['authors'],
          'copyright' => $row['copyright'],
          'background' => $row['background'],
          'css' => $row['css'],
          'styleId' => $row['style_id'] ? (int)$row['style_id'] : null,
          'ccliNumber' => $row['ccli_number'],
          'key' => $row['song_key']
        ];
    }

    private function fetchBlocks(int $account, int $songNumber): array
    {
        $stmt = self::prepare('
				SELECT `type`, `text`
				FROM `blocks`
				WHERE `songnumber` = ?
				AND `account` = ?
			');

        $stmt->bind_param('ii', $songNumber, $account)->execute();
        $stmt->fetchAll($blockRows);
        $stmt->close();

        $blocks = [];
        foreach ($blockRows as $blockRow) {
            $blocksText = [];

            foreach (explode(self::SEPARATOR_BLOCK, $blockRow['text']) as $t) {
                $blocksText[] = str_replace(self::SEPARATOR_BLOCK_ESCAPE, self::SEPARATOR_BLOCK, $t);
            }

            $blocks[$blockRow['type']] = $blocksText;
        }

        return $blocks;
    }

    protected function post(Request &$req, Response &$res): never
    {
        $req->params->check('title')->checkArray('initialOrder')->checkObject('blocks');

        $account = $req->account;
        $songNumber = $req->params->getAsInt('songNumber', 0);
        $title = $req->params->get('title');
        $initialOrder = $req->params->getAsArray('initialOrder'); // Fixed: get as array
        $blocks = $req->params->getAsObject('blocks');
        $order = $req->params->getAsObject('order');
        $authors = $req->params->get('authors', self::UNKNOWN_AUTHOR);
        $copyright = $req->params->get('copyright', self::UNKNOWN_COPYRIGHT);

        if ($songNumber <= 0) {
            $songNumber = $this->generateSongNumber($account);
        } else {
            // Check if song with this number already exists for this account
            $checkStmt = self::prepare('
				SELECT COUNT(*) as count
				FROM `songs`
				WHERE `account` = ?
				AND `songnumber` = ?
			');

            $checkStmt->bind_param('ii', $account, $songNumber)->execute();
            $checkStmt->bind_result($count);
            $checkStmt->fetch();
            $checkStmt->close();

            if ($count > 0) {
                $res->error(400, 'Song with CCLI number ' . $songNumber . ' already exists in your library');
            }
        }

        $orderValue = '';
        if ($order !== null) {
            $orderValue = json_encode($order);
        } else {
            // Fallback: create a simple array
            $orderValue = json_encode($initialOrder);
        }

        $stmt = self::prepare('
			INSERT INTO `songs` (
				`account`, `songnumber`, `title`, `initialOrder`, `order`, `authors`, `copyright`
			) VALUES (
				?, ?, ?, ?, ?, ?, ?
			)
		');

        $stmt->bind_param(
            'iisssss',
            $account,
            $songNumber,
            $title,
            join(self::SEPARATOR_ORDER, $initialOrder),
            $orderValue,
            $authors,
            $copyright
        )->execute()->close();

        $this->insertBlocks($account, $songNumber, $blocks);

        $res->success([
            'account' => $account,
            'songNumber' => $songNumber,
            'title' => $title,
            'initialOrder' => $initialOrder,
            'order' => $order,
            'blocks' => $blocks,
            'authors' => $authors,
            'copyright' => $copyright
        ]);
    }

    protected function put(Request &$req, Response &$res): never
    {
        $req->params->checkNumeric('songNumber')->check('title')->checkArray('initialOrder')->checkObject('blocks');

        $account = $req->account;
        $songNumber = $req->params->getAsInt('songNumber');
        $title = $req->params->get('title');
        $initialOrder = $req->params->getAsArray('initialOrder');
        $blocks = $req->params->getAsObject('blocks');
        $order = $req->params->getAsObject('order');
        $authors = $req->params->get('authors', self::UNKNOWN_AUTHOR);
        $copyright = $req->params->get('copyright', self::UNKNOWN_COPYRIGHT);

        $orderValue = '';
        if ($order !== null) {
            $orderValue = json_encode($order);
        } else {
            // Fallback: create a simple array
            $orderValue = json_encode($initialOrder);
        }

        // Upsert: update the song when it exists, otherwise create the row. The child `blocks`
        // rows have a FK to `songs`, so the parent must exist before insertBlocks() runs — a plain
        // UPDATE silently affects 0 rows for a missing song and the block insert then fails (1452).
        $stmt = self::prepare('
			INSERT INTO `songs` (`account`, `songnumber`, `title`, `initialOrder`, `order`, `authors`, `copyright`)
			VALUES (?, ?, ?, ?, ?, ?, ?)
			ON DUPLICATE KEY UPDATE
				`title` = VALUES(`title`),
				`initialOrder` = VALUES(`initialOrder`),
				`order` = VALUES(`order`),
				`authors` = VALUES(`authors`),
				`copyright` = VALUES(`copyright`)
		');

        $stmt->bind_param(
            'iisssss',
            $account,
            $songNumber,
            $title,
            join(self::SEPARATOR_ORDER, $initialOrder),
            $orderValue,
            $authors,
            $copyright
        )->execute()->close();

        $this->insertBlocks($account, $songNumber, $blocks);

        $res->success([
            'account' => $account,
            'songNumber' => $songNumber,
            'title' => $title,
            'initialOrder' => $initialOrder,
            'order' => $order,
            'blocks' => $blocks,
            'authors' => $authors,
            'copyright' => $copyright
        ]);
    }

    protected function delete(Request &$req, Response &$res): never
    {
        $req->params->checkNumeric('songNumber');

        $account = $req->account;
        $songNumber = $req->params->getAsInt('songNumber');

        $stmt = self::prepare('
				DELETE FROM `songs`
				WHERE `songnumber` = ?
				AND `account` = ?
			');

        $stmt->bind_param('ii', $songNumber, $account)->execute()->close();

        $stmt = self::prepare('
				DELETE FROM `blocks`
				WHERE `songnumber` = ?
				AND `account` = ?
			');

        $stmt->bind_param('ii', $songNumber, $account)->execute()->close();

        $res->success([
            'message' => 'song with number "' . $songNumber . '" successfully deleted'
        ]);
    }

    private function insertBlocks(int $account, int $songNumber, object $blocks): void
    {
        $stmt = self::prepare('
				DELETE FROM `blocks`
				WHERE `songnumber` = ?
				AND `account` = ?
			');

        $stmt->bind_param('ii', $songNumber, $account)->execute()->close();

        $stmt = self::prepare('
				INSERT INTO `blocks` (
					`account`, `songnumber`, `type`, `text`
				) VALUES (
					?, ?, ?, ?
				)
			');

        foreach ($blocks as $type => $text) {
            $stmt->bind_param(
                'iiss',
                $account,
                $songNumber,
                $type,
                join(self::SEPARATOR_BLOCK, str_replace(self::SEPARATOR_BLOCK, self::SEPARATOR_BLOCK_ESCAPE, $text))
            )->execute();
        }

        $stmt->close();
    }

    private function generateSongNumber(int $account): int
    {
        $stmt = self::prepare('
				SELECT MAX(`songnumber`) + 1
				FROM `songs`
				WHERE `songnumber` < ?
				AND `account` = ?
			');

        $stmt->bind_param('ii', CUSTOM_NUMBER_LIMIT, $account)->execute();
        $stmt->bind_result($songNumber);

        if (!$stmt->fetch()) {
            $stmt->close();

            throw new Error('Could not generate songNumber for account ' . $account);
        }

        $stmt->close();

        return max($songNumber, 1);
    }
}
