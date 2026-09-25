<?php

require_once(__DIR__ . '/RestController.php');

/**
 * The library: saved copies of agenda groups (with their songs, media entries, versions,
 * mappings and playback settings) and of single media entries, to reuse in other shows.
 *
 * An entry is a copy: changing a show never changes the library, and adding an entry to a show
 * copies it again. `data` is read and written whole: `{ group?: ShowGroup, items: ShowItem[] }`.
 *
 * GET    /rest/LibraryEntries        → all entries for the account, newest first
 * POST   /rest/LibraryEntries        → create { kind, name, data }
 * PUT    /rest/LibraryEntries/{id}   → update (partial) { name?, data? }
 * DELETE /rest/LibraryEntries/{id}   → delete
 */
class LibraryEntries extends RestController
{
    private const KINDS = ['group', 'media'];
    /** Generous for a group with many versions and timelines, small enough to keep rows sane. */
    private const MAX_DATA_BYTES = 2000000;

    protected function get(Request &$req, Response &$res): never
    {
        $account = $req->account;

        $stmt = self::prepare('
				SELECT `id`, `kind`, `name`, `data`, `updated_at`
				FROM `library_entries`
				WHERE `account` = ?
				ORDER BY `updated_at` DESC, `name`
			');
        $stmt->bind_param('i', $account)->execute()->fetchAll($rows)->close();

        $entries = [];
        foreach ($rows as $row) {
            $data = json_decode($row['data'] ?? '{}', true);
            $entries[] = [
                'id' => (int)$row['id'],
                'kind' => $row['kind'],
                'name' => $row['name'],
                'data' => is_array($data) ? $data : ['items' => []],
                'updated_at' => $row['updated_at'],
            ];
        }

        $res->success($entries);
    }

    private function encodeData(Response &$res, mixed $data): string
    {
        if (!is_array($data) || !isset($data['items']) || !is_array($data['items'])) {
            $res->error(400, 'A library entry needs items');
        }
        $json = json_encode($data);
        if ($json === false || strlen($json) > self::MAX_DATA_BYTES) {
            $res->error(400, 'Invalid or oversized library entry');
        }
        return $json;
    }

    protected function post(Request &$req, Response &$res): never
    {
        $req->params->check('kind', 'name', 'data');

        $account = $req->account;
        $kind = $req->params->get('kind');
        if (!in_array($kind, self::KINDS, true)) {
            $res->error(400, 'Unknown library entry kind');
        }
        $name = trim($req->params->get('name'));
        if ($name === '') {
            $res->error(400, 'A library entry needs a name');
        }
        $name = mb_substr($name, 0, 200);
        $data = $this->encodeData($res, $req->params->get('data', null, false));

        $stmt = self::prepare('
				INSERT INTO `library_entries` (`account`, `kind`, `name`, `data`)
				VALUES (?, ?, ?, ?)
			');
        $stmt->bind_param('isss', $account, $kind, $name, $data)->execute()->id($id)->close();

        $res->success(['id' => $id, 'message' => 'Library entry created']);
    }

    protected function put(Request &$req, Response &$res): never
    {
        $req->path->checkNumeric(0);
        $id = $req->path->getAsInt(0);
        $account = $req->account;

        $fields = [];
        $types = '';
        $values = [];

        $nameRaw = $req->params->get('name', null, false);
        if ($nameRaw !== null && trim($nameRaw) !== '') {
            $fields[] = '`name` = ?';
            $types .= 's';
            $values[] = mb_substr(trim($nameRaw), 0, 200);
        }
        if ($req->params->provided('data')) {
            $fields[] = '`data` = ?';
            $types .= 's';
            $values[] = $this->encodeData($res, $req->params->get('data', null, false));
        }

        if (count($fields) > 0) {
            $sql = 'UPDATE `library_entries` SET ' . implode(', ', $fields) . ' WHERE `id` = ? AND `account` = ?';
            $types .= 'ii';
            $values[] = $id;
            $values[] = $account;
            self::prepare($sql)->bind_param($types, ...$values)->execute()->close();
        }

        $res->success(['message' => 'Library entry updated', 'id' => $id]);
    }

    protected function delete(Request &$req, Response &$res): never
    {
        $req->path->checkNumeric(0);
        $id = $req->path->getAsInt(0);
        $account = $req->account;

        self::prepare('DELETE FROM `library_entries` WHERE `id` = ? AND `account` = ?')
            ->bind_param('ii', $id, $account)->execute()->close();

        $res->success(['message' => 'Library entry deleted']);
    }
}
