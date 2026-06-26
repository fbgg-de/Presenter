<?php

require_once(__DIR__ . '/RestController.php');
require_once(__DIR__ . '/../config.php');

/**
 * SongRenumber — change a custom song's number to its CCLI id, migrating every reference:
 * the song row, its blocks, PDF area-mappings, PDF annotations, every show's order JSON, and
 * the on-disk PDF folder. The `ccli_number` column is set to the new number too.
 *
 *   POST /rest/SongRenumber  body { oldNumber, newNumber }
 */
class SongRenumber extends RestController
{
    protected function post(Request &$req, Response &$res): never
    {
        $req->params->checkNumeric('oldNumber')->checkNumeric('newNumber');

        $account = $req->account;
        $old     = $req->params->getAsInt('oldNumber');
        $new     = $req->params->getAsInt('newNumber');

        if ($new <= 0 || $new === $old) {
            $res->error(400, 'Please enter a valid CCLI number');
        }
        // Only custom songs can be promoted; a real CCLI song already carries its number.
        if ($old >= CUSTOM_NUMBER_LIMIT) {
            $res->error(400, 'Only custom songs can be assigned a CCLI number');
        }
        if ($new < CUSTOM_NUMBER_LIMIT) {
            $res->error(400, 'A CCLI number must be ' . CUSTOM_NUMBER_LIMIT . ' or higher');
        }

        // Source must exist; target number must be free.
        $srcRow = null;
        self::prepare('SELECT `songnumber` FROM `songs` WHERE `account` = ? AND `songnumber` = ?')
            ->bind_param('ii', $account, $old)->execute()->fetchOne($srcRow)->close();
        if (!$srcRow) {
            $res->error(404, 'Song #' . $old . ' was not found');
        }
        $clashRow = null;
        self::prepare('SELECT `songnumber` FROM `songs` WHERE `account` = ? AND `songnumber` = ?')
            ->bind_param('ii', $account, $new)->execute()->fetchOne($clashRow)->close();
        if ($clashRow) {
            $res->error(409, 'A song with number ' . $new . ' already exists in your library');
        }

        $newStr = (string)$new;
        $tx = self::transaction();
        try {
            // 1. Copy the song to the new number (so child rows have a valid parent to point at),
            //    setting the CCLI number as well.
            self::prepare(
                'INSERT INTO `songs`
                    (`account`, `songnumber`, `title`, `authors`, `copyright`, `ccli_number`,
                     `song_key`, `initialOrder`, `order`, `background`, `css`, `style_id`)
                 SELECT `account`, ?, `title`, `authors`, `copyright`, ?,
                        `song_key`, `initialOrder`, `order`, `background`, `css`, `style_id`
                 FROM `songs` WHERE `account` = ? AND `songnumber` = ?'
            )->bind_param('isii', $new, $newStr, $account, $old)->execute()->close();

            // 2. Move all child references to the new number.
            foreach (['blocks', 'pdf_area_mappings', 'pdf_annotations'] as $table) {
                self::prepare("UPDATE `{$table}` SET `songnumber` = ? WHERE `account` = ? AND `songnumber` = ?")
                    ->bind_param('iii', $new, $account, $old)->execute()->close();
            }

            // 3. Delete the old song row (its children were moved, so nothing cascades).
            self::prepare('DELETE FROM `songs` WHERE `account` = ? AND `songnumber` = ?')
                ->bind_param('ii', $account, $old)->execute()->close();

            // 4. Rewrite the song number inside every show's order JSON.
            $showsUpdated = $this->updateShowsOrder($account, $old, $new);

            $tx->commit();
        } catch (\Throwable $e) {
            $tx->rollback();
            $res->error(500, 'Failed to renumber song: ' . $e->getMessage());
        }

        // 5. Move the song's PDFs on disk (best-effort; outside the DB transaction).
        $this->movePdfDir($account, $old, $new);

        $res->success([
            'message'      => 'Song renumbered from ' . $old . ' to ' . $new,
            'oldNumber'    => $old,
            'newNumber'    => $new,
            'showsUpdated' => $showsUpdated ?? 0,
        ]);
    }

    /** Replace the song number inside every show's order JSON. Returns how many shows changed. */
    private function updateShowsOrder(int $account, int $old, int $new): int
    {
        $rows = [];
        self::prepare('SELECT `title`, `order` FROM `shows` WHERE `account` = ?')
            ->bind_param('i', $account)->execute()->fetchAll($rows)->close();

        $updated = 0;
        foreach ($rows as $row) {
            $order = json_decode($row['order'] ?? '', true);
            if (!is_array($order)) {
                continue;
            }
            $changed = false;
            foreach ($order as &$item) {
                if (is_array($item) && ($item['type'] ?? null) === 'song' && (int)($item['songNumber'] ?? 0) === $old) {
                    $item['songNumber'] = $new;
                    $changed = true;
                } elseif (is_numeric($item) && (int)$item === $old) {
                    $item = $new; // legacy numeric order format
                    $changed = true;
                }
            }
            unset($item);
            if ($changed) {
                $json  = json_encode($order);
                $title = $row['title'];
                self::prepare('UPDATE `shows` SET `order` = ? WHERE `account` = ? AND `title` = ?')
                    ->bind_param('sis', $json, $account, $title)->execute()->close();
                $updated++;
            }
        }
        return $updated;
    }

    /** Rename the song's PDF storage folder to follow the new number. */
    private function movePdfDir(int $account, int $old, int $new): void
    {
        $base = __DIR__ . '/../data/' . $account . '/pdfs/';
        $from = $base . $old;
        $to   = $base . $new;
        if (is_dir($from) && !is_dir($to)) {
            @rename($from, $to);
        }
    }
}
