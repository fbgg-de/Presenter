<?php

require_once(__DIR__ . '/RestController.php');
require_once(__DIR__ . '/../classes/MetricsAnalytics.php');

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
        $limit = max(1, min(10000, $req->query->getAsInt('limit', 100)));
        $offset = max(0, $req->query->getAsInt('offset', 0));
        $deviceId = $req->query->get('device_id', null, false);

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

        // Older rows may have no metadata. Missing device IDs must not count as a device.
        $deviceExpr = MetricsAnalytics::device();
        if ($deviceId !== null) {
            $conditions[] = "{$deviceExpr} = ?";
            $types .= 's';
            $values[] = $deviceId;
        }
        $scope = count($conditions) > 0 ? implode(' AND ', $conditions) : '1';
        $select = static function (string $sql, string $bindTypes, array $bindValues): array {
            $stmt = self::prepare($sql);
            if ($bindTypes !== '') {
                $stmt->bind_param($bindTypes, ...$bindValues);
            }
            $stmt->execute()->fetchAll($rows)->close();
            return $rows;
        };

        // Freeze exports at a scope-wide insertion ID so newly recorded events cannot shift pages.
        $snapshotRaw = $req->query->get('snapshot_id', null, false);
        $snapshot = $snapshotRaw !== null ? max(0, (int)$snapshotRaw)
            : (int)($select("SELECT COALESCE(MAX(`id`), 0) AS snapshot_id FROM `metrics` WHERE {$scope}", $types, $values)[0]['snapshot_id'] ?? 0);
        $scope .= ' AND `id` <= ?';
        $types .= 'i';
        $values[] = $snapshot;
        $scopeTypes = $types;
        $scopeValues = $values;
        $where = $scope;
        foreach (['from', 'to'] as $bound) {
            $value = $$bound;
            if ($value === null) continue;
            if (!is_string($value)) $res->error(400, 'Invalid metrics date range');
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) $value .= $bound === 'from' ? ' 00:00:00' : ' 23:59:59';
            $date = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $value, new DateTimeZone('UTC'));
            if (!$date || $date->format('Y-m-d H:i:s') !== $value) $res->error(400, 'Invalid metrics date range');
            $$bound = $value;
            $where .= $bound === 'from' ? ' AND `created_at` >= ?' : ' AND `created_at` <= ?';
            $types .= 's';
            $values[] = $value;
        }
        if ($from !== null && $to !== null && $from > $to) $res->error(400, 'Invalid metrics date range');

        // Get total count
        $total = (int)($select("SELECT COUNT(*) AS total FROM `metrics` WHERE {$where}", $types, $values)[0]['total'] ?? 0);

        // Aggregate in SQL across the entire filtered range, independently of the raw-row limit.
        $summary = null;
        if ($req->query->getAsInt('include_summary', 0) === 1) {
            $granularity = $req->query->get('granularity', 'day', false);
            $summary = MetricsAnalytics::build($select, $scope, $scopeTypes, $scopeValues, $from, $to, $granularity);
        }
        // Get results
        $types .= 'ii';
        $values[] = $limit;
        $values[] = $offset;

        $stmt = self::prepare("
				SELECT `id`, `account`, `user_sub`, `event`, `entity_type`, `entity_id`, `metadata`, `created_at`
				FROM `metrics`
				WHERE {$where}
                ORDER BY `created_at` DESC, `id` DESC
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
            'metrics' => $metrics,
            'summary' => $summary,
            'snapshot_id' => $snapshot
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
