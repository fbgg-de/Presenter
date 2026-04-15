<?php

require_once(__DIR__ . '/RestController.php');

class AdminAccountProviders extends RestController
{
    protected function post(Request &$req, Response &$res): never
    {
        $this->requireAdmin($res);

        $req->params->checkNumeric('license')->checkNumeric('provider_id');

        $license = $req->params->getAsInt('license');
        $providerId = $req->params->getAsInt('provider_id');
        $isDefault = $req->params->getAsBool('is_default', false);

        // If setting as default, unset other defaults for this license
        if ($isDefault) {
            $stmt = self::prepare('
					UPDATE account_oidc_providers
					SET is_default = 0
					WHERE license = ?
				');
            $stmt->bind_param('i', $license)
                ->execute()
                ->close();
        }

        // Insert or update the provider assignment
        $stmt = self::prepare('
				INSERT INTO account_oidc_providers (license, provider_id, is_default)
				VALUES (?, ?, ?)
				ON DUPLICATE KEY UPDATE is_default = VALUES(is_default)
			');

        $isDefaultInt = $isDefault ? 1 : 0;
        $stmt->bind_param('iii', $license, $providerId, $isDefaultInt)
            ->execute()
            ->close();

        $res->success([
            'message' => 'Provider assigned to account successfully',
        ]);
    }

    protected function delete(Request &$req, Response &$res): never
    {
        $this->requireAdmin($res);

        $req->params->checkNumeric('license')->checkNumeric('provider_id');

        $license = $req->params->getAsInt('license');
        $providerId = $req->params->getAsInt('provider_id');

        $stmt = self::prepare('
				DELETE FROM account_oidc_providers
				WHERE license = ? AND provider_id = ?
			');

        $stmt->bind_param('ii', $license, $providerId)
            ->execute();

        $affected = 0;
        $stmt->affected($affected);
        $stmt->close();

        if ($affected === 0) {
            $res->error(404, 'Provider assignment not found');
        }

        $res->success([
            'message' => 'Provider unassigned from account successfully',
        ]);
    }
}
