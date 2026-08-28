<?php

require_once(__DIR__ . '/RestController.php');
require_once(__DIR__ . '/../classes/MonitorToken.php');

/**
 * Monitor token validation — called by the WebSocket relay server.
 *
 * GET /rest/ValidateMonitorToken?token=<payload.signature>
 *
 * No session authentication required (whitelisted in rest.php); the token signs its own
 * claims. Returns { "scope": "admin" } or { "scope": "account", "account": <number> }.
 *
 * Kept separate from ValidateToken on purpose: that one resolves a *viewer* token, which
 * authenticates a display. A viewer token must never be able to subscribe to an account's
 * full message traffic, so the two token kinds never share a validation path.
 */
class ValidateMonitorToken extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        $token  = trim($_GET['token'] ?? '');
        $claims = $token === '' ? null : MonitorToken::verify($token);

        if ($claims === null) {
            $res->error(403, 'Invalid or expired monitor token.');
        }

        $res->success([
            'scope'   => $claims['scope'],
            'account' => $claims['account'],
        ]);
    }
}
