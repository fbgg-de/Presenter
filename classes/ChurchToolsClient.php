<?php

/**
 * ChurchToolsClient — HTTP client for the ChurchTools REST API.
 *
 * URL and token are passed explicitly so that each account can have its own
 * ChurchTools instance configured in the database rather than in a global
 * config constant.
 */
class ChurchToolsClient
{
    /** @param array{url:string,token:string} $cfg */
    public static function get(string $path, array $params = [], array $cfg = [])
    {
        return self::request('GET', $path, $params, [], $cfg);
    }

    /** @param array{url:string,token:string} $cfg */
    public static function post(string $path, array $params = [], array $data = [], array $cfg = [])
    {
        return self::request('POST', $path, $params, $data, $cfg);
    }

    /** @param array{url:string,token:string} $cfg */
    public static function put(string $path, array $params = [], array $data = [], array $cfg = [])
    {
        return self::request('PUT', $path, $params, $data, $cfg);
    }

    /** @param array{url:string,token:string} $cfg */
    public static function patch(string $path, array $params = [], array $data = [], array $cfg = [])
    {
        return self::request('PATCH', $path, $params, $data, $cfg);
    }

    /** @param array{url:string,token:string} $cfg */
    public static function delete(string $path, array $params = [], array $cfg = [])
    {
        return self::request('DELETE', $path, $params, [], $cfg);
    }

    /** @param array{url:string,token:string} $cfg */
    public static function addToken(string $url, array $cfg = []): string
    {
        $token = $cfg['token'] ?? '';
        return $url . (parse_url($url, PHP_URL_QUERY) ? '&' : '?') . 'login_token=' . $token;
    }

    /** @param array{url:string,token:string} $cfg */
    private static function request(string $method, string $path, array $params = [], array $data = [], array $cfg = [])
    {
        $ch = curl_init();

        $baseUrl = rtrim($cfg['url'] ?? '', '/') . '/';
        $url = $baseUrl . $path;

        if (!empty($params)) {
            $url .= '?' . http_build_query($params);
        }

        $headers = [
            'Authorization: Login ' . ($cfg['token'] ?? ''),
                'Accept: application/json',
            ];

        if ($method === 'POST' || $method === 'PUT' || $method === 'PATCH') {
            $headers[] = 'Content-Type: application/json';
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }

        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
        ]);

        $response = curl_exec($ch);

        unset($ch);

        if ($response === false) {
            return false;
        }

        return json_decode($response, true);
    }
}
