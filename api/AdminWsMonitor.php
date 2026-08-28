<?php

require_once(__DIR__ . '/RestController.php');
require_once(__DIR__ . '/../classes/MonitorToken.php');

/**
 * POST /rest/AdminWsMonitor → mints a short-lived token that lets the admin panel attach
 *                             to the WebSocket relay as a message monitor, plus the relay
 *                             URL to connect it to.
 *
 * Admin authentication required. The token is spent immediately on the relay handshake
 * and expires within a couple of minutes — see MonitorToken.
 */
class AdminWsMonitor extends RestController
{
    protected function post(Request &$req, Response &$res): never
    {
        $this->requireAdmin($res);

        $wsHost = defined('WS_HOST') && is_array(WS_HOST) ? WS_HOST : [];

        if (empty($wsHost['host'])) {
            $res->error(409, 'No WebSocket relay is configured (WS_HOST in config.php).');
        }

        $path   = isset($wsHost['path']) && $wsHost['path'] !== '/' ? $wsHost['path'] : '';
        $scheme = !empty($wsHost['wss']) ? 'wss' : 'ws';
        $port   = (int) ($wsHost['port'] ?? 0);

        $res->success([
            'token'     => MonitorToken::issue(null),
            'expiresIn' => MonitorToken::TTL,
            'url'       => $scheme . '://' . $wsHost['host'] . ($port ? ':' . $port : '') . $path,
        ]);
    }
}
