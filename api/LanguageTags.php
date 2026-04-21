<?php

  require_once(__DIR__ . '/RestController.php');

  /**
   * GET /rest/LanguageTags
   * Returns all distinct language tags found in song blocks, matching lines like "[EN] ..." or "[DE] ...".
   */
  class LanguageTags extends RestController
  {
    protected function get(Request &$req, Response &$res): never
    {
      $account = $req->account;

      $stmt = self::prepare('
            WITH RECURSIVE codes AS (
                SELECT
                    `text`,
                    REGEXP_SUBSTR(`text`, \'\\\\[[A-Za-z]{2,5}\\\\]\') AS code,
                    REGEXP_REPLACE(`text`, \'^.*?\\\\[[A-Za-z]{2,5}\\\\]\', \'\') AS rest
                FROM `blocks`
                WHERE `account` = ?
                  AND `text` REGEXP \'\\\\[[A-Za-z]{2,5}\\\\]\'

                UNION ALL

                SELECT
                    rest AS `text`,
                    REGEXP_SUBSTR(rest, \'\\\\[[A-Za-z]{2,5}\\\\]\') AS code,
                    REGEXP_REPLACE(rest, \'^.*?\\\\[[A-Za-z]{2,5}\\\\]\', \'\') AS rest
                FROM codes
                WHERE rest REGEXP \'\\\\[[A-Za-z]{2,5}\\\\]\'
            )
            SELECT DISTINCT
                UPPER(REPLACE(REPLACE(code, \'[\', \'\'), \']\', \'\')) AS lang_code
            FROM codes
            WHERE code IS NOT NULL AND code <> \'\'
            ORDER BY lang_code
        ');

      $stmt->bind_param('i', $account)->execute();
      $stmt->fetchAll($rows);
      $stmt->close();

      $tags = array_column($rows, 'lang_code');

      if (!in_array('EN', $tags, true)) {
        $tags[] = 'EN';
      }

      $res->success($tags);
    }
  }
