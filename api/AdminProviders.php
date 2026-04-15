<?php

require_once(__DIR__ . '/RestController.php');

class AdminProviders extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        $this->requireAdmin($res);

        // Get all OIDC providers
        $stmt = self::prepare('
				SELECT
					id,
					name,
					discovery_url,
					client_id,
					client_secret,
					scopes,
					required_group,
					enabled,
					created_at
				FROM oidc_providers
				ORDER BY name
			');

        $providers = [];
        $stmt->execute();
        $stmt->fetchAll($providers);
        $stmt->close();

        // Convert types
        foreach ($providers as &$provider) {
            $provider['id'] = (int)$provider['id'];
            $provider['enabled'] = (bool)$provider['enabled'];
        }

        $res->success($providers);
    }

    protected function post(Request &$req, Response &$res): never
    {
        $this->requireAdmin($res);

        $req->params->check('name')->check('discovery_url')->check('client_id')->check('client_secret');

        $name = $req->params->get('name');
        $discoveryUrl = $req->params->get('discovery_url');
        $clientId = $req->params->get('client_id');
        $clientSecret = $req->params->get('client_secret');
        $scopes = $req->params->get('scopes', 'openid email profile');
        $requiredGroup = $req->params->get('required_group', null);
        $enabled = $req->params->getAsBool('enabled', true);

        $stmt = self::prepare('
				INSERT INTO oidc_providers
				(name, discovery_url, client_id, client_secret, scopes, required_group, enabled)
				VALUES (?, ?, ?, ?, ?, ?, ?)
			');

        $enabledInt = $enabled ? 1 : 0;
        $stmt->bind_param('ssssssi', $name, $discoveryUrl, $clientId, $clientSecret, $scopes, $requiredGroup, $enabledInt)
            ->execute();

        $id = 0;
        $stmt->id($id);
        $stmt->close();

        $res->success([
            'message' => 'Provider created successfully',
            'id' => $id,
        ]);
    }

    protected function put(Request &$req, Response &$res): never
    {
        $this->requireAdmin($res);

        $req->params->checkNumeric('id');

        $id = $req->params->getAsInt('id');

        // Build dynamic update query
        $updates = [];
        $types = '';
        $values = [];

        $fields = ['name', 'discovery_url', 'client_id', 'client_secret', 'scopes', 'required_group'];
        foreach ($fields as $field) {
            if ($req->params->has($field)) {
                $updates[] = "$field = ?";
                $types .= 's';
                $values[] = $req->params->get($field);
            }
        }

        if ($req->params->has('enabled')) {
            $updates[] = 'enabled = ?';
            $types .= 'i';
            $values[] = $req->params->getAsBool('enabled') ? 1 : 0;
        }

        if (empty($updates)) {
            $res->error(400, 'No fields to update');
        }

        $stmt = self::prepare('
				UPDATE oidc_providers
				SET ' . implode(', ', $updates) . '
				WHERE id = ?
			');

        $types .= 'i';
        $values[] = $id;

        $stmt->bind_param($types, ...$values)
            ->execute();

        $affected = 0;
        $stmt->affected($affected);
        $stmt->close();

        if ($affected === 0) {
            $res->error(404, 'Provider not found');
        }

        $res->success([
            'message' => 'Provider updated successfully',
        ]);
    }

    protected function delete(Request &$req, Response &$res): never
    {
        $this->requireAdmin($res);

        $req->params->checkNumeric('id');

        $id = $req->params->getAsInt('id');

        $stmt = self::prepare('
				DELETE FROM oidc_providers
				WHERE id = ?
			');

        $stmt->bind_param('i', $id)
            ->execute();

        $affected = 0;
        $stmt->affected($affected);
        $stmt->close();

        if ($affected === 0) {
            $res->error(404, 'Provider not found');
        }

        $res->success([
            'message' => 'Provider deleted successfully',
        ]);
    }
}
