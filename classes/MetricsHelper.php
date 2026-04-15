<?php

require_once(__DIR__ . '/DB.php');

/**
 * MetricsHelper
 *
 * Lightweight utility for recording metrics events into the metrics table.
 * Call MetricsHelper::record() from any API handler.
 * Failures are silently swallowed so metrics never break the real request.
 */
class MetricsHelper extends DB
{
    /**
     * Record a metrics event.
     *
     * @param string      $event       Event name (e.g. 'login', 'login_failed')
     * @param int|null    $account     Account license ID (null = system/pre-auth)
     * @param array       $meta        Optional key-value data stored as JSON metadata
     * @param string|null $userSub     OIDC subject identifier (optional)
     * @param string|null $entityType  Entity type (optional)
     * @param string|null $entityId    Entity ID (optional)
     */
    public static function record(
        string $event,
        ?int $account = null,
        array $meta = [],
        ?string $userSub = null,
        ?string $entityType = null,
        ?string $entityId = null
    ): void {
        try {
            $metaJson = count($meta) > 0 ? json_encode($meta) : null;
            $acct = $account ?? 0;

            self::prepare('INSERT INTO `metrics` (`account`, `user_sub`, `event`, `entity_type`, `entity_id`, `metadata`) VALUES (?, ?, ?, ?, ?, ?)')
                ->bind_param('isssss', $acct, $userSub, $event, $entityType, $entityId, $metaJson)
                ->execute()
                ->close();
        } catch (\Throwable $e) {
            // Metrics recording must never crash the main request
        }
    }
}
