<?php

require_once(__DIR__ . '/RestController.php');
require_once(__DIR__ . '/Song.php');

/**
 * GET  /rest/AccountSettings → returns account-wide settings
 * PUT  /rest/AccountSettings → updates account-wide settings
 */
class AccountSettings extends RestController
{
    protected function get(Request &$req, Response &$res): never
    {
        $account = $req->account;

        $stmt = self::prepare('SELECT `default_style_id`, `show_title_template`, `default_language`, `languages` FROM `account` WHERE `license` = ?');
        $stmt->bind_param('i', $account)->execute()->fetchOne($row)->close();

        $res->success([
            'defaultStyleId' => $row ? (int)$row['default_style_id'] : null,
            'showTitleTemplate' => $row ? ($row['show_title_template'] ?? null) : null,
            'languages' => $this->resolveLanguages($row),
        ]);
    }

    protected function put(Request &$req, Response &$res): never
    {
        $account = $req->account;

        $defaultStyleIdRaw = $req->params->get('defaultStyleId', null, false);
        $showTitleTemplateRaw = $req->params->get('showTitleTemplate', null, false);
        $languagesProvided = $req->params->provided('languages');

        if ($defaultStyleIdRaw === null && $showTitleTemplateRaw === null && !$languagesProvided) {
            $res->error(400, 'No fields to update');
        }

        // The pool every song's language list is picked from. An empty array is a valid
        // value (it falls back to the tags already present in the library), so the write is
        // driven by whether the key was sent, not by whether it holds anything.
        $languages = [];
        if ($languagesProvided) {
            $raw = $req->params->get('languages', [], false);
            $languages = Song::sanitiseLanguages(is_array($raw) ? $raw : []);

            if ($languages === []) {
                $res->error(400, 'At least one language is required');
            }
        }

        // Handle defaultStyleId
        $defaultStyleId = null;
        $updateStyleId = $defaultStyleIdRaw !== null;
        if ($updateStyleId) {
            if ($defaultStyleIdRaw === '' || $defaultStyleIdRaw === false) {
                $defaultStyleId = null;
            } else {
                $defaultStyleId = intval($defaultStyleIdRaw);
                $check = self::prepare('SELECT `id` FROM `styles` WHERE `id` = ? AND `account` = ?');
                $check->bind_param('ii', $defaultStyleId, $account)->execute()->fetchOne($styleRow)->close();
                if (!$styleRow) {
                    $res->error(404, 'Style not found for this account');
                }
            }
        }

        // Handle showTitleTemplate
        $showTitleTemplate = null;
        $updateTemplate = $showTitleTemplateRaw !== null;
        if ($updateTemplate) {
            $showTitleTemplate = is_string($showTitleTemplateRaw) ? trim($showTitleTemplateRaw) : null;
        }

        // Build update query dynamically
        $setParts = [];
        $types = '';
        $values = [];

        if ($updateStyleId) {
            if ($defaultStyleId === null) {
                $setParts[] = '`default_style_id` = NULL';
            } else {
                $setParts[] = '`default_style_id` = ?';
                $types .= 'i';
                $values[] = $defaultStyleId;
            }
        }
        if ($updateTemplate) {
            if ($showTitleTemplate === null || $showTitleTemplate === '') {
                $setParts[] = '`show_title_template` = NULL';
            } else {
                $setParts[] = '`show_title_template` = ?';
                $types .= 's';
                $values[] = $showTitleTemplate;
            }
        }

        if ($languagesProvided) {
            $setParts[] = '`languages` = ?';
            $types .= 's';
            $values[] = json_encode($languages);
            // The first entry is the account default, mirrored into the legacy column.
            $setParts[] = '`default_language` = ?';
            $types .= 's';
            $values[] = $languages[0];
        }

        $sql = 'UPDATE `account` SET ' . implode(', ', $setParts) . ' WHERE `license` = ?';
        $types .= 'i';
        $values[] = $account;

        $stmt = self::prepare($sql);
        if ($types && $values) {
            $stmt->bind_param($types, ...$values);
        }
        $stmt->execute()->close();

        // Re-fetch updated values
        $fetch = self::prepare('SELECT `default_style_id`, `show_title_template`, `default_language`, `languages` FROM `account` WHERE `license` = ?');
        $fetch->bind_param('i', $account)->execute()->fetchOne($updated)->close();

        $res->success([
            'message' => 'Account settings updated',
            'defaultStyleId' => $updated ? ((int)$updated['default_style_id'] ?: null) : null,
            'showTitleTemplate' => $updated ? ($updated['show_title_template'] ?? null) : null,
            'languages' => $this->resolveLanguages($updated),
        ]);
    }

    /**
     * The account's language pool. Accounts that predate the column fall back to the single
     * `default_language` they already had, so the editor always has at least one language
     * to offer instead of an empty picker.
     */
    private function resolveLanguages(?array $row): array
    {
        if (!$row) {
            return ['EN'];
        }

        $languages = Song::decodeLanguages($row['languages'] ?? null);

        if ($languages === []) {
            $languages = Song::sanitiseLanguages([$row['default_language'] ?? 'EN']);
        }

        return $languages === [] ? ['EN'] : $languages;
    }
}
