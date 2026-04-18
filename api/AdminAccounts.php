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
				GROUP BY a.license
				ORDER BY a.name, a.license
			');

        $accounts = [];
        $stmt->execute();
        $stmt->fetchAll($accounts);
        $stmt->close();

        // Parse providers for each account
        foreach ($accounts as &$account) {
            $account['license'] = (int)$account['license'];
            $account['active'] = (bool)$account['active'];

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
        $mail = $req->params->get('mail', null);
        $name = $req->params->get('name', null);
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
