<?php

require_once(__DIR__ . '/RestController.php');

// Lists available licenses/tenants for login selection
class Accounts extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        self::prepare('
				SELECT `license`, `name`
				FROM `account`
				WHERE `active` = 1
				ORDER BY `license`
			')
        ->execute()
        ->fetchAll($result)
        ->close();

        $res->success($result);
    }
}
