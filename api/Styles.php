<?php

require_once(__DIR__ . '/RestController.php');

class Styles extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        $account = $req->account;
        $idRaw = $req->path->get(0, null, false);

        if (is_numeric($idRaw)) {
            $this->handleGetSingleStyle($res, $account, intval($idRaw));
        }

        $this->handleListStyles($res, $account);
    }

    private function handleGetSingleStyle(Response &$res, int $account, int $id): never
    {
        $stmt = self::prepare('
				SELECT s.`id`, s.`name`, s.`enabled`, s.`data`, s.`created_at`, s.`updated_at`
				FROM `styles` s
				WHERE s.`id` = ? AND s.`account` = ?
			');
        $stmt->bind_param('ii', $id, $account)->execute()->fetchOne($style)->close();

        if (!$style) {
            $res->error(404, 'Style not found');
        }

        $style['data'] = json_decode($style['data'], true);

        $res->success($style);
    }

    private function handleListStyles(Response &$res, int $account): never
    {
        $stmt = self::prepare('
				SELECT `id`, `name`, `enabled`, `data`, `created_at`, `updated_at`
				FROM `styles`
				WHERE `account` = ?
				ORDER BY `name`
			');
        $stmt->bind_param('i', $account)->execute()->fetchAll($styles)->close();

        foreach ($styles as &$style) {
            $style['data'] = json_decode($style['data'], true);
        }

        $res->success($styles);
    }

    protected function post(Request &$req, Response &$res): never
    {
        $req->params->check('name', 'data');

        $account = $req->account;
        $name = $req->params->get('name');
        $enabled = $req->params->getAsBool('enabled', true) ? 1 : 0;
        $data = json_encode($req->params->getAsObject('data'));

        $stmt = self::prepare('
				INSERT INTO `styles` (`account`, `name`, `enabled`, `data`)
				VALUES (?, ?, ?, ?)
			');
        $stmt->bind_param('isis', $account, $name, $enabled, $data)->execute()->id($id)->close();

        $res->success([
            'id' => $id,
            'name' => $name,
            'enabled' => (bool)$enabled,
            'message' => 'Style created'
        ]);
    }

    protected function put(Request &$req, Response &$res): never
    {
        $req->path->checkNumeric(0);
        $id = $req->path->getAsInt(0);
        $account = $req->account;

        // Build dynamic update
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

        $dataRaw = $req->params->get('data', null, false);
        if ($dataRaw !== null) {
            $fields[] = '`data` = ?';
            $types .= 's';
            $values[] = json_encode($dataRaw);
        }

        if (count($fields) > 0) {
            $sql = 'UPDATE `styles` SET ' . implode(', ', $fields) . ' WHERE `id` = ? AND `account` = ?';
            $types .= 'ii';
            $values[] = $id;
            $values[] = $account;

            $stmt = self::prepare($sql);
            $stmt->bind_param($types, ...$values)->execute()->close();
        }

        $res->success(['message' => 'Style updated', 'id' => $id]);
    }

    protected function delete(Request &$req, Response &$res): never
    {
        $req->path->checkNumeric(0);
        $id = $req->path->getAsInt(0);
        $account = $req->account;

        $stmt = self::prepare('
				DELETE FROM `styles`
				WHERE `id` = ? AND `account` = ?
			');
        $stmt->bind_param('ii', $id, $account)->execute()->close();

        $res->success(['message' => 'Style deleted']);
    }
}
