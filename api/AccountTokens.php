<?php

require_once(__DIR__ . '/RestController.php');

/**
 * Viewer token management for the authenticated account.
 *
 * GET    /rest/AccountTokens  → { hasToken: bool, tokenPrefix: string|null }
 * POST   /rest/AccountTokens  → generates (or regenerates) a viewer token
 *                               returns { token: string } — full token shown ONCE
 * DELETE /rest/AccountTokens  → revokes the viewer token
 */
class AccountTokens extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        $account = $req->account;

        $stmt = self::prepare('SELECT `viewer_token` FROM `account` WHERE `license` = ?');
        $stmt->bind_param('i', $account)->execute()->fetchOne($row)->close();

        $token = $row['viewer_token'] ?? null;

        $res->success([
            'hasToken'    => !empty($token),
            'tokenPrefix' => $token ? substr($token, 0, 8) . '...' : null,
        ]);
    }

    protected function post(Request &$req, Response &$res): never
    {
        $account = $req->account;

        // Generate a cryptographically random 32-byte (64-char hex) token
        $token = bin2hex(random_bytes(32));

        $stmt = self::prepare('UPDATE `account` SET `viewer_token` = ? WHERE `license` = ?');
        $stmt->bind_param('si', $token, $account)->execute()->close();

        $res->success([
            'token'   => $token,
            'message' => 'Viewer token generated. Save it — it will not be shown again.',
        ]);
    }

    protected function delete(Request &$req, Response &$res): never
    {
        $account = $req->account;

        $stmt = self::prepare('UPDATE `account` SET `viewer_token` = NULL WHERE `license` = ?');
        $stmt->bind_param('i', $account)->execute()->close();

        $res->success(['message' => 'Viewer token revoked.']);
    }
}
