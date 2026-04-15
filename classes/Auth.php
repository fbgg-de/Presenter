<?php

require_once(__DIR__ . '/DB.php');

class Auth extends DB
{
    /**
     * Find or create a user by OIDC subject identifier.
     * Returns the user's license (account) ID, or null on failure.
     *
     * Lookup order:
     *  1. By oidc_sub (unique OIDC subject identifier – most reliable)
     *  2. By email address
     *  3. By display name
     * If no existing account matches, a new account is created automatically.
     */
    public static function findOrCreateUser(string $sub, string $name, ?string $email, array $groups): ?int
    {
        try {
            // 1. Try by OIDC subject identifier (if column exists)
            try {
                $stmt = self::prepare('SELECT `license` FROM `account` WHERE `oidc_sub` = ? AND `active` = 1');
                $stmt->bind_param('s', $sub)->execute()->fetchOne($result)->close();

                if ($result) {
                    $license = intval($result['license']);
                    $stmt = self::prepare('UPDATE `account` SET `lastactivity` = NOW(), `name` = ?, `mail` = COALESCE(?, `mail`) WHERE `license` = ?');
                    $stmt->bind_param('ssi', $name, $email, $license)->execute()->close();
                    return $license;
                }
            } catch (\Throwable $e) {
                // oidc_sub column may not exist yet — continue to fallback lookups
            }

            // 2. Try by email
            if ($email) {
                $stmt = self::prepare('SELECT `license` FROM `account` WHERE `mail` = ? AND `active` = 1');
                $stmt->bind_param('s', $email)->execute()->fetchOne($result)->close();

                if ($result) {
                    $license = intval($result['license']);
                    // Link oidc_sub to this account for future lookups
                    try {
                        $stmt = self::prepare('UPDATE `account` SET `lastactivity` = NOW(), `name` = ?, `oidc_sub` = ? WHERE `license` = ?');
                        $stmt->bind_param('ssi', $name, $sub, $license)->execute()->close();
                    } catch (\Throwable $e) {
                        // oidc_sub column may not exist — update without it
                        $stmt = self::prepare('UPDATE `account` SET `lastactivity` = NOW(), `name` = ? WHERE `license` = ?');
                        $stmt->bind_param('si', $name, $license)->execute()->close();
                    }
                    return $license;
                }
            }

            // 3. Try by name
            $stmt = self::prepare('SELECT `license` FROM `account` WHERE `name` = ? AND `active` = 1');
            $stmt->bind_param('s', $name)->execute()->fetchOne($result)->close();

            if ($result) {
                $license = intval($result['license']);
                try {
                    $stmt = self::prepare('UPDATE `account` SET `lastactivity` = NOW(), `mail` = COALESCE(?, `mail`), `oidc_sub` = ? WHERE `license` = ?');
                    $stmt->bind_param('ssi', $email, $sub, $license)->execute()->close();
                } catch (\Throwable $e) {
                    $stmt = self::prepare('UPDATE `account` SET `lastactivity` = NOW() WHERE `license` = ?');
                    $stmt->bind_param('i', $license)->execute()->close();
                }
                return $license;
            }

            // 4. No existing account found — create a new one
            return self::createAccount($sub, $name, $email);
        } catch (\Throwable $e) {
            require_once(__DIR__ . '/Logging.php');
            Logging::error('Auth::findOrCreateUser failed: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Create a new account for an OIDC user.
     * Generates a new license number and inserts the account row.
     */
    private static function createAccount(string $sub, string $name, ?string $email): ?int
    {
        require_once(__DIR__ . '/Logging.php');

        // Generate a new license number (max + 1, starting at 1)
        $stmt = self::prepare('SELECT COALESCE(MAX(`license`), 0) + 1 AS next_license FROM `account`');
        $stmt->execute()->fetchOne($result)->close();
        $license = intval($result['next_license']);

        // Insert new account with oidc_sub if the column exists
        try {
            $stmt = self::prepare('INSERT INTO `account` (`license`, `mail`, `name`, `oidc_sub`, `active`) VALUES (?, ?, ?, ?, 1)');
            $stmt->bind_param('isss', $license, $email, $name, $sub)->execute()->close();
        } catch (\Throwable $e) {
            // oidc_sub column may not exist — insert without it
            $stmt = self::prepare('INSERT INTO `account` (`license`, `mail`, `name`, `active`) VALUES (?, ?, ?, 1)');
            $stmt->bind_param('iss', $license, $email, $name)->execute()->close();
        }

        Logging::info('Created new account for OIDC user: sub=' . $sub . ', license=' . $license . ', name=' . $name);

        // Insert default show_item_types for the new account
        try {
            $stmt = self::prepare("INSERT INTO `show_item_types` (`account`, `type_key`, `label`, `color`, `icon`, `is_default`) VALUES (?, 'song', 'Song', '#1976d2', 'MusicNote', 1)");
            $stmt->bind_param('i', $license)->execute()->close();
            $stmt = self::prepare("INSERT INTO `show_item_types` (`account`, `type_key`, `label`, `color`, `icon`, `is_default`) VALUES (?, 'media', 'Media', '#f9a825', 'Image', 1)");
            $stmt->bind_param('i', $license)->execute()->close();
            $stmt = self::prepare("INSERT INTO `show_item_types` (`account`, `type_key`, `label`, `color`, `icon`, `is_default`) VALUES (?, 'bible_verse', 'Bible Verse', '#388e3c', 'MenuBook', 1)");
            $stmt->bind_param('i', $license)->execute()->close();
        } catch (\Throwable $e) {
            Logging::warning('Could not insert default show_item_types for license ' . $license . ': ' . $e->getMessage());
        }

        return $license;
    }

    /**
     * Check if a user exists by ID and set session data.
     */
    public static function checkById(int $license): bool
    {
        try {
            $stmt = self::prepare('SELECT `license`, `mail`, `name` FROM `account` WHERE `license` = ? AND `active` = 1');
            $stmt->bind_param('i', $license)->execute()->fetchOne($result)->close();

            if ($result) {
                $_SESSION['account'] = intval($result['license']);
                $_SESSION['mail'] = $result['mail'] ?? '';
                $_SESSION['authType'] = 'oidc';
                return true;
            }

            return false;
        } catch (\Throwable $e) {
            require_once(__DIR__ . '/Logging.php');
            Logging::error('Auth::checkById failed: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Update the last activity timestamp for an account.
     */
    public static function updateLastActivity(int $license): void
    {
        try {
            $stmt = self::prepare('UPDATE `account` SET `lastactivity` = NOW() WHERE `license` = ?');
            $stmt->bind_param('i', $license)->execute()->close();
        } catch (\Throwable $e) {
            require_once(__DIR__ . '/Logging.php');
            Logging::warning('Auth::updateLastActivity failed for license ' . $license . ': ' . $e->getMessage());
        }
    }

    /**
     * Set up an admin session directly from OIDC login.
     * Admin users do not need a row in the account table.
     */
    public static function setAdminSessionFromOidc(string $sub, string $name, ?string $email): void
    {
        $_SESSION['authType'] = 'oidc_admin';
        $_SESSION['account'] = 0;
        $_SESSION['admin_sub'] = $sub;
        $_SESSION['admin_name'] = $name;
        $_SESSION['mail'] = $email ?? '';
    }
}
