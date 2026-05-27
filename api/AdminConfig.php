<?php

require_once(__DIR__ . '/RestController.php');

/**
 * GET /rest/AdminConfig  → returns a safe, read-only summary of the server configuration.
 *
 * Sensitive values (passwords, secrets, API keys) are intentionally omitted.
 * Admin authentication required.
 */
class AdminConfig extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        $this->requireAdmin($res);

        $res->success([
            'server' => [
                'phpVersion'    => PHP_VERSION,
                'phpSapi'       => PHP_SAPI,
                'serverSoftware'=> $_SERVER['SERVER_SOFTWARE'] ?? null,
                'mysqlVersion'  => $this->getMysqlVersion(),
            ],
            'app' => [
                'domain'        => defined('DOMAIN')            ? DOMAIN            : null,
                'baseUrl'       => defined('BASE_URL')          ? BASE_URL          : null,
                'development'   => defined('DEVELOPMENT') && (bool) DEVELOPMENT,
                'defaultLanguage' => defined('DEFAULT_LANGUAGE') ? DEFAULT_LANGUAGE : null,
                'searchResultLimit' => defined('SEARCH_RESULT_LIMIT') ? (int)SEARCH_RESULT_LIMIT : null,
                'customNumberLimit' => defined('CUSTOM_NUMBER_LIMIT') ? (int)CUSTOM_NUMBER_LIMIT : null,
            ],
            'database' => [
                'host'     => defined('DB_HOST')     ? DB_HOST     : null,
                'database' => defined('DB_DATABASE') ? DB_DATABASE : null,
                'user'     => defined('DB_USER')     ? DB_USER     : null,
                // DB_PASSWORD intentionally omitted
            ],
            'cors' => [
                'allowedOrigins' => defined('CORS_ALLOWED_ORIGINS') ? CORS_ALLOWED_ORIGINS : [],
            ],
            'oidc' => [
                'discoveryUrl'   => defined('OIDC_DISCOVERY_URL')  ? OIDC_DISCOVERY_URL  : null,
                'clientId'       => defined('OIDC_CLIENT_ID')      ? OIDC_CLIENT_ID      : null,
                // OIDC_CLIENT_SECRET intentionally omitted
                'adminGroup'     => defined('OIDC_ADMIN_GROUP')    ? OIDC_ADMIN_GROUP    : null,
                'requiredGroup'  => defined('OIDC_REQUIRED_GROUP') ? OIDC_REQUIRED_GROUP : null,
                'redirectUri'    => defined('OIDC_REDIRECT_URI')   ? OIDC_REDIRECT_URI   : null,
                'scopes'         => defined('OIDC_CLIENT_SCOPES')  ? OIDC_CLIENT_SCOPES  : [],
            ],
            'bible' => [
                'enabled'             => defined('BIBLE_API') && is_array(BIBLE_API) && (bool) (BIBLE_API['enabled'] ?? false),
                'name'                => defined('BIBLE_API') && is_array(BIBLE_API) ? (BIBLE_API['name'] ?? null) : null,
                'baseUrl'             => defined('BIBLE_API') && is_array(BIBLE_API) ? (BIBLE_API['base_url'] ?? null) : null,
                'translationsEndpoint'=> defined('BIBLE_API') && is_array(BIBLE_API) ? (BIBLE_API['translations_endpoint'] ?? null) : null,
                'verseEndpoint'       => defined('BIBLE_API') && is_array(BIBLE_API) ? (BIBLE_API['verse_endpoint'] ?? null) : null,
                // api_key intentionally omitted
            ],
            'wsHost' => defined('WS_HOST') && is_array(WS_HOST) && !empty(WS_HOST['host'])
                ? [
                  'wss'  => !empty(WS_HOST['wss']),
                  'host' => WS_HOST['host'],
                  'port' => (int)(WS_HOST['port'] ?? 443),
                  'path' => WS_HOST['path'] ?? '/',
                  ]
                : null,
        ]);
    }

    private function getMysqlVersion(): ?string
    {
        try {
            $stmt = self::prepare('SELECT VERSION() AS v');
            $stmt->execute()->fetchOne($row)->close();
            return $row['v'] ?? null;
        } catch (\Throwable $e) {
            return null;
        }
    }
}

