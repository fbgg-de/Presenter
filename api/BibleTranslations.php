<?php

require_once(__DIR__ . '/../config.php');
require_once(__DIR__ . '/RestController.php');
require_once(__DIR__ . '/../classes/BibleApi.php');

class BibleTranslations extends RestController
{
    use BibleApi;

    protected function get(Request &$req, Response &$res): never
    {
        if (!defined('BIBLE_API') || empty(BIBLE_API['base_url'])) {
            $res->error(503, 'Bible API is not configured. Please configure BIBLE_API in config.php.');
        }

        $lang = $req->query->get('lang', null, false);
        $config = BIBLE_API;

        $url = rtrim($config['base_url'], '/') . ($config['translations_endpoint'] ?? '/bibles');
        if ($lang !== null) {
            $url .= '?language=' . urlencode($lang);
        }

        $json = $this->makeApiRequest($url, $config);
        if (!$json) {
            $res->error(502, 'Failed to fetch bible translations from API');
        }

        // Extract translations using configured path
        $translationsPath = $config['translations_path'] ?? 'data';
        $translations = $this->extractByPath($json, $translationsPath);

        if (!is_array($translations)) {
            $res->error(502, 'Could not parse translations from API response');
        }

        // Normalize to standard format
        $idField = $config['translation_id_field'] ?? 'id';
        $nameField = $config['translation_name_field'] ?? 'name';
        $langField = $config['translation_lang_field'] ?? 'language.id';

        $result = [];
        foreach ($translations as $t) {
            $result[] = [
                'id' => $this->extractByPath($t, $idField) ?? '',
                'name' => $this->extractByPath($t, $nameField) ?? '',
                'language' => $this->extractByPath($t, $langField) ?? '',
            ];
        }

        $res->success($result);
    }
}
