<?php

/**
 * BibleApiTrait
 *
 * Shared helpers for Bible API controllers (BibleVerses, BibleTranslations).
 */
trait BibleApi
{
    /**
     * Execute an authenticated GET request to the configured Bible API.
     * Returns the decoded JSON array on success, or null on failure.
     */
    private function makeApiRequest(string $url, array $config): ?array
    {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);

        $headers = ['Accept: application/json'];
        if (!empty($config['api_key'])) {
            $headers[] = 'api-key: ' . $config['api_key'];
        }
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if ($httpCode !== 200 || !$response) {
            return null;
        }

        return json_decode($response, true);
    }

    /**
     * Walk a dot-notation path through a nested array and return the value,
     * or null if any key in the path is missing.
     */
    private function extractByPath(mixed $data, string $path): mixed
    {
        $keys = explode('.', $path);
        $current = $data;
        foreach ($keys as $key) {
            if (!is_array($current) || !isset($current[$key])) {
                return null;
            }
            $current = $current[$key];
        }
        return $current;
    }
}

