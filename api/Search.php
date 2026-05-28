<?php

require_once(__DIR__ . '/RestController.php');
require_once(__DIR__ . '/../config.php');

class Search extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        $req->query->check('q');
        $query = $req->query->get('q');
        $type = strtolower($req->query->get('type', 'all', false));
        $account = $req->account;
        $limit = SEARCH_RESULT_LIMIT;

        $results = [];

        // Songs search
        if ($type === 'all' || $type === 'songs') {
            $isNumeric = ctype_digit(trim($query));
            if ($isNumeric) {
                // Search by song number
                $stmt = self::prepare('
						SELECT `songnumber` AS `id`, `title` AS `name`, \'song\' AS `type`
						FROM `songs`
						WHERE `account` = ?
						AND CAST(`songnumber` AS CHAR) LIKE ?
						ORDER BY `songnumber`
						LIMIT ?
					');
                $stmt->bind_param('isi', $account, $query . '%', $limit)->execute()->fetchAll($songResults)->close();
            } else {
                $search = $this->prepareSearchParameter($query);
                $stmt = self::prepare('
						SELECT `songnumber` AS `id`, `title` AS `name`, \'song\' AS `type`,
						  MATCH(`title`) AGAINST (? IN BOOLEAN MODE) AS `relevance`,
						  CASE WHEN `title` LIKE ? THEN 10 ELSE 0 END AS `prefix_boost`
						FROM `songs`
						WHERE `account` = ?
						AND (`title` LIKE ? OR MATCH(`title`) AGAINST (? IN BOOLEAN MODE) OR `authors` LIKE ?)
						ORDER BY `prefix_boost` DESC, `relevance` DESC, `title`
						LIMIT ?
					');
                $like = "%{$query}%";
                $prefixLike = "{$query}%";
                $stmt->bind_param('ssisssi', $search, $prefixLike, $account, $like, $search, $like, $limit)->execute()->fetchAll($songResults)->close();
            }
            $results = array_merge($results, $songResults);
        }

        // Styles search
        if ($type === 'all' || $type === 'styles') {
            $stmt = self::prepare('
					SELECT `id`, `name`, \'style\' AS `type`
					FROM `styles`
					WHERE `account` = ? AND `name` LIKE ?
					ORDER BY `name`
					LIMIT ?
				');
            $like = "%{$query}%";
            $stmt->bind_param('isi', $account, $like, $limit)->execute()->fetchAll($styleResults)->close();
            $results = array_merge($results, $styleResults);
        }

        $res->success($results);
    }

    private function prepareSearchParameter(string $search): string
    {
        $result = [];
        foreach (explode(' ', $search) as $word) {
            $word = trim($word);
            if (!empty($word)) {
                $word = str_replace(['+', '-', '@', '<', '>', '(', ')', '~', '*', '"'], '', $word);
                if (!empty($word)) {
                    $result[] = $word . '*';
                }
            }
        }
        return join(' ', $result);
    }
}
