<?php

const API = __DIR__ . '/api/';

require_once(__DIR__ . '/config.php');
require_once(__DIR__ . '/classes/Cors.php');
require_once(__DIR__ . '/classes/OidcClient.php');
require_once(__DIR__ . '/api/utils.php');

Cors::handle();

$path = trim(strtok($_SERVER['REQUEST_URI'], '?'));

$paths = explode('/', $path);
$index = array_search('rest', $paths);

if ($index === false) {
    (new Response())->error(500, 'could not find "rest" in path');
} else {
    ++$index;

    if (str_ends_with($path, '/')) {
        array_pop($paths);
    }
}

$restClass = ucfirst($paths[$index]);
$restFile = API . $restClass . '.php';

Cors::configureSession();
session_start();

// Silently refresh the OIDC access token when it is near expiry (within 5 minutes).
// This keeps the server-side session alive without requiring the user to log in again.
OidcClient::tryRefreshSession(300);

if (!isset($_SESSION['authType']) || empty($_SESSION['authType'])) {
    // Allow unauthenticated log writes so the early-error-capture script (and
    // any client-side error reporter) can POST diagnostic messages even when
    // the user has no valid session (e.g. blank-page scenarios on iOS).
    // GET (read) and DELETE (clear) still require admin auth — only write is open.
    $isAnonymousLogWrite = $restClass === 'Log' && $_SERVER['REQUEST_METHOD'] === 'POST';

    if (!in_array($restClass, ['Session', 'Accounts', 'ValidateToken']) && !$isAnonymousLogWrite) {
        // An unauthenticated request to a protected endpoint is an *expected*
        // condition (e.g. a device whose session lapsed still polling /rest/Shows
        // or /rest/PdfAnnotations). It is a normal 401 HTTP outcome, not a server
        // fault — don't log it, or the error log fills with permission-denied noise.
        (new Response())->error(401, 'permission denied for accessing "/rest/' . $restClass . '"', false);
    }
}

if (!file_exists($restFile)) {
    (new Response())->error(404, 'path "/rest/' . $restClass . '" does not exist');
} else {
    require_once($restFile);

    if (in_array($restClass, ['Rest', 'RestController'])) {
        (new Response())->error(404, 'cannot call abstract class or interface "' . $restClass . '"');
    } else {
        if (!class_exists($restClass)) {
            (new Response())->error(404, 'class "' . $restClass . '" does not exist');
        } else {
            $controller = new $restClass();

            if ($controller instanceof Rest) {
                $controller->handle(new Request(array_slice($paths, $index + 1)));
            } else {
                (new Response())->error(500, 'class "' . $restClass . '" does not inherit from Rest interface');
            }
        }
    }
}
