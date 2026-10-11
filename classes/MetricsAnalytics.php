<?php

/** Full-range analytics. The caller supplies an authorized, parameter-bound scope. */
class MetricsAnalytics
{
    public static function metadata(string $field): string
    {
        // All callers use fixed field names, never request input.
        if (!preg_match('/^[a-zA-Z_]+$/', $field)) throw new InvalidArgumentException('Invalid metadata field');
        return "NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(`metadata`), `metadata`, '{}'), '$.{$field}')), ''), 'null')";
    }

    public static function device(): string
    {
        return "NULLIF(" . self::metadata('device_id') . ", 'unknown')";
    }

    public static function numbers(array $rows, array $keys): array
    {
        foreach ($rows as &$row) {
            foreach ($keys as $key) {
                if (array_key_exists($key, $row)) $row[$key] = (int)$row[$key];
            }
        }
        unset($row);
        return $rows;
    }

    /** Date bounds are inclusive; the preceding period has exactly the same duration. */
    public static function previousRange(?string $from, ?string $to): ?array
    {
        if (!$from || !$to) return null;
        $start = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $from, new DateTimeZone('UTC'));
        $end = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $to, new DateTimeZone('UTC'));
        if (!$start || !$end || $start->format('Y-m-d H:i:s') !== $from || $end->format('Y-m-d H:i:s') !== $to || $end < $start) return null;
        $seconds = $end->getTimestamp() - $start->getTimestamp() + 1;
        return ['from' => $start->modify("-{$seconds} seconds")->format('Y-m-d H:i:s'), 'to' => $start->modify('-1 second')->format('Y-m-d H:i:s')];
    }

    /** Cohorts are first active weeks inside the selected range, not first-ever device use. */
    public static function retention(array $weeks, string $observationTo, ?string $observationFrom = null): array
    {
        $byDevice = [];
        foreach ($weeks as $row) $byDevice[$row['device']][] = $row['week'];
        $cohorts = [];
        foreach ($byDevice as $deviceWeeks) {
            sort($deviceWeeks);
            $first = $deviceWeeks[0];
            $cohorts[$first] ??= ['week' => $first, 'size' => 0, 'counts' => []];
            $cohorts[$first]['size']++;
            foreach (array_unique($deviceWeeks) as $week) {
                $offset = (int)round((strtotime($week . ' UTC') - strtotime($first . ' UTC')) / 604800);
                $cohorts[$first]['counts'][$offset] = ($cohorts[$first]['counts'][$offset] ?? 0) + 1;
            }
        }
        ksort($cohorts);
        $result = [];
        foreach ($cohorts as $cohort) {
            $cells = [];
            $available = max(0, (int)floor((strtotime($observationTo . ' UTC') - strtotime($cohort['week'] . ' UTC')) / 604800));
            for ($i = 0; $i <= $available; $i++) {
                $weekEnd = date('Y-m-d', strtotime($cohort['week'] . ' UTC') + ($i + 1) * 604800 - 86400);
                $weekStart = date('Y-m-d', strtotime($cohort['week'] . ' UTC') + $i * 604800);
                $cells[] = ['offset' => $i, 'devices' => $cohort['counts'][$i] ?? 0, 'complete' => $weekEnd <= $observationTo && ($observationFrom === null || $weekStart >= $observationFrom)];
            }
            $result[] = ['week' => $cohort['week'], 'size' => $cohort['size'], 'weeks' => $cells];
        }
        return $result;
    }

    public static function build(callable $query, string $scope, string $types, array $values, ?string $from, ?string $to, string $granularity): array
    {
        $where = $scope;
        $rangeTypes = $types;
        $rangeValues = $values;
        if ($from !== null) { $where .= ' AND `created_at` >= ?'; $rangeTypes .= 's'; $rangeValues[] = $from; }
        if ($to !== null) { $where .= ' AND `created_at` <= ?'; $rangeTypes .= 's'; $rangeValues[] = $to; }
        $select = static fn(string $sql) => $query($sql, $rangeTypes, $rangeValues);
        $device = self::device();
        $numeric = ['events', 'devices', 'accounts', 'errors', 'active_days', 'account', 'weekday', 'hour', 'sessions'];
        $rows = static fn(string $sql) => self::numbers($select($sql), $numeric);
        $bucket = match ($granularity) {
            'week' => 'DATE_SUB(DATE(`created_at`), INTERVAL WEEKDAY(`created_at`) DAY)',
            'month' => "DATE_FORMAT(`created_at`, '%Y-%m-01')",
            default => 'DATE(`created_at`)',
        };
        $summary = [
            'totals' => $rows("SELECT COUNT(*) AS events, COUNT(DISTINCT {$device}) AS devices,
                COUNT(DISTINCT NULLIF(`account`, 0)) AS accounts, COUNT(DISTINCT DATE(`created_at`)) AS active_days,
                SUM(`event` = 'uncaught_error') AS errors FROM `metrics` WHERE {$where}")[0],
            'daily' => $rows("SELECT DATE(`created_at`) AS day, COUNT(*) AS events, COUNT(DISTINCT {$device}) AS devices,
                SUM(`event` = 'uncaught_error') AS errors FROM `metrics` WHERE {$where} GROUP BY DATE(`created_at`) ORDER BY day"),
            'activity' => $rows("SELECT {$bucket} AS day, COUNT(*) AS events, COUNT(DISTINCT {$device}) AS devices,
                SUM(`event` = 'uncaught_error') AS errors FROM `metrics` WHERE {$where} GROUP BY {$bucket} ORDER BY day"),
            'patterns' => $rows("SELECT WEEKDAY(`created_at`) AS weekday, HOUR(`created_at`) AS hour, COUNT(*) AS events
                FROM `metrics` WHERE {$where} GROUP BY weekday, hour ORDER BY weekday, hour"),
            'features' => $rows("SELECT `event`, COUNT(*) AS events, COUNT(DISTINCT {$device}) AS devices,
                COUNT(DISTINCT NULLIF(`account`, 0)) AS accounts FROM `metrics` WHERE {$where} GROUP BY `event` ORDER BY events DESC, `event`"),
            'eventTimeline' => $rows("SELECT {$bucket} AS day, `event`, COUNT(*) AS events FROM `metrics` WHERE {$where}
                GROUP BY {$bucket}, `event` ORDER BY day, `event`"),
            'entities' => $rows("SELECT COALESCE(`entity_type`, 'unknown') AS name, COUNT(*) AS events FROM `metrics` WHERE {$where} GROUP BY `entity_type` ORDER BY events DESC"),
            'accountFeatures' => $rows("SELECT `account`, `event`, COUNT(*) AS events, COUNT(DISTINCT {$device}) AS devices FROM `metrics`
                WHERE {$where} AND `account` <> 0 GROUP BY `account`, `event` ORDER BY `account`, `event`"),
            'accountDaily' => $rows("SELECT DATE(`created_at`) AS day, `account`, COUNT(*) AS events FROM `metrics`
                WHERE {$where} AND `account` <> 0 GROUP BY DATE(`created_at`), `account` ORDER BY day"),
            'accounts' => $rows("SELECT `account`, COUNT(*) AS events, COUNT(DISTINCT {$device}) AS devices,
                SUM(`event` = 'uncaught_error') AS errors, MIN(`created_at`) AS first_seen, MAX(`created_at`) AS last_seen
                FROM `metrics` WHERE {$where} AND `account` <> 0 GROUP BY `account` ORDER BY events DESC, `account`"),
        ];
        $comparison = self::previousRange($from, $to);
        $previousAccounts = [];
        if ($comparison) {
            $previousWhere = $scope . ' AND `created_at` >= ? AND `created_at` <= ?';
            $previousValues = [...$values, $comparison['from'], $comparison['to']];
            $previousAccounts = self::numbers($query("SELECT `account`, COUNT(*) AS events, SUM(`event` = 'uncaught_error') AS errors
                FROM `metrics` WHERE {$previousWhere} AND `account` <> 0 GROUP BY `account`", $types . 'ss', $previousValues), $numeric);
            $comparison['totals'] = self::numbers($query("SELECT COUNT(*) AS events, COUNT(DISTINCT {$device}) AS devices,
                COUNT(DISTINCT NULLIF(`account`, 0)) AS accounts, SUM(`event` = 'uncaught_error') AS errors
                FROM `metrics` WHERE {$previousWhere}", $types . 'ss', $previousValues), $numeric)[0];
        }
        $summary['comparison'] = $comparison;
        $current = array_column($summary['accounts'], null, 'account');
        foreach ($previousAccounts as $row) {
            $current[$row['account']] ??= ['account' => $row['account'], 'events' => 0, 'devices' => 0, 'errors' => 0, 'first_seen' => null, 'last_seen' => null];
            $current[$row['account']]['previous_events'] = $row['events'];
            $current[$row['account']]['previous_errors'] = $row['errors'];
        }
        foreach ($current as &$row) { $row['previous_events'] ??= $comparison ? 0 : null; $row['previous_errors'] ??= $comparison ? 0 : null; }
        unset($row);
        $summary['accounts'] = array_values($current);

        $dimensions = [
            ['song_imported', 'source'], ['song_updated', 'via'], ['song_renumbered', 'ok'],
            ['window_opened', 'name'], ['window_opened', 'displayMode'], ['window_opened', 'fullscreen'],
            ['musician_button_clicked', 'button'], ['musician_button_clicked', 'value'], ['musician_layer_action', 'action'],
            ['musician_edit_tool_used', 'tool'], ['modal_opened', 'modal'], ['uncaught_error', 'source'],
        ];
        $parts = [];
        foreach ($dimensions as [$event, $field]) {
            $expr = self::metadata($field);
            $parts[] = "SELECT '{$event}' AS event, '{$field}' AS field, COALESCE({$expr}, 'unknown') AS name, COUNT(*) AS events
                FROM filtered WHERE `event` = '{$event}' GROUP BY {$expr}";
        }
        $width = self::metadata('width'); $height = self::metadata('height');
        $parts[] = "SELECT 'window_opened' AS event, 'resolution' AS field, COALESCE(CONCAT({$width}, '×', {$height}), 'unknown') AS name,
            COUNT(*) AS events FROM filtered WHERE `event` = 'window_opened' GROUP BY name";
        $summary['dimensions'] = $rows("WITH filtered AS (SELECT `event`, `metadata` FROM `metrics` WHERE {$where}) " . implode(' UNION ALL ', $parts));
        $title = self::metadata('title');
        $summary['topEntities'] = $rows("SELECT `account`, `event`, `entity_id`, MAX({$title}) AS title, COUNT(*) AS events FROM `metrics`
            WHERE {$where} AND `entity_id` IS NOT NULL AND `event` IN ('song_selected', 'show_loaded', 'setting_changed')
            GROUP BY `account`, `event`, `entity_id` ORDER BY events DESC, `account`, `entity_id`");
        $value = self::metadata('value');
        $summary['settingValues'] = $rows("WITH ranked AS (
            SELECT `account`, `entity_id`, {$value} AS value,
                ROW_NUMBER() OVER (PARTITION BY `account`, `entity_id`, {$device} ORDER BY `created_at` DESC, `id` DESC) AS rownum
            FROM `metrics` WHERE {$where} AND `event` = 'setting_changed' AND {$device} IS NOT NULL
        ) SELECT `entity_id` AS setting, COALESCE(value, 'unknown') AS name, COUNT(*) AS devices FROM ranked
            WHERE rownum = 1 GROUP BY `entity_id`, value ORDER BY devices DESC");

        $serverToday = $query('SELECT CURRENT_DATE AS day', '', [])[0]['day'];
        $lastDay = $to ? substr($to, 0, 10) : $serverToday;
        $observationTo = min($lastDay, $serverToday);
        $deviceWeeks = $select("SELECT {$device} AS device, DATE_SUB(DATE(`created_at`), INTERVAL WEEKDAY(`created_at`) DAY) AS week
            FROM `metrics` WHERE {$where} AND {$device} IS NOT NULL GROUP BY device, week ORDER BY week");
        $summary['retention'] = self::retention($deviceWeeks, $observationTo, $from ? substr($from, 0, 10) : null);
        $summary['observationTo'] = $observationTo;

        $source = self::metadata('source'); $message = self::metadata('message');
        $summary['reliability'] = [
            'affected_devices' => $rows("SELECT COUNT(DISTINCT {$device}) AS devices FROM `metrics` WHERE {$where} AND `event` = 'uncaught_error'")[0]['devices'],
            'daily' => $rows("SELECT DATE(`created_at`) AS day, COUNT(*) AS errors, COUNT(DISTINCT {$device}) AS devices
                FROM `metrics` WHERE {$where} AND `event` = 'uncaught_error' GROUP BY DATE(`created_at`) ORDER BY day"),
            'issues' => $rows("SELECT COALESCE({$source}, 'unknown') AS source, COALESCE(LEFT({$message}, 240), 'unknown') AS message,
                COUNT(*) AS events, COUNT(DISTINCT {$device}) AS devices, COUNT(DISTINCT NULLIF(`account`, 0)) AS accounts,
                MIN(`created_at`) AS first_seen, MAX(`created_at`) AS last_seen
                FROM `metrics` WHERE {$where} AND `event` = 'uncaught_error' GROUP BY source, message ORDER BY events DESC, source, message"),
        ];
        $session = self::metadata('session_id'); $previous = self::metadata('workflow_previous');
        $flowEvents = "'show_loaded', 'song_selected', 'block_navigated', 'window_opened', 'presentation_opened'";
        $sessionKey = "CONCAT(`account`, ':', {$device}, ':', {$session})";
        $summary['workflow'] = [
            'coverage' => $rows("SELECT COUNT(*) AS events, SUM({$session} IS NOT NULL AND {$device} IS NOT NULL) AS tracked,
                COUNT(DISTINCT {$sessionKey}) AS sessions FROM `metrics` WHERE {$where} AND `event` IN ({$flowEvents})")[0],
            'transitions' => $rows("SELECT {$previous} AS source, `event` AS target, COUNT(*) AS events, COUNT(DISTINCT {$sessionKey}) AS sessions
                FROM `metrics` WHERE {$where} AND {$session} IS NOT NULL AND {$device} IS NOT NULL
                AND `event` IN ({$flowEvents}) AND {$previous} IN ({$flowEvents})
                GROUP BY source, target ORDER BY events DESC, source, target"),
        ];
        $summary['workflow']['coverage']['tracked'] = (int)($summary['workflow']['coverage']['tracked'] ?? 0);
        return $summary;
    }
}
