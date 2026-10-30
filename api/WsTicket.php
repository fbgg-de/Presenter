<?php

require_once(__DIR__ . '/RestController.php');
require_once(__DIR__ . '/../classes/MonitorToken.php');

/**
 * Relay ticket for the signed-in session.
 *
 * GET /rest/WsTicket → { "ticket": "<payload.signature>", "expires": <unix seconds> }
 *
 * The WebSocket relay used to take a bare account number, which anyone could guess. Apps now
 * fetch this ticket and send it in their relay auth message; the relay resolves it through
 * /rest/ValidateWsTicket. It lives a day so a reconnect mid-service never depends on the
 * backend answering right then — clients cache it and only fetch a new one well before expiry.
 */
class WsTicket extends RestController
{
    public const TTL = 24 * 60 * 60;

    protected function get(Request &$req, Response &$res): never
    {
        // Account 0 is the admin session / signed-out sentinel, never a real account.
        if ($req->account < 1) {
            $res->error(403, 'No account to open the relay for.', false);
        }

        $res->success([
            'ticket'  => MonitorToken::issue($req->account, 'client', self::TTL),
            'expires' => time() + self::TTL,
        ]);
    }
}
