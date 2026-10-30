<?php

require_once(__DIR__ . '/RestController.php');
require_once(__DIR__ . '/../classes/MonitorToken.php');

/**
 * Relay ticket validation — called by the WebSocket relay server.
 *
 * GET /rest/ValidateWsTicket?ticket=<payload.signature> → { "account": <n>, "expires": <unix seconds> }
 *
 * No session required (whitelisted in rest.php); the ticket signs its own claims. Only
 * `client` tickets pass — a monitor token is not a relay login, and a ticket is not a monitor.
 */
class ValidateWsTicket extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        $ticket = trim($_GET['ticket'] ?? '');
        $claims = $ticket === '' ? null : MonitorToken::verify($ticket, ['client']);

        if ($claims === null) {
            $res->error(403, 'Invalid or expired relay ticket.', false);
        }

        $res->success([
            'account' => $claims['account'],
            'expires' => $claims['exp'],
        ]);
    }
}
