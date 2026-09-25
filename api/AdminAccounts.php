<?php

require_once(__DIR__ . '/RestController.php');
require_once(__DIR__ . '/../classes/AccountSchema.php');

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

        // The integration columns arrive with migrations 32 and 33.
        $nextcloudByLicense = [];
        try {
            $privateColumn = AccountSchema::privateNetworkColumn();
            $ncStmt = self::prepare(
                'SELECT `license`, `nextcloud_url`' . ($privateColumn ? ", `{$privateColumn}` AS `private_network`" : '') . ' FROM `account`'
            );
            $ncStmt->execute();
            $ncStmt->fetchAll($nextcloudRows);
            $ncStmt->close();
            foreach ($nextcloudRows as $row) {
                $nextcloudByLicense[(int)$row['license']] = $row;
            }
        } catch (\Throwable $e) {
            $nextcloudByLicense = [];
        }

        // Parse providers for each account
        foreach ($accounts as &$account) {
            $account['license'] = (int)$account['license'];
            $account['active'] = (bool)$account['active'];
            $account['church_tools_url'] = $account['church_tools_url'] ?? null;
            // Never expose the token — send only a flag indicating whether it's set
            $account['church_tools_enabled'] = !empty($account['church_tools_url']) && !empty($account['church_tools_token']);
            unset($account['church_tools_token']);

            // The account manages its own connections in Settings; the admin only decides whether
            // they may be in a private network.
            $nextcloud = $nextcloudByLicense[$account['license']] ?? [];
            $account['nextcloud_url'] = $nextcloud['nextcloud_url'] ?? null;
            $account['integrations_private_network'] = !empty($nextcloud['private_network']);

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

        // Whether the account's integrations (Nextcloud, ChurchTools) may be in a private network:
        // it lets the server reach its own network, so it is the server admin's call, not the account's.
        if ($req->params->provided('integrationsPrivateNetwork')) {
            $column = AccountSchema::privateNetworkColumn();
            if (!$column) {
                $res->error(409, 'The database is missing the private-network column; run the migrations first', false);
            }
            $updates[] = "`{$column}` = ?";
            $types .= 'i';
            $values[] = $req->params->get('integrationsPrivateNetwork', false, false) ? 1 : 0;
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
