START TRANSACTION;

-- --------------------------------------------------------
-- Accounts / Tenants
-- --------------------------------------------------------
CREATE TABLE `account` (
  `license` int(11) NOT NULL,
  `mail` varchar(200) DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `name` varchar(200) DEFAULT NULL,
  `default_style_id` int DEFAULT NULL,
  `default_language` varchar(10) DEFAULT 'EN',
  `show_title_template` varchar(200) DEFAULT 'Show {dd}.{MM}.{yyyy}',
  `window_names` JSON DEFAULT NULL,
  `musician_names` JSON DEFAULT NULL,
  `church_tools_url` VARCHAR(500) DEFAULT NULL,
  `church_tools_token` VARCHAR(500) DEFAULT NULL,
  `viewer_token` VARCHAR(64) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `lastactivity` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`license`),
  UNIQUE KEY `uk_account_viewer_token` (`viewer_token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- OIDC Providers
-- --------------------------------------------------------
CREATE TABLE `oidc_providers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL,
  `discovery_url` varchar(500) NOT NULL,
  `client_id` varchar(300) NOT NULL,
  `client_secret` varchar(300) NOT NULL,
  `scopes` varchar(300) NOT NULL DEFAULT 'openid email profile',
  `required_group` varchar(200) DEFAULT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_oidc_providers_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Which providers are available for which license
CREATE TABLE `account_oidc_providers` (
  `license` int(11) NOT NULL,
  `provider_id` int(11) NOT NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`license`,`provider_id`),
  KEY `fk_aop_provider` (`provider_id`),
  CONSTRAINT `fk_aop_account` FOREIGN KEY (`license`) REFERENCES `account` (`license`) ON DELETE CASCADE,
  CONSTRAINT `fk_aop_provider` FOREIGN KEY (`provider_id`) REFERENCES `oidc_providers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Styles Library
-- --------------------------------------------------------
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Window-name-specific style overrides
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Songs
-- --------------------------------------------------------
CREATE TABLE `songs` (
  `account` int(11) NOT NULL,
  `songnumber` int(11) NOT NULL,
  `title` varchar(300) NOT NULL,
  `authors` varchar(300) NOT NULL,
  `copyright` varchar(600) NOT NULL,
  `ccli_number` varchar(50) DEFAULT NULL,
  `song_key` varchar(10) DEFAULT NULL,
  `initialOrder` varchar(150) NOT NULL,
  `order` JSON NOT NULL,
  `background` varchar(300) DEFAULT NULL,
  `css` mediumtext DEFAULT NULL,
  `style_id` INT DEFAULT NULL,
  PRIMARY KEY (`account`,`songnumber`),
  CONSTRAINT `fk_songs_account` FOREIGN KEY (`account`) REFERENCES `account` (`license`) ON DELETE CASCADE,
  CONSTRAINT `fk_songs_style` FOREIGN KEY (`style_id`) REFERENCES `styles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Song Blocks
-- --------------------------------------------------------
CREATE TABLE `blocks` (
  `account` int(11) NOT NULL,
  `songnumber` int(11) NOT NULL,
  `type` varchar(60) NOT NULL,
  `text` mediumtext NOT NULL,
  KEY `fk_song` (`account`,`songnumber`),
  CONSTRAINT `fk_blocks_song` FOREIGN KEY (`account`, `songnumber`) REFERENCES `songs` (`account`, `songnumber`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Shows / Set-Lists
-- --------------------------------------------------------
CREATE TABLE `shows` (
  `account` int(11) NOT NULL,
  `title` varchar(200) NOT NULL,
  `date` timestamp NOT NULL DEFAULT current_timestamp(),
  `order` JSON NOT NULL,
  `groups` JSON DEFAULT NULL,
  `style_id` INT DEFAULT NULL,
  `event_id` INT DEFAULT NULL,
  `event_name` VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (`account`,`title`),
  CONSTRAINT `fk_shows_account` FOREIGN KEY (`account`) REFERENCES `account` (`license`) ON DELETE CASCADE,
  CONSTRAINT `fk_shows_style` FOREIGN KEY (`style_id`) REFERENCES `styles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Usage Metrics
-- --------------------------------------------------------
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Show Item Type Configuration
-- --------------------------------------------------------
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Fulltext Indices
-- --------------------------------------------------------
ALTER TABLE `blocks` ADD FULLTEXT KEY `text` (`text`);
ALTER TABLE `songs` ADD FULLTEXT KEY `title` (`title`);

-- --------------------------------------------------------
-- PDF Area Mappings (musician block → PDF region mapping)
-- --------------------------------------------------------
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Account default style FK (added after styles table exists)
-- --------------------------------------------------------
ALTER TABLE `account`
  ADD CONSTRAINT `fk_account_style` FOREIGN KEY (`default_style_id`)
    REFERENCES `styles` (`id`) ON DELETE SET NULL;

-- --------------------------------------------------------
-- PDF Annotations (one row per annotation, database-backed)
-- --------------------------------------------------------
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Schema Version Tracking (for migrations)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `schema_version` (
  `version` INT NOT NULL,
  `description` VARCHAR(500) NOT NULL DEFAULT '',
  `applied_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `schema_version` (`version`, `description`) VALUES (15, 'Fresh install — all migrations included');

COMMIT;

/*
 * Database migrations are managed through the Admin Panel UI in the "Database" tab.
 *
 * The migration logic lives in api/AdminMigrations.php and is exposed via:
 *   GET  /rest/AdminMigrations → view status
 *   POST /rest/AdminMigrations → run pending migrations
 */
