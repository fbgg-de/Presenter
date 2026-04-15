<?php

/**
 * migrate.php — Database migration script for Presenter.
 *
 * Usage:
 *   php migrate.php              Run all pending migrations
 *   php migrate.php --dry-run    Preview changes without applying
 *   php migrate.php --status     Show current schema version
 *
 * This script upgrades an existing Presenter database from a legacy schema
 * to the current schema defined in install.sql. It is idempotent — running
 * it multiple times is safe.
 */

require_once(__DIR__ . '/config.php');

$dryRun = in_array('--dry-run', $argv ?? []);
$statusOnly = in_array('--status', $argv ?? []);

echo "Presenter Database Migration\n";
echo "=============================\n";

if ($dryRun) {
    echo "** DRY RUN MODE — no changes will be applied **\n";
}
echo "\n";

// Connect to database
$db = new mysqli(DB_HOST, DB_USER, DB_PASSWORD, DB_DATABASE);
if ($db->connect_error) {
    die("Connection failed: " . $db->connect_error . "\n");
}

$db->set_charset('utf8mb4');

// Ensure schema_version table exists
$db->query("
    CREATE TABLE IF NOT EXISTS `schema_version` (
        `version` INT NOT NULL,
        `description` VARCHAR(500) NOT NULL,
        `applied_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`version`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

// Get current version
$result = $db->query("SELECT MAX(`version`) AS v FROM `schema_version`");
$row = $result->fetch_assoc();
$currentVersion = intval($row['v'] ?? 0);

echo "Current schema version: {$currentVersion}\n\n";

if ($statusOnly) {
    $result = $db->query("SELECT * FROM `schema_version` ORDER BY `version`");
    while ($row = $result->fetch_assoc()) {
        echo "  v{$row['version']}  {$row['description']}  ({$row['applied_at']})\n";
    }
    $db->close();
    exit(0);
}

// Define migrations
$migrations = [
    1 => [
        'description' => 'Add styles table and style_window_overrides',
        'up' => function (mysqli $db) {
            if (!tableExists($db, 'styles')) {
                $db->query("
                    CREATE TABLE `styles` (
                        `id` INT AUTO_INCREMENT PRIMARY KEY,
                        `account` INT NOT NULL,
                        `name` VARCHAR(200) NOT NULL,
                        `enabled` TINYINT(1) DEFAULT 1,
                        `data` JSON NOT NULL,
                        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY `uk_styles_account_name` (`account`, `name`),
                        CONSTRAINT `fk_styles_account` FOREIGN KEY (`account`)
                            REFERENCES `account` (`license`) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
                ");
                echo "    Created table: styles\n";
            }
            if (!tableExists($db, 'style_window_overrides')) {
                $db->query("
                    CREATE TABLE `style_window_overrides` (
                        `id` INT AUTO_INCREMENT PRIMARY KEY,
                        `style_id` INT NOT NULL,
                        `window_name` VARCHAR(200) NOT NULL,
                        `override_style_id` INT NOT NULL,
                        UNIQUE KEY `uk_swo` (`style_id`, `window_name`),
                        CONSTRAINT `fk_swo_style` FOREIGN KEY (`style_id`)
                            REFERENCES `styles` (`id`) ON DELETE CASCADE,
                        CONSTRAINT `fk_swo_override` FOREIGN KEY (`override_style_id`)
                            REFERENCES `styles` (`id`) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
                ");
                echo "    Created table: style_window_overrides\n";
            }
        },
    ],

    2 => [
        'description' => 'Add metrics table',
        'up' => function (mysqli $db) {
            if (!tableExists($db, 'metrics')) {
                $db->query("
                    CREATE TABLE `metrics` (
                        `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
                        `account` INT NOT NULL,
                        `user_sub` VARCHAR(200) DEFAULT NULL,
                        `event` VARCHAR(100) NOT NULL,
                        `entity_type` VARCHAR(50) DEFAULT NULL,
                        `entity_id` VARCHAR(200) DEFAULT NULL,
                        `metadata` JSON DEFAULT NULL,
                        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        INDEX `idx_metrics_account` (`account`),
                        INDEX `idx_metrics_event` (`event`),
                        INDEX `idx_metrics_created` (`created_at`),
                        CONSTRAINT `fk_metrics_account` FOREIGN KEY (`account`)
                            REFERENCES `account` (`license`) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
                ");
                echo "    Created table: metrics\n";
            }
        },
    ],

    3 => [
        'description' => 'Add show_item_types table',
        'up' => function (mysqli $db) {
            if (!tableExists($db, 'show_item_types')) {
                $db->query("
                    CREATE TABLE `show_item_types` (
                        `id` INT AUTO_INCREMENT PRIMARY KEY,
                        `account` INT NOT NULL,
                        `type_key` VARCHAR(50) NOT NULL,
                        `label` VARCHAR(100) NOT NULL,
                        `color` VARCHAR(20) NOT NULL DEFAULT '#1976d2',
                        `icon` VARCHAR(50) NOT NULL DEFAULT 'MusicNote',
                        `is_default` TINYINT(1) DEFAULT 0,
                        UNIQUE KEY `uk_sit_account_type` (`account`, `type_key`),
                        CONSTRAINT `fk_sit_account` FOREIGN KEY (`account`)
                            REFERENCES `account` (`license`) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
                ");
                echo "    Created table: show_item_types\n";
            }
        },
    ],

    4 => [
        'description' => 'Add new columns to account table',
        'up' => function (mysqli $db) {
            if (!columnExists($db, 'account', 'active')) {
                $db->query("ALTER TABLE `account` ADD COLUMN `active` TINYINT(1) NOT NULL DEFAULT 1");
                echo "    Added column: account.active\n";
            }
            if (!columnExists($db, 'account', 'name')) {
                $db->query("ALTER TABLE `account` ADD COLUMN `name` VARCHAR(200) DEFAULT NULL");
                echo "    Added column: account.name\n";
            }
            if (!columnExists($db, 'account', 'created_at')) {
                $db->query("ALTER TABLE `account` ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP");
                echo "    Added column: account.created_at\n";
            }
            if (!columnExists($db, 'account', 'lastactivity')) {
                $db->query("ALTER TABLE `account` ADD COLUMN `lastactivity` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP");
                echo "    Added column: account.lastactivity\n";
            }
            if (!columnExists($db, 'account', 'default_style_id')) {
                $db->query("ALTER TABLE `account` ADD COLUMN `default_style_id` INT DEFAULT NULL");
                echo "    Added column: account.default_style_id\n";
            }
            if (!columnExists($db, 'account', 'default_language')) {
                $db->query("ALTER TABLE `account` ADD COLUMN `default_language` VARCHAR(10) DEFAULT 'EN'");
                echo "    Added column: account.default_language\n";
            }
            if (!columnExists($db, 'account', 'show_title_template')) {
                $db->query("ALTER TABLE `account` ADD COLUMN `show_title_template` VARCHAR(200) DEFAULT 'Show {dd}.{MM}.{yyyy}'");
                echo "    Added column: account.show_title_template\n";
            }
            if (!columnExists($db, 'account', 'window_names')) {
                $db->query("ALTER TABLE `account` ADD COLUMN `window_names` JSON DEFAULT NULL");
                echo "    Added column: account.window_names\n";
            }
            if (!columnExists($db, 'account', 'musician_names')) {
                $db->query("ALTER TABLE `account` ADD COLUMN `musician_names` JSON DEFAULT NULL");
                echo "    Added column: account.musician_names\n";
            }
        },
    ],

    5 => [
        'description' => 'Add style_id to songs and shows tables',
        'up' => function (mysqli $db) {
            if (!columnExists($db, 'songs', 'style_id')) {
                $db->query("ALTER TABLE `songs` ADD COLUMN `style_id` INT DEFAULT NULL");
                echo "    Added column: songs.style_id\n";
            }
            if (!columnExists($db, 'songs', 'song_key')) {
                $db->query("ALTER TABLE `songs` ADD COLUMN `song_key` VARCHAR(10) DEFAULT NULL");
                echo "    Added column: songs.song_key\n";
            }
            if (!columnExists($db, 'songs', 'ccli_number')) {
                $db->query("ALTER TABLE `songs` ADD COLUMN `ccli_number` VARCHAR(50) DEFAULT NULL");
                echo "    Added column: songs.ccli_number\n";
            }
            if (!columnExists($db, 'shows', 'style_id')) {
                $db->query("ALTER TABLE `shows` ADD COLUMN `style_id` INT DEFAULT NULL");
                echo "    Added column: shows.style_id\n";
            }
        },
    ],

    6 => [
        'description' => 'Add OIDC providers tables',
        'up' => function (mysqli $db) {
            if (!tableExists($db, 'oidc_providers')) {
                $db->query("
                    CREATE TABLE `oidc_providers` (
                        `id` INT(11) NOT NULL AUTO_INCREMENT,
                        `name` VARCHAR(200) NOT NULL,
                        `discovery_url` VARCHAR(500) NOT NULL,
                        `client_id` VARCHAR(300) NOT NULL,
                        `client_secret` VARCHAR(300) NOT NULL,
                        `scopes` VARCHAR(300) NOT NULL DEFAULT 'openid email profile',
                        `required_group` VARCHAR(200) DEFAULT NULL,
                        `enabled` TINYINT(1) NOT NULL DEFAULT 1,
                        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (`id`),
                        UNIQUE KEY `uk_oidc_providers_name` (`name`)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
                ");
                echo "    Created table: oidc_providers\n";
            }
            if (!tableExists($db, 'account_oidc_providers')) {
                $db->query("
                    CREATE TABLE `account_oidc_providers` (
                        `license` INT(11) NOT NULL,
                        `provider_id` INT(11) NOT NULL,
                        `is_default` TINYINT(1) NOT NULL DEFAULT 0,
                        PRIMARY KEY (`license`, `provider_id`),
                        KEY `fk_aop_provider` (`provider_id`),
                        CONSTRAINT `fk_aop_account` FOREIGN KEY (`license`) REFERENCES `account` (`license`) ON DELETE CASCADE,
                        CONSTRAINT `fk_aop_provider` FOREIGN KEY (`provider_id`) REFERENCES `oidc_providers` (`id`) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
                ");
                echo "    Created table: account_oidc_providers\n";
            }
        },
    ],

    7 => [
        'description' => 'Insert default show_item_types for existing accounts',
        'up' => function (mysqli $db) {
            $result = $db->query("SELECT `license` FROM `account`");
            while ($row = $result->fetch_assoc()) {
                $license = intval($row['license']);
                // Check if already has entries
                $check = $db->query("SELECT COUNT(*) AS c FROM `show_item_types` WHERE `account` = {$license}");
                $count = intval($check->fetch_assoc()['c']);
                if ($count === 0) {
                    $db->query("INSERT INTO `show_item_types` (`account`, `type_key`, `label`, `color`, `icon`, `is_default`) VALUES
                        ({$license}, 'song', 'Song', '#1976d2', 'MusicNote', 1),
                        ({$license}, 'media', 'Media', '#f9a825', 'Image', 1),
                        ({$license}, 'bible_verse', 'Bible Verse', '#388e3c', 'MenuBook', 1)
                    ");
                    echo "    Inserted default show_item_types for account {$license}\n";
                }
            }
        },
    ],

    8 => [
        'description' => 'Migrate songs.order from comma-separated to JSON orders map',
        'up' => function (mysqli $db) {
            // Check if songs table has 'order' column as TEXT/VARCHAR (legacy format)
            $result = $db->query("SHOW COLUMNS FROM `songs` LIKE 'order'");
            if ($result->num_rows === 0) {
                echo "    No 'order' column found in songs table — skipping.\n";
                return;
            }
            $col = $result->fetch_assoc();
            $colType = strtolower($col['Type'] ?? '');

            // Skip if already JSON type
            if (strpos($colType, 'json') !== false) {
                echo "    songs.order is already JSON — skipping data conversion.\n";
                return;
            }

            // Read all songs and convert
            $songs = $db->query("SELECT `account`, `songnumber`, `order` FROM `songs`");
            $converted = 0;
            while ($row = $songs->fetch_assoc()) {
                $oldOrder = $row['order'] ?? '';
                if (empty($oldOrder)) {
                    continue;
                }

                // Try to parse as JSON first (might already be migrated)
                $parsed = json_decode($oldOrder, true);
                if (is_array($parsed) && isset($parsed['Default'])) {
                    continue; // Already in new format
                }

                // Legacy format: comma-separated block names
                $blockNames = array_map('trim', explode(',', $oldOrder));
                $blockNames = array_filter($blockNames, fn ($b) => $b !== '');
                $newOrders = json_encode(['Default' => array_values($blockNames)]);

                $stmt = $db->prepare("UPDATE `songs` SET `order` = ? WHERE `account` = ? AND `songnumber` = ?");
                $stmt->bind_param('sii', $newOrders, $row['account'], $row['songnumber']);
                $stmt->execute();
                $stmt->close();
                $converted++;
            }
            echo "    Converted {$converted} songs.order entries to JSON format.\n";

            // Alter column type to JSON if it was TEXT
            if (strpos($colType, 'json') === false) {
                // Ensure all NULL/empty values are valid JSON before altering
                $db->query("UPDATE `songs` SET `order` = '{\"Default\":[]}' WHERE `order` IS NULL OR TRIM(`order`) = ''");
                $db->query("ALTER TABLE `songs` MODIFY COLUMN `order` JSON NOT NULL");
                echo "    Changed songs.order column type to JSON.\n";
            }
        },
    ],

    9 => [
        'description' => 'Migrate shows.order from number array to typed ShowItem array',
        'up' => function (mysqli $db) {
            // First check the column type
            $colResult = $db->query("SHOW COLUMNS FROM `shows` LIKE 'order'");
            if ($colResult->num_rows === 0) {
                echo "    No 'order' column found in shows table — skipping.\n";
                return;
            }
            $colInfo = $colResult->fetch_assoc();
            $colType = strtolower($colInfo['Type'] ?? '');
            $isAlreadyJson = (strpos($colType, 'json') !== false);

            echo "    shows.order column type: {$colType}\n";

            // Read all shows — use CAST to ensure we get the raw string value
            $shows = $db->query("SELECT `account`, `title`, CAST(`order` AS CHAR) AS `order_raw` FROM `shows`");
            if (!$shows) {
                throw new Exception("Failed to read shows: " . $db->error);
            }
            $converted = 0;
            $errors = 0;
            while ($row = $shows->fetch_assoc()) {
                $oldOrder = trim($row['order_raw'] ?? '');
                $account = intval($row['account']);
                $title = $row['title'];

                if (empty($oldOrder)) {
                    // Set empty rows to valid JSON
                    $stmt = $db->prepare("UPDATE `shows` SET `order` = '[]' WHERE `account` = ? AND `title` = ?");
                    $stmt->bind_param('is', $account, $title);
                    $stmt->execute();
                    $stmt->close();
                    continue;
                }

                // Try to parse as JSON first
                $parsed = json_decode($oldOrder, true);

                // Case 1: Valid JSON array of objects with 'type' key — already migrated
                if (is_array($parsed) && count($parsed) > 0 && isset($parsed[0]['type'])) {
                    continue;
                }

                // Case 2: Valid JSON array of numbers [101, 102, 103]
                if (is_array($parsed) && count($parsed) > 0 && !isset($parsed[0]['type'])) {
                    $newOrder = [];
                    foreach ($parsed as $item) {
                        if (is_int($item) || is_numeric($item)) {
                            $newOrder[] = [
                                'type' => 'song',
                                'songNumber' => intval($item),
                                'order' => 'Default',
                            ];
                        }
                    }
                    $newJson = json_encode($newOrder);
                    $stmt = $db->prepare("UPDATE `shows` SET `order` = ? WHERE `account` = ? AND `title` = ?");
                    $stmt->bind_param('sis', $newJson, $account, $title);
                    if (!$stmt->execute()) {
                        echo "    WARNING: Failed to update show \"{$title}\": {$stmt->error}\n";
                        $errors++;
                    } else {
                        $converted++;
                    }
                    $stmt->close();
                    continue;
                }

                // Case 3: Empty JSON array
                if (is_array($parsed) && count($parsed) === 0) {
                    continue; // Already valid JSON
                }

                // Case 4: Comma-separated number string "7134466,6271093,6335953"
                // Also handles single numbers
                $trimmed = trim($oldOrder, " \t\n\r\0\x0B\"'");
                if (preg_match('/^\d+(\s*,\s*\d+)*$/', $trimmed)) {
                    $numbers = array_map('trim', explode(',', $trimmed));
                    $newOrder = [];
                    foreach ($numbers as $num) {
                        if (is_numeric($num) && $num !== '') {
                            $newOrder[] = [
                                'type' => 'song',
                                'songNumber' => intval($num),
                                'order' => 'Default',
                            ];
                        }
                    }
                    $newJson = json_encode($newOrder);
                    $stmt = $db->prepare("UPDATE `shows` SET `order` = ? WHERE `account` = ? AND `title` = ?");
                    $stmt->bind_param('sis', $newJson, $account, $title);
                    if (!$stmt->execute()) {
                        echo "    WARNING: Failed to update show \"{$title}\": {$stmt->error}\n";
                        $errors++;
                    } else {
                        $converted++;
                    }
                    $stmt->close();
                    continue;
                }

                // Case 5: Unrecognized format — convert to empty array to prevent ALTER failure
                echo "    WARNING: Unrecognized format for show \"{$title}\": {$oldOrder}\n";
                $stmt = $db->prepare("UPDATE `shows` SET `order` = '[]' WHERE `account` = ? AND `title` = ?");
                $stmt->bind_param('is', $account, $title);
                $stmt->execute();
                $stmt->close();
                $errors++;
            }
            echo "    Converted {$converted} shows.order entries to typed ShowItem format.\n";
            if ($errors > 0) {
                echo "    {$errors} entries had issues (see warnings above).\n";
            }

            // Alter column type to JSON if not already
            if (!$isAlreadyJson) {
                // Final safety: ensure ALL remaining NULL/empty values are valid JSON
                $db->query("UPDATE `shows` SET `order` = '[]' WHERE `order` IS NULL OR TRIM(CAST(`order` AS CHAR)) = ''");

                // Verify all rows are valid JSON before ALTER
                $check = $db->query("SELECT `account`, `title`, CAST(`order` AS CHAR) AS `order_raw` FROM `shows` WHERE JSON_VALID(`order`) = 0");
                if ($check && $check->num_rows > 0) {
                    echo "    Found {$check->num_rows} rows with invalid JSON — fixing...\n";
                    while ($bad = $check->fetch_assoc()) {
                        $rawVal = $bad['order_raw'] ?? '';
                        echo "    Fixing show \"{$bad['title']}\": {$rawVal}\n";
                        // Try comma-separated as a last resort
                        $trimmed2 = trim($rawVal, " \t\n\r\0\x0B\"'");
                        if (preg_match('/^\d+(\s*,\s*\d+)*$/', $trimmed2)) {
                            $nums = array_map('trim', explode(',', $trimmed2));
                            $items = [];
                            foreach ($nums as $n) {
                                if (is_numeric($n) && $n !== '') {
                                    $items[] = ['type' => 'song', 'songNumber' => intval($n), 'order' => 'Default'];
                                }
                            }
                            $fixJson = json_encode($items);
                        } else {
                            $fixJson = '[]';
                        }
                        $fixStmt = $db->prepare("UPDATE `shows` SET `order` = ? WHERE `account` = ? AND `title` = ?");
                        $fixStmt->bind_param('sis', $fixJson, $bad['account'], $bad['title']);
                        $fixStmt->execute();
                        $fixStmt->close();
                    }
                }

                $db->query("ALTER TABLE `shows` MODIFY COLUMN `order` JSON NOT NULL");
                if ($db->error) {
                    throw new Exception("ALTER TABLE failed: " . $db->error);
                }
                echo "    Changed shows.order column type to JSON.\n";
            }
        },
    ],

    10 => [
        'description' => 'Add FK constraints for style_id on account, songs, shows',
        'up' => function (mysqli $db) {
            // account.default_style_id FK
            if (!fkExists($db, 'account', 'fk_account_style')) {
                $db->query("ALTER TABLE `account` ADD CONSTRAINT `fk_account_style` FOREIGN KEY (`default_style_id`) REFERENCES `styles` (`id`) ON DELETE SET NULL");
                echo "    Added FK: account.fk_account_style\n";
            }
            // songs.style_id FK
            if (!fkExists($db, 'songs', 'fk_songs_style')) {
                $db->query("ALTER TABLE `songs` ADD CONSTRAINT `fk_songs_style` FOREIGN KEY (`style_id`) REFERENCES `styles` (`id`) ON DELETE SET NULL");
                echo "    Added FK: songs.fk_songs_style\n";
            }
            // shows.style_id FK
            if (!fkExists($db, 'shows', 'fk_shows_style')) {
                $db->query("ALTER TABLE `shows` ADD CONSTRAINT `fk_shows_style` FOREIGN KEY (`style_id`) REFERENCES `styles` (`id`) ON DELETE SET NULL");
                echo "    Added FK: shows.fk_shows_style\n";
            }
        },
    ],

    11 => [
        'description' => 'Fix blocks table FK to reference songs instead of account',
        'up' => function (mysqli $db) {
            // Drop the incorrect single-column FK if it exists
            if (fkExists($db, 'blocks', 'fk_blocks_account')) {
                $db->query("ALTER TABLE `blocks` DROP FOREIGN KEY `fk_blocks_account`");
                echo "    Dropped FK: blocks.fk_blocks_account\n";
            }
            // Add the correct composite FK to songs(account, songnumber)
            if (!fkExists($db, 'blocks', 'fk_blocks_song')) {
                $db->query("ALTER TABLE `blocks` ADD CONSTRAINT `fk_blocks_song` FOREIGN KEY (`account`, `songnumber`) REFERENCES `songs` (`account`, `songnumber`) ON DELETE CASCADE");
                echo "    Added FK: blocks.fk_blocks_song\n";
            }
        },
    ],

    12 => [
        'description' => 'Add pdf_area_mappings table for storing block-to-PDF-region mappings',
        'up' => function (mysqli $db) {
            if (!tableExists($db, 'pdf_area_mappings')) {
                $db->query("
                    CREATE TABLE `pdf_area_mappings` (
                        `id` INT AUTO_INCREMENT PRIMARY KEY,
                        `account` INT NOT NULL,
                        `songnumber` INT NOT NULL,
                        `filename` VARCHAR(300) NOT NULL,
                        `musician_name` VARCHAR(200) NOT NULL DEFAULT '_',
                        `mappings` JSON NOT NULL,
                        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY `uk_pam` (`account`, `songnumber`, `filename`, `musician_name`),
                        CONSTRAINT `fk_pam_account` FOREIGN KEY (`account`)
                            REFERENCES `account` (`license`) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
                ");
                echo "    Created table: pdf_area_mappings\n";
            }
        },
    ],
    13 => [
        'description' => 'Add pdf_annotations table (one-row-per-annotation with normalized columns)',
        'up' => function (mysqli $db) {
            // Drop any previous layer-based version of the table (idempotent)
            $db->query("DROP TABLE IF EXISTS `pdf_annotations`");
            // Create per-annotation table
            $db->query("
                CREATE TABLE `pdf_annotations` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `account` INT NOT NULL,
                    `songnumber` INT NOT NULL,
                    `filename` VARCHAR(300) NOT NULL,
                    `layer` VARCHAR(200) NOT NULL,
                    `tool` VARCHAR(20) NOT NULL,
                    `page` INT NOT NULL,
                    `x` DOUBLE NOT NULL,
                    `y` DOUBLE NOT NULL,
                    `color` VARCHAR(20) NOT NULL DEFAULT '#ff0000',
                    `opacity` DOUBLE NOT NULL DEFAULT 1.0,
                    `sort_order` INT NOT NULL DEFAULT 0,
                    `data` JSON NOT NULL,
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX `idx_pa_layer_order` (`account`, `songnumber`, `filename`, `layer`, `sort_order`),
                    CONSTRAINT `fk_pa_account` FOREIGN KEY (`account`)
                        REFERENCES `account` (`license`) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
            ");
            echo "    Created table: pdf_annotations (one-row-per-annotation)\n";
        },
    ],
];

// Apply pending migrations
$applied = 0;
foreach ($migrations as $version => $migration) {
    if ($version <= $currentVersion) {
        continue;
    }

    echo "Applying migration v{$version}: {$migration['description']}...\n";

    if (!$dryRun) {
        $db->begin_transaction();
        try {
            $migration['up']($db);

            $stmt = $db->prepare("INSERT INTO `schema_version` (`version`, `description`) VALUES (?, ?)");
            $stmt->bind_param('is', $version, $migration['description']);
            $stmt->execute();
            $stmt->close();

            $db->commit();
            echo "  ✅ Applied v{$version}\n\n";
        } catch (Exception $e) {
            $db->rollback();
            echo "  ❌ Failed v{$version}: " . $e->getMessage() . "\n";
            die("Migration aborted.\n");
        }
    } else {
        echo "  (dry-run: would apply)\n\n";
    }

    $applied++;
}

if ($applied === 0) {
    echo "Database is up to date. No migrations needed.\n";
} else {
    echo "{$applied} migration(s) " . ($dryRun ? "would be" : "were") . " applied.\n";
}

$db->close();

// ---- Helper functions ----

function tableExists(mysqli $db, string $table): bool
{
    $result = $db->query("SHOW TABLES LIKE '{$table}'");
    return $result->num_rows > 0;
}

function columnExists(mysqli $db, string $table, string $column): bool
{
    $result = $db->query("SHOW COLUMNS FROM `{$table}` LIKE '{$column}'");
    return $result->num_rows > 0;
}

function fkExists(mysqli $db, string $table, string $constraintName): bool
{
    $dbName = DB_DATABASE;
    $result = $db->query("
        SELECT COUNT(*) AS c FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = '{$dbName}'
          AND TABLE_NAME = '{$table}'
          AND CONSTRAINT_NAME = '{$constraintName}'
          AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    ");
    return intval($result->fetch_assoc()['c'] ?? 0) > 0;
}
