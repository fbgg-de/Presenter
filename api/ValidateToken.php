<?php

require_once(__DIR__ . '/RestController.php');

/**
 * Token validation endpoint — called by the WebSocket relay server.
 *
 * GET /rest/ValidateToken?token=<hex64>
 *
 * No session authentication required (whitelisted in rest.php).
 * Returns { "account": <number> } on success or a 403 error.
 *
 * The endpoint is intentionally minimal: it only resolves a viewer token to
 * an account number so the WS relay can authenticate token-based connections
 * without needing its own database connection.
 */
class ValidateToken extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        $token = trim($_GET['token'] ?? '');

        if (!preg_match('/^[0-9a-f]{64}$/', $token)) {
            $res->error(400, 'Invalid token format.');
        }

        $stmt = self::prepare('SELECT `license` FROM `account` WHERE `viewer_token` = ? AND `active` = 1 LIMIT 1');
        $stmt->bind_param('s', $token)->execute()->fetchOne($row)->close();

        if (!$row) {
            $res->error(403, 'Token not found or account inactive.');
        }

        $res->success(['account' => (int) $row['license']]);
    }
}
