<?php

require_once(__DIR__ . '/RestController.php');

class Metrics extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        $account = $req->account;
        $isAdmin = isset($_SESSION['authType']) && $_SESSION['authType'] === 'oidc_admin';

        $from = $req->query->get('from', null, false);
        $to = $req->query->get('to', null, false);
        $event = $req->query->get('event', null, false);
        $entityType = $req->query->get('entity_type', null, false);
        $limit = $req->query->getAsInt('limit', 100);
        $offset = $req->query->getAsInt('offset', 0);

        // Admins may pass an explicit account filter; without it they see all accounts.
        $filterAccount = null;
        if ($isAdmin) {
            $accountRaw = $req->query->get('account', null, false);
            if ($accountRaw !== null) {
                $filterAccount = intval($accountRaw);
            }
        } else {
            $filterAccount = $account;
        }

        $conditions = [];
        $types = '';
        $values = [];

        if ($filterAccount !== null) {
            $conditions[] = '`account` = ?';
            $types .= 'i';
            $values[] = $filterAccount;
        }

        if ($from !== null) {
            $conditions[] = '`created_at` >= ?';
            $types .= 's';
            $values[] = $from;
        }

        if ($to !== null) {
            $conditions[] = '`created_at` <= ?';
            $types .= 's';
            $values[] = $to;
        }

        if ($event !== null) {
            $conditions[] = '`event` = ?';
            $types .= 's';
            $values[] = $event;
        }

        if ($entityType !== null) {
            $conditions[] = '`entity_type` = ?';
            $types .= 's';
            $values[] = $entityType;
        }

        $where = count($conditions) > 0 ? implode(' AND ', $conditions) : '1';

        // Get total count
        $countStmt = self::prepare("SELECT COUNT(*) AS total FROM `metrics` WHERE {$where}");
        $countStmt->bind_param($types, ...$values)->execute()->fetchOne($countResult)->close();
        $total = $countResult['total'] ?? 0;

        // Get results
        $types .= 'ii';
        $values[] = $limit;
        $values[] = $offset;

        $stmt = self::prepare("
				SELECT `id`, `account`, `user_sub`, `event`, `entity_type`, `entity_id`, `metadata`, `created_at`
				FROM `metrics`
				WHERE {$where}
				ORDER BY `created_at` DESC
				LIMIT ? OFFSET ?
			");
        $stmt->bind_param($types, ...$values)->execute()->fetchAll($metrics)->close();

        foreach ($metrics as &$metric) {
            if ($metric['metadata']) {
                $metric['metadata'] = json_decode($metric['metadata'], true);
            }
        }

        $res->success([
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
            'metrics' => $metrics
        ]);
    }

    protected function post(Request &$req, Response &$res): never
    {
        $req->params->check('event');

        $account = $req->account;
        $userSub = $_SESSION['admin_sub'] ?? null;
        $event = $req->params->get('event');
        $entityType = $req->params->get('entity_type', null, false);
        $entityId = $req->params->get('entity_id', null, false);
        $metadata = $req->params->get('metadata', null, false);

        $metaJson = $metadata !== null ? json_encode($metadata) : null;

        $stmt = self::prepare('
				INSERT INTO `metrics` (`account`, `user_sub`, `event`, `entity_type`, `entity_id`, `metadata`)
				VALUES (?, ?, ?, ?, ?, ?)
			');
        $stmt->bind_param('isssss', $account, $userSub, $event, $entityType, $entityId, $metaJson)->execute()->close();

        $res->success(['message' => 'Metric recorded']);
    }
}
