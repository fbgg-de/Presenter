<?php

require_once(__DIR__ . '/ChurchToolsClient.php');

/**
 * ChurchToolsCcli — stateless CCLI SongSelect helpers (search + detail), shared by the
 * unified Search endpoint and the ChurchToolsSongs import/detail endpoint.
 *
 * Pure HTTP/parsing only — the caller passes the account's CT config (url + token);
 * config loading stays in the RestControllers that have DB access.
 */
class ChurchToolsCcli
{
    /** Fallback ChurchTools song category used when creating a song and none can be borrowed. */
    private const int DEFAULT_SONG_CATEGORY_ID = 1;

    /**
     * Search the CCLI SongSelect catalogue. Returns a normalized song list (possibly empty).
     *
     * @param array{url:string,token:string} $cfg
     * @return array<int,array{ccli:?int,name:string,author:?string,copyright:?string}>
     */
    public static function search(string $q, int $limit, array $cfg): array
    {
        if (trim($q) === '') {
            return [];
        }

        $data = ChurchToolsClient::legacyAjax('getCCLISongsMatchingTitle', ['songTitle' => $q], $cfg);
        if ($data === false) {
            return [];
        }

        // The legacy endpoint wraps the CCLI API response as a JSON string under `data`.
        $inner = $data['data'] ?? null;
        if (is_string($inner)) {
            $inner = json_decode($inner, true);
        }
        $results = $inner['data']['results'] ?? [];

        $out = [];
        foreach ((array)$results as $item) {
            if (!is_array($item)) {
                continue;
            }
            $authors = $item['authors'] ?? [];
            $out[] = [
                'ccli'      => isset($item['songNumber']) ? (int)$item['songNumber'] : null,
                'name'      => $item['title'] ?? '',
                'author'    => is_array($authors) ? implode(', ', $authors) : ($authors ?: null),
                'copyright' => !empty($item['isPublicDomain']) ? 'Public Domain' : null,
            ];
        }

        return $limit > 0 ? array_slice($out, 0, $limit) : $out;
    }

    /**
     * Resolve a single CCLI SongSelect song (incl. lyrics → blocks) for import.
     *
     * The exact legacy `func`/payload is still being pinned down, so the raw response is
     * echoed under `_debug` whenever no lyric blocks could be extracted.
     *
     * @param array{url:string,token:string} $cfg
     * @return array<string,mixed>
     */
    public static function detail(int $songNumber, array $cfg): array
    {
        require_once(__DIR__ . '/Logging.php');

        // Metadata (name / author / copyright / tonality) — same func the CT web UI uses.
        $metaResp = ChurchToolsClient::legacyAjax('getCCLISongData', ['songNumber' => $songNumber], $cfg);
        $meta = self::unwrapData($metaResp);
        $name      = $meta['title'] ?? $meta['name'] ?? null;
        $authorRaw = $meta['author'] ?? $meta['authors'] ?? null;
        $author    = is_array($authorRaw) ? implode(', ', $authorRaw) : ($authorRaw ?: null);
        $copyRaw   = $meta['copyright'] ?? $meta['copyrights'] ?? null;
        $copyright = is_array($copyRaw) ? implode(', ', $copyRaw) : ($copyRaw ?: null);
        // getCCLISongData returns the default key as `defaultKey: ["E"]` (an array).
        $keyRaw    = $meta['defaultKey'] ?? $meta['tonality'] ?? $meta['key'] ?? null;
        $key       = is_array($keyRaw) ? ($keyRaw[0] ?? null) : ($keyRaw ?: null);

        // Lyrics. arrangementID is only consumed by CT when *saving* a file, so a 0 is fine
        // for fetching (we never create a CT song just to read the lyrics).
        $lyricsResp = ChurchToolsClient::legacyAjax('getCCLILyrics', [
            'songNumber'    => $songNumber,
            'title'         => $name ?? '',
            'arrangementID' => 0,
        ], $cfg);
        // The lyrics live under data.content (a JSON *string*) → .data.{lyrics,authors,copyrights,…}.
        $lyricsData = self::lyricsContent($lyricsResp);
        [$blocks, $order] = self::parseLyrics($lyricsData);

        // The lyrics payload carries fuller author/copyright than getCCLISongData — use as fallback.
        if (($author === null || $author === '') && !empty($lyricsData['authors'])) {
            $author = implode(', ', (array)$lyricsData['authors']);
        }
        if (($copyright === null || $copyright === '') && !empty($lyricsData['copyrights'])) {
            $copyright = implode(', ', (array)$lyricsData['copyrights']);
        }
        if (($name === null || $name === '') && !empty($lyricsData['title'])) {
            $name = $lyricsData['title'];
        }

        $payload = [
            'ccli'      => $songNumber,
            'name'      => $name,
            'author'    => $author,
            'copyright' => $copyright,
            'key'       => $key,
            'blocks'    => $blocks,
            'order'     => $order,
        ];
        if (count($blocks) === 0) {
            // Echo both raw responses + the decoded lyric keys so the shape can be confirmed.
            $payload['_debug'] = ['songData' => $metaResp, 'lyrics' => $lyricsResp];
            Logging::debug('ccliLyrics empty keys=' . implode(',', array_keys($lyricsData))
                . ' snippet=' . substr((string)json_encode($lyricsData), 0, 900));
        }
        $blocks
          |> count(...)
          |> (fn ($x) => sprintf('ccliDetail songNumber=%d name=%s author=%s copyright=%s key=%s blocks=%d', $songNumber, $name ?? '-', $author ?? '-', $copyright ?? '-', $key ?? '-', $x))
          |> Logging::debug(...);
        return $payload;
    }

    /**
     * Fetch the CCLI chord chart for a song as a PDF. Returns the raw PDF bytes, or null.
     * `$reason` is set to 'unavailable' when CCLI reports the song simply has no chord chart
     * (so the caller can tell that apart from a transport/parse failure).
     *
     * `getCCLIChordsFile` generates the chart, *stores it as a ChurchTools file* and returns a
     * reference `{success, id, filename, bezeichnung}` — so the actual PDF is fetched in a second
     * step via the file-download endpoint.
     *
     * @param array{url:string,token:string} $cfg
     */
    public static function chordsPdf(int $songNumber, string $title, string $tonality, array $cfg, int $columns = 2, ?string &$reason = null): ?string
    {
        require_once(__DIR__ . '/Logging.php');
        $reason = null;

        // The generated chord file is only downloadable when attached to a *real* arrangement —
        // an orphaned arrangementID=0 file 403s on download. So ensure a CT song/arrangement
        // exists for this CCLI number first (found by ccli, or created), like the CT web UI does.
        $arrangementId = self::ensureArrangement($songNumber, $title, null, $cfg) ?? 0;

        $raw = ChurchToolsClient::legacyAjaxRaw('getCCLIChordsFile', [
            'songNumber'    => $songNumber,
            'title'         => $title,
            'arrangementID' => $arrangementId,
            'tonality'      => $tonality !== '' ? $tonality : 'C',
            'style'         => 'Standard',
            'numColumns'    => $columns > 0 ? $columns : 2,
        ], $cfg);
        $body = $raw['body'];
        if (!is_string($body) || $body === '') {
            return null;
        }

        // Already the raw PDF? (defensive — current CT returns a JSON file reference instead).
        if (str_starts_with($body, '%PDF')) {
            return $body;
        }

        $decoded = json_decode($body, true);
        $data    = is_array($decoded) ? ($decoded['data'] ?? []) : [];

        // CCLI reports "Song N does not have sheet music available." with success:false.
        $problem = is_array($data) ? ($data['problem'] ?? '') : '';
        if ((is_array($data) && ($data['success'] ?? null) === false) || stripos((string)$problem, 'sheet music') !== false) {
            $reason = 'unavailable';
            Logging::debug("ccliChords songNumber={$songNumber}: no chord chart available on CCLI");
            return null;
        }

        // Current shape: the chart was stored as a CT file → download it by id (via REST).
        if (is_array($data) && !empty($data['id'])) {
            $pdf = ChurchToolsClient::downloadFileById((int)$data['id'], $cfg);
            if (is_string($pdf) && str_starts_with($pdf, '%PDF')) {
                return $pdf;
            }
            Logging::debug("ccliChords songNumber={$songNumber}: stored-file download did not return a PDF");
            return null;
        }

        // Legacy fallback: an inline (base64) PDF payload.
        $b64 = is_array($decoded) ? ($decoded['file'] ?? $decoded['content'] ?? $decoded['pdf'] ?? '') : $body;
        if (!is_string($b64) || $b64 === '') {
            Logging::debug("ccliChords songNumber={$songNumber}: no pdf payload found in response");
            return null;
        }
        if (str_contains($b64, 'base64,')) {
            $b64 = substr($b64, strpos($b64, 'base64,') + 7);
        }
        $bin = base64_decode($b64, true);
        if ($bin === false || !str_starts_with($bin, '%PDF')) {
            Logging::debug("ccliChords songNumber={$songNumber}: chord payload was not a PDF");
            return null;
        }
        return $bin;
    }

    /**
     * Find (by CCLI number / title) or create a ChurchTools song with a default arrangement,
     * returning the arrangement id (or null). Shared by chord import and event-agenda sync.
     *
     * NB: the `/songs` list has NO `ccli` filter and `query` only matches title/author — so we
     * search by title (incl. arrangements) and confirm the `ccli` field, falling back to a name
     * match. `POST /songs` requires a `categoryId`, borrowed from an existing song.
     *
     * @param array{url:string,token:string} $cfg
     */
    public static function ensureArrangement(int $ccli, string $title, ?string $author, array $cfg, ?string $copyright = null): ?int
    {
        require_once(__DIR__ . '/Logging.php');

        $categoryId = null;
        $arrId      = self::findArrangement($ccli, $title, $cfg, $categoryId);
        if ($arrId !== null) {
            return $arrId;
        }

        // POST /songs requires a categoryId — borrow one from any existing song.
        if ($categoryId === null) {
            $any  = ChurchToolsClient::get('songs', ['limit' => 10], $cfg);
            $rows = is_array($any) ? ($any['data'] ?? []) : [];
            foreach ($rows as $song) {
                $cid = $song['category']['id'] ?? $song['categoryId'] ?? null;
                if ($cid !== null) {
                    $categoryId = $cid;
                    break;
                }
            }
            Logging::debug("ccli borrowCategory rows=" . count($rows) . ' cat=' . ($categoryId ?? '-')
                . ' firstKeys=' . (isset($rows[0]) && is_array($rows[0]) ? implode(',', array_keys($rows[0])) : '-')
                . ' raw=' . substr((string)json_encode(is_array($any) ? $any : ['_nonArray' => $any]), 0, 250));
        }
        // Empty song library → take the account's first configured song category from the event
        // masterdata (works even with zero songs, unlike borrowing from an existing song).
        if ($categoryId === null) {
            $md   = ChurchToolsClient::get('event/masterdata', [], $cfg);
            $cats = is_array($md) ? ($md['data']['songCategories'] ?? []) : [];
            $categoryId = $cats[0]['id'] ?? null;
            Logging::debug('ccli songCategory from masterdata count=' . count($cats) . ' cat=' . ($categoryId ?? '-'));
        }
        // Last resort: a hard-coded default so a CT song can still be created.
        if ($categoryId === null) {
            $categoryId = self::DEFAULT_SONG_CATEGORY_ID;
            Logging::debug("ccli ensureArrangement ccli={$ccli}: using fallback categoryId={$categoryId}");
        }

        $body = [
            'name'         => $title !== '' ? $title : ('CCLI ' . $ccli),
            'categoryId'   => (int)$categoryId,
            'arrangements' => [['name' => 'Default', 'isDefault' => true]],
        ];
        if ($ccli > 0) {
            $body['ccli'] = (string)$ccli;
        }
        if ($author !== null && $author !== '') {
            $body['author'] = $author;
        }
        if ($copyright !== null && $copyright !== '') {
            $body['copyright'] = $copyright;
        }
        $created = ChurchToolsClient::post('songs', [], $body, $cfg);
        $arrId   = $created['data']['arrangements'][0]['id'] ?? null;
        // If the song was created but the arrangement id wasn't in the response, fetch it.
        if ($arrId === null && !empty($created['data']['id'])) {
            $songId  = (int)$created['data']['id'];
            $full    = ChurchToolsClient::get("songs/{$songId}", ['include' => 'arrangements'], $cfg);
            $arrId   = $full['data']['arrangements'][0]['id'] ?? null;
        }
        Logging::debug("ccli ensureArrangement created ccli={$ccli} cat={$categoryId} arrId=" . ($arrId ?? 'null')
            . ($arrId === null ? ' resp=' . substr((string)json_encode($created), 0, 400) : ''));
        return $arrId !== null ? (int)$arrId : null;
    }

    /**
     * Look up an existing CT song's default arrangement id by CCLI number (preferred) or title.
     * Also captures a usable `categoryId` from any returned song (for the create fallback).
     */
    private static function findArrangement(int $ccli, string $title, array $cfg, ?int &$categoryId): ?int
    {
        $search = $title !== '' ? $title : (string)$ccli;
        if ($search === '' || $search === '0') {
            return null;
        }

        $found = ChurchToolsClient::get('songs', ['query' => $search, 'include' => 'arrangements', 'limit' => 50], $cfg);
        $rows  = is_array($found) ? ($found['data'] ?? []) : [];
        require_once(__DIR__ . '/Logging.php');
        Logging::debug("ccli findArrangement search='{$search}' ccli={$ccli} rows=" . count($rows)
            . ' firstCcli=' . ($rows[0]['ccli'] ?? '-') . ' firstCat=' . ($rows[0]['category']['id'] ?? $rows[0]['categoryId'] ?? '-')
            . (is_array($found) ? '' : ' raw=' . substr((string)json_encode($found), 0, 200)));

        $byCcli = null;
        $byName = null;
        foreach ($rows as $song) {
            if (!is_array($song)) {
                continue;
            }
            if ($categoryId === null) {
                $categoryId = $song['category']['id'] ?? $song['categoryId'] ?? 0;
            }
            if ($ccli > 0 && (string)($song['ccli'] ?? '') === (string)$ccli) {
                $byCcli = $song;
                break;
            }
            if ($byName === null && $title !== '' && mb_strtolower((string)($song['name'] ?? '')) === mb_strtolower($title)) {
                $byName = $song;
            }
        }

        $match = $byCcli ?? $byName;
        if (is_array($match) && !empty($match['arrangements'][0]['id'])) {
            $categoryId = $match['category']['id'] ?? $match['categoryId'] ?? $categoryId;
            return (int)$match['arrangements'][0]['id'];
        }
        return null;
    }

    /**
     * Sync a show's ordered songs to a ChurchTools event's agenda. Resolves the CCLI songs
     * (custom songs skipped) to arrangement ids — creating CT songs as needed — then reconciles
     * the agenda. Idempotent. Shared by the events endpoint and the show-save endpoint.
     *
     * @param array<int>            $songNumbers     show song numbers, in order
     * @param array<int,array>      $detailsByNumber songnumber => {title,authors,copyright,ccli_number}
     * @param array{url:string,token:string} $cfg
     * @return array{ok:bool,synced:int,reason?:string}
     */
    public static function syncEventAgenda(int $eventId, array $songNumbers, array $detailsByNumber, array $cfg): array
    {
        require_once(__DIR__ . '/Logging.php');
        $limit = defined('CUSTOM_NUMBER_LIMIT') ? CUSTOM_NUMBER_LIMIT : 10000;
        $syncCustom = defined('CUSTOM_NUMBER_SYNC') ? CUSTOM_NUMBER_SYNC : false;

        $arrangementIds = [];
        $ccliSongCount  = 0;
        foreach ($songNumbers as $num) {
            $num = (int)$num;
            $row       = $detailsByNumber[$num] ?? null;
            $title     = $row['title'] ?? ('#' . $num);
            $author    = $row['authors'] ?? null;
            $copyright = $row['copyright'] ?? null;
            // Valid CCLI number: the `ccli_number` column, or the song number itself when in range.
            $ccliCol = isset($row['ccli_number']) && ctype_digit((string)$row['ccli_number']) ? (int)$row['ccli_number'] : 0;
            $ccli    = $ccliCol > 0 ? $ccliCol : ($num >= $limit ? $num : 0);
            if ($ccli <= 0 && !$syncCustom) {
                continue; // skip custom (non-CCLI) songs
            }
            $ccliSongCount++;
            $arrId = self::ensureArrangement($ccli, (string)$title, $author, $cfg, $copyright);
            if ($arrId !== null) {
                $arrangementIds[] = $arrId;
            }
        }

        if ($ccliSongCount === 0) {
            Logging::debug("eventSync eventId={$eventId} no CCLI songs to sync");
            return ['ok' => true, 'synced' => 0, 'reason' => 'no_ccli_songs'];
        }
        if (count($arrangementIds) === 0) {
            Logging::debug("eventSync eventId={$eventId} could not resolve any CCLI song");
            return ['ok' => false, 'synced' => 0, 'reason' => 'unresolved'];
        }

        $ok = self::syncAgendaSongs($eventId, $arrangementIds, $cfg);
        return ['ok' => $ok, 'synced' => count($arrangementIds)];
    }

    /**
     * Reconcile an event's agenda so its song items match the given arrangements (in show order),
     * idempotently (a no-op when already in sync). Uses item-level POST/DELETE — the whole-agenda
     * PUT is forbidden for agendas that contain non-song items. A missing agenda is created first
     * (PUT create is allowed). Non-song items (headers/text) are left untouched.
     *
     * @param array{url:string,token:string} $cfg
     */
    private static function syncAgendaSongs(int $eventId, array $arrangementIds, array $cfg): bool
    {
        require_once(__DIR__ . '/Logging.php');

        $agenda        = ChurchToolsClient::get("events/{$eventId}/agenda", ['include' => 'items'], $cfg);
        $hasAgenda     = isset($agenda['data']['id']);
        $existingItems = $agenda['data']['items'] ?? [];

        // Create the agenda if the event has none yet. PUT *create* (of a missing agenda) is
        // permitted, even though a full PUT *update* of an existing agenda usually isn't.
        if (!$hasAgenda) {
            $event      = ChurchToolsClient::get("events/{$eventId}", [], $cfg);
            $calendarId = $event['data']['calendar']['id'] ?? null;
            if ($calendarId === null) {
                Logging::debug("eventSync eventId={$eventId} no calendarId — cannot create agenda");
                return false;
            }
            $created = ChurchToolsClient::put("events/{$eventId}/agenda", [], ['calendarId' => (int)$calendarId], $cfg);
            if (!isset($created['data']['id'])) {
                Logging::debug("eventSync eventId={$eventId} agenda create FAILED resp=" . substr((string)json_encode($created), 0, 300));
                return false;
            }
            $existingItems = [];
        }

        $desired = array_values(array_map('intval', $arrangementIds));

        // Existing song items: their arrangement ids (in order) and item ids (to remove).
        $currentSongOrder = [];
        $songItemIds      = [];
        foreach ($existingItems as $it) {
            if (($it['type'] ?? '') === 'song') {
                $aid = $it['song']['arrangementId'] ?? null;
                if ($aid) {
                    $currentSongOrder[] = (int)$aid;
                }
                if (!empty($it['id'])) {
                    $songItemIds[] = $it['id'];
                }
            }
        }
        if ($currentSongOrder === $desired) {
            Logging::debug("eventSync eventId={$eventId} already in sync (" . count($desired) . ' songs)');
            return true;
        }

        // Reconcile with item-level operations — the whole-agenda PUT is FORBIDDEN for agendas
        // that contain non-song items (CT "error.forbidden.update"), but adding/removing single
        // song items is permitted. Non-song items (headers/text) are left untouched; the songs
        // end up in the show's order (appended after any non-song items).
        $removed = 0;
        foreach ($songItemIds as $itemId) {
            ChurchToolsClient::delete("events/{$eventId}/agenda/items/{$itemId}", [], $cfg);
            $removed++;
        }
        $added    = 0;
        $lastFail = null;
        foreach ($desired as $arrId) {
            $resp = ChurchToolsClient::post("events/{$eventId}/agenda/items", [], ['type' => 'song', 'arrangementId' => $arrId], $cfg);
            if (isset($resp['data']['id'])) {
                $added++;
            } else {
                $lastFail = $resp;
            }
        }
        $ok = $added === count($desired);
        Logging::debug("eventSync eventId={$eventId} hadAgenda=" . ($hasAgenda ? 'yes' : 'no')
            . ' was=[' . implode(',', $currentSongOrder) . '] now=[' . implode(',', $desired) . ']'
            . " removed={$removed} added={$added}/" . count($desired) . ' ok=' . ($ok ? 'yes' : 'no')
            . ($ok ? '' : ' resp=' . substr((string)json_encode($lastFail), 0, 300)));
        return $ok;
    }

    /** Decode a legacy response's `data` payload (often a JSON string, sometimes nested under data.data). */
    private static function unwrapData($resp): array
    {
        if (!is_array($resp)) {
            return [];
        }
        $data = $resp['data'] ?? $resp;
        if (is_string($data)) {
            $decoded = json_decode($data, true);
            $data = is_array($decoded) ? $decoded : ['_raw' => $data];
        }
        if (isset($data['data']) && is_array($data['data'])) {
            return $data['data'];
        }
        return is_array($data) ? $data : [];
    }

    /**
     * Dig the song-lyrics object out of a getCCLILyrics response. Shape:
     *   { status, data: { success, content: "<json string>" } }
     * where the decoded content is { statusCode, message, data: { type:songLyrics, lyrics, … } }.
     */
    private static function lyricsContent($resp): array
    {
        if (!is_array($resp)) {
            return [];
        }
        $data = $resp['data'] ?? [];
        if (is_array($data) && isset($data['content'])) {
            $content = $data['content'];
            if (is_string($content)) {
                $decoded = json_decode($content, true);
                $content = is_array($decoded) ? $decoded : [];
            }
            if (is_array($content) && isset($content['data']) && is_array($content['data'])) {
                return $content['data'];
            }
            return is_array($content) ? $content : [];
        }
        // Fall back to the generic unwrap for any other shape.
        return self::unwrapData($resp);
    }

    /** Map CCLI lyrics to presenter blocks + a default order. Handles structured sections or a plain text block. */
    private static function parseLyrics($lyrics): array
    {
        if (!is_array($lyrics)) {
            return [[], []];
        }

        // SongSelect shape: lyricParts[] = { partType, partTypeNumber, partLabel, lyrics }.
        // ChurchTools' own .sng labels these "<partType> <number>" (Verse 1, Chorus 1, Misc 1).
        $parts = $lyrics['lyricParts'] ?? null;
        if (is_array($parts) && isset($parts[0]) && is_array($parts[0])) {
            $blocks = [];
            $order  = [];
            foreach ($parts as $i => $part) {
                if (!is_array($part)) {
                    continue;
                }
                $type  = $part['partType'] ?? $part['partLabel'] ?? 'Part';
                $num   = $part['partTypeNumber'] ?? '';
                $label = trim((string)$type . ' ' . (string)$num);
                if ($label === '') {
                    $label = 'Part ' . ($i + 1);
                }
                $lines = preg_split('/\r\n|\r|\n/', (string)($part['lyrics'] ?? ''));
                [$blocks, $order] = self::addBlock($blocks, $order, $label, self::cleanLines($lines));
            }
            return [$blocks, $order];
        }

        // Structured sections/verses (array of {label,text}).
        $sections = $lyrics['sections'] ?? $lyrics['verses'] ?? null;
        if (is_array($sections) && isset($sections[0]) && is_array($sections[0])) {
            $blocks = [];
            $order  = [];
            foreach ($sections as $i => $section) {
                if (!is_array($section)) {
                    continue;
                }
                $label = $section['label'] ?? $section['caption'] ?? $section['title'] ?? $section['type'] ?? ('Part ' . ($i + 1));
                $text  = $section['lyrics'] ?? $section['text'] ?? $section['content'] ?? '';
                $lines = is_array($text) ? $text : preg_split('/\r\n|\r|\n/', (string)$text);
                [$blocks, $order] = self::addBlock($blocks, $order, (string)$label, self::cleanLines($lines));
            }
            return [$blocks, $order];
        }

        // Plain text lyrics (the common SongSelect shape) — split into labelled sections.
        $text = $lyrics['lyrics'] ?? $lyrics['text'] ?? $lyrics['plainText'] ?? null;
        if (is_string($text) && trim($text) !== '') {
            return self::parsePlainLyrics($text);
        }
        return [[], []];
    }

    /** Split a plain-text lyric block into sections (blank-line separated; optional leading label line). */
    private static function parsePlainLyrics(string $text): array
    {
        $text = str_replace(["\r\n", "\r"], "\n", $text);
        $chunks = preg_split('/\n[ \t]*\n+/', trim($text)) ?: [];
        $labelRe = '/^\s*((?:pre[- ]?chorus|chorus|verse|bridge|refrain|strophe|vers|intro|outro|interlude|instrumental|tag|ending|coda|hook|part|teil)\b[^\n]{0,20})$/i';

        $blocks = [];
        $order  = [];
        foreach ($chunks as $chunk) {
            $lines = explode("\n", $chunk);
            $label = null;
            if (count($lines) > 0 && preg_match($labelRe, trim($lines[0]))) {
                $label = trim(rtrim(trim($lines[0]), ':.'));
                array_shift($lines);
            }
            $clean = self::cleanLines($lines);
            if (count($clean) === 0) {
                continue;
            }
            if ($label === null || $label === '') {
                $label = 'Part ' . (count($order) + 1);
            }
            [$blocks, $order] = self::addBlock($blocks, $order, $label, $clean);
        }
        return [$blocks, $order];
    }

    /** Add a block under a unique key (suffixing duplicates), preserving order. */
    private static function addBlock(array $blocks, array $order, string $label, array $lines): array
    {
        if (count($lines) === 0) {
            return [$blocks, $order];
        }
        $key = $label;
        $n   = 2;
        while (isset($blocks[$key])) {
            $key = $label . ' ' . $n;
            $n++;
        }
        $blocks[$key] = $lines;
        $order[]      = $key;
        return [$blocks, $order];
    }

    /** Trim trailing whitespace and drop empty lines. */
    private static function cleanLines($lines): array
    {
        return array_map(static fn ($l) => rtrim((string)$l), (array)$lines)
            |> (fn ($x) => array_filter($x, static fn ($l) => trim($l) !== ''))
            |> array_values(...);
    }
}
