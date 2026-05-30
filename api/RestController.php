<?php

require_once(__DIR__ . '/utils.php');
require_once(__DIR__ . '/Rest.php');
require_once(__DIR__ . '/../classes/DB.php');

abstract class RestController extends DB implements Rest
{
    /**
     * Verify that the current session has admin privileges.
     * Call this at the start of any admin-only endpoint method.
     * @param Response $res The response object to use for error responses
     */
    protected function requireAdmin(Response &$res): void
    {
        if (!isset($_SESSION['authType']) || $_SESSION['authType'] !== 'oidc_admin') {
            $res->error(403, 'Admin access required');
        }
    }

    protected function get(Request &$req, Response &$res): never
    {
        $res->error(500, 'method "get" not implemented');
    }

    protected function post(Request &$req, Response &$res): never
    {
        $res->error(500, 'method "post" not implemented');
    }

    protected function put(Request &$req, Response &$res): never
    {
        $res->error(500, 'method "put" not implemented');
    }

    protected function delete(Request &$req, Response &$res): never
    {
        $res->error(500, 'method "delete" not implemented');
    }

    protected function patch(Request &$req, Response &$res): never
    {
        $res->error(500, 'method "patch" not implemented');
    }

    public function handle(Request $req): never
    {
        $res = new Response();

        try {
            match($req->method) {
                'POST' => $this->post($req, $res),
                'PUT' => $this->put($req, $res),
                'PATCH' => $this->patch($req, $res),
                'DELETE' => $this->delete($req, $res),
                default => $this->get($req, $res),
            };
        } catch (Error $e) {
            $res->error(400, $e->getMessage());
        }
    }
}
