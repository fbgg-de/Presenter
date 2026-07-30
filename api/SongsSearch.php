<?php

require_once(__DIR__ . '/RestController.php');

class SongsSearch extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        $req->query->check('q');
        $query = $req->query->get('q');

        $account = $req->account;
        $result = [];

        $mode = strtolower($req->path->get(0, 'title'));

        // Callers that render a denser list (e.g. the set list "Add" view) can ask for more
        // rows than the deployment-wide default. Clamped so a client cannot request the table.
        $limit = SEARCH_RESULT_LIMIT;
        $limitRaw = $req->query->get('limit', null, false);
        if ($limitRaw !== null && is_numeric($limitRaw)) {
            $limit = max(1, min(50, (int)$limitRaw));
        }

        switch ($mode) {
            case 'text':
                $search = self::prepareSearchParameter($query);

                $stmt = self::prepare('
            SELECT
              `songs`.`songnumber` AS `songNumber`,
              `songs`.`title`,
              `songs`.`authors`,
              MAX(MATCH(`blocks`.`text`) AGAINST (? IN BOOLEAN MODE)) AS `score`
            FROM `songs`
            INNER JOIN `blocks`
              ON `songs`.`songnumber` = `blocks`.`songnumber`
              AND `songs`.`account` = `blocks`.`account`
            WHERE
              `songs`.`account` = ?
              AND MATCH(`blocks`.`text`) AGAINST (? IN BOOLEAN MODE)
            GROUP BY `songs`.`songnumber`, `songs`.`title`, `songs`.`authors`
            ORDER BY `score` DESC, `songs`.`title`
            LIMIT ?
          ');

                $stmt->bind_param('sisi', $search, $account, $search, $limit)->execute()->fetchAll($result)->close();
                break;
            case 'number':
                $req->query->checkNumeric('q');

                $stmt = self::prepare('
            SELECT `songnumber` AS `songNumber`, `title`, `authors`
            FROM `songs`
            WHERE
              CAST(`songnumber` AS CHAR) LIKE ?
              AND `account` = ?
            ORDER BY `songnumber`
            LIMIT ?
          ');

                $stmt->bind_param('sii', $query . '%', $account, $limit)->execute()->fetchAll($result)->close();
                break;
            default: // title — search title, authors, and songNumber
                // If query is purely numeric, also match by song number
                $isNumeric = ctype_digit(trim($query));
                $search = self::prepareSearchParameter($query);

                if ($isNumeric) {
                    // Search by song number prefix
                    $stmt = self::prepare('
              SELECT `songnumber` AS `songNumber`, `title`, `authors`
              FROM `songs`
              WHERE
                CAST(`songnumber` AS CHAR) LIKE ?
                AND `account` = ?
              ORDER BY `songnumber`
              LIMIT ?
            ');
                    $stmt->bind_param('sii', $query . '%', $account, $limit)->execute()->fetchAll($result)->close();
                } else {
                    $stmt = self::prepare('
              SELECT
                `songnumber` AS `songNumber`,
                `title`,
                `authors`,
                MATCH(`title`) AGAINST (? IN BOOLEAN MODE) AS `relevance`,
                CASE WHEN `title` LIKE ? THEN 10 ELSE 0 END AS `prefix_boost`
              FROM `songs`
              WHERE
                `account` = ?
                AND (
                  `title` LIKE ?
                  OR MATCH(`title`) AGAINST (? IN BOOLEAN MODE)
                  OR `authors` LIKE ?
                )
              ORDER BY
                `prefix_boost` DESC,
                `relevance` DESC,
                `title`
              LIMIT ?
            ');

                    $likeQuery = "%{$query}%";
                    $prefixLike = "{$query}%";
                    $stmt->bind_param('ssisssi', $search, $prefixLike, $account, $likeQuery, $search, $likeQuery, $limit)->execute()->fetchAll($result)->close();
                }
        }

        $res->success($result);
    }

    private function prepareSearchParameter(string $search): string
    {
        $result = [];

        foreach (explode(' ', $search) as $word) {
            $word = trim($word);
            if (!empty($word)) {
                // Remove or escape special characters that are operators in FULLTEXT boolean mode
                // Characters to escape: + - @ < > ( ) ~ * "
                $word = str_replace(['+', '-', '@', '<', '>', '(', ')', '~', '*', '"'], '', $word);

                if (!empty($word)) {
                    // Use OR logic (no +) to make search less restrictive
                    // Add word with wildcard (word*)
                    $result[] = $word . '*';
                }
            }
        }

        return join(' ', $result);
    }
}
