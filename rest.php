<?php

const API = __DIR__ . '/api/';

require_once(__DIR__ . '/config.php');
require_once(__DIR__ . '/classes/Cors.php');
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

if (!isset($_SESSION['authType']) || empty($_SESSION['authType'])) {
    if (!in_array($restClass, ['Session', 'Accounts'])) {
        (new Response())->error(401, 'permission denied for accessing "/rest/' . $restClass . '"');
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
