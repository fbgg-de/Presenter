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

        // ── GET /rest/ChurchToolsSongs  (search) ─────────────────────────────
        if ($ctSongId === 0) {
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

            $songs = $data['data'] ?? [];
            $result = [];
            foreach ($songs as $song) {
                $result[] = [
                    'id'         => $song['id'],
                    'name'       => $song['name'],
                    'author'     => $song['author'] ?? null,
                    'copyright'  => $song['copyright'] ?? null,
                    'ccli'       => $song['ccli'] ?? null,
                    'category'   => $song['category']['name'] ?? null,
                ];
            }

            $res->success([
                'songs' => $result,
                'meta'  => $data['meta'] ?? null,
            ]);
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
            curl_close($ch);

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
