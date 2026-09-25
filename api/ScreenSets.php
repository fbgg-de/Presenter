<?php

require_once(__DIR__ . '/RestController.php');

/**
 * Screen sets.
 *
 * A named shortcut for several screen groups — "LED wall" = LED left + LED right — offered as one
 * chip wherever media entries choose their screens. A set holds nothing else: each group keeps
 * its own framing and settings.
 *
 * GET    /rest/ScreenSets        → all sets for the account, by name
 * POST   /rest/ScreenSets        → create { name, screenGroupIds }
 * PUT    /rest/ScreenSets/{id}   → update (partial)
 * DELETE /rest/ScreenSets/{id}   → delete
 */
class ScreenSets extends RestController
{
    /** Group ids as a clean list of distinct positive integers. */
    private static function groupIds(mixed $raw): array
    {
        $ids = [];
        foreach (is_array($raw) ? $raw : [] as $value) {
            $id = intval($value);
            if ($id > 0 && !in_array($id, $ids, true)) {
                $ids[] = $id;
            }
        }
        return $ids;
    }

    protected function get(Request &$req, Response &$res): never
    {
        $account = $req->account;

        $stmt = self::prepare('
				SELECT `id`, `name`, `screen_group_ids`
				FROM `screen_sets`
				WHERE `account` = ?
				ORDER BY `name`
			');
        $stmt->bind_param('i', $account)->execute()->fetchAll($sets)->close();

        $result = [];
        foreach ($sets as $set) {
            $result[] = [
                'id' => (int)$set['id'],
                'name' => $set['name'],
                'screenGroupIds' => self::groupIds(json_decode($set['screen_group_ids'] ?? '[]', true)),
            ];
        }

        $res->success($result);
    }

    protected function post(Request &$req, Response &$res): never
    {
        $req->params->check('name');

        $account = $req->account;
        $name = trim($req->params->get('name'));
        if ($name === '') {
            $res->error(400, 'A screen set needs a name');
        }
        $ids = json_encode(self::groupIds($req->params->get('screenGroupIds', [], false)));

        $stmt = self::prepare('
				INSERT INTO `screen_sets` (`account`, `name`, `screen_group_ids`)
				VALUES (?, ?, ?)
			');
        $stmt->bind_param('iss', $account, $name, $ids)->execute()->id($id)->close();

        $res->success(['id' => $id, 'message' => 'Screen set created']);
    }

    protected function put(Request &$req, Response &$res): never
    {
        $req->path->checkNumeric(0);
        $id = $req->path->getAsInt(0);
        $account = $req->account;

        $fields = [];
        $types = '';
        $values = [];

        $nameRaw = $req->params->get('name', null, false);
        if ($nameRaw !== null && trim($nameRaw) !== '') {
            $fields[] = '`name` = ?';
            $types .= 's';
            $values[] = trim($nameRaw);
        }
        if ($req->params->provided('screenGroupIds')) {
            $fields[] = '`screen_group_ids` = ?';
            $types .= 's';
            $values[] = json_encode(self::groupIds($req->params->get('screenGroupIds', [], false)));
        }

        if (count($fields) > 0) {
            $sql = 'UPDATE `screen_sets` SET ' . implode(', ', $fields) . ' WHERE `id` = ? AND `account` = ?';
            $types .= 'ii';
            $values[] = $id;
            $values[] = $account;
            self::prepare($sql)->bind_param($types, ...$values)->execute()->close();
        }

        $res->success(['message' => 'Screen set updated', 'id' => $id]);
    }

    protected function delete(Request &$req, Response &$res): never
    {
        $req->path->checkNumeric(0);
        $id = $req->path->getAsInt(0);
        $account = $req->account;

        self::prepare('DELETE FROM `screen_sets` WHERE `id` = ? AND `account` = ?')->bind_param('ii', $id, $account)->execute()->close();

        $res->success(['message' => 'Screen set deleted']);
    }
}
