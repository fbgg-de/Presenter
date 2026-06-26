<?php

require_once(__DIR__ . '/RestController.php');
require_once(__DIR__ . '/../config.php');
require_once(__DIR__ . '/../classes/ChurchToolsCcli.php');

class Search extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        // CCLI SongSelect single-song resolve (author/copyright/lyrics) for the import flow.
        // Hosted here (rather than on ChurchToolsSongs) so it shares the proven-loading
        // Search endpoint. No `q` needed.
        $ccliDetail = $req->query->get('ccli_detail', null, false);
        if ($ccliDetail !== null && $ccliDetail !== '') {
            $cfg = $this->ctConfig($req->account);
            if ($cfg === null) {
                $res->error(404, 'ChurchTools integration is not configured for this account');
            }
            $res->success(ChurchToolsCcli::detail((int)$ccliDetail, $cfg));
        }

        $req->query->check('q');
        $query = $req->query->get('q');
        $type = strtolower($req->query->get('type', 'all', false));
        // Opt-in: also blend CCLI SongSelect suggestions into song/all searches.
        $includeCcli = in_array($req->query->get('ccli', '0', false), ['1', 'true'], true);
        $account = $req->account;
        $limit = SEARCH_RESULT_LIMIT;

        $results = [];

        // Songs search
        if ($type === 'all' || $type === 'songs') {
            $isNumeric = ctype_digit(trim($query));
            if ($isNumeric) {
                // Search by song number
                $stmt = self::prepare('
						SELECT `songnumber` AS `id`, `title` AS `name`, \'song\' AS `type`
						FROM `songs`
						WHERE `account` = ?
						AND CAST(`songnumber` AS CHAR) LIKE ?
						ORDER BY `songnumber`
						LIMIT ?
					');
                $stmt->bind_param('isi', $account, $query . '%', $limit)->execute()->fetchAll($songResults)->close();
            } else {
                $search = $this->prepareSearchParameter($query);
                $stmt = self::prepare('
						SELECT `songnumber` AS `id`, `title` AS `name`, \'song\' AS `type`,
						  MATCH(`title`) AGAINST (? IN BOOLEAN MODE) AS `relevance`,
						  CASE WHEN `title` LIKE ? THEN 10 ELSE 0 END AS `prefix_boost`
						FROM `songs`
						WHERE `account` = ?
						AND (`title` LIKE ? OR MATCH(`title`) AGAINST (? IN BOOLEAN MODE) OR `authors` LIKE ?)
						ORDER BY `prefix_boost` DESC, `relevance` DESC, `title`
						LIMIT ?
					');
                $like = "%{$query}%";
                $prefixLike = "{$query}%";
                $stmt->bind_param('ssisssi', $search, $prefixLike, $account, $like, $search, $like, $limit)->execute()->fetchAll($songResults)->close();
            }
            $results = array_merge($results, $songResults);
        }

        // Styles search
        if ($type === 'all' || $type === 'styles') {
            $stmt = self::prepare('
					SELECT `id`, `name`, \'style\' AS `type`
					FROM `styles`
					WHERE `account` = ? AND `name` LIKE ?
					ORDER BY `name`
					LIMIT ?
				');
            $like = "%{$query}%";
            $stmt->bind_param('isi', $account, $like, $limit)->execute()->fetchAll($styleResults)->close();
            $results = array_merge($results, $styleResults);
        }

        // CCLI SongSelect suggestions (joined server-side, deduped against local songs).
        if ($includeCcli && ($type === 'all' || $type === 'songs') && !ctype_digit(trim($query))) {
            $results = array_merge($results, $this->ccliResults($query, $account, $limit));
        }

        $res->success($results);
    }

    /**
     * POST /rest/Search/<songNumber>/import-chords  body { title, key, columns }
     * Fetches the CCLI chord chart PDF and stores it as one of the song's musician PDFs.
     * (Lives here alongside the CCLI search/detail so the whole import flow uses one endpoint.)
     */
    protected function post(Request &$req, Response &$res): never
    {
        $songNumber = $req->path->getAsInt(0, 0);
        $action     = $req->path->get(1, '');
        if ($songNumber === 0 || $action !== 'import-chords') {
            $res->error(400, 'Expected POST /rest/Search/<songNumber>/import-chords');
        }

        $cfg = $this->ctConfig($req->account);
        if ($cfg === null) {
            $res->error(404, 'ChurchTools integration is not configured for this account');
        }

        $title     = $req->params->get('title', '', false);
        $key       = $req->params->get('key', '', false);
        $columns   = (int)$req->params->get('columns', 2, false);
        $isDefault = in_array($req->params->get('default', '0', false), ['1', 'true', 1, true], true);

        $reason = null;
        $pdf = ChurchToolsCcli::chordsPdf($songNumber, (string)$title, (string)$key, $cfg, $columns > 0 ? $columns : 2, $reason);
        if ($pdf === null) {
            if ($reason === 'unavailable') {
                $res->error(404, 'No chord chart is available for this song on CCLI');
            }
            $res->error(502, 'Could not fetch the chord chart from ChurchTools');
        }

        // Store alongside the song's other PDFs (same layout as the Pdfs endpoint).
        $dir = __DIR__ . '/../data/' . ($_SESSION['account'] ?? '0') . '/pdfs/' . $songNumber;
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        // Match the upload naming convention: "<label>-<key>.pdf" (the leading label is "Default"
        // for the song-level default PDF, otherwise "Chords"; the key is detected from the suffix).
        $keyPart  = $key !== '' ? '-' . preg_replace('/[^A-Za-z0-9#]/', '', (string)$key) : '';
        $filename = ($isDefault ? 'Default' : 'Chords') . $keyPart . '.pdf';

        // When importing a new default, demote any existing default(s) — regardless of key — so
        // exactly one default PDF remains (relabel "Default…" → "Chords…", keeping their key suffix).
        if ($isDefault) {
            $account = $req->account;
            foreach (glob($dir . '/Default*.pdf') ?: [] as $existing) {
                $base = basename($existing);
                if (strcasecmp($base, $filename) === 0) {
                    continue; // will be overwritten by the new file below
                }
                $demoted = 'Chords' . substr($base, strlen('Default'));
                $n       = 0;
                while (file_exists($dir . '/' . $demoted)) {
                    $n++;
                    $demoted = 'Chords' . $n . substr($base, strlen('Default'));
                }
                rename($existing, $dir . '/' . $demoted);
                // Move the filename-keyed metadata with the file so it isn't orphaned.
                foreach (['pdf_area_mappings', 'pdf_annotations'] as $table) {
                    self::prepare("UPDATE `{$table}` SET `filename` = ? WHERE `account` = ? AND `songnumber` = ? AND `filename` = ?")
                        ->bind_param('siis', $demoted, $account, $songNumber, $base)->execute()->close();
                }
            }
        }

        if (file_put_contents($dir . '/' . $filename, $pdf) === false) {
            $res->error(500, 'Failed to store the chord PDF');
        }

        $res->success(['message' => 'Chord chart imported', 'filename' => $filename]);
    }

    /**
     * Search CCLI SongSelect for the account and return suggestions not already imported
     * (CCLI-imported songs use the CCLI number as their song number).
     */
    private function ccliResults(string $query, int $account, int $limit): array
    {
        $cfg = $this->ctConfig($account);
        if ($cfg === null) {
            return [];
        }

        $songs = ChurchToolsCcli::search($query, $limit, $cfg);
        if (count($songs) === 0) {
            return [];
        }

        // Collect existing local song numbers among the CCLI hits to dedupe.
        $ccliNumbers = array_values(array_filter(array_map(static fn ($s) => $s['ccli'], $songs)));
        $existing = [];
        if (count($ccliNumbers) > 0) {
            $placeholders = implode(',', array_fill(0, count($ccliNumbers), '?'));
            $types = 'i' . str_repeat('i', count($ccliNumbers));
            $stmt = self::prepare("SELECT `songnumber` FROM `songs` WHERE `account` = ? AND `songnumber` IN ({$placeholders})");
            $stmt->bind_param($types, $account, ...$ccliNumbers)->execute()->fetchAll($rows)->close();
            foreach ($rows as $row) {
                $existing[(int)$row['songnumber']] = true;
            }
        }

        $out = [];
        foreach ($songs as $song) {
            if ($song['ccli'] === null || isset($existing[$song['ccli']])) {
                continue;
            }
            $out[] = [
                'id'        => $song['ccli'],
                'name'      => $song['name'],
                'type'      => 'churchtools',
                'author'    => $song['author'],
                'copyright' => $song['copyright'],
                'ccli'      => $song['ccli'],
            ];
        }
        return $out;
    }

    /** Load the account's ChurchTools config (url + token), or null if not configured. */
    private function ctConfig(int $account): ?array
    {
        if (!$account) {
            return null;
        }
        $stmt = self::prepare('SELECT `church_tools_url`, `church_tools_token` FROM `account` WHERE `license` = ?');
        $stmt->bind_param('i', $account)->execute()->fetchOne($row)->close();
        if (!$row || empty($row['church_tools_url']) || empty($row['church_tools_token'])) {
            return null;
        }
        return ['url' => $row['church_tools_url'], 'token' => $row['church_tools_token']];
    }

    private function prepareSearchParameter(string $search): string
    {
        $result = [];
        foreach (explode(' ', $search) as $word) {
            $word = trim($word);
            if (!empty($word)) {
                $word = str_replace(['+', '-', '@', '<', '>', '(', ')', '~', '*', '"'], '', $word);
                if (!empty($word)) {
                    $result[] = $word . '*';
                }
            }
        }
        return join(' ', $result);
    }
}
