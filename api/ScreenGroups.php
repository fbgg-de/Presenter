<?php

require_once(__DIR__ . '/RestController.php');

/**
 * Screen groups.
 *
 * A screen group is a logical output ("Audience", "Stage", "Stream") that presentation
 * windows are assigned to. The group itself is account-wide; which window belongs to it is
 * stored on the device, with the rest of the window rig. `data` holds the kind and which
 * layers (background, slides, media, bible verses, overlays) the group shows.
 *
 * Structurally identical to `StageLayers`: one JSON `data` blob per row, read and written whole.
 *
 * GET    /rest/ScreenGroups          → all groups for the account, in operator order
 * POST   /rest/ScreenGroups          → create
 * POST   /rest/ScreenGroups/defaults → the starting pair, only while the account has none
 * PUT    /rest/ScreenGroups/{id}     → update (partial)
 * DELETE /rest/ScreenGroups/{id}     → delete
 */
class ScreenGroups extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        $account = $req->account;

        $stmt = self::prepare('
				SELECT `id`, `name`, `enabled`, `sort_order`, `data`, `created_at`, `updated_at`
				FROM `screen_groups`
				WHERE `account` = ?
				ORDER BY `sort_order`, `name`
			');
        $stmt->bind_param('i', $account)->execute()->fetchAll($groups)->close();

        foreach ($groups as &$group) {
            $group['id'] = (int)$group['id'];
            $group['enabled'] = (bool)$group['enabled'];
            $group['sort_order'] = (int)$group['sort_order'];
            $group['data'] = json_decode($group['data'], true) ?: [];
        }

        $res->success($groups);
    }

    /**
     * The two groups an account starts with: a normal presentation and a stage monitor.
     *
     * Without them the first thing a new account meets is an empty board — a window cannot be
     * opened usefully until a group exists, and which group to make is not something anyone
     * should have to decide before they have seen the app work once.
     *
     * Only the kind is stored; the client fills the rest from `normaliseScreenGroupData`, so the
     * defaults stay in one place. The names come from the client, in its own language.
     *
     * Runs only while the account has no group at all, so it cannot appear beside groups the
     * account already set up. An account that deletes every group does get the pair back — that
     * is the same "start from nothing" state, and coming back from an accidental wipe is worth
     * more than honouring a deliberate one.
     */
    private function seedDefaults(Request &$req, Response &$res): never
    {
        $account = $req->account;

        $stmt = self::prepare('SELECT COUNT(*) AS `count` FROM `screen_groups` WHERE `account` = ?');
        $stmt->bind_param('i', $account)->execute()->fetchOne($row)->close();
        if ((int)($row['count'] ?? 0) > 0) {
            $res->success(['message' => 'The account already has screen groups', 'created' => 0]);
        }

        $defaults = [
            ['name' => trim((string)$req->params->get('audience', 'Audience', false)) ?: 'Audience', 'kind' => 'audience'],
            ['name' => trim((string)$req->params->get('stage', 'Stage', false)) ?: 'Stage', 'kind' => 'stage'],
        ];

        $created = 0;
        foreach ($defaults as $order => $default) {
            $name = mb_substr($default['name'], 0, 200);
            $data = json_encode(['kind' => $default['kind']]);
            // IGNORE because (account, name) is unique: two devices opening the app at the same
            // moment both see an empty list, and the loser of that race must not fail.
            $stmt = self::prepare('
                    INSERT IGNORE INTO `screen_groups` (`account`, `name`, `enabled`, `sort_order`, `data`)
                    VALUES (?, ?, 1, ?, ?)
                ');
            $stmt->bind_param('isis', $account, $name, $order, $data)->execute()->close();
            $created++;
        }

        $res->success(['message' => 'Default screen groups created', 'created' => $created]);
    }

    protected function post(Request &$req, Response &$res): never
    {
        if ($req->path->get(0, '', false) === 'defaults') {
            $this->seedDefaults($req, $res);
        }

        $req->params->check('name', 'data');

        $account = $req->account;
        $name = $req->params->get('name');
        $enabled = $req->params->getAsBool('enabled', true) ? 1 : 0;
        $sortOrder = intval($req->params->get('sort_order', 0, false) ?? 0);
        $data = json_encode($req->params->getAsObject('data'));

        $stmt = self::prepare('
				INSERT INTO `screen_groups` (`account`, `name`, `enabled`, `sort_order`, `data`)
				VALUES (?, ?, ?, ?, ?)
			');
        $stmt->bind_param('isiis', $account, $name, $enabled, $sortOrder, $data)->execute()->id($id)->close();

        $res->success([
            'id' => $id,
            'name' => $name,
            'enabled' => (bool)$enabled,
            'sort_order' => $sortOrder,
            'message' => 'Screen group created'
        ]);
    }

    protected function put(Request &$req, Response &$res): never
    {
        $req->path->checkNumeric(0);
        $id = $req->path->getAsInt(0);
        $account = $req->account;

        // Partial update: toggling one layer must not have to round-trip the name as well.
        $fields = [];
        $types = '';
        $values = [];

        $nameRaw = $req->params->get('name', null, false);
        if ($nameRaw !== null) {
            $fields[] = '`name` = ?';
            $types .= 's';
            $values[] = $nameRaw;
        }

        $enabledRaw = $req->params->get('enabled', null, false);
        if ($enabledRaw !== null) {
            $fields[] = '`enabled` = ?';
            $types .= 'i';
            $values[] = $enabledRaw ? 1 : 0;
        }

        $sortRaw = $req->params->get('sort_order', null, false);
        if ($sortRaw !== null) {
            $fields[] = '`sort_order` = ?';
            $types .= 'i';
            $values[] = intval($sortRaw);
        }

        $dataRaw = $req->params->get('data', null, false);
        if ($dataRaw !== null) {
            $fields[] = '`data` = ?';
            $types .= 's';
            $values[] = json_encode($dataRaw);
        }

        if (count($fields) > 0) {
            $sql = 'UPDATE `screen_groups` SET ' . implode(', ', $fields) . ' WHERE `id` = ? AND `account` = ?';
            $types .= 'ii';
            $values[] = $id;
            $values[] = $account;

            $stmt = self::prepare($sql);
            $stmt->bind_param($types, ...$values)->execute()->close();
        }

        $res->success(['message' => 'Screen group updated', 'id' => $id]);
    }

    protected function delete(Request &$req, Response &$res): never
    {
        $req->path->checkNumeric(0);
        $id = $req->path->getAsInt(0);
        $account = $req->account;

        $stmt = self::prepare('
				DELETE FROM `screen_groups`
				WHERE `id` = ? AND `account` = ?
			');
        $stmt->bind_param('ii', $id, $account)->execute()->close();

        $res->success(['message' => 'Screen group deleted']);
    }
}
