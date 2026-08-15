<?php

require_once(__DIR__ . '/RestController.php');
require_once(__DIR__ . '/../classes/MetricsHelper.php');

/**
 * AdminSongs — song library overview and duplicate merging for the admin panel.
 *
 *   GET  /rest/AdminSongs/{license}
 *        → the account's library with usage references plus suspected-duplicate groups
 *          (songs sharing a CCLI number or a normalized title).
 *
 *   POST /rest/AdminSongs  body { license, sourceNumber, targetNumber, dryRun? }
 *        → replace `sourceNumber` by `targetNumber`: every reference (shows, set lists) is
 *          repointed at the target, then the source song is deleted. Song *content* is never
 *          merged — blocks, lyrics, named orders and PDFs of the target stay exactly as they
 *          are, and the source's copies are dropped along with it. `dryRun` runs the whole
 *          thing inside a transaction and rolls it back, so the UI can show an exact preview.
 *
 * Where both songs are already referenced by the same show or set list, the source's reference
 * is dropped and the target's existing one is kept (with its tags, custom keys and position).
 */
class AdminSongs extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        $this->requireAdmin($res);
        $req->path->checkNumeric(0);

        $license = $req->path->getAsInt(0);

        $songs = [];
        self::prepare(
            'SELECT s.`songnumber`, s.`title`, s.`authors`, s.`copyright`, s.`ccli_number`, s.`song_key`,
                    s.`updated_at`,
                    JSON_LENGTH(JSON_KEYS(s.`order`)) AS `orderCount`,
                    (SELECT COUNT(*) FROM `blocks` b
                      WHERE b.`account` = s.`account` AND b.`songnumber` = s.`songnumber`) AS `blockCount`,
                    (SELECT COUNT(*) FROM `pdf_area_mappings` m
                      WHERE m.`account` = s.`account` AND m.`songnumber` = s.`songnumber`) AS `pdfCount`,
                    (SELECT COUNT(*) FROM `pdf_annotations` a
                      WHERE a.`account` = s.`account` AND a.`songnumber` = s.`songnumber`) AS `annotationCount`
             FROM `songs` s
             WHERE s.`account` = ?
             ORDER BY s.`title`'
        )->bind_param('i', $license)->execute()->fetchAll($songs)->close();

        $setListNames = $this->setListNamesBySong($license);
        $showTitles   = $this->showTitlesBySong($license);

        $result = [];
        foreach ($songs as $row) {
            $number = (int)$row['songnumber'];

            $result[] = [
                'songNumber'      => $number,
                'title'           => $row['title'],
                'authors'         => $row['authors'],
                'copyright'       => $row['copyright'],
                'ccliNumber'      => $row['ccli_number'],
                'key'             => $row['song_key'],
                'updatedAt'       => $row['updated_at'] ?? null,
                'orderCount'      => (int)($row['orderCount'] ?? 0),
                'blockCount'      => (int)($row['blockCount'] ?? 0),
                'pdfCount'        => (int)($row['pdfCount'] ?? 0),
                'annotationCount' => (int)($row['annotationCount'] ?? 0),
                'shows'           => $showTitles[$number] ?? [],
                'setLists'        => $setListNames[$number] ?? [],
            ];
        }

        $res->success([
            'license' => $license,
            'songs'   => $result,
            'groups'  => $this->duplicateGroups($songs),
        ]);
    }

    protected function post(Request &$req, Response &$res): never
    {
        $this->requireAdmin($res);
        $req->params->checkNumeric('license', 'sourceNumber', 'targetNumber');

        $license = $req->params->getAsInt('license');
        $source  = $req->params->getAsInt('sourceNumber');
        $target  = $req->params->getAsInt('targetNumber');
        $dryRun  = $req->params->getAsBool('dryRun', false);

        if ($source === $target) {
            $res->error(400, 'A song cannot be merged into itself');
        }

        $sourceRow = $this->fetchSong($license, $source);
        if (!$sourceRow) {
            $res->error(404, 'Song #' . $source . ' was not found in account ' . $license);
        }
        $targetRow = $this->fetchSong($license, $target);
        if (!$targetRow) {
            $res->error(404, 'Song #' . $target . ' was not found in account ' . $license);
        }

        // Named orders the target actually has. A reference pointing at one of the source's
        // orders would dangle after the merge, so those get cleared instead of carried over.
        $targetOrders = json_decode($targetRow['order'] ?? '{}', true);
        $targetOrders = is_array($targetOrders) ? array_keys($targetOrders) : [];

        $plan = [
            'setLists'          => ['repointed' => [], 'dropped' => []],
            'shows'             => ['repointed' => [], 'dropped' => []],
            'clearedOrderNames' => 0,
            'deleted'           => [
                'blocks'         => 0,
                'pdfMappings'    => 0,
                'pdfAnnotations' => 0,
                'pdfFiles'       => $this->countPdfFiles($license, $source),
            ],
        ];

        $tx = self::transaction();
        try {
            $this->mergeSetListEntries($license, $source, $target, $targetOrders, $plan);
            $this->mergeShowOrders($license, $source, $target, $targetOrders, $plan);
            $this->deleteSourceSong($license, $source, $plan);

            if ($dryRun) {
                $tx->rollback();
            } else {
                $tx->commit();
            }
        } catch (\Throwable $e) {
            $tx->rollback();
            $res->error(500, 'Failed to merge song: ' . $e->getMessage());
        }

        if (!$dryRun) {
            // Best-effort, outside the transaction: the source's PDFs are not merged, so its
            // storage folder goes away with the song.
            $this->deletePdfDir($license, $source);

            MetricsHelper::record('song_merged', $license, [
                'source' => $source,
                'target' => $target,
                'shows'  => count($plan['shows']['repointed']) + count($plan['shows']['dropped']),
                'setLists' => count($plan['setLists']['repointed']) + count($plan['setLists']['dropped']),
            ], $_SESSION['admin_sub'] ?? null, 'song', (string)$target);
        }

        $res->success(array_merge($plan, [
            'message'      => $dryRun
                ? 'Preview of merging #' . $source . ' into #' . $target
                : 'Song #' . $source . ' was replaced by #' . $target,
            'dryRun'       => $dryRun,
            'license'      => $license,
            'sourceNumber' => $source,
            'targetNumber' => $target,
            'sourceTitle'  => $sourceRow['title'],
            'targetTitle'  => $targetRow['title'],
        ]));
    }

    // ────────────────────────── merge steps ──────────────────────────

    /**
     * Repoint the source's set list entries at the target. When the target is already in that
     * set list, the source's entry (and its tags) is dropped instead — the target's entry wins.
     * @param array<int,string> $targetOrders
     * @param array             $plan
     */
    private function mergeSetListEntries(int $account, int $source, int $target, array $targetOrders, array &$plan): void
    {
        $entries = [];
        self::prepare(
            'SELECT e.`id`, l.`name`,
                    (SELECT COUNT(*) FROM `set_list_entries` t
                      WHERE t.`set_list_id` = e.`set_list_id` AND t.`songnumber` = ?) AS `targetPresent`
             FROM `set_list_entries` e
             JOIN `set_lists` l ON l.`id` = e.`set_list_id`
             WHERE e.`account` = ? AND e.`songnumber` = ?
             ORDER BY l.`name`'
        )->bind_param('iii', $target, $account, $source)->execute()->fetchAll($entries)->close();

        foreach ($entries as $entry) {
            $entryId = (int)$entry['id'];

            if ((int)$entry['targetPresent'] > 0) {
                self::prepare('DELETE FROM `set_list_entries` WHERE `id` = ?')
                    ->bind_param('i', $entryId)->execute()->close();
                $plan['setLists']['dropped'][] = $entry['name'];
                continue;
            }

            self::prepare('UPDATE `set_list_entries` SET `songnumber` = ? WHERE `id` = ?')
                ->bind_param('ii', $target, $entryId)->execute()->close();
            $plan['setLists']['repointed'][] = $entry['name'];
            $plan['clearedOrderNames'] += $this->clearUnknownOrderNames($entryId, $targetOrders);
        }
    }

    /**
     * Null out tag block-order names the target song does not have — same rule the set list
     * endpoint applies on write (see SetListEntries::filterBlockOrderNames).
     * @param array<int,string> $targetOrders
     */
    private function clearUnknownOrderNames(int $entryId, array $targetOrders): int
    {
        $sql   = 'UPDATE `set_list_entry_tags` SET `block_order_name` = NULL
                  WHERE `set_list_entry_id` = ? AND `block_order_name` IS NOT NULL';
        $types = 'i';
        $args  = [$entryId];

        if (count($targetOrders) > 0) {
            $sql  .= ' AND `block_order_name` NOT IN (' . implode(',', array_fill(0, count($targetOrders), '?')) . ')';
            $types .= str_repeat('s', count($targetOrders));
            $args  = array_merge($args, $targetOrders);
        }

        $stmt = self::prepare($sql)->bind_param($types, ...$args)->execute();
        $stmt->affected($affected);
        $stmt->close();

        return (int)($affected ?? 0);
    }

    /**
     * Rewrite every show's order JSON. The source item becomes the target item, keeping its
     * custom key; a show that already contains the target loses the source item instead.
     * @param array<int,string> $targetOrders
     */
    private function mergeShowOrders(int $account, int $source, int $target, array $targetOrders, array &$plan): void
    {
        $rows = [];
        self::prepare('SELECT `title`, `order` FROM `shows` WHERE `account` = ? ORDER BY `title`')
            ->bind_param('i', $account)->execute()->fetchAll($rows)->close();

        foreach ($rows as $row) {
            $order = json_decode($row['order'] ?? '', true);
            if (!is_array($order)) {
                continue;
            }

            [$newOrder, $repointed, $dropped, $cleared] = self::rewriteOrder($order, $source, $target, $targetOrders);
            $plan['clearedOrderNames'] += $cleared;

            if (!$repointed && !$dropped) {
                continue;
            }

            $json  = json_encode($newOrder);
            $title = $row['title'];
            self::prepare('UPDATE `shows` SET `order` = ? WHERE `account` = ? AND `title` = ?')
                ->bind_param('sis', $json, $account, $title)->execute()->close();

            if ($repointed) {
                $plan['shows']['repointed'][] = $title;
            }
            if ($dropped) {
                $plan['shows']['dropped'][] = $title;
            }
        }
    }

    /**
     * Rewrite one show's item list. The source item becomes the target item and keeps its custom
     * key; a named order the target does not have is dropped, since it would dangle. Once the
     * target is in the list — originally, or because an item was just repointed — every further
     * source item is a duplicate and disappears.
     *
     * @param  array<int,string> $targetOrders
     * @return array{0:array, 1:bool, 2:bool, 3:int} new order, repointed?, dropped?, cleared names
     */
    private static function rewriteOrder(array $order, int $source, int $target, array $targetOrders): array
    {
        $hasTarget = false;
        foreach ($order as $item) {
            if (self::isSongItem($item, $target)) {
                $hasTarget = true;
                break;
            }
        }

        $newOrder  = [];
        $repointed = false;
        $dropped   = false;
        $cleared   = 0;

        foreach ($order as $item) {
            if (!self::isSongItem($item, $source)) {
                $newOrder[] = $item;
                continue;
            }

            if ($hasTarget) {
                $dropped = true;
                continue;
            }

            if (is_array($item)) {
                $item['songNumber'] = $target;
                if (isset($item['order']) && !in_array($item['order'], $targetOrders, true)) {
                    unset($item['order']);
                    $cleared++;
                }
            } else {
                $item = $target; // legacy numeric order format
            }

            $newOrder[] = $item;
            $hasTarget  = true;
            $repointed  = true;
        }

        return [$newOrder, $repointed, $dropped, $cleared];
    }

    /** Drop the source song and everything that belongs to it alone. */
    private function deleteSourceSong(int $account, int $source, array &$plan): void
    {
        foreach (['pdf_annotations' => 'pdfAnnotations', 'pdf_area_mappings' => 'pdfMappings', 'blocks' => 'blocks'] as $table => $key) {
            $stmt = self::prepare("DELETE FROM `{$table}` WHERE `account` = ? AND `songnumber` = ?")
                ->bind_param('ii', $account, $source)->execute();
            $stmt->affected($affected);
            $stmt->close();
            $plan['deleted'][$key] = (int)($affected ?? 0);
        }

        self::prepare('DELETE FROM `songs` WHERE `account` = ? AND `songnumber` = ?')
            ->bind_param('ii', $account, $source)->execute()->close();
    }

    // ────────────────────────── helpers ──────────────────────────

    private function fetchSong(int $account, int $number): ?array
    {
        self::prepare('SELECT `songnumber`, `title`, `order` FROM `songs` WHERE `account` = ? AND `songnumber` = ?')
            ->bind_param('ii', $account, $number)->execute()->fetchOne($row)->close();

        return $row ?: null;
    }

    /** @return array<int,string[]> songnumber => set list names */
    private function setListNamesBySong(int $account): array
    {
        $rows = [];
        self::prepare(
            'SELECT e.`songnumber`, l.`name`
             FROM `set_list_entries` e
             JOIN `set_lists` l ON l.`id` = e.`set_list_id`
             WHERE e.`account` = ?
             ORDER BY l.`name`'
        )->bind_param('i', $account)->execute()->fetchAll($rows)->close();

        $byNumber = [];
        foreach ($rows as $row) {
            $byNumber[(int)$row['songnumber']][] = $row['name'];
        }

        return $byNumber;
    }

    /** @return array<int,string[]> songnumber => show titles referencing it */
    private function showTitlesBySong(int $account): array
    {
        $rows = [];
        self::prepare('SELECT `title`, `order` FROM `shows` WHERE `account` = ? ORDER BY `title`')
            ->bind_param('i', $account)->execute()->fetchAll($rows)->close();

        $byNumber = [];
        foreach ($rows as $row) {
            $order = json_decode($row['order'] ?? '', true);
            if (!is_array($order)) {
                continue;
            }

            $seen = [];
            foreach ($order as $item) {
                $number = self::songNumberOf($item);
                if ($number === null || isset($seen[$number])) {
                    continue;
                }
                $seen[$number]      = true;
                $byNumber[$number][] = $row['title'];
            }
        }

        return $byNumber;
    }

    /**
     * Group songs that look like duplicates of each other. Two songs are linked when they share
     * a CCLI number or a normalized title; links are transitive, so a chain ends up in one group.
     *
     * @param  array<int,array> $songs raw `songs` rows
     * @return array<int,array> groups of two or more songs
     */
    private function duplicateGroups(array $songs): array
    {
        $parent = [];
        $find = function (int $n) use (&$parent, &$find): int {
            return $parent[$n] === $n ? $n : ($parent[$n] = $find($parent[$n]));
        };

        $byCcli  = [];
        $byTitle = [];
        foreach ($songs as $row) {
            $number          = (int)$row['songnumber'];
            $parent[$number] = $number;

            $ccli = trim((string)($row['ccli_number'] ?? ''));
            if ($ccli !== '' && $ccli !== '0') {
                $byCcli[$ccli][] = $number;
            }

            $title = self::normalizeTitle((string)$row['title']);
            if ($title !== '') {
                $byTitle[$title][] = $number;
            }
        }

        $reasons = [];
        foreach (['ccli' => $byCcli, 'title' => $byTitle] as $reason => $buckets) {
            foreach ($buckets as $numbers) {
                if (count($numbers) < 2) {
                    continue;
                }
                $root = $find($numbers[0]);
                foreach ($numbers as $number) {
                    $other = $find($number);
                    if ($other !== $root) {
                        $parent[$other] = $root;
                        $root           = $find($root);
                    }
                }
                $reasons[$find($root)][$reason] = true;
            }
        }

        $members = [];
        foreach (array_keys($parent) as $number) {
            $members[$find($number)][] = $number;
        }

        // The union pass may have merged two roots after their reasons were recorded, so fold the
        // reasons onto the final root as well.
        $groups = [];
        $groupReasons = [];
        foreach ($reasons as $root => $set) {
            foreach (array_keys($set) as $reason) {
                $groupReasons[$find((int)$root)][$reason] = true;
            }
        }

        $id = 0;
        foreach ($members as $root => $numbers) {
            if (count($numbers) < 2) {
                continue;
            }
            sort($numbers);
            $groups[] = [
                'id'          => ++$id,
                'reasons'     => array_keys($groupReasons[$root] ?? []),
                'songNumbers' => $numbers,
            ];
        }

        return $groups;
    }

    /** Fold case, umlauts and punctuation away so "Herr, Dein Name!" matches "herr dein name". */
    private static function normalizeTitle(string $title): string
    {
        $lower  = mb_strtolower(trim($title), 'UTF-8');
        $folded = strtr($lower, [
            'ä' => 'a', 'ö' => 'o', 'ü' => 'u', 'ß' => 'ss',
            'á' => 'a', 'à' => 'a', 'â' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e',
            'í' => 'i', 'ì' => 'i', 'ó' => 'o', 'ò' => 'o', 'ô' => 'o',
            'ú' => 'u', 'ù' => 'u', 'ñ' => 'n', 'ç' => 'c',
        ]);

        return preg_replace('/[^a-z0-9]+/u', '', $folded) ?? '';
    }

    /** The song number a show item points at, or null when it is not a song item. */
    private static function songNumberOf(mixed $item): ?int
    {
        if (is_array($item)) {
            if (($item['type'] ?? 'song') !== 'song' || !isset($item['songNumber'])) {
                return null;
            }
            return (int)$item['songNumber'];
        }

        return is_numeric($item) ? (int)$item : null; // legacy numeric order format
    }

    private static function isSongItem(mixed $item, int $number): bool
    {
        return self::songNumberOf($item) === $number;
    }

    private function pdfDir(int $account, int $number): string
    {
        return __DIR__ . '/../data/' . $account . '/pdfs/' . $number;
    }

    private function countPdfFiles(int $account, int $number): int
    {
        $dir = $this->pdfDir($account, $number);
        if (!is_dir($dir)) {
            return 0;
        }

        return count(array_diff(scandir($dir) ?: [], ['.', '..']));
    }

    private function deletePdfDir(int $account, int $number): void
    {
        $dir = $this->pdfDir($account, $number);
        if (!is_dir($dir)) {
            return;
        }

        foreach (array_diff(scandir($dir) ?: [], ['.', '..']) as $entry) {
            $path = $dir . '/' . $entry;
            if (is_file($path)) {
                @unlink($path);
            }
        }

        @rmdir($dir);
    }
}
