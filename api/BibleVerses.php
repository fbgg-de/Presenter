<?php

require_once(__DIR__ . '/../config.php');
require_once(__DIR__ . '/RestController.php');
require_once(__DIR__ . '/../classes/BibleApi.php');

class BibleVerses extends RestController
{
    use BibleApi;

    protected function get(Request &$req, Response &$res): never
    {
        if (!defined('BIBLE_API') || empty(BIBLE_API['base_url'])) {
            $res->error(503, 'Bible API is not configured. Please configure BIBLE_API in config.php.');
        }

        $ref = urldecode($req->path->get(0, ''));
        if (empty($ref)) {
            $res->error(400, 'Bible reference is required (e.g., John 3:16)');
        }

        $translation = $req->query->get('translation', '', false);
        $config = BIBLE_API;

        // Build the verse endpoint URL
        $endpoint = str_replace('{translation}', urlencode($translation), $config['verse_endpoint'] ?? '/search');
        $url = rtrim($config['base_url'], '/') . $endpoint;

        // Add query parameters
        $url .= '?query=' . urlencode($ref);

        $response = $this->makeApiRequest($url, $config);

        if ($response === null) {
            $res->error(502, 'Failed to fetch bible verse from API');
        }

        // Extract verse data using the configured path
        $versePath = $config['verse_path'] ?? 'data';
        $data = $this->extractByPath($response, $versePath);

        $result = [
            'reference' => $ref,
            'translation' => $translation,
            'text' => '',
            'verses' => [],
            'copyright' => $response['copyright'] ?? null,
        ];

        if (is_array($data)) {
            // Handle array of passages
            $textField = $config['verse_text_field'] ?? 'content';

            if (isset($data[0])) {
                $refField = $config['verse_ref_field'] ?? 'reference';

                foreach ($data as $i => $passage) {
                    $text = $passage[$textField] ?? '';
                    $result['text'] .= ($i > 0 ? ' ' : '') . strip_tags($text);
                    $result['verses'][] = [
                        'number' => $i + 1,
                        'text' => strip_tags($text),
                    ];
                }
                $result['reference'] = $data[0][$refField] ?? $ref;
            } else {
                // Single passage object
                $result['text'] = strip_tags($data[$textField] ?? '');
                $result['reference'] = $data[$config['verse_ref_field'] ?? 'reference'] ?? $ref;
                $result['verses'][] = [
                    'number' => 1,
                    'text' => $result['text'],
                ];
            }
        }

        $res->success($result);
    }
}
