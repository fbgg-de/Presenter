<?php

require_once(__DIR__ . '/RestController.php');
require_once(__DIR__ . '/NextcloudRelay.php');
require_once(__DIR__ . '/../classes/AccountSchema.php');

/**
 * The account's own connections to other services, managed by the account in Settings → Connections.
 *
 * GET /rest/AccountIntegrations → { spotifyClientId, spotifyEnabled, nextcloudUrl, churchToolsUrl,
 *                                   churchToolsEnabled, privateNetwork }
 * PUT /rest/AccountIntegrations   { spotifyClientId?, spotifyClientSecret?, nextcloudUrl?, churchToolsUrl?, churchToolsToken? }
 *
 * Secrets (Spotify client secret, ChurchTools login token) are write-only: they never leave the
 * server, and a blank value keeps the stored one. Clearing the Spotify client id or the ChurchTools
 * address removes the secret with it. An empty Nextcloud address switches Nextcloud off.
 *
 * Whether these services may be reached in a private network stays with the server admin
 * (admin Accounts, account.integrations_private_network): it lets the server reach into its own
 * network on the account's behalf. The requests themselves are guarded (NextcloudRelay,
 * OutboundHttp).
 */
class AccountIntegrations extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        $res->success($this->current((int)$req->account));
    }

    protected function put(Request &$req, Response &$res): never
    {
        $account = (int)$req->account;
        if (!$account) {
            $res->error(401, 'Not signed in');
        }

        $updates = [];
        $types = '';
        $values = [];
        $set = function (string $column, ?string $value) use (&$updates, &$types, &$values) {
            if ($value === null) {
                $updates[] = "`{$column}` = NULL";
                return;
            }
            $updates[] = "`{$column}` = ?";
            $types .= 's';
            $values[] = $value;
        };

        // ── Spotify ──
        $clearsSpotify = false;
        if ($req->params->provided('spotifyClientId')) {
            $clientId = trim((string)$req->params->get('spotifyClientId', '', false));
            $clearsSpotify = $clientId === '';
            $set('spotify_client_id', $clearsSpotify ? null : mb_substr($clientId, 0, 100));
            if ($clearsSpotify) {
                $set('spotify_client_secret', null);
            }
        }
        $secret = trim((string)$req->params->get('spotifyClientSecret', '', false));
        if ($secret !== '' && !$clearsSpotify) {
            $set('spotify_client_secret', mb_substr($secret, 0, 200));
        }

        // ── Nextcloud ──
        if ($req->params->provided('nextcloudUrl')) {
            $raw = trim((string)$req->params->get('nextcloudUrl', '', false));
            if ($raw === '') {
                $set('nextcloud_url', null);
            } else {
                // Stored in canonical form: the web version compares its browser-stored sign-in with it.
                $url = NextcloudRelay::normalizeServer($raw);
                if ($url === null || strlen($url) > 500) {
                    $res->error(400, 'The Nextcloud address must be an https:// address', false);
                }
                $set('nextcloud_url', $url);
            }
        }

        // ── ChurchTools ──
        $clearsChurchTools = false;
        if ($req->params->provided('churchToolsUrl')) {
            $raw = trim((string)$req->params->get('churchToolsUrl', '', false));
            $clearsChurchTools = $raw === '';
            if ($clearsChurchTools) {
                $set('church_tools_url', null);
                $set('church_tools_token', null);
            } else {
                $parts = parse_url($raw);
                if (!$parts || strtolower($parts['scheme'] ?? '') !== 'https' || empty($parts['host']) || isset($parts['user']) || strlen($raw) > 500) {
                    $res->error(400, 'The ChurchTools address must be an https:// address', false);
                }
                $set('church_tools_url', $raw);
            }
        }
        $token = trim((string)$req->params->get('churchToolsToken', '', false));
        if ($token !== '' && !$clearsChurchTools) {
            $set('church_tools_token', mb_substr($token, 0, 500));
        }

        if (!$updates) {
            $res->error(400, 'No fields to update');
        }

        $types .= 'i';
        $values[] = $account;
        self::prepare('UPDATE `account` SET ' . implode(', ', $updates) . ' WHERE `license` = ?')
            ->bind_param($types, ...$values)
            ->execute()
            ->close();

        $res->success(['message' => 'Integrations updated'] + $this->current($account));
    }

    /** What the settings show: never a secret, only whether one is stored. */
    private function current(int $account): array
    {
        $row = null;
        if ($account) {
            $stmt = self::prepare(
                'SELECT `spotify_client_id`, `spotify_client_secret`, `nextcloud_url`, `church_tools_url`, `church_tools_token`
                 FROM `account` WHERE `license` = ?'
            );
            $stmt->bind_param('i', $account)->execute()->fetchOne($row)->close();
        }
        return [
            'spotifyClientId' => $row['spotify_client_id'] ?? null,
            'spotifyEnabled' => !empty($row['spotify_client_id']) && !empty($row['spotify_client_secret']),
            'nextcloudUrl' => $row['nextcloud_url'] ?? null,
            'churchToolsUrl' => $row['church_tools_url'] ?? null,
            'churchToolsEnabled' => !empty($row['church_tools_url']) && !empty($row['church_tools_token']),
            'privateNetwork' => AccountSchema::privateNetworkAllowed($account),
        ];
    }
}
