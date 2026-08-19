<?php

require_once(__DIR__ . '/DB.php');

class Auth extends DB
{
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
                // The account name is what the user picks on the login page, so it is what
                // the app shows back to them. Falls back to the mail when the row has none.
                $_SESSION['name'] = $result['name'] ?? '';
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
        $_SESSION['name'] = $name;
        $_SESSION['mail'] = $email ?? '';
    }
}
