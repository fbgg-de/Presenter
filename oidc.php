<?php

require_once(__DIR__ . '/classes/Cors.php');
require_once(__DIR__ . '/classes/OidcClient.php');
require_once(__DIR__ . '/classes/Auth.php');
require_once(__DIR__ . '/classes/MetricsHelper.php');
require_once(__DIR__ . '/config.php');
require_once(__DIR__ . '/classes/Logging.php');
require_once(__DIR__ . '/classes/DB.php');

// OIDC callback handler for browser redirects
// This file is called directly by the OIDC provider after login

Cors::handle();
Cors::configureSession();

session_start();

if (isset($_GET['logout'])) {
    $idToken = $_SESSION['oidc_tokens']['id_token'] ?? null;
    unset($_SESSION['account']);
    unset($_SESSION['authType']);
    unset($_SESSION['mail']);
    unset($_SESSION['admin_sub']);
    unset($_SESSION['admin_name']);
    unset($_SESSION['oidc_tokens']);
    $oidc = OidcClient::fromGlobalConfig();
    $logoutUrl = $oidc->getLogoutUrl($idToken, BASE_URL);

    header('Location: ' . $logoutUrl);
    exit;
}

// If no authorization code or state, start login
if (!isset($_GET['code']) || !isset($_GET['state'])) {
    // Optional redirect target after successful login
    $redirect = $_GET['redirect'] ?? BASE_URL;
    try {
        $state = bin2hex(random_bytes(16));
    } catch (Exception $e) {
        $state = bin2hex(openssl_random_pseudo_bytes(16));
    }
    $_SESSION['oidc_state'] = $state;
    $_SESSION['redirect'] = $redirect;
    // Persist admin login intent across the OIDC redirect round-trip
    $_SESSION['oidc_admin'] = !empty($_GET['admin']);

    // Determine which OIDC provider to use
    $license = isset($_GET['license']) ? intval($_GET['license']) : null;

    if (!empty($_SESSION['oidc_admin']) || $license === null) {
        // Admin login — use global config
        unset($_SESSION['oidc_license']);
        unset($_SESSION['oidc_provider_id']);
        $oidc = OidcClient::fromGlobalConfig();
    } else {
        // Tenant login — look up the default provider for this license
        $provider = lookupDefaultProvider($license);
        if (!$provider) {
            header('Location: /unauthorized?error=oidc.no_provider&license=' . $license);
            exit;
        }
        $_SESSION['oidc_license'] = $license;
        $_SESSION['oidc_provider_id'] = (int)$provider['id'];
        $oidc = OidcClient::fromProvider($provider);
    }

    $authUrl = $oidc->getAuthorizationUrl($state);

    header('Location: ' . $authUrl);
    exit;
}

$state = $_GET['state'];
$code = $_GET['code'];

if (!isset($_SESSION['oidc_state']) || $state !== $_SESSION['oidc_state']) {
    MetricsHelper::record('login_failed', null, ['method' => 'oidc', 'reason' => 'invalid_state']);
    header('Location: /unauthorized?error=oidc.invalid_state');
    exit;
}
unset($_SESSION['oidc_state']);

try {
    // Reconstruct the correct OidcClient instance
    $isAdminLogin = !empty($_SESSION['oidc_admin']);
    unset($_SESSION['oidc_admin']); // Clean up immediately

    $license = $_SESSION['oidc_license'] ?? null;
    $providerId = $_SESSION['oidc_provider_id'] ?? null;
    unset($_SESSION['oidc_license']); // only needed during the redirect round-trip
    // Keep oidc_provider_id in session so the token refresh can reconstruct the correct OidcClient

    if ($isAdminLogin || $license === null) {
        $oidc = OidcClient::fromGlobalConfig();
        $providerRow = null;
    } else {
        // Re-fetch provider from DB using the stored provider_id
        $providerRow = lookupProviderById($providerId);
        if (!$providerRow) {
            MetricsHelper::record('login_failed', null, ['method' => 'oidc', 'reason' => 'provider_not_found']);
            header('Location: /unauthorized?error=oidc.provider_not_found');
            exit;
        }
        $oidc = OidcClient::fromProvider($providerRow);
    }

    $tokens = $oidc->getToken($code);
    if (empty($tokens['access_token'])) {
        MetricsHelper::record('login_failed', null, ['method' => 'oidc', 'reason' => 'token_exchange_failed']);
        header('Location: /unauthorized?error=oidc.token_exchange_failed');
        exit;
    }
    $userinfo = $oidc->getUserInfo($tokens['access_token']);
    if (empty($userinfo['sub'])) {
        MetricsHelper::record('login_failed', null, ['method' => 'oidc', 'reason' => 'userinfo_failed']);
        header('Location: /unauthorized?error=oidc.userinfo_failed');
        exit;
    }
    $sub = $userinfo['sub'];
    $email = $userinfo['email'] ?? null;
    $name = $userinfo['name'] ?? $userinfo['preferred_username'] ?? $sub;
    $groups = $userinfo['groups'] ?? [];

    if ($isAdminLogin) {
        // ── Admin login ──────────────────────────────────────────────────
        // Check global OIDC_REQUIRED_GROUP first (if configured)
        if (defined('OIDC_REQUIRED_GROUP') && !empty(OIDC_REQUIRED_GROUP)) {
            $requiredGroup = strtolower(trim(OIDC_REQUIRED_GROUP));
            $userGroupsLower = array_map(fn ($g) => strtolower(trim($g)), $groups);
            if (!in_array($requiredGroup, $userGroupsLower)) {
                $userGroups = count($groups) > 0 ? implode(', ', $groups) : '[none]';
                Logging::warning('OIDC access denied for user ' . $sub . '. Required group: ' . OIDC_REQUIRED_GROUP . '. User groups: ' . $userGroups);
                MetricsHelper::record('login_failed', null, ['method' => 'oidc', 'reason' => 'access_denied', 'sub' => $sub]);
                header('Location: /unauthorized?error=oidc.access_denied&required_group=' . OIDC_REQUIRED_GROUP . '&user_groups=' . urlencode($userGroups) . '&sub=' . urlencode($sub));
                exit;
            }
        }

        // Enforce OIDC_ADMIN_GROUP
        if (!defined('OIDC_ADMIN_GROUP') || empty(OIDC_ADMIN_GROUP)) {
            Logging::warning('Admin login attempted but OIDC_ADMIN_GROUP is not configured');
            MetricsHelper::record('login_failed', null, ['method' => 'oidc', 'reason' => 'admin_group_not_configured', 'sub' => $sub]);
            header('Location: /unauthorized?error=oidc.admin_access_denied');
            exit;
        }
        $adminGroup = strtolower(trim(OIDC_ADMIN_GROUP));
        $userGroupsLower = array_map(fn ($g) => strtolower(trim($g)), $groups);
        if (!in_array($adminGroup, $userGroupsLower)) {
            $userGroups = count($groups) > 0 ? implode(', ', $groups) : '[none]';
            Logging::warning('Admin access denied for user ' . $sub . '. Required admin group: ' . OIDC_ADMIN_GROUP . '. User groups: ' . $userGroups);
            MetricsHelper::record('login_failed', null, ['method' => 'oidc', 'reason' => 'admin_access_denied', 'sub' => $sub]);
            header('Location: /unauthorized?error=oidc.admin_access_denied&required_group=' . urlencode(OIDC_ADMIN_GROUP) . '&user_groups=' . urlencode($userGroups) . '&sub=' . urlencode($sub));
            exit;
        }
        // Admin login successful
        Auth::setAdminSessionFromOidc($sub, $name, $email);
    } else {
        // ── Tenant login ─────────────────────────────────────────────────
        // Check provider's required_group (if configured)
        $requiredGroup = $providerRow['required_group'] ?? null;
        if (!empty($requiredGroup)) {
            $requiredGroupLower = strtolower(trim($requiredGroup));
            $userGroupsLower = array_map(fn ($g) => strtolower(trim($g)), $groups);
            if (!in_array($requiredGroupLower, $userGroupsLower)) {
                $userGroups = count($groups) > 0 ? implode(', ', $groups) : '[none]';
                Logging::warning('OIDC access denied for user ' . $sub . ' on license ' . $license . '. Required group: ' . $requiredGroup . '. User groups: ' . $userGroups);
                MetricsHelper::record('login_failed', $license, ['method' => 'oidc', 'reason' => 'access_denied', 'sub' => $sub]);
                header('Location: /unauthorized?error=oidc.access_denied&required_group=' . urlencode($requiredGroup) . '&user_groups=' . urlencode($userGroups) . '&sub=' . urlencode($sub));
                exit;
            }
        }

        // Verify the account exists and is active, set session
        if (!Auth::checkById($license)) {
            MetricsHelper::record('login_failed', $license, ['method' => 'oidc', 'reason' => 'account_not_found', 'sub' => $sub]);
            header('Location: /unauthorized?error=oidc.account_not_found');
            exit;
        }

        // Update last activity
        Auth::updateLastActivity($license);

        // Keep oidc_provider_id so token refresh can reconstruct the correct OidcClient
        if ($providerId) {
            $_SESSION['oidc_provider_id'] = (int)$providerId;
        }
    }

    $_SESSION['oidc_tokens'] = [
      'access_token' => $tokens['access_token'],
      'id_token' => $tokens['id_token'] ?? null,
      'refresh_token' => $tokens['refresh_token'] ?? null,
      'expires_at' => time() + ($tokens['expires_in'] ?? 3600),
    ];
    $redirectUrl = $_SESSION['redirect'] ?? '/';
    unset($_SESSION['redirect']);
    Logging::info('OIDC login successful for user: ' . $sub . ($license ? ' (license ' . $license . ')' : ' (admin)'));
    MetricsHelper::record('login', $isAdminLogin ? null : $license, ['method' => 'oidc', 'admin' => $isAdminLogin]);

    header('Location: ' . $redirectUrl);
    exit;
} catch (Exception $e) {
    Logging::error('OIDC Auth error: ' . $e->getMessage());
    MetricsHelper::record('login_failed', null, ['method' => 'oidc', 'reason' => 'exception', 'message' => $e->getMessage()]);

    header('Location: /unauthorized?error=oidc.authentication_failed&details=' . urlencode($e->getMessage()));
    exit;
}

// ── Helper functions ──────────────────────────────────────────────────

/**
 * Look up the default OIDC provider for a given license from the DB.
 * Returns the oidc_providers row or null.
 */
function lookupDefaultProvider(int $license): ?array
{
    $db = new mysqli(DB_HOST, DB_USER, DB_PASSWORD, DB_DATABASE);
    if ($db->connect_error) {
        Logging::error('DB connection failed in lookupDefaultProvider: ' . $db->connect_error);
        return null;
    }
    $db->set_charset('utf8mb4');

    $stmt = $db->prepare('
    SELECT p.*
    FROM oidc_providers p
    JOIN account_oidc_providers aop ON p.id = aop.provider_id
    WHERE aop.license = ? AND aop.is_default = 1 AND p.enabled = 1
    LIMIT 1
  ');
    $stmt->bind_param('i', $license);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    $stmt->close();
    $db->close();

    return $row ?: null;
}

/**
 * Look up an OIDC provider by its ID.
 * Returns the oidc_providers row or null.
 */
function lookupProviderById(int $providerId): ?array
{
    $db = new mysqli(DB_HOST, DB_USER, DB_PASSWORD, DB_DATABASE);
    if ($db->connect_error) {
        Logging::error('DB connection failed in lookupProviderById: ' . $db->connect_error);
        return null;
    }
    $db->set_charset('utf8mb4');

    $stmt = $db->prepare('
    SELECT * FROM oidc_providers
    WHERE id = ? AND enabled = 1
    LIMIT 1
  ');
    $stmt->bind_param('i', $providerId);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    $stmt->close();
    $db->close();

    return $row ?: null;
}
