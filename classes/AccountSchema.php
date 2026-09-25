<?php

require_once(__DIR__ . '/DB.php');

/**
 * Account columns whose name changed along the way, looked up rather than assumed.
 *
 * "May this account's integrations be reached in a private network?" lived on
 * `account.nextcloud_private_network` (migration 32) before migration 33 renamed it to
 * `integrations_private_network` for ChurchTools as well. A server whose migration stopped
 * half-way would otherwise fail every request that reads it — including the Nextcloud sign-in —
 * with "Unknown column", so the name is resolved at runtime and a missing column simply means
 * "public addresses only".
 */
final class AccountSchema
{
    private const PRIVATE_NETWORK_COLUMNS = ['integrations_private_network', 'nextcloud_private_network'];

    /** Resolved once per request. `false` once it is known that neither column exists. */
    private static string|false|null $privateNetwork = null;

    /** The column holding the private-network switch, or null when the migration has not run. */
    public static function privateNetworkColumn(): ?string
    {
        if (self::$privateNetwork === null) {
            self::$privateNetwork = false;
            foreach (self::PRIVATE_NETWORK_COLUMNS as $column) {
                if (self::columnExists($column)) {
                    self::$privateNetwork = $column;
                    break;
                }
            }
        }
        return self::$privateNetwork === false ? null : self::$privateNetwork;
    }

    /** Whether this account's integrations may be reached on a private network address. */
    public static function privateNetworkAllowed(int $account): bool
    {
        $column = self::privateNetworkColumn();
        if (!$column || !$account) {
            return false;
        }
        $row = null;
        $stmt = DB::prepare("SELECT `{$column}` AS `allowed` FROM `account` WHERE `license` = ?");
        $stmt->bind_param('i', $account)->execute()->fetchOne($row)->close();
        return !empty($row['allowed']);
    }

    private static function columnExists(string $column): bool
    {
        try {
            $row = null;
            $stmt = DB::prepare('SHOW COLUMNS FROM `account` LIKE ?');
            $stmt->bind_param('s', $column)->execute()->fetchOne($row)->close();
            return !empty($row);
        } catch (\Throwable $e) {
            return false;
        }
    }
}
