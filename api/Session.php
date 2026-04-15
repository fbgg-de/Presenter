<?php

require_once(__DIR__ . '/RestController.php');
require_once(__DIR__ . '/../config.php');

class Session extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        // Optional sub-routes under /rest/Session/...
        $subRoute = strtolower($req->path->get(0, ''));

        switch ($subRoute) {
            case 'oidc-auth-url':
                // Returns a URL that starts the OIDC login flow.
                // The client should open this URL (web: window.location, electron: shell.openExternal).
                $redirect = $req->query->get('redirect', BASE_URL);
                $redirect = filter_var($redirect, FILTER_SANITIZE_URL);

                // Ensure redirect stays within our domain (basic safety)
                if (str_starts_with($redirect, '/')) {
                    $redirect = BASE_URL . ltrim($redirect, '/');
                }

                $admin = $req->query->getAsBool('admin', false);
                // License is optional - use get() with valueRequired=false instead of getAsInt()
                $licenseRaw = $req->query->get('license', null, false);
                $license = $licenseRaw !== null ? intval($licenseRaw) : null;

                // Return a same-origin /oidc path. On production, .htaccess rewrites this to oidc.php.
                // On dev, the Vite proxy forwards /oidc to the PHP server.
                $url = '/oidc?redirect=' . urlencode($redirect);
                if ($admin) {
                    $url .= '&admin=1';
                } elseif ($license !== null) {
                    $url .= '&license=' . intval($license);
                }

                $res->success([
                    'url' => $url
                ]);
                break;
            default:
                $res->success([
                              'account' => $_SESSION['account'] ?? 0,
                              'mail' => $_SESSION['mail'] ?? '',
                              'isAuthenticated' => isset($_SESSION['authType']) && !empty($_SESSION['authType']),
                              'authType' => $_SESSION['authType'] ?? null,
                          ]);
        }
    }

    protected function delete(Request &$req, Response &$res): never
    {
        session_unset();
        session_destroy();

        $res->success([
            'message' => 'successfully logged out'
        ]);
    }
}
