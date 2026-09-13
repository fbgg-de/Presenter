<?php

require_once(__DIR__ . '/RestController.php');

class AdminAccounts extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        $this->requireAdmin($res);

        // Get all accounts with their OIDC provider assignments
        $stmt = self::prepare('
				SELECT
					a.license,
					a.mail,
					a.name,
					a.active,
					a.created_at,
					a.lastactivity,
					a.church_tools_url,
					a.church_tools_token,
					GROUP_CONCAT(
						CONCAT(
							aop.provider_id, ":",
							p.name, ":",
							CAST(aop.is_default AS CHAR)
						) SEPARATOR ";"
					) as providers
				FROM account a
				LEFT JOIN account_oidc_providers aop ON a.license = aop.license
				LEFT JOIN oidc_providers p ON aop.provider_id = p.id
				GROUP BY a.license, a.name
				ORDER BY a.name, a.license
			');

        $accounts = [];
        $stmt->execute();
        $stmt->fetchAll($accounts);
        $stmt->close();

        // Spotify credentials arrive with migration 25 — read separately so the account list
        // still loads on an older schema.
        $spotifyByLicense = [];
        try {
            $spStmt = self::prepare('SELECT `license`, `spotify_client_id`, `spotify_client_secret` FROM `account`');
            $spStmt->execute();
            $spStmt->fetchAll($spotifyRows);
            $spStmt->close();
            foreach ($spotifyRows as $row) {
                $spotifyByLicense[(int)$row['license']] = $row;
            }
        } catch (\Throwable $e) {
            $spotifyByLicense = [];
        }

        // Parse providers for each account
        foreach ($accounts as &$account) {
            $account['license'] = (int)$account['license'];
            $account['active'] = (bool)$account['active'];
            $account['church_tools_url'] = $account['church_tools_url'] ?? null;
            // Never expose the token — send only a flag indicating whether it's set
            $account['church_tools_enabled'] = !empty($account['church_tools_url']) && !empty($account['church_tools_token']);
            unset($account['church_tools_token']);

            // The client id is not a secret and is shown for editing; the secret never leaves.
            $spotify = $spotifyByLicense[$account['license']] ?? [];
            $account['spotify_client_id'] = $spotify['spotify_client_id'] ?? null;
            $account['spotify_enabled'] = !empty($spotify['spotify_client_id']) && !empty($spotify['spotify_client_secret']);

            $providersList = [];
            if (!empty($account['providers'])) {
                $providerParts = explode(';', $account['providers']);
                foreach ($providerParts as $part) {
                    $info = explode(':', $part);
                    if (count($info) === 3) {
                        $providersList[] = [
                            'provider_id' => (int)$info[0],
                            'provider_name' => $info[1],
                            'is_default' => (bool)$info[2],
                        ];
                    }
                }
            }
            $account['providers'] = $providersList;
        }

        $res->success($accounts);
    }

    protected function post(Request &$req, Response &$res): never
    {
        $this->requireAdmin($res);

        $req->params->check('mail')->checkNumeric('license');

        $license = $req->params->getAsInt('license');
        $mail = $req->params->get('mail');
        $name = $req->params->get('name', '');
        $active = $req->params->getAsBool('active', true);

        // Insert new account
        $stmt = self::prepare('
				INSERT INTO account (license, mail, name, active)
				VALUES (?, ?, ?, ?)
			');

        $stmt->bind_param('issi', $license, $mail, $name, $active)
            ->execute()
            ->close();

        $res->success([
            'message' => 'Account created successfully',
            'license' => $license,
        ]);
    }

    protected function put(Request &$req, Response &$res): never
    {
        $this->requireAdmin($res);

        $req->params->checkNumeric('license');

        $license = $req->params->getAsInt('license');
        $mail = $req->params->get('mail', null, false);
        $name = $req->params->get('name', null, false);
        $active = $req->params->has('active') ? $req->params->getAsBool('active') : null;
        $churchToolsUrl = $req->params->has('churchToolsUrl') ? $req->params->get('churchToolsUrl', null) : false;
        $churchToolsToken = $req->params->has('churchToolsToken') ? $req->params->get('churchToolsToken', null) : false;

        // Build dynamic update query
        $updates = [];
        $types = '';
        $values = [];

        if ($mail !== null) {
            $updates[] = 'mail = ?';
            $types .= 's';
            $values[] = $mail;
        }

        if ($name !== null) {
            $updates[] = 'name = ?';
            $types .= 's';
            $values[] = $name;
        }

        if ($active !== null) {
            $updates[] = 'active = ?';
            $types .= 'i';
            $values[] = $active ? 1 : 0;
        }

        if ($churchToolsUrl !== false) {
            $ctUrl = $churchToolsUrl ? trim($churchToolsUrl) : null;
            if ($ctUrl === null || $ctUrl === '') {
                $updates[] = '`church_tools_url` = NULL';
            } else {
                $updates[] = '`church_tools_url` = ?';
                $types .= 's';
                $values[] = $ctUrl;
            }
        }

        if ($churchToolsToken !== false) {
            $ctToken = $churchToolsToken ? trim($churchToolsToken) : null;
            if ($ctToken === null || $ctToken === '') {
                $updates[] = '`church_tools_token` = NULL';
            } else {
                $updates[] = '`church_tools_token` = ?';
                $types .= 's';
                $values[] = $ctToken;
            }
        }

        // Spotify app credentials. An explicitly empty client id clears both halves — a secret
        // without its id is useless. The secret is write-only: only a typed value replaces it.
        if ($req->params->provided('spotifyClientId')) {
            $spotifyClientId = trim((string)$req->params->get('spotifyClientId', '', false));
            if ($spotifyClientId === '') {
                $updates[] = '`spotify_client_id` = NULL';
                $updates[] = '`spotify_client_secret` = NULL';
            } else {
                $updates[] = '`spotify_client_id` = ?';
                $types .= 's';
                $values[] = mb_substr($spotifyClientId, 0, 100);
            }
        }

        $spotifyClientSecret = trim((string)$req->params->get('spotifyClientSecret', '', false));
        $clearsSpotify = $req->params->provided('spotifyClientId') && trim((string)$req->params->get('spotifyClientId', '', false)) === '';
        if ($spotifyClientSecret !== '' && !$clearsSpotify) {
            $updates[] = '`spotify_client_secret` = ?';
            $types .= 's';
            $values[] = mb_substr($spotifyClientSecret, 0, 200);
        }

        if (empty($updates)) {
            $res->error(400, 'No fields to update');
        }

        $updates[] = 'lastactivity = CURRENT_TIMESTAMP';

        $stmt = self::prepare('
				UPDATE account
				SET ' . implode(', ', $updates) . '
				WHERE license = ?
			');

        $types .= 'i';
        $values[] = $license;

        $stmt->bind_param($types, ...$values)
            ->execute();

        $affected = 0;
        $stmt->affected($affected);
        $stmt->close();

        if ($affected === 0) {
            $res->error(404, 'Account not found');
        }

        $res->success([
            'message' => 'Account updated successfully',
        ]);
    }

    protected function delete(Request &$req, Response &$res): never
    {
        $this->requireAdmin($res);

        $req->params->checkNumeric('license');

        $license = $req->params->getAsInt('license');

        $stmt = self::prepare('
				DELETE FROM account
				WHERE license = ?
			');

        $stmt->bind_param('i', $license)
            ->execute();

        $affected = 0;
        $stmt->affected($affected);
        $stmt->close();

        if ($affected === 0) {
            $res->error(404, 'Account not found');
        }

        $res->success([
            'message' => 'Account deleted successfully',
        ]);
    }
}
