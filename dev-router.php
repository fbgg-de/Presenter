<?php

/**
 * Router for PHP's built-in dev server (`yarn dev:backend`).
 * Mimics the .htaccess rewrites used on Apache in production:
 *   /rest/*  → rest.php  (parses the path from REQUEST_URI itself)
 *   /oidc/*  → oidc.php
 * Everything else is served as a static file by the built-in server.
 */

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if (preg_match('#^/rest(/|$)#', $uri)) {
    require __DIR__ . '/rest.php';
    return true;
}

if (preg_match('#^/oidc(/|$)#', $uri)) {
    require __DIR__ . '/oidc.php';
    return true;
}

return false;
