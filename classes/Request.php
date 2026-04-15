<?php

require_once(__DIR__ . '/Values.php');

class Request
{
    public string $method;
    public string $contentType;
    public int $account;

    public Values $path;
    public Values $params;
    public Values $query;

    public function __construct(array $path)
    {
        $this->method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $this->contentType = strtolower($_SERVER['CONTENT_TYPE'] ?? 'application/json');
        $this->account = intval($_SESSION['account'] ?? 0);

        $this->path = new Values('PATH', $path);
        $this->params = new Values('PARAMS');
        $this->query = new Values('QUERY');


        if (isset($_SERVER['QUERY_STRING'])) {
            parse_str($_SERVER['QUERY_STRING'], $this->query->values);
        }

        if ($this->method === 'GET') {
            return;
        }

        switch ($this->contentType) {
            case 'application/json':
                $vars = json_decode(file_get_contents("php://input"));
                break;
            case 'application/x-www-form-urlencoded':
                parse_str(file_get_contents("php://input"), $vars);
                break;
            default:
                return;
        }

        if ($vars) {
            foreach ($vars as $key => $value) {
                $this->params->add($key, $value);
            }
        }
    }
}
