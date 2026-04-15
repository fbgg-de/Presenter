<?php

require_once(__DIR__ . '/RestController.php');

class ShowItemTypes extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        $account = $req->account;

        $stmt = self::prepare('
				SELECT `id`, `type_key`, `label`, `color`, `icon`, `is_default`
				FROM `show_item_types`
				WHERE `account` = ?
				ORDER BY `type_key`
			');
        $stmt->bind_param('i', $account)->execute()->fetchAll($types)->close();

        // If no types configured, return defaults
        if (empty($types)) {
            $types = [
                [
            'type_key' => 'song',
            'label' => 'Song',
            'color' => '#1976d2',
            'icon' => 'MusicNote',
            'is_default' => 1
          ],
                [
            'type_key' => 'media',
            'label' => 'Media',
            'color' => '#f9a825',
            'icon' => 'Image',
            'is_default' => 1
          ],
                [
            'type_key' => 'bible_verse',
            'label' => 'Bible Verse',
            'color' => '#388e3c',
            'icon' => 'MenuBook',
            'is_default' => 1
          ],
            ];
        }

        $res->success($types);
    }

    protected function put(Request &$req, Response &$res): never
    {
        $req->params->check('type_key');

        $account = $req->account;
        $typeKey = $req->params->get('type_key');
        $label = $req->params->get('label', $typeKey, false);
        $color = $req->params->get('color', '#1976d2', false);
        $icon = $req->params->get('icon', 'MusicNote', false);

        $stmt = self::prepare('
				INSERT INTO `show_item_types` (`account`, `type_key`, `label`, `color`, `icon`)
				VALUES (?, ?, ?, ?, ?)
				ON DUPLICATE KEY UPDATE `label` = VALUES(`label`), `color` = VALUES(`color`), `icon` = VALUES(`icon`)
			');
        $stmt->bind_param('issss', $account, $typeKey, $label, $color, $icon)->execute()->close();

        $res->success(['message' => 'Show item type updated']);
    }
}
