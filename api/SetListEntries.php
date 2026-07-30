<?php

require_once(__DIR__ . '/RestController.php');

/**
 * Set List Entries and their Tag Assignments.
 *
 * A Set List Entry is the single representation of one Song inside one Set List — adding the
 * same song twice extends the existing entry with further Tag Assignments rather than creating
 * a duplicate. Key and block-order name live on the Tag Assignment, so the same song can be
 * prepared differently per tag context.
 *
 * POST   /rest/SetListEntries              → { setListId, songNumber, tags?: [...] }
 *                                            upserts the entry, merges the given tag assignments
 * PUT    /rest/SetListEntries/{entryId}    → { tags: [...] } replaces the entry's assignments
 * DELETE /rest/SetListEntries/{entryId}            → remove the whole entry
 * DELETE /rest/SetListEntries/{entryId}/{tagName}  → remove a single tag assignment
 *
 * A tag payload is { tagName, customKey?, blockOrderName? }. `customKey` / `blockOrderName` are
 * nullable; `blockOrderName` must be an order name that already exists on the song — set lists
 * never introduce new block-order names.
 */
class SetListEntries extends RestController
{
    /** Resolve the set list an entry belongs to, or 404 when it is not this account's. */
    private function requireEntry(Response &$res, int $entryId, int $account): array
    {
        $stmt = self::prepare('
                SELECT e.`id`, e.`set_list_id`, e.`songnumber`
                FROM `set_list_entries` e
                INNER JOIN `set_lists` l ON l.`id` = e.`set_list_id`
                WHERE e.`id` = ? AND l.`account` = ?
            ');
        $stmt->bind_param('ii', $entryId, $account)->execute()->fetchOne($entry)->close();

        if (!$entry) {
            $res->error(404, 'Set list entry not found');
        }

        return $entry;
    }

    /** Normalize a client tag payload; returns null when it carries no usable tag name. */
    private function normalizeTag(mixed $tag): ?array
    {
        $tag = is_object($tag) ? (array)$tag : $tag;
        if (!is_array($tag)) {
            return null;
        }

        $tagName = trim((string)($tag['tagName'] ?? ''));
        if ($tagName === '') {
            return null;
        }

        $key = isset($tag['customKey']) ? trim((string)$tag['customKey']) : '';
        $order = isset($tag['blockOrderName']) ? trim((string)$tag['blockOrderName']) : '';

        return [
            'tagName' => mb_substr($tagName, 0, 100),
            'customKey' => $key === '' ? null : mb_substr($key, 0, 20),
            'blockOrderName' => $order === '' ? null : mb_substr($order, 0, 200),
        ];
    }

    /**
     * Reject block-order names the song does not actually have. Set lists must reuse the
     * existing named orders, so an unknown name is stored as null rather than inventing one.
     */
    private function filterBlockOrderNames(array $tags, int $account, int $songNumber): array
    {
        $stmt = self::prepare('SELECT `order` FROM `songs` WHERE `account` = ? AND `songnumber` = ?');
        $stmt->bind_param('ii', $account, $songNumber)->execute()->fetchOne($song)->close();

        $orders = json_decode($song['order'] ?? '{}', true);
        $known = is_array($orders) ? array_keys($orders) : [];

        foreach ($tags as &$tag) {
            if ($tag['blockOrderName'] !== null && !in_array($tag['blockOrderName'], $known, true)) {
                $tag['blockOrderName'] = null;
            }
        }

        return $tags;
    }

    private function upsertTags(int $entryId, array $tags): void
    {
        foreach ($tags as $tag) {
            $stmt = self::prepare('
                    INSERT INTO `set_list_entry_tags` (`set_list_entry_id`, `tag_name`, `custom_key`, `block_order_name`)
                    VALUES (?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE `custom_key` = VALUES(`custom_key`), `block_order_name` = VALUES(`block_order_name`)
                ');
            $stmt->bind_param('isss', $entryId, $tag['tagName'], $tag['customKey'], $tag['blockOrderName'])
                ->execute()->close();
        }
    }

    private function fetchTags(int $entryId): array
    {
        $stmt = self::prepare('
                SELECT `id`, `tag_name`, `custom_key`, `block_order_name`
                FROM `set_list_entry_tags`
                WHERE `set_list_entry_id` = ?
                ORDER BY `tag_name`
            ');
        $stmt->bind_param('i', $entryId)->execute()->fetchAll($rows)->close();

        return array_map(fn ($r) => [
            'id' => (int)$r['id'],
            'tagName' => $r['tag_name'],
            'customKey' => $r['custom_key'],
            'blockOrderName' => $r['block_order_name'],
        ], $rows);
    }

    protected function post(Request &$req, Response &$res): never
    {
        $req->params->checkNumeric('setListId', 'songNumber');

        $account = $req->account;
        $setListId = $req->params->getAsInt('setListId');
        $songNumber = $req->params->getAsInt('songNumber');

        $stmt = self::prepare('SELECT `id` FROM `set_lists` WHERE `id` = ? AND `account` = ?');
        $stmt->bind_param('ii', $setListId, $account)->execute()->fetchOne($list)->close();
        if (!$list) {
            $res->error(404, 'Set list not found');
        }

        $stmt = self::prepare('SELECT `songnumber` FROM `songs` WHERE `account` = ? AND `songnumber` = ?');
        $stmt->bind_param('ii', $account, $songNumber)->execute()->fetchOne($song)->close();
        if (!$song) {
            $res->error(404, 'Song not found');
        }

        $tags = [];
        foreach ($req->params->getAsArray('tags', []) as $raw) {
            $tag = $this->normalizeTag($raw);
            if ($tag !== null) {
                $tags[] = $tag;
            }
        }
        $tags = $this->filterBlockOrderNames($tags, $account, $songNumber);

        $tx = self::transaction();
        try {
            // One entry per (set list, song) — adding the same song again reuses it.
            $stmt = self::prepare('SELECT `id` FROM `set_list_entries` WHERE `set_list_id` = ? AND `songnumber` = ?');
            $stmt->bind_param('ii', $setListId, $songNumber)->execute()->fetchOne($existing)->close();

            if ($existing) {
                $entryId = (int)$existing['id'];
            } else {
                $stmt = self::prepare('
                        SELECT COALESCE(MAX(`sort_order`), -1) + 1 AS `next`
                        FROM `set_list_entries` WHERE `set_list_id` = ?
                    ');
                $stmt->bind_param('i', $setListId)->execute()->fetchOne($sortRow)->close();
                $sortOrder = (int)($sortRow['next'] ?? 0);

                $stmt = self::prepare('
                        INSERT INTO `set_list_entries` (`set_list_id`, `account`, `songnumber`, `sort_order`)
                        VALUES (?, ?, ?, ?)
                    ');
                $stmt->bind_param('iiii', $setListId, $account, $songNumber, $sortOrder)->execute()->id($newId)->close();
                $entryId = (int)$newId;
            }

            $this->upsertTags($entryId, $tags);
            $tx->commit();
        } catch (\Throwable $e) {
            $tx->rollback();
            $res->error(500, 'Failed to add song to set list: ' . $e->getMessage());
        }

        $res->success([
            'id' => $entryId,
            'setListId' => $setListId,
            'songNumber' => $songNumber,
            'tags' => $this->fetchTags($entryId),
            'created' => !$existing,
        ]);
    }

    protected function put(Request &$req, Response &$res): never
    {
        $req->path->checkNumeric(0);
        $req->params->checkArray('tags');

        $entryId = $req->path->getAsInt(0);
        $account = $req->account;
        $entry = $this->requireEntry($res, $entryId, $account);

        $tags = [];
        foreach ($req->params->getAsArray('tags', []) as $raw) {
            $tag = $this->normalizeTag($raw);
            if ($tag !== null) {
                $tags[] = $tag;
            }
        }
        $tags = $this->filterBlockOrderNames($tags, $account, (int)$entry['songnumber']);

        $keep = array_map(fn ($t) => $t['tagName'], $tags);

        $tx = self::transaction();
        try {
            // Replace semantics: drop assignments the client no longer lists, upsert the rest.
            if (count($keep) === 0) {
                $stmt = self::prepare('DELETE FROM `set_list_entry_tags` WHERE `set_list_entry_id` = ?');
                $stmt->bind_param('i', $entryId)->execute()->close();
            } else {
                $placeholders = implode(',', array_fill(0, count($keep), '?'));
                $stmt = self::prepare(
                    "DELETE FROM `set_list_entry_tags` WHERE `set_list_entry_id` = ? AND `tag_name` NOT IN ({$placeholders})"
                );
                $stmt->bind_param('i' . str_repeat('s', count($keep)), $entryId, ...$keep)->execute()->close();
            }

            $this->upsertTags($entryId, $tags);
            $tx->commit();
        } catch (\Throwable $e) {
            $tx->rollback();
            $res->error(500, 'Failed to update tag assignments: ' . $e->getMessage());
        }

        $res->success([
            'id' => $entryId,
            'songNumber' => (int)$entry['songnumber'],
            'tags' => $this->fetchTags($entryId),
        ]);
    }

    protected function delete(Request &$req, Response &$res): never
    {
        $req->path->checkNumeric(0);
        $entryId = $req->path->getAsInt(0);
        $account = $req->account;
        $this->requireEntry($res, $entryId, $account);

        // Second path segment = remove only that Tag Assignment, keeping the entry.
        $tagName = $req->path->get(1, '', false);
        if ($tagName !== '' && $tagName !== null) {
            $tagName = rawurldecode((string)$tagName);
            $stmt = self::prepare('DELETE FROM `set_list_entry_tags` WHERE `set_list_entry_id` = ? AND `tag_name` = ?');
            $stmt->bind_param('is', $entryId, $tagName)->execute()->close();

            $res->success([
                'id' => $entryId,
                'tags' => $this->fetchTags($entryId),
                'message' => 'Tag assignment removed',
            ]);
        }

        $stmt = self::prepare('DELETE FROM `set_list_entries` WHERE `id` = ?');
        $stmt->bind_param('i', $entryId)->execute()->close();

        $res->success(['message' => 'Song removed from set list']);
    }
}
