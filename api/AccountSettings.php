<?php

require_once(__DIR__ . '/RestController.php');

/**
 * GET  /rest/AccountSettings → returns account-wide settings
 * PUT  /rest/AccountSettings → updates account-wide settings
 */
class AccountSettings extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        $account = $req->account;

        $stmt = self::prepare('SELECT `default_style_id` FROM `account` WHERE `license` = ?');
        $stmt->bind_param('i', $account)->execute()->fetchOne($row)->close();

        $res->success([
            'defaultStyleId' => $row ? (int)$row['default_style_id'] : null,
        ]);
    }

    protected function put(Request &$req, Response &$res): never
    {
        $account = $req->account;

        $defaultStyleIdRaw = $req->params->get('defaultStyleId', null, false);

        if ($defaultStyleIdRaw === null) {
            $res->error(400, 'No fields to update');
        }

        // Handle defaultStyleId
        $defaultStyleId = null;
        if ($defaultStyleIdRaw !== null) {
            if ($defaultStyleIdRaw === '' || $defaultStyleIdRaw === false) {
                $defaultStyleId = null;
            } else {
                $defaultStyleId = intval($defaultStyleIdRaw);
                $check = self::prepare('SELECT `id` FROM `styles` WHERE `id` = ? AND `account` = ?');
                $check->bind_param('ii', $defaultStyleId, $account)->execute()->fetchOne($styleRow)->close();
                if (!$styleRow) {
                    $res->error(404, 'Style not found for this account');
                }
            }
        }

        // Build update query
        if ($defaultStyleId === null) {
            $stmt = self::prepare('UPDATE `account` SET `default_style_id` = NULL WHERE `license` = ?');
            $stmt->bind_param('i', $account)->execute()->close();
        } else {
            $stmt = self::prepare('UPDATE `account` SET `default_style_id` = ? WHERE `license` = ?');
            $stmt->bind_param('ii', $defaultStyleId, $account)->execute()->close();
        }

        // Re-fetch updated values
        $fetch = self::prepare('SELECT `default_style_id` FROM `account` WHERE `license` = ?');
        $fetch->bind_param('i', $account)->execute()->fetchOne($updated)->close();

        $res->success([
            'message' => 'Account settings updated',
            'defaultStyleId' => $updated ? (int)$updated['default_style_id'] : null,
        ]);
    }
}

