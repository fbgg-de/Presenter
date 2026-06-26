<?php

/**
 * ChurchToolsSongs — Proxy endpoint for ChurchTools song search and file downloads.
 *
 * All communication with the ChurchTools API is done server-side so the ChurchTools
 * token never leaves the PHP backend.
 *
 * Routes:
 *   GET /rest/ChurchToolsSongs               – Search songs (param: q, page, limit)
 *   GET /rest/ChurchToolsSongs/<ctSongId>     – Get a single song with arrangements (include=arrangements,files)
 *   GET /rest/ChurchToolsSongs/<ctSongId>/<arrangementId>/files – Get file list for an arrangement
 *   GET /rest/ChurchToolsSongs/<ctSongId>/<arrangementId>/download/<filename> – Proxy-stream a file
 */

require_once(__DIR__ . '/RestController.php');
require_once(__DIR__ . '/../classes/ChurchToolsClient.php');
require_once(__DIR__ . '/../classes/ChurchToolsCcli.php');

class ChurchToolsSongs extends RestController
{
    /**
     * Load the ChurchTools config (url + token) for the current account from the DB.
     * Returns null if the account has no ChurchTools integration configured.
     */
    private function getCtConfig(): ?array
    {
        $account = $_SESSION['account'] ?? 0;
        if (!$account) {
            return null;
        }
        $stmt = self::prepare('SELECT `church_tools_url`, `church_tools_token` FROM `account` WHERE `license` = ?');
        $stmt->bind_param('i', $account)->execute()->fetchOne($row)->close();
        if (!$row || empty($row['church_tools_url']) || empty($row['church_tools_token'])) {
            return null;
        }
        return [
            'url'   => $row['church_tools_url'],
            'token' => $row['church_tools_token'],
        ];
    }

    /**
     * POST /rest/ChurchToolsSongs/<songNumber>/import-chords  body { title, key }
     * Fetches the CCLI chord chart PDF and stores it as one of the song's musician PDFs.
     */
    protected function post(Request &$req, Response &$res): never
    {
        $cfg = $this->getCtConfig();
        if ($cfg === null) {
            $res->error(404, 'ChurchTools integration is not configured for this account');
        }

        $songNumber = $req->path->getAsInt(0, 0);
        $action     = $req->path->get(1, '');
        if ($songNumber === 0 || $action !== 'import-chords') {
            $res->error(400, 'Expected POST /rest/ChurchToolsSongs/<songNumber>/import-chords');
        }

        $title = $req->params->get('title', '', false);
        $key   = $req->params->get('key', '', false);

        $pdf = ChurchToolsCcli::chordsPdf($songNumber, (string)$title, (string)$key, $cfg);
        if ($pdf === null) {
            $res->error(502, 'Could not fetch the chord chart from ChurchTools');
        }

        // Store alongside the song's other PDFs (same layout as the Pdfs endpoint).
        $dir = __DIR__ . '/../data/' . ($_SESSION['account'] ?? '0') . '/pdfs/' . $songNumber;
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        $filename = 'Chords' . ($key !== '' ? ' (' . preg_replace('/[^A-Za-z0-9#]/', '', (string)$key) . ')' : '') . '.pdf';
        if (file_put_contents($dir . '/' . $filename, $pdf) === false) {
            $res->error(500, 'Failed to store the chord PDF');
        }

        $res->success(['message' => 'Chord chart imported', 'filename' => $filename]);
    }

    protected function get(Request &$req, Response &$res): never
    {
        $cfg = $this->getCtConfig();
        if ($cfg === null) {
            $res->error(404, 'ChurchTools integration is not configured for this account');
        }

        $ctSongId    = $req->path->getAsInt(0, 0);
        $subRoute    = $req->path->get(1, '');
        $fileAction  = $req->path->get(2, '');
        $filename    = $req->path->get(3, '');

        if ($ctSongId === 0) {
            // ?ccli_detail=<songNumber> resolves a single CCLI song (author/copyright/lyrics)
            // for the import flow. CCLI *search* now lives in the unified /rest/Search endpoint.
            $ccliDetail = $req->query->get('ccli_detail', null, false);
            if ($ccliDetail !== null && $ccliDetail !== '') {
                $res->success(ChurchToolsCcli::detail((int)$ccliDetail, $cfg));
            }

            // Otherwise: search the church's own song library by name. This is used to match
            // a presenter song to its ChurchTools arrangements/PDFs (musician view), not the
            // main song search.
            $q     = $req->query->get('q', '');
            $page  = $req->query->getAsInt('page', 1);
            $limit = $req->query->getAsInt('limit', 20);
            $params = ['limit' => $limit, 'page' => $page];
            if ($q !== '') {
                $params['name'] = $q;
            }
            $data = ChurchToolsClient::get('songs', $params, $cfg);
            if ($data === false) {
                $res->error(502, 'Could not reach ChurchTools');
            }
            $result = [];
            foreach (($data['data'] ?? []) as $song) {
                $result[] = [
                    'id'        => $song['id'],
                    'name'      => $song['name'],
                    'author'    => $song['author'] ?? null,
                    'copyright' => $song['copyright'] ?? null,
                    'ccli'      => $song['ccli'] ?? null,
                    'category'  => $song['category']['name'] ?? null,
                ];
            }
            $res->success(['songs' => $result, 'meta' => $data['meta'] ?? null, 'source' => 'library']);
        }

        // ── GET /rest/ChurchToolsSongs/<id>/files  (arrangement file list) ───
        if ($subRoute !== '' && is_numeric($subRoute) && $fileAction === 'files') {
            $arrangementId = (int)$subRoute;
            $data = ChurchToolsClient::get(
                "songs/{$ctSongId}/arrangements/{$arrangementId}",
                ['include' => 'files'],
                $cfg
            );

            if ($data === false) {
                $res->error(502, 'Could not reach ChurchTools');
            }

            $arr   = $data['data'] ?? [];
            $files = $arr['files'] ?? [];
            $result = [];
            foreach ($files as $file) {
                $result[] = [
                    'filename' => $file['filename'],
                    'fileUrl'  => ChurchToolsClient::addToken($file['fileUrl'], $cfg),
                ];
            }

            $res->success(['files' => $result]);
        }

        // ── GET /rest/ChurchToolsSongs/<id>/<arrangementId>/download/<file>  ─
        // Proxy the file so the browser downloads it authenticated, without
        // ever exposing the ChurchTools token to the frontend.
        if ($subRoute !== '' && is_numeric($subRoute) && $fileAction === 'download' && $filename !== '') {
            $arrangementId = (int)$subRoute;
            // Re-fetch file list to get the authoritative signed URL
            $data = ChurchToolsClient::get(
                "songs/{$ctSongId}/arrangements/{$arrangementId}",
                ['include' => 'files'],
                $cfg
            );

            if ($data === false) {
                $res->error(502, 'Could not reach ChurchTools');
            }

            $files = $data['data']['files'] ?? [];
            $fileUrl = null;
            foreach ($files as $file) {
                if ($file['filename'] === $filename) {
                    $fileUrl = ChurchToolsClient::addToken($file['fileUrl'], $cfg);
                    break;
                }
            }

            if ($fileUrl === null) {
                $res->error(404, 'File not found');
            }

            // Stream the file through PHP so no credentials are exposed
            $ch = curl_init($fileUrl);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_HEADER         => true,
            ]);
            $raw = curl_exec($ch);
            $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
            $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);

            $body = substr($raw, $headerSize);
            $safeName = basename($filename);

            header('Content-Type: ' . ($contentType ?: 'application/octet-stream'));
            header('Content-Disposition: attachment; filename="' . addslashes($safeName) . '"');
            header('Content-Length: ' . strlen($body));
            echo $body;
            exit;
        }

        // ── GET /rest/ChurchToolsSongs/<id>  (single song + arrangements) ────
        $data = ChurchToolsClient::get(
            "songs/{$ctSongId}",
            ['include' => 'arrangements'],
            $cfg
        );

        if ($data === false) {
            $res->error(502, 'Could not reach ChurchTools');
        }

        $song = $data['data'] ?? null;
        if (!$song) {
            $res->error(404, 'Song not found in ChurchTools');
        }

        // Fetch file lists for all arrangements in parallel (sequential for simplicity)
        $arrangementsFull = [];
        foreach (($song['arrangements'] ?? []) as $arr) {
            $arrData = ChurchToolsClient::get(
                "songs/{$ctSongId}/arrangements/{$arr['id']}",
                ['include' => 'files'],
                $cfg
            );
            $files = $arrData['data']['files'] ?? [];
            $fileList = [];
            foreach ($files as $file) {
                $fileList[] = [
                    'filename' => $file['filename'],
                    'fileUrl'  => ChurchToolsClient::addToken($file['fileUrl'], $cfg),
                ];
            }
            $arrangementsFull[] = [
                'id'          => $arr['id'],
                'name'        => $arr['name'],
                'key'         => $arr['key'] ?? null,
                'beat'        => $arr['beat'] ?? null,
                'tempo'       => $arr['tempo'] ?? null,
                'description' => $arr['description'] ?? null,
                'files'       => $fileList,
            ];
        }

        $res->success([
            'id'           => $song['id'],
            'name'         => $song['name'],
            'author'       => $song['author'] ?? null,
            'copyright'    => $song['copyright'] ?? null,
            'ccli'         => $song['ccli'] ?? null,
            'arrangements' => $arrangementsFull,
        ]);
    }
}
