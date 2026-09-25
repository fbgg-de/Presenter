<?php

require_once(__DIR__ . '/RestController.php');

/**
 * Groups from past shows, for the library: every agenda group with at least one entry, from the
 * most recent shows, without anyone having to save them first.
 *
 * GET /rest/LibraryPastGroups?limit=60&exclude=<show title>
 *   → [{ showTitle, date, group, items }], newest show first
 *
 * `exclude` leaves out the show being edited. Shows saved before groups existed are one group.
 */
class LibraryPastGroups extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        $account = $req->account;
        $limit = max(1, min(200, intval($req->query->get('limit', 60, false))));
        $exclude = (string)$req->query->get('exclude', '', false);

        $stmt = self::prepare('
				SELECT `title`, `date`, `order`, `groups`
				FROM `shows`
				WHERE `account` = ? AND `title` <> ?
				ORDER BY `date` DESC
				LIMIT ?
			');
        $stmt->bind_param('isi', $account, $exclude, $limit)->execute()->fetchAll($rows)->close();

        $result = [];
        foreach ($rows as $row) {
            $order = json_decode($row['order'] ?? '[]', true);
            if (!is_array($order)) {
                continue;
            }
            $groups = json_decode($row['groups'] ?? 'null', true);
            if (!is_array($groups) || count($groups) === 0) {
                $groups = [['id' => 'default', 'name' => '']];
            }

            $itemsByGroup = [];
            foreach ($order as $item) {
                // Very old shows stored bare song numbers.
                if (is_numeric($item)) {
                    $item = ['type' => 'song', 'songNumber' => (int)$item];
                }
                if (!is_array($item)) {
                    continue;
                }
                $groupId = isset($item['groupId']) && is_string($item['groupId']) ? $item['groupId'] : 'default';
                $itemsByGroup[$groupId][] = $item;
            }

            foreach ($groups as $group) {
                if (!is_array($group) || !isset($group['id'])) {
                    continue;
                }
                $items = $itemsByGroup[$group['id']] ?? [];
                if (count($items) === 0) {
                    continue;
                }
                $result[] = [
                    'showTitle' => $row['title'],
                    'date' => $row['date'],
                    'group' => $group,
                    'items' => $items,
                ];
            }
        }

        $res->success($result);
    }
}
