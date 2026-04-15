# Presenter -- Requirements Specification

> **Version:** 2.0
> **Date:** 2026-04-05
> **Author:** Marcel Birkholz
> **Goal:** Unify the existing PHP + vanilla-JS web app and the Electron prototype into a single repository with a modern, maintainable architecture. The result must work as a standalone browser app **and** as an Electron desktop client.

---

## Table of Contents

1. [Project Vision](#1-project-vision)
2. [Architecture Overview](#2-architecture-overview)
3. [Tech Stack](#3-tech-stack)
4. [Repository & Project Structure](#4-repository--project-structure)
5. [Backend (PHP)](#5-backend-php)
6. [Frontend (React SPA)](#6-frontend-react-spa)
7. [Electron Desktop Client](#7-electron-desktop-client)
8. [Show / Set-List Management & Item Types](#8-show--set-list-management--item-types)
9. [Song Management](#9-song-management)
10. [Bible Verse Integration](#10-bible-verse-integration)
11. [Musician PDF View (Separate Feature)](#11-musician-pdf-view-separate-feature)
12. [Presentation Windows & Display Modes](#12-presentation-windows--display-modes)
13. [Window Management Panel (Electron)](#13-window-management-panel-electron)
14. [Styling & Theming System](#14-styling--theming-system)
15. [App UI Theme -- Dark & Light Mode](#15-app-ui-theme----dark--light-mode)
16. [Media Management (Images, Videos & Colors)](#16-media-management-images-videos--colors)
17. [Multi-Language Support (Song Lyrics)](#17-multi-language-support-song-lyrics)
18. [Band-Specific Orders](#18-band-specific-orders)
19. [OIDC Authentication (OIDC-Only)](#19-oidc-authentication-oidc-only)
20. [Unified Search](#20-unified-search)
21. [Settings & Configuration](#21-settings--configuration)
22. [Keyboard Mapping & WebSocket / Companion Commands](#22-keyboard-mapping--websocket--companion-commands)
23. [Admin Metrics & Statistics Dashboard](#23-admin-metrics--statistics-dashboard)
24. [Internationalization (App UI)](#24-internationalization-app-ui)
25. [Migration Script (PHP)](#25-migration-script-php)
26. [Testing & Quality](#26-testing--quality)
27. [Build, Release & CI/CD](#27-build-release--cicd)
28. [Non-Functional Requirements](#28-non-functional-requirements)
29. [Future Ideas / Nice-to-Have](#29-future-ideas--nice-to-have)
30. [Open Questions & Review Notes](#30-open-questions--review-notes)

---

## 1. Project Vision

**Presenter** is a worship-lyrics presentation tool. Its primary use case is displaying song lyrics on one or more screens during church services or worship events. A control operator chooses songs, arranges them into set-lists (shows), selects which verse/block to display, and controls the visual output in real-time. Beyond songs the set-list can also contain standalone media items (images / videos / solid colors) and bible verses.

### Key Goals

- **Unified repository** -- PHP backend + TypeScript/React frontend + Electron wrapper in one repo.
- **Browser-first** -- The SPA must be fully functional in any modern browser (no Electron required).
- **Electron-enhanced** -- The Electron client adds direct window management, local media serving, a WebSocket server for external controllers, PDF musician view, and auto-update.
- **Clean, simple UI** -- Supports both **dark mode** and **light mode**, persisted per device in localStorage.
- **No config.json** -- All user/device settings live in **localStorage** to maximise compatibility between browser and Electron usage. Electron-only capabilities (window bounds, file-system paths) are also stored in localStorage within the Electron renderer.
- **Modern DX** -- Single `node_modules` at root, Yarn, Vite, TypeScript strict mode, Prettier, ESLint, Vitest. Always target the **latest stable versions** of all dependencies.

---

## 2. Architecture Overview

```
+-----------------------------------------------------------------+
|                      Presenter Repository                        |
|                                                                  |
|  +---------------+   REST / JSON   +-------------------------+  |
|  | PHP Backend   | <-------------> | React SPA               |  |
|  | (api/)        |                 | (frontend/)             |  |
|  | MySQL / DB    |                 | Vite + TS + MUI         |  |
|  +---------------+                 | RTK Query               |  |
|                                    | typesafe-i18n           |  |
|                                    +------------+------------+  |
|                                                 |               |
|                                +----------------v------------+  |
|                                | Electron Shell              |  |
|                                | (electron/)                 |  |
|                                | - Main process              |  |
|                                | - Preload                   |  |
|                                | - Local media server        |  |
|                                | - Local PDF cache (optional)|  |
|                                | - Window management panel   |  |
|                                | - WebSocket server          |  |
|                                | - IPC bridge                |  |
|                                +-----------------------------+  |
|                                                                  |
|                  +-------------------------------+               |
|                  | Bitfocus Companion / External |               |
|                  | (WebSocket client)            |               |
|                  +-------------------------------+               |
+-----------------------------------------------------------------+
```

### Communication Flow

1. **Browser mode:** SPA <-> PHP REST API (same origin or configurable base URL). No WebSocket available in browser-only mode (WebSocket requires the Electron host).
2. **Electron mode:** SPA loaded inside BrowserWindow <-> PHP REST API (remote server). Electron main process provides additional IPC APIs for window management, local file access, and local media/PDF serving. The Electron main process also runs a **WebSocket server** for external controllers (Bitfocus Companion, etc.).
3. **Presentation windows** communicate with the control window via `postMessage` (browser) or Electron IPC (desktop).
4. **WebSocket server (Electron-only)** for real-time commands from external controllers, remote control, multi-client sync, and musician view synchronization.

> **Important:** The PHP backend does **not** support WebSocket. The WebSocket server runs exclusively within the Electron main process (Node.js). In browser-only mode the WebSocket features are unavailable.

---

## 3. Tech Stack

### Backend

| Concern   | Technology                             |
| --------- | -------------------------------------- |
| Language  | **PHP 8.5+**                           |
| Database  | MySQL 9+ / MariaDB 11+                 |
| Auth      | **OIDC only** (OpenID Connect)         |
| API style | REST (JSON request/response)           |
| Routing   | Custom lightweight router (`rest.php`) |
| Sessions  | PHP native sessions                    |

### Frontend

| Concern     | Technology                                                            |
| ----------- | --------------------------------------------------------------------- |
| Language    | TypeScript 5.8+ (strict)                                              |
| Framework   | React 19+                                                             |
| Build tool  | Vite 7+                                                               |
| UI library  | Material UI (MUI) 7+                                                  |
| Charts      | recharts 3+ (or MUI X Charts)                                         |
| State       | Redux Toolkit 2+ (RTK Query for API, slices for state)                |
| Routing     | React Router 7+                                                       |
| i18n        | typesafe-i18n 5+                                                      |
| Drag & Drop | @dnd-kit/core 6+ / @dnd-kit/sortable 10+                              |
| PDF         | react-pdf 9+ (pdf.js wrapper), pdf-lib 1.17+ (PDF annotation writing) |
| QR Code     | qrcode.react 4+ (or similar)                                          |
| Formatting  | Prettier 3+                                                           |
| Linting     | ESLint 9+ (flat config)                                               |
| Testing     | Vitest 3+ / happy-dom                                                 |
| Package mgr | Yarn 4 (node-modules linker)                                          |

### Electron

| Concern     | Technology                                                          |
| ----------- | ------------------------------------------------------------------- |
| Framework   | Electron 35+ (via `electron-vite` or simplified custom Vite config) |
| Builder     | electron-builder 26+                                                |
| Auto-update | electron-updater 6+                                                 |
| IPC         | contextBridge + ipcMain/ipcRenderer                                 |
| Preload     | Isolated context, contextIsolation: true                            |

> All version numbers are minimum targets. Always use the latest stable release at the time of development.

---

## 4. Repository & Project Structure

Single repository, single `node_modules` at root.

```
presenter/
+-- api/                            # PHP REST controllers
|   +-- RestController.php          # Abstract base
|   +-- Session.php                 # Auth / session (OIDC only)
|   +-- Accounts.php                # Public account listing
|   +-- Song.php                    # CRUD songs
|   +-- SongsAll.php                # List all songs
|   +-- SongsSearch.php             # Search songs
|   +-- Shows.php                   # CRUD shows / set-lists
|   +-- Styles.php                  # Style presets CRUD
|   +-- BibleVerses.php             # Bible verse lookup
|   +-- BibleTranslations.php       # List available bible translations from configured API
|   +-- Pdfs.php                    # PDF file CRUD (server-side storage)
|   +-- Metrics.php                 # Usage metrics / analytics
|   +-- Search.php                  # Unified search across entity types
|   +-- Log.php                     # Logging endpoint
|   +-- AdminAccounts.php           # Admin: manage accounts
|   +-- AdminProviders.php          # Admin: manage OIDC providers
|   +-- AdminAccountProviders.php   # Admin: assign providers to accounts
|   +-- Migrate.php                 # Database migration script
|   +-- utils.php                   # Shared helpers, autoloader
+-- classes/                        # PHP utility classes
|   +-- DB.php                      # Database connection (singleton)
|   +-- Request.php                 # Request abstraction
|   +-- Response.php                # JSON response helper
|   +-- Statement.php               # Prepared statement wrapper
|   +-- Transaction.php             # Transaction helper
|   +-- Values.php                  # Value object helpers
|   +-- OidcClient.php              # OIDC discovery, token exchange, userinfo
|   +-- Logging.php                 # File / DB logging
+-- electron/                       # Electron-specific source
|   +-- main/
|   |   +-- index.ts                # Main process entry
|   |   +-- windows.ts              # Window creation & management
|   |   +-- mediaServer.ts          # Local HTTP server for media files
|   |   +-- pdfCache.ts             # Optional local PDF cache for offline use
|   |   +-- wsServer.ts             # Built-in WebSocket server
|   |   +-- ipc.ts                  # IPC handler registrations
|   +-- preload/
|       +-- index.ts                # Preload script (contextBridge)
|       +-- index.d.ts              # Type declarations for renderer
+-- frontend/                       # React SPA (Vite project root)
|   +-- index.html                  # Main SPA entry
|   +-- presentation.html           # Presentation window entry
|   +-- musician.html               # Musician PDF view entry
|   +-- src/
|   |   +-- main.tsx                # React root mount
|   |   +-- presentation.tsx        # Presentation window mount
|   |   +-- musician.tsx            # Musician PDF view mount
|   |   +-- App.tsx                 # Root component (providers, router)
|   |   +-- theme.ts                # MUI theme (dark + light modes)
|   |   +-- env.d.ts                # Vite env type declarations
|   |   +-- api/
|   |   |   +-- presenterApi.ts     # RTK Query API definition
|   |   +-- store/
|   |   |   +-- index.ts            # Redux store configuration
|   |   |   +-- showSlice.ts        # Show state management
|   |   |   +-- presentationSlice.ts # Active song/block/line state
|   |   |   +-- settingsSlice.ts    # Settings state (localStorage sync)
|   |   |   +-- themeSlice.ts       # Dark / light / system mode
|   |   |   +-- songsSlice.ts       # Client-side song cache
|   |   +-- components/
|   |   |   +-- Control.tsx         # Block/verse display & line-level selection
|   |   |   +-- Sidebar.tsx         # Item list, drag-to-reorder, actions
|   |   |   +-- Header.tsx          # App bar with navigation + theme toggle
|   |   |   +-- Footer.tsx          # Quick-access window management bar
|   |   |   +-- SongEditor.tsx      # Full song editor
|   |   |   +-- SongLibrary.tsx     # Server-side song browser / search
|   |   |   +-- Shows.tsx           # Show selector / creator / manager
|   |   |   +-- Settings.tsx        # Settings drawer UI
|   |   |   +-- Presentation.tsx    # Presentation window factory
|   |   |   +-- DraggableList.tsx   # Generic drag-and-drop list
|   |   |   +-- StyleEditor.tsx     # WYSIWYG + raw CSS style editor
|   |   |   +-- StyleInspector.tsx  # Active style breakdown dialog
|   |   |   +-- MediaBrowser.tsx    # Media file browser & picker
|   |   |   +-- ColorPicker.tsx     # Solid color media picker
|   |   |   +-- VideoPlayer.tsx     # Video controls overlay
|   |   |   +-- VideoControlBar.tsx # Stacked video controls at bottom of Control
|   |   |   +-- BibleVersePicker.tsx # Bible verse selector
|   |   |   +-- UnifiedSearch.tsx   # Typed search with chip filter
|   |   |   +-- WindowManager.tsx   # Electron window management panel
|   |   |   +-- CompanionHelper.tsx # WS command copy helper
|   |   |   +-- MetricsDashboard.tsx # Admin analytics dashboard
|   |   |   +-- PdfDashboard.tsx    # PDF dashboard, import & mapping view
|   |   |   +-- QrCodeShare.tsx     # QR code display & URL copy
|   |   +-- pages/
|   |   |   +-- MainPage.tsx        # Primary control page
|   |   |   +-- LoginPage.tsx       # OIDC-only login
|   |   |   +-- AdminPage.tsx       # Admin dashboard
|   |   |   +-- UnauthorizedPage.tsx
|   |   |   +-- MusicianPage.tsx    # PDF musician view
|   |   +-- routes/
|   |   |   +-- RequireAuth.tsx     # Auth guard
|   |   +-- presentation/
|   |   |   +-- index.tsx           # Presentation window bootstrap
|   |   |   +-- Presentation.tsx    # Presentation rendering component
|   |   +-- settings/
|   |   |   +-- Settings.tsx        # Settings UI drawer
|   |   |   +-- Options.tsx         # Option definitions & defaults
|   |   +-- song/
|   |   |   +-- index.ts            # Song types, constants, exports
|   |   |   +-- Song.ts             # Song class
|   |   |   +-- CcliSong.ts        # CCLI SongSelect import parser
|   |   +-- i18n/                   # typesafe-i18n generated + translations
|   |       +-- en/index.ts
|   |       +-- de/index.ts
|   +-- vite.config.ts
+-- config-sample.php               # Sample PHP config (includes BIBLE_API example)
+-- config.php                      # Local PHP config (git-ignored)
+-- rest.php                        # PHP REST router / entry point
+-- oidc.php                        # OIDC callback handler
+-- install.sql                     # Database schema
+-- migrate.php                     # Database + data migration script (PHP)
+-- .htaccess                       # Apache URL rewriting
+-- data/                           # Server-managed file storage (git-ignored)
|   +-- {account}/                  # Per-account folder
|       +-- pdfs/                   # PDF sheet music (see 11.2)
|           +-- {songNumber}/
|               +-- Default.pdf
|               +-- ...
+-- dist/                           # Deployment output (git-ignored)
+-- package.json                    # Root package.json (single node_modules)
+-- tsconfig.json                   # Base TS config
+-- tsconfig.node.json              # Node/Electron TS config
+-- tsconfig.web.json               # Frontend TS config
+-- vite.config.ts
+-- electron-builder.yml
+-- eslint.config.js
+-- .prettierrc
+-- .typesafe-i18n.json
+-- .env / .env.dev
+-- README.md
```

---

## 5. Backend (PHP)

### 5.1 Database Schema

#### Existing Tables (preserved)

- **`account`** -- Licenses / tenants (`license` PK, `mail`, `name`, `active`, timestamps)
- **`oidc_providers`** -- OIDC provider configs
- **`account_oidc_providers`** -- Many-to-many: providers per license
- **`songs`** -- Song metadata per account
- **`blocks`** -- Song text blocks per song
- **`shows`** -- Set-lists per account

#### Schema Extensions

```sql
-- Account-level settings (NEW columns on account)
ALTER TABLE `account`
  ADD COLUMN `default_style_id` INT DEFAULT NULL,
  ADD COLUMN `default_language` VARCHAR(10) DEFAULT 'EN',
  ADD COLUMN `show_title_template` VARCHAR(200) DEFAULT 'Show {dd}.{MM}.{yyyy}',
  ADD COLUMN `window_names` JSON DEFAULT NULL,
  ADD COLUMN `musician_names` JSON DEFAULT NULL,
  ADD CONSTRAINT `fk_account_style` FOREIGN KEY (`default_style_id`)
    REFERENCES `styles` (`id`) ON DELETE SET NULL;

-- Styles library: reusable style presets
-- All style properties are stored in a single JSON `data` column.
-- The client is responsible for resolving, merging, and calculating
-- the final CSS from the JSON data at render time.
CREATE TABLE `styles` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `account` INT NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `enabled` TINYINT(1) DEFAULT 1,
  `data` JSON NOT NULL,                -- all style properties (see Style interface)
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_styles_account_name` (`account`, `name`),
  CONSTRAINT `fk_styles_account` FOREIGN KEY (`account`)
    REFERENCES `account` (`license`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Window-name-specific style overrides per level
-- Allows assigning additional styles to specific presentation window names
-- at any style level (global, show, item)
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

-- Show-level styles
ALTER TABLE `shows` ADD COLUMN `style_id` INT DEFAULT NULL;
ALTER TABLE `shows` ADD CONSTRAINT `fk_shows_style`
  FOREIGN KEY (`style_id`) REFERENCES `styles` (`id`) ON DELETE SET NULL;

-- Song-level styles
ALTER TABLE `songs` ADD COLUMN `style_id` INT DEFAULT NULL;
ALTER TABLE `songs` ADD CONSTRAINT `fk_songs_style`
  FOREIGN KEY (`style_id`) REFERENCES `styles` (`id`) ON DELETE SET NULL;

-- Usage metrics / analytics
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

-- Show-item type configuration (colors & MUI icon names per type, per account)
CREATE TABLE `show_item_types` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `account` INT NOT NULL,
  `type_key` VARCHAR(50) NOT NULL,
  `label` VARCHAR(100) NOT NULL,
  `color` VARCHAR(20) NOT NULL DEFAULT '#1976d2',
  `icon` VARCHAR(50) NOT NULL DEFAULT 'MusicNote',   -- MUI icon component name
  `is_default` TINYINT(1) DEFAULT 0,
  UNIQUE KEY `uk_sit_account_type` (`account`, `type_key`),
  CONSTRAINT `fk_sit_account` FOREIGN KEY (`account`)
    REFERENCES `account` (`license`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

```

> **Note:** Window configurations are **not** stored in the database. They are local-only, persisted in the browser's/Electron's localStorage (see 21).

### 5.2 REST API Endpoints

All endpoints are prefixed with `/rest/`. Authentication is required for all except `Accounts`.

| Method | Endpoint                         | Description                                         |
| ------ | -------------------------------- | --------------------------------------------------- |
| GET    | `/rest/Session`                  | Get current session info                            |
| DELETE | `/rest/Session`                  | Logout                                              |
| GET    | `/rest/Session/oidc-auth-url`    | Get OIDC authorization URL                          |
| GET    | `/rest/Accounts`                 | List available accounts (public)                    |
| GET    | `/rest/SongsAll/{order?}`        | List all songs                                      |
| GET    | `/rest/SongsSearch/{mode}?q=`    | Search songs (title/number/text)                    |
| GET    | `/rest/Song/{songNumber}`        | Get full song with blocks                           |
| POST   | `/rest/Song`                     | Create song                                         |
| PUT    | `/rest/Song`                     | Update song                                         |
| DELETE | `/rest/Song`                     | Delete song                                         |
| GET    | `/rest/SongExists/{songNumber}`  | Check if song exists                                |
| GET    | `/rest/Shows/{limit}/{offset?}`  | List shows with pagination                          |
| POST   | `/rest/Shows`                    | Save/create show                                    |
| DELETE | `/rest/Shows`                    | Delete show                                         |
| GET    | `/rest/Styles`                   | List all style presets                              |
| POST   | `/rest/Styles`                   | Create style preset                                 |
| PUT    | `/rest/Styles/{id}`              | Update style preset                                 |
| DELETE | `/rest/Styles/{id}`              | Delete style preset                                 |
| GET    | `/rest/BibleVerses/{ref}`        | Look up bible verse(s) by reference                 |
| GET    | `/rest/BibleTranslations`        | List available bible translations (`?lang=` filter) |
| GET    | `/rest/Pdfs/{songNumber}`        | List PDFs for a song                                |
| GET    | `/rest/Pdfs/{songNumber}/{file}` | Download/serve a specific PDF (authenticated)       |
| POST   | `/rest/Pdfs/{songNumber}`        | Upload a PDF                                        |
| DELETE | `/rest/Pdfs/{songNumber}/{file}` | Delete a PDF                                        |
| GET    | `/rest/Pdfs/search?q=`           | Search PDFs by filename across all songs            |
| GET    | `/rest/Pdfs/updates?since=`      | List PDFs modified since timestamp (polling)        |
| GET    | `/rest/Search?q=&type=`          | Unified search across types (see 20)                |
| GET    | `/rest/Metrics`                  | Query metrics with filters (admin)                  |
| POST   | `/rest/Metrics`                  | Record a metric event                               |
| GET    | `/rest/ShowItemTypes`            | List show-item type configs                         |
| PUT    | `/rest/ShowItemTypes`            | Update show-item type config                        |
| GET    | `/rest/Log`                      | Get logs (admin)                                    |
| DELETE | `/rest/Log`                      | Clear logs (admin)                                  |
| GET    | `/rest/AdminAccounts`            | List accounts (admin)                               |
| POST   | `/rest/AdminAccounts`            | Create account (admin)                              |
| PUT    | `/rest/AdminAccounts`            | Update account (admin)                              |
| DELETE | `/rest/AdminAccounts`            | Delete account (admin)                              |
| GET    | `/rest/AdminProviders`           | List OIDC providers (admin)                         |
| POST   | `/rest/AdminProviders`           | Create provider (admin)                             |
| PUT    | `/rest/AdminProviders`           | Update provider (admin)                             |
| DELETE | `/rest/AdminProviders`           | Delete provider (admin)                             |
| POST   | `/rest/AdminAccountProviders`    | Assign provider to account (admin)                  |
| DELETE | `/rest/AdminAccountProviders`    | Unassign provider from account (admin)              |

> The legacy `POST /rest/Session` (mail + license login) has been **removed**. Authentication is OIDC-only.

### 5.3 OIDC Backend Flow

1. Frontend requests OIDC auth URL -> Backend returns redirect URL.
2. User is redirected to identity provider.
3. IdP redirects back to `/oidc.php` with authorization code.
4. Backend exchanges code for tokens, validates claims, checks group membership.
5. Session is established with `account`, `mail`, `authType` (`oidc` or `oidc_admin`).
6. Admin OIDC uses global config constants; tenant OIDC uses per-account provider from DB.

---

## 6. Frontend (React SPA)

### 6.1 Core Layout

- **MainPage** -- Split view: Sidebar (left, ~400px) + Control area (right, flexible) + Footer (bottom, collapsible).
- **Sidebar** -- Show item list for current show (songs, media, bible verses, separators or groups / sections with names), drag-to-reorder, edit/delete actions, search, library browser, show selector, settings, presentation window toggle. Each item rendered with its type-specific **MUI icon** and **color** (e.g., `MusicNote` in blue for songs, `Image` in yellow for media, `MenuBook` in green for bible verses). Each song item shows small **override tags/chips** below it indicating applied overrides (e.g., "Acoustic", "EN primary", "Key: C"). A small **PDF icon** badge is shown when server-side PDFs exist for the song (and selected key, if provided). Clicking a song item opens a **popdown menu** to change per-item overrides: order, translations (with priority/stacking), and key (see 8.2).
- **Control** -- Displays content of the selected show item (song blocks with line-level selection, bible verse text, media preview). Active content is sent to presentation window(s). Video controls are placed at the bottom of the control area (see 12.7).
- **Header** -- App bar with **dark/light mode toggle** (MUI `LightMode` / `DarkMode` icon), **app language switcher** (compact flag icons or dropdown for switching the typesafe-i18n locale, e.g., 🇬🇧 EN / 🇩🇪 DE; selection persisted in `presenter_ui_language`), account menu, **window manager toggle** (Electron -- toggles the window manager panel on/off), settings.
- **Footer** -- Quick-access window management bar. Toggled on/off from the header. Shows window status, freeze toggles, fade-to-black, and window identification trigger. Always visible when enabled for fast access during live operation (see 13).

> **Explicit save:** All data mutations (shows, songs, styles, settings) require an explicit **Save / Update** action by the user. There is no auto-save or debounced-save behavior anywhere in the application. An **unsaved-changes indicator** (e.g., dot badge on the save button, asterisk in the title, or a subtle banner) is always visible when pending changes exist. This ensures the operator is always in control and avoids accidental overwrites.

### 6.2 Pages / Routes

| Route           | Component        | Auth Required | Description                                  |
| --------------- | ---------------- | ------------- | -------------------------------------------- |
| `/`             | MainPage         | Yes           | Primary control interface                    |
| `/login`        | LoginPage        | No            | Account selection + **OIDC-only login**      |
| `/admin`        | AdminPage        | Yes (admin)   | Accounts, providers, logs, metrics dashboard |
| `/unauthorized` | UnauthorizedPage | No            | Error display for auth failures              |
| `/notes`        | MusicianPage     | Yes           | **PDF musician view** (see 11)               |

### 6.3 State Management

- **RTK Query (`presenterApi`)** -- All server communication (songs, shows, styles, PDFs, bible verses, metrics, etc.).
- **Redux slices** -- All client-side state is managed exclusively via Redux Toolkit slices. No React Context is used for state management, ensuring a single consistent pattern throughout the app.
  - `showSlice` -- Current show, items, dirty/unsaved state.
  - `presentationSlice` -- `activeItemIndex`, `activeBlockIndex`, **`activeLineIndex`** (for line-level selection), `isBlack`, `frozenWindows`.
  - `settingsSlice` -- All localStorage-backed settings. Reads from localStorage on init, writes back on change. Selectors provide typed access to every setting.
  - `themeSlice` -- Dark / light / system mode. Persisted to `presenter_theme_mode` in localStorage.
  - `songsSlice` -- Client-side song cache for the current show. Populated from RTK Query results.

### 6.4 Key Components

#### Sidebar

- Show item list with drag-and-drop reordering.
- Each item renders a **MUI icon** (e.g., `MusicNote`, `Image`, `MenuBook`) in the configured color as a badge. No emoji/unicode symbols.
- Top toolbar: Unified Search (see 20), Add menu (song / media / bible verse), Song Library, Presentation Window toggle, Show selector, Account, Settings.
- Drag & drop import of `.txt` files (CCLI SongSelect format).

#### Control (Block / Content View)

- **For songs:** Renders all blocks/verses as MUI Cards. Selected block highlighted. **Each line within a block is individually selectable.** Clicking/tapping a line highlights it and updates the `activeLineIndex` in the presentation state. The selected line is visually distinguished (e.g., bolder text, accent background, or underline) to help the operator track the current position in the lyrics. This line-level selection feeds the **stream display mode** (two-line scrolling view) and serves as an orientation aid for the operator. Auto-scroll to the active block/line. Copyright block appended at the end.
- **For bible verses:** Renders the verse text in a card. Auto-paginates long passages. Individual verses are selectable for precise display control. **Bold formatting:** double-clicking a verse number or individual word toggles **bold** on/off. Bold ranges are stored in the `ShowItem` metadata and carry through to presentation window rendering, allowing the operator to emphasize specific words or verses.
- **For media:** Preview thumbnail (image), video player with controls, or color swatch (solid color items). For solid-color media items, a large color preview is shown.
- **Video controls** are rendered at the **bottom of the control view** (see 12.7 for details).

#### Song Editor

- Full-width drawer. Tab-based UI. Block text editing. Translation tags. Block order management per band (see 18). **Explicit save** via a Save button. An unsaved-changes indicator is shown when edits are pending. Undo/redo support.

#### Song Library

- Dialog with all songs from DB. Filter/search by title or number. Add to show. Delete with confirmation.

#### Shows (Set-List Manager)

- Show selector/creator/renamer/deleter dialog.
- Show title auto-generated from the **account-level template** (stored in `account.show_title_template`), supporting date variables: `{yyyy}`, `{MM}`, `{dd}`, `{HH}`, `{mm}`, `{ss}`. The template is editable in account settings.
- CCLI reporting link generation. **Explicit save** via a Save button with unsaved-changes indicator. No auto-save.

#### Settings Drawer

- Grouped, properly typed inputs, tooltips. See 21.

---

## 7. Electron Desktop Client

### 7.1 Simplified Setup

Use `electron-vite` or a simplified custom Vite config. Frontend build output loaded directly by Electron.

### 7.2 Main Process Features

- **Single instance lock.**
- **Window management:**
  - Save and restore main window bounds in localStorage (via IPC to renderer).
  - Create presentation windows with configurable position, size, fullscreen, frameless, kiosk, always-on-top.
  - Move windows to specific screens/positions on startup.
  - Support multiple simultaneous presentation windows.
  - **Named windows** -- each window has a name; multiple windows may share the same name. Style/command assignments target by name. **Window names are stored per account** (in `account.window_names` JSON column) for consistency and reuse across devices. The operator picks from the account-level list or adds new names which are synced back.
  - **Freeze per window** -- a frozen window ignores content updates; unfreezing immediately applies the latest state.
  - **Hide mouse per window** -- configurable per window to prevent the cursor from appearing on presentation screens.
  - **Window identification** -- on command, all presentation windows briefly overlay their name and an incremental number for easy identification.
- **IPC handlers:**
  - `window-minimize`, `window-close`, `window-maximize`
  - `get-app-version`, `check-for-updates`
  - `open-directory` -- Open a directory in the OS file explorer.
  - `create-presentation-window`, `close-presentation-window`
  - `list-screens` -- Return available displays/monitors.
  - `check-media-files` -- Verify media files exist locally.
  - `export-settings` -- Export all localStorage entries as a `.json` file (Save As dialog).
  - `import-settings` -- Import a `.json` file; return a diff of changes for review.
  - `apply-imported-settings` -- Confirm and apply; reload windows if needed.
  - `fade-to-black` / `fade-from-black` -- By window name.
  - `freeze-window` / `unfreeze-window` -- By window name. Frozen windows queue content updates without rendering them.
  - `identify-windows` -- Triggers all presentation windows to briefly display an overlay with their name and incremental number.
  - `get-window-states`
  - `open-musician-view` -- Open the musician PDF view as a separate BrowserWindow.
- **Local media server** -- Serves files from a configurable local directory (e.g., Nextcloud sync folder) via HTTP on localhost. Path stored in localStorage.
- **Local PDF cache (optional)** -- For offline use, the Electron client can cache recently accessed PDFs locally. The primary source of truth for PDFs is the server-side `data/` folder accessed via REST API (see 11.2).
- **Built-in WebSocket server** -- Runs on a configurable port (default `9001`). Electron-only. See 22.
- **Auto-updater.**
- **Security:** `nodeIntegration: false`, `contextIsolation: true`, CSP, allowlisted origins.

### 7.3 Preload Script

```typescript
interface ElectronAPI {
  minimize: () => Promise<void>;
  close: () => Promise<void>;
  maximize: () => Promise<void>;
  getAppVersion: () => Promise<string>;
  checkForUpdates: () => Promise<UpdateInfo>;
  openDirectory: (path: string) => Promise<boolean>;
  listScreens: () => Promise<ScreenInfo[]>;
  createPresentationWindow: (config: WindowConfig) => Promise<string>;
  closePresentationWindow: (id: string) => Promise<void>;
  updatePresentationContent: (id: string, content: PresentationContent) => Promise<void>;
  checkMediaFiles: (files: string[]) => Promise<MediaCheckResult>;
  exportSettings: () => Promise<string>;
  importSettings: (filePath: string) => Promise<SettingsDiff>;
  applyImportedSettings: (diff: SettingsDiff) => Promise<void>;
  fadeToBlack: (windowName: string) => Promise<void>;
  fadeFromBlack: (windowName: string) => Promise<void>;
  freezeWindow: (windowName: string) => Promise<void>;
  unfreezeWindow: (windowName: string) => Promise<void>;
  identifyWindows: () => Promise<void>;
  getWindowStates: () => Promise<WindowState[]>;
  openMusicianView: (config: MusicianViewConfig) => Promise<string>;
}
```

### 7.4 Settings Storage -- localStorage Only

**No `config.json` file in appData.** All settings (including Electron-specific ones like media path, PDF path, backend URL, window layouts, WebSocket port) are stored in **localStorage** within the Electron renderer process. This maximises compatibility: the same settings keys and logic work identically in browser mode and Electron mode.

Electron-only settings (not relevant in browser mode) are simply ignored when running in a browser.

### 7.5 Settings Export & Import

- **Export:** Electron reads all `presenter_*` keys from localStorage, serializes them as JSON, and saves via a "Save As" dialog.
- **Import:** Accept a `.json` file via file picker **or drag & drop**.
  1. Parse the file.
  2. Diff against current localStorage values and present changes.
  3. User reviews and confirms.
  4. Apply to localStorage. Reload/recreate affected windows if needed.
- Works in browser too (without file-system dialogs -- use download link / file input).

---

## 8. Show / Set-List Management & Item Types

### 8.1 Show Item Types

A show is an ordered list of **typed items**. Each type has a configurable **color** and **MUI icon name**.

| Type Key      | Default Label | Default Color      | Default MUI Icon | Description                                               |
| ------------- | ------------- | ------------------ | ---------------- | --------------------------------------------------------- |
| `song`        | Song          | `#1976d2` (blue)   | `MusicNote`      | A worship song from the library                           |
| `media`       | Media         | `#f9a825` (yellow) | `Image`          | A standalone image, video, **or solid color** (no lyrics) |
| `bible_verse` | Bible Verse   | `#388e3c` (green)  | `MenuBook`       | A bible passage to display on screen                      |

- Configurable per account via settings or admin panel. Stored in `show_item_types`.
- Icons are always **MUI icon component names** (e.g., `MusicNote`, `Image`, `MenuBook`, `Videocam`). No unicode/emoji.
- **Media items** now support three sub-types: **image**, **video**, and **solid color**. A solid color item allows the operator to quickly display a full-screen color (e.g., black, white, or any custom color) via a color picker (see 16).

> **Note:** PDF files are **not** a show item type. PDFs are handled by the separate Musician PDF View (see 11).

### 8.2 Show Data Model

```typescript
type ShowItemType = 'song' | 'media' | 'bible_verse';
type MediaSubType = 'image' | 'video' | 'color';

interface ShowItem {
  type: ShowItemType;
  songNumber?: number; // song
  order?: string; // song: band-specific order name (key from Song.orders, e.g. "Acoustic")
  key?: string; // song: musical key override (e.g. "C", "G", "Bb") — used for PDF resolution
  translations?: string[]; // song: ordered language codes to display (first = primary, on top); overrides per-window default
  mediaPath?: string; // media: filename/path (image or video)
  mediaSubType?: MediaSubType; // media: which kind of media (default: 'image')
  mediaColor?: string; // media: hex color for solid-color items (e.g., '#000000')
  bibleRef?: string; // bible_verse: e.g. "John 3:16"
  bibleTranslation?: string; // bible_verse: e.g. "ESV"
  bibleFormattedSegments?: { start: number; end: number; bold: boolean }[]; // bible_verse: bold ranges
  label?: string; // optional override display name
  styleId?: number; // item-level style override
}

interface Show {
  title: string;
  order: ShowItem[];
  date?: string;
  styleId?: number;
}
```

### 8.3 Show Features

- Show selector dialog (opens on app start).
- Create new show with **account-level title template** (e.g., `Show {dd}.{MM}.{yyyy}`).
- Load, save, override, rename, delete shows.
- Add items via dedicated "Add" menu: Song (from library or CCLI search), Media (file picker or color picker), Bible Verse (verse picker).
- CCLI reporting link generation. **Explicit save** via a Save button with unsaved-changes indicator.

---

## 9. Song Management

### 9.1 Song Data Model

```typescript
interface Song {
  songNumber: number;
  title: string;
  author?: string;
  copyright?: string;
  ccliNumber?: string;
  key?: string; // musical key, e.g. "C", "G", "Bb" (optional)
  blocks: Block[];
  orders: Record<string, string[]>; // { "Default": ["Verse 1", "Chorus", ...], "Acoustic": [...] }
  styleId?: number;
  languages?: string[]; // available translation languages, e.g. ["EN", "DE"]
}

interface Block {
  name: string; // e.g. "Verse 1", "Chorus", "Bridge"
  lines: Line[];
}

interface Line {
  text: string;
  language?: string; // e.g. "EN", "DE" -- for multi-language lyrics
}
```

> **`"Default"` order:** The `"Default"` key in `Song.orders` is the **base arrangement**. It is automatically populated during import (CCLI `.txt` or manual creation) and serves as: (1) the fallback order when no band-specific order is selected for a show item, (2) the initial block sequence shown in the song editor's Blocks tab, and (3) the canonical reference ordering. Every song must have a `"Default"` order.

### 9.2 Song Constants

- **Default block names:** Verse 1–10, Chorus 1–4, Bridge 1–3, Pre-Chorus, Intro, Outro, Ending, Interlude, Tag, Misc.
- Block names are user-editable and may include custom names.

### 9.3 CCLI SongSelect Integration

In addition to file-based `.txt` import, the app provides a **CCLI SongSelect API-like search** experience:

- The search bar (see 20) supports searching by CCLI song number or title.
- If the backend can proxy to the CCLI SongSelect website (scraping search results and lyrics with proper credentials), results are shown alongside local songs.
- Due to CCLI's restrictive API access, this feature may operate as a best-effort integration: search via the CCLI website with the user's credentials, parse results, and allow import.
- Fallback: the existing drag & drop `.txt` import remains fully supported.

### 9.4 Song Editor Features

- Full-width drawer with tab-based UI.
- **Metadata tab:** Title, author, copyright, CCLI number, **key** (optional, e.g., "C", "G", "Bb"), languages.
- **Blocks tab:** Add, rename, delete, reorder blocks. Each block has a text area for editing lines. Translation tags (e.g., `[EN]`, `[DE]`) can be added per line. The block sequence shown here follows the `"Default"` order.
- **Orders tab:** Manage multiple named orderings per band (see 18). Each order is a sequence of block names.
- **Style tab:** Assign a style preset to the song (item-level style override).
- **Explicit save** via Save button with unsaved-changes indicator. Undo/redo support.

### 9.5 Song Library Browser

- Dialog listing all songs from the database.
- Filter/search by title, song number, or lyrics text.
- Columns: number, title, author, CCLI number.
- Actions: Add to current show, Edit, Delete (with confirmation).
- Pagination or virtual scroll for large libraries.

---

## 10. Bible Verse Integration

### 10.1 Concept

Bible verses are a first-class show item type. The operator can look up any bible passage by reference (e.g., "John 3:16", "Psalm 23:1-6") and add it to the set-list. The verse text is fetched from a configurable API, displayed in the control view, and sent to presentation windows.

### 10.2 Configurable Bible API

The bible verse API connection is **globally configured** in `config.php` (not per account, not in the database). Only APIs that return **JSON** are supported — XML-based APIs are not. However, the **translation / version** is **user-selectable** at runtime — the operator chooses a translation from a dynamically populated list.

Configuration is defined as a PHP array constant in `config.php`:

```php
// config.php (excerpt)
define('BIBLE_API', [
    'name'                  => 'API.Bible',
    'base_url'              => 'https://api.scripture.api.bible/v1',
    'api_key'               => 'your-api-key-here',       // optional, leave empty if not required
    'translations_endpoint' => '/bibles',                  // endpoint path that returns available translations
    'translations_path'     => 'data',                     // dot-notation path to extract the translations array from the response
    'translation_id_field'  => 'id',                       // field name for the translation ID
    'translation_name_field'=> 'name',                     // field name for the display name
    'translation_lang_field'=> 'language.id',              // field name for the language code (for filtering)
    'verse_path'            => 'data.content',             // dot-notation path to extract verse text from the response
]);
```

- The `config-sample.php` file ships with a pre-filled example configuration for easy setup.
- Only **one active provider** at a time. To switch providers, the server administrator edits `config.php`.
- The backend reads this config when proxying verse lookups (`GET /rest/BibleVerses/{ref}`) and translation listings (`GET /rest/BibleTranslations`).
- **Translation selection is user-facing:** The operator picks a translation from a dynamically fetched list in the BibleVersePicker (see 10.3).

#### Example Public APIs (JSON only)

| Provider          | Base URL                               | Auth           | Notes                                   |
| ----------------- | -------------------------------------- | -------------- | --------------------------------------- |
| **API.Bible**     | `https://api.scripture.api.bible/v1`   | API key (free) | 2500+ versions, 1700+ languages         |
| **Bible-API.com** | `https://bible-api.com`                | None           | Free, simple REST, limited translations |
| **ESV API**       | `https://api.esv.org/v3/passage/text/` | API key (free) | ESV only, clean text output             |
| **Bolls.Life**    | `https://bolls.life/get-verse/`        | None           | Free, multiple translations, JSON       |

### 10.3 BibleVersePicker Component

- A dialog/drawer component for searching and selecting bible verses.
- **Input fields:** Book (autocomplete dropdown), Chapter (number), Verse range (start–end).
- **Quick reference input:** Free-text field accepting standard references like `John 3:16`, `Ps 23:1-6`, `Rom 8:28-30`.
- **Translation selector:** A **dynamic dropdown** populated by `GET /rest/BibleTranslations`. The list can be filtered by **language** via a language-code chip/dropdown (e.g., showing only German translations). The user's last-used translation is remembered in `presenter_bible_translation` (localStorage). The selected translation ID is passed as part of the verse lookup.
- **Preview pane:** Shows the fetched verse text before adding to the show.
- **Bold formatting:** In the preview pane, **double-clicking** an individual verse or word toggles **bold** formatting. This allows the operator to emphasize specific passages before adding the verse to the show. Bold ranges are stored in `ShowItem.bibleFormattedSegments`.
- **Auto-pagination:** Long passages (e.g., full chapters) are automatically split into displayable pages based on the presentation window size and font settings.

### 10.4 Backend Lookup

- `GET /rest/BibleVerses/{ref}?translation=ESV` -- The backend proxies the request to the configured bible API.
- The backend normalizes the response into a standard format:

```typescript
interface BibleVerseResult {
  reference: string; // normalized, e.g. "John 3:16"
  translation: string; // e.g. "ESV"
  text: string; // full verse text
  verses: {
    number: number;
    text: string;
  }[];
  copyright?: string; // attribution / copyright notice from the API
}
```

- Error handling: if the API is unavailable or the reference is invalid, the backend returns an appropriate error with a user-friendly message.

### 10.5 Display on Presentation

- Bible verses are rendered with the verse reference as a header/title and the text as the body.
- Long passages are paginated: the operator can navigate between pages in the control view.
- The active bible API copyright/attribution is shown at the bottom of the presentation (if required by the API provider).
- Style inheritance follows the three-level style cascade (see 14).

---

## 11. Musician PDF View (Separate Feature)

### 11.1 Concept

The Musician PDF View is a **standalone page/window** (not a show item type). It displays PDF sheet music in sync with the current song flow. Musicians open this view on their own device (tablet, laptop) or the Electron app opens it as a separate BrowserWindow. Since PDFs are stored **server-side**, the musician view works in **browser-only mode** as well — editing, uploading, and browsing PDFs does not require Electron. Real-time sync (auto-follow the operator) requires the Electron WebSocket server, but manual mode is always available.

### 11.2 Server-Side PDF Storage

PDF files are stored on the **server** in a dedicated `data/{account}/pdfs/` directory, organized by song number. They are served via authenticated REST endpoints (`GET /rest/Pdfs/{songNumber}/{filename}`) — **not** via a public URL. This eliminates the need for Electron's local PDF server as the primary mechanism and makes PDF management available in browser-only mode as well.

> **Electron offline fallback:** For offline use cases, the Electron client can optionally cache recently accessed PDFs locally (`pdfCache.ts`). The primary source of truth is always the server.

#### Folder Structure Convention

```
data/{account}/pdfs/
+-- {songNumber}/                    # Folder per song, named by song number
|   +-- {bandOrderName}.pdf          # PDF named by band order (general case)
|   +-- {bandOrderName}-{key}.pdf    # PDF named by band order + song key (e.g. Acoustic-C.pdf)
|   +-- {specificName}.pdf           # PDF named by specific musician/instrument name (override)
|   +-- {specificName}-{key}.pdf     # Specific name + key variant
|   +-- Default.pdf                  # Fallback PDF if no specific match
|   +-- Default-{key}.pdf            # Key-specific fallback (e.g. Default-C.pdf)
```

**Example:**

```
data/42/pdfs/
+-- 101/
|   +-- Default.pdf                  # Default sheet music for song 101
|   +-- Default-C.pdf                # Default in key of C
|   +-- Acoustic.pdf                 # Sheet music for "Acoustic" band order
|   +-- Acoustic-G.pdf              # "Acoustic" in key of G
|   +-- Piano.pdf                    # Sheet music for "Piano" specific name
|   +-- Sarah.pdf                    # Sheet music for musician "Sarah" (personal override)
+-- 102/
|   +-- Default.pdf
|   +-- Worship-Band.pdf
```

The system resolves the PDF in the following priority:

1. **Specific name + key match** -- e.g., `Piano-C.pdf` (musician name + song key from ShowItem).
2. **Specific name match** -- e.g., `Piano.pdf` (musician name, no key).
3. **Band order + key match** -- e.g., `Acoustic-C.pdf`.
4. **Band order match** -- e.g., `Acoustic.pdf`.
5. **Default + key match** -- e.g., `Default-C.pdf`.
6. **Default.pdf** -- final fallback.

If `ShowItem.key` (or `Song.key`) is not set, key-based variants are skipped.

#### PDF REST API

| Method | Endpoint                             | Description                                        |
| ------ | ------------------------------------ | -------------------------------------------------- |
| GET    | `/rest/Pdfs/{songNumber}`            | List all PDFs for a song                           |
| GET    | `/rest/Pdfs/{songNumber}/{filename}` | Download/serve a PDF file (authenticated)          |
| POST   | `/rest/Pdfs/{songNumber}`            | Upload one or more PDFs                            |
| DELETE | `/rest/Pdfs/{songNumber}/{filename}` | Delete a PDF file                                  |
| GET    | `/rest/Pdfs/search?q=`               | Search PDFs across all songs by filename           |
| GET    | `/rest/Pdfs/updates?since={ts}`      | List PDFs modified since a timestamp (for polling) |

- **Polling for updates:** Browser-only clients poll `GET /rest/Pdfs/updates?since=` every **30 seconds** to detect changes made by other users (e.g., annotation saves). In Electron mode, the WebSocket `musician_pdf_updated` message is preferred; polling serves as a fallback.
- **Security:** All PDF endpoints require authentication. Files in `data/` are not publicly accessible (protected by `.htaccess` or server config).

### 11.3 Custom Names (Musician / Instrument Names)

Musicians can configure **custom names** in the settings to identify themselves or their instrument. This determines which PDF variant is loaded.

- **Custom names** are selectable and editable in the musician view settings.
- Examples: `"Piano"`, `"Guitar"`, `"Sarah"`, `"Alto Sax"`, `"Keys"`.
- Custom names are stored **per account** in `account.musician_names` (JSON array) so they can be shared and reused across devices.
- Each musician device selects one active name from the list (stored locally in `presenter_musician_name` in localStorage).
- New names can be added by any musician and are synced back to the account.

### 11.4 How It Works

1. The musician opens `/notes` in a browser or via the Electron "Open Musician View" button.
2. **Band selection (first-time setup):** On first launch (or when no band is selected), the musician is prompted to **choose a band / order name** from the list of available bands across all songs in the current show. The selected band is saved in `presenter_musician_band` in localStorage. This determines which song order is used in the set-list view and which PDF variant is loaded (see 11.2). The band can be changed at any time from a dropdown in the musician view toolbar.
3. The view shows:

- A **collapsible sidebar** on the left listing all songs/items in the current show, in the **band-specific order** for each song (using the order matching `presenter_musician_band`, falling back to "Default"). The musician can tap to switch between PDFs. The sidebar collapses to maximize the PDF viewing area on smaller screens.
- A **PDF viewer** (powered by `react-pdf`) displaying the PDF associated with the currently active song, resolved by the musician's custom name, band order, and fallback chain (see 11.2).
- **Page view mode selector** -- configurable display modes:
  - **Single page** -- one page at a time (default).
  - **Two-page spread** -- two pages side by side, useful for landscape tablets or larger screens.
  - **Continuous scroll** -- all pages in a vertical scroll.
- **Sync indicator** (on/off toggle) showing whether auto-sync is active.
- **Block selection indicator** -- a subtle, configurable indicator showing which block is currently selected by the operator. This is opt-in and configurable on the client side (can be turned off to avoid distraction). Displays as a small badge, sidebar highlight, or page-margin marker.

4. **Auto-sync mode (default on) — stability-first navigation:**

- When the operator selects a song or navigates to a block, the musician view automatically switches to the matching PDF and highlights the mapped region.
- PDF-to-block mapping is defined via area mappings (see 11.5).
- **Minimal movement principle:** The view prioritizes stability and readability over animation. Scrolling or page changes happen **only when the target block/region is not currently visible** in the viewport. If the target region is already on screen (even partially), the view does **not** scroll or jump — it only updates the block indicator.
- **Example:** A typical song has the chorus at the top of the page and multiple verses below. When the operator switches between verses that are all visible on the same page, the PDF view stays put. The musician can see everything they need without the page moving unexpectedly. A scroll/page change only occurs when the target is genuinely off-screen.
- **No animations:** There are no cross-fade, page-turn, or slide animations. When a page change is necessary (target on a different page), it happens as a simple instant page switch. This avoids disorientation and ensures the musician always has a clear, stable view of their sheet music.

5. **Manual override:**

- The musician can toggle sync off at any time.
- When sync is off, the musician can manually browse the set-list, switch songs, scroll through the PDF, and navigate pages freely.
- Toggling sync back on snaps to the current operator position.
- **Navigation buttons** with semi-transparent opacity are overlaid on the left and right edges (or top/bottom) for quickly navigating to the next/previous page and song. Using these buttons **automatically disables auto-sync** to avoid conflicting navigation.

6. **Song PDF association:** Each song can have one or more associated PDF filenames stored in its metadata or in a separate mapping. The musician view resolves these from the PDF directory using the folder structure convention (see 11.2).

### 11.5 PDF Area Mapping

```typescript
interface PdfAreaMapping {
  blockName: string; // e.g., "Verse 1", "Chorus"
  page: number; // 1-based page number
  region?: {
    // optional crop region (percentages 0-100)
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
```

- A mapping editor lets the user draw rectangles on PDF pages and assign each to a block name.
- When a block is active, the PDF view scrolls/zooms to the mapped region.
- If no mapping exists, the PDF is displayed as-is with manual page navigation.

### 11.6 PDF Dashboard & Import View

A **web-based** view (accessible from both browser and Electron) for managing PDF files and mappings:

- **PDF browser/dashboard:** Search and browse all existing PDFs across all songs. Filter by song number, song title, order name, musician name, or **song key**. Provides a quick overview of what sheet music is available.
- **Upload interface:** Drag & drop or file picker to upload PDFs to the server. PDFs are placed into the correct folder structure automatically (by song number). The filename determines the band/musician/key association.
- **Mapping editor:** Visual editor to map PDF regions to song blocks (see 11.5).
- **Band/pitch support:** Upload multiple PDF variants per song — each variant named by band order, musician name, and/or key.
- **Bulk operations:** Upload multiple PDFs at once, with automatic folder placement based on filename patterns.
- **Preview:** Inline PDF preview during upload and mapping.
- **Sidebar integration:** In the main app sidebar, a small **PDF icon** badge on song items indicates when server-side PDFs exist for that song (and selected key, if set). This gives the operator a quick overview without opening the PDF dashboard.

### 11.7 QR Code Sharing

The musician view includes a **QR code sharing** feature for quickly distributing the view URL and WebSocket connection info to musicians:

- A button/icon in the musician view toolbar triggers a dialog showing:
  - A **QR code** encoding the current musician view URL (including the server address and optionally the current page/song context).
  - A **"Copy URL" button** that copies the full URL to the clipboard for sending via a messenger or other means.
- The QR code includes the WebSocket server address so that scanned devices connect to the correct Electron host.
- This makes it easy for musicians to share the view quickly without manually typing URLs.

### 11.8 PDF Annotations (Database-Backed, Per-Annotation Model)

Musicians can add annotations directly on top of PDF sheet music. Annotations are **stored in the database** as individual rows in the `pdf_annotations` table (one row per annotation element), with immediate auto-save on every action.

#### Implementation

- **Storage:** Each annotation is persisted as a single row via `POST /rest/PdfAnnotations/{songNumber}`. No client-side PDF modification is needed — annotations are rendered as HTML5 Canvas overlays.
- **Layers:** Annotations are grouped by a `layer` column (defaulting to the musician's display name). Musicians can create, rename, and delete custom layers.
- **Always-visible overlays:** The annotation canvas overlays are **always rendered** (read-only, `pointerEvents: none`) when annotations exist for the current PDF, even when the annotation toolbar is hidden (i.e., when edit mode is off). This ensures annotations remain visible after leaving edit mode.
- **Fixed toolbar layout:** The annotation toolbar is rendered **outside** the scrollable PDF container, so it stays fixed at the bottom of the view and does not scroll with the PDF content.

#### Toolbar Architecture

The toolbar uses a **two-bar layout**:

1. **Secondary bar (top):** Tool-specific options that appear above the main toolbar when a tool is selected (e.g., line width slider for freehand draw, font controls for text, opacity slider for highlight, icon picker for icon tool, eraser hint text).
2. **Primary bar (bottom):** Tool selector (toggle button group), color picker, undo, clear layer, layer viewer, active layer chip, and download button.

#### Annotation Types

| Type          | Description                                                                                                                                                                                                                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Freehand**  | Free-form pen/pencil lines drawn on the PDF with configurable stroke width.                                                                                                                                                                                                                                          |
| **Highlight** | Semi-transparent color overlay rectangles on regions of the PDF with configurable opacity (0–100%).                                                                                                                                                                                                                  |
| **Text**      | Short text notes placed at specific positions on a page. Supports bold, italic, underline, and configurable font size.                                                                                                                                                                                               |
| **Icons**     | Custom uploaded SVG icons placed at any position. Icons are stored on the filesystem (`data/{account}/icons/`) with no database table — the API scans the directory to list available icons.                                                                                                                         |
| **Eraser**    | Click on a specific annotation to remove it via hit-testing. The eraser performs geometric hit-detection (point-to-segment distance for freehand, bounding-box for highlights, text, and icons) and deletes the matched annotation by its database ID via `DELETE /rest/PdfAnnotations/{songNumber}/{annotationId}`. |

#### Colors

All annotation tools support multiple colors: red, blue, green, orange, black, white, and purple.

#### Icon Management

- Icons are **filesystem-backed** — stored as SVG files in `data/{account}/icons/`. No database table is used; the `PdfIcons` API reads directly from the filesystem.
- The icon tool's secondary toolbar shows selectable icon thumbnails with theme-aware contrast (`filter: invert(1)` in dark mode for visibility).
- A **cogwheel (Settings) button** opens the icon management popover, which lists all icons with delete buttons and an upload button. The standalone upload icon button has been removed from the toolbar row — uploading is only available inside the management popover.
- Icon annotations store the `iconFilename` (server filename) in the annotation data, not a numeric database ID.

#### Display Architecture (Canvas Overlay)

Annotations are rendered via HTML5 Canvas overlays positioned absolutely on top of each PDF page:

1. Per-page `<canvas>` elements are created via `createPortal` into wrapper `<div>`s injected into each `.react-pdf__Page` element.
2. Canvas dimensions match the parent page element's client dimensions, and all annotation coordinates are stored as percentages (0–100) for zoom-independent positioning.
3. Background layers (non-active, visible) are rendered at 20% opacity in gray.
4. Active layer annotations are rendered at full fidelity with their original colors.

#### Multi-Layer Features

- **Layer viewer popover:** Musicians can view, create, rename, delete, and switch between annotation layers within the toolbar. Clicking a layer's name/label also selects it as the active layer.
- **Immediate feedback:** Newly created layers appear immediately in the layer overview (tracked via local state), even before any annotations are added to them.
- **Auto-select on delete:** When the active layer is deleted, the system automatically selects the first remaining layer (or falls back to the musician's default layer name).
- **Background layers:** Annotations from other visible layers are rendered at 20% opacity behind the active layer's annotations, allowing musicians to see each other's notes.
- **Footer layer viewer:** The musician footer bar includes a read-only `PdfLayerViewer` (no delete/rename controls) for quick layer visibility toggling without entering edit mode.

#### Additional Features

- **Undo:** Non-local undo that deletes the annotation with the highest `sort_order` in the active layer, persisting across page reloads.
- **Clear layer:** Remove all annotations from the current active layer (with confirmation dialog).
- **Toggle visibility:** Musicians can toggle all annotation canvas overlays on/off via the layer viewer's master switch.
- **Download:** Export the PDF with all visible annotation layers embedded as OCG groups via `pdf-lib`, for viewing in external PDF readers.

#### API Endpoints

| Method   | Endpoint                                                 | Description                                 |
| -------- | -------------------------------------------------------- | ------------------------------------------- |
| `GET`    | `/rest/PdfAnnotations/{songNumber}?filename=X`           | List all annotations for a PDF (all layers) |
| `POST`   | `/rest/PdfAnnotations/{songNumber}`                      | Insert a single annotation (auto-save)      |
| `PUT`    | `/rest/PdfAnnotations/{songNumber}/rename`               | Rename a layer                              |
| `DELETE` | `/rest/PdfAnnotations/{songNumber}/undo?filename&layer`  | Undo last annotation in a layer             |
| `DELETE` | `/rest/PdfAnnotations/{songNumber}/layer?filename&layer` | Clear entire layer                          |
| `DELETE` | `/rest/PdfAnnotations/{songNumber}/{annotationId}`       | Delete a single annotation by ID (eraser)   |

#### Icon API Endpoints (Filesystem-Backed)

| Method   | Endpoint                    | Description                     |
| -------- | --------------------------- | ------------------------------- |
| `GET`    | `/rest/PdfIcons`            | List all icons (directory scan) |
| `GET`    | `/rest/PdfIcons/{filename}` | Serve an icon SVG file          |
| `POST`   | `/rest/PdfIcons`            | Upload a new SVG icon           |
| `DELETE` | `/rest/PdfIcons/{filename}` | Delete an icon file             |

### 11.9 Communication

- The musician view receives the current state (active song, active block, active line) via the **Electron WebSocket server** (see 22) when available.
- WebSocket messages for musician sync:
  - `musician_sync` -- broadcasts current song, block, and line selection.
  - `musician_pdf_updated` -- broadcasts that annotation data has changed for a PDF. Receiving clients can refetch annotation data from the API.
  - `midi_event` -- (optional) broadcasts MIDI navigation events from musician devices for informational purposes (see 11.10).
- The musician view is primarily read-only for show control; it does not send navigation commands back.
- **Browser-only fallback:** When WebSocket is unavailable (no Electron host), the musician view can operate in **manual mode** without auto-sync. PDF update detection uses the **polling endpoint** (`GET /rest/Pdfs/updates?since=`) at a 30-second interval.

### 11.10 MIDI Device Support (Musician View)

Musicians can use **Bluetooth MIDI foot-switches** (and USB MIDI devices) for hands-free navigation in the musician PDF view.

#### Web MIDI API

- Uses the browser's **Web MIDI API** (`navigator.requestMIDIAccess()`). Works in Chromium-based browsers and Electron.
- **Constraint:** Web MIDI API requires HTTPS or localhost in most browsers. This must be documented in setup instructions.

#### MIDI Learn

- A **"MIDI Learn"** button in the musician view settings opens a mapping dialog.
- The user selects an action (e.g., "Next Page") and then presses the desired foot-switch / MIDI button. The app listens for the next incoming MIDI message and maps it to the chosen action.
- **Available actions:** Next page, Previous page, Next song, Previous song, Next block, Previous block.

#### Device-Specific Mappings

- MIDI mappings are stored **per MIDI device name** in localStorage (`presenter_midi_mappings` — JSON object keyed by device name).
- When multiple MIDI devices are connected, each retains its own mapping independently.
- Example:
  ```json
  {
    "AirTurn PED": {
      "note_60": "next_page",
      "note_62": "prev_page",
      "note_64": "next_song"
    }
  }
  ```

#### Auto-Reconnect

- When a Bluetooth MIDI device disconnects and reconnects, the app **automatically re-establishes** the MIDI connection and restores the saved mapping.
- A small status indicator in the musician view toolbar shows MIDI connection state (connected / disconnected / scanning).

#### Tracking Master

- Configurable toggle: **who controls the musician view's position?**
  - **Operator (default):** The musician view follows the operator's block selection via WebSocket sync. MIDI foot-switch presses are ignored for navigation (but can still be used for page turns).
  - **MIDI (self):** The musician navigates independently via MIDI. Operator sync is paused. Useful during rehearsal or when the musician needs to jump ahead.
- Stored in `presenter_midi_tracking_master` (`operator` | `midi`, default `operator`).
- Switching tracking master can also be mapped to a MIDI button.

#### WebSocket Sharing

- MIDI navigation events can optionally be **broadcast via WebSocket** (`midi_event` action) so that other connected clients are informed of the musician's navigation. This is informational only — it does not control other devices unless a device explicitly opts to follow a specific musician.

---

## 12. Presentation Windows & Display Modes

### 12.1 Window Creation

- **Browser:** `window.open()` with configurable features.
- **Electron:** `new BrowserWindow()` via IPC.
- Multiple simultaneous windows. Each independent.

### 12.2 Display Modes

| Mode       | Description                                                                                                                                                                                                                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Normal** | Full block view with translations and background image/video.                                                                                                                                                                                                                                             |
| **Stream** | Scrolling lines. Configurable line count (default 2). Supports transparent background. Uses the active **line-level selection** to determine which lines to display -- the selected line and subsequent lines (up to the configured count) are shown, enabling a smooth two-line teleprompter-style view. |

> **Note:** The previous "Text Only" and "Background Only" modes have been replaced by **per-window style options**. To achieve a text-only display, set `hideBackground: true` in the window configuration or via a style. To achieve a background-only display, set `hideText: true`. These options can be combined with any display mode and are controllable per presentation window (see 12.5 and 14).

### 12.3 OBS / Live-Stream Integration

- **Stream** mode supports `transparent background` for OBS Browser Source integration.
- Electron: `BrowserWindow` with `transparent: true`, `frame: false`, `hasShadow: false`.
- Browser: URL query params `?mode=stream&transparent=1&lines=2&name=StreamWindow` for direct OBS Browser Source use.
  - The **`name`** parameter allows targeting a specific window name, so the OBS source receives only the styles and content intended for that named window.
- All text rendering and animations work within OBS's Chromium engine.

### 12.4 Communication

- `postMessage` (browser) or IPC (Electron). Each window renders independently per its mode/language config.
- **Line-level updates:** When the operator selects a line, the updated `activeLineIndex` is broadcast to all presentation windows. The **stream** mode uses this to display the correct lines. The **normal** mode may optionally highlight the active line subtly (configurable).

### 12.5 Window Configuration

Window configs are stored **locally in localStorage**, not in the database.

```typescript
interface WindowConfig {
  name: string; // multiple windows may share the same name
  displayMode: 'normal' | 'stream';
  languages: string; // "all", "EN", "EN,DE", etc.
  positionX?: number;
  positionY?: number;
  width: number;
  height: number;
  fullscreen: boolean;
  frameless: boolean;
  alwaysOnTop: boolean;
  hideMouse: boolean; // hide the mouse cursor on this presentation window
  hideText: boolean; // hide text overlay (replaces "Background Only" mode)
  hideBackground: boolean; // hide background image/video (replaces "Text Only" mode)
  frozen: boolean; // when true, content updates are queued but not rendered
  streamLines?: number; // number of lines to show in stream mode (default 2)
  streamTransparentBg?: boolean;
  videoMask?: VideoMask | null;
}
```

### 12.6 Flexible Video Masking

Percentage-based crop region:

```typescript
interface VideoMask {
  x: number; // 0-100
  y: number; // 0-100
  width: number; // 0-100
  height: number; // 0-100
}
```

Examples: left half `{x:0,y:0,w:50,h:100}`, right half `{x:50,y:0,w:50,h:100}`, center third, top half, any arbitrary region. Visual mask editor in the Window Manager.

### 12.7 Video Controls

Video playback controls are rendered at the **bottom of the control view** (not inside the presentation window).

- **Single video:** Play / Pause / Stop buttons, seekable progress bar with time display.
- **Multiple videos:** When multiple videos are active (e.g., different presentation windows showing different background videos, or a media item with a video plus a style background video), **multiple video control bars are stacked** vertically at the bottom of the control area. Each bar is labeled with the source context (e.g., window name or "Background Video").
- **Global controls:** Above the individual video control bars, a row of **global Play / Pause / Stop buttons** is displayed. These buttons affect **all active videos simultaneously**, making it easy to start, pause, or stop everything at once.
- Video state is synced across all presentation windows displaying the same video.

### 12.8 Next-Block Preview Line

An optional **preview line** can be displayed at the bottom of the presentation window showing the **first line of the next block** in the song order. This gives the operator and congregation a subtle heads-up of what comes next.

- **Toggled on/off** via the `presenter_next_line_preview` setting (default: `true`).
- **Color:** The preview line color is configurable via the style property `nextLinePreviewColor` (see 14.2) or the dedicated setting `presenter_next_line_preview_color` (default: `#AAAAAA`). The style property takes precedence if set.
- **Multi-language support:** When `presenter_next_line_translation` is `true` (default), the preview line includes all languages that the presentation window is configured to display. For example, if a window shows `"EN,DE"`, the next-block preview shows both the English and German first lines of the upcoming block.
- **Positioning:** The preview line is rendered below the current block content with reduced opacity / smaller font size to visually distinguish it from the active content. Exact positioning and sizing follow the active style.
- **Edge cases:**
  - If the current block is the last block in the song order, the preview shows the first line of the **next show item** (if it is a song), or nothing if the next item is a media/bible verse or there is no next item.
  - If the next block has no text lines (e.g., instrumental interlude), the preview is hidden.

---

## 13. Window Management Panel (Electron)

### 13.1 Toggle & Placement

The window manager is **toggled on/off** from a button in the header app bar. When enabled, it appears as a dedicated panel (expandable drawer or overlay). For quick access during live operation, a **footer bar** at the bottom of the main page provides compact window controls without needing to open the full panel.

### 13.2 Footer Bar (Quick Access)

The footer bar is a slim, always-visible (when enabled) strip at the bottom of the main page. It provides:

- **Window status indicators** -- compact icons/chips for each open presentation window showing: name, mode (Normal/Stream icon), and state (visible / blacked out / frozen).
- **Quick freeze toggle** per window -- one-click freeze/unfreeze.
- **Quick fade-to-black** per window -- one-click toggle.
- **Identify button** -- triggers all presentation windows to briefly overlay their name and incremental number.
- The footer can be collapsed/hidden via a toggle in the header or settings.

### 13.3 Full Window Management Panel

The full panel is accessible by clicking the window manager toggle in the header. Features:

- **Window list** with name, mode, style, status (visible / black / frozen).
- **Quick actions:** fade to black / show, freeze / unfreeze, change mode, change languages, toggle hideText / hideBackground, toggle hideMouse, move/resize, close.
- **Create window** button with config form. Names suggested from the **account-level window names list** (`account.window_names`).
- **Window Identify button** -- when clicked, every open presentation window displays a semi-transparent overlay for a few seconds showing:
  - The window's **name** (e.g., "Main Lyrics").
  - An **incremental number** (e.g., #1, #2, #3) to distinguish windows sharing the same name.
  - This helps the operator quickly identify which physical screen corresponds to which window configuration.
- **Freeze functionality** per window:
  - A toggle switch per window to **freeze** it.
  - When frozen, the presentation window ignores all content updates (song changes, block/line navigation, style changes). It continues to display whatever was on screen when frozen.
  - When **unfrozen**, the window immediately updates to the current live state (latest song, block, line, style).
  - Use case: freeze a secondary screen to hold a specific slide while navigating ahead on the primary screen.
- **Named groups:** Windows with the same name grouped visually.
- **Desktop area assignment:** Visual grid of connected displays; drag windows onto displays.
- **Presets:** Save/load layout presets (stored in localStorage).
- Simplified version in browser mode.
- Controllable via WebSocket (see 22).

---

## 14. Styling & Theming System

### 14.1 Style Levels & Priority

The styling system uses **three cascading layers**. Each level defines a default style and can optionally define **additional styles per presentation window name** for targeted overrides.

| Level      | Scope                               | Storage                               |
| ---------- | ----------------------------------- | ------------------------------------- |
| **Global** | Account-wide default                | `account.default_style_id`            |
| **Show**   | Per set-list / show                 | `shows.style_id`                      |
| **Item**   | Per song / media item / bible verse | `songs.style_id` / `ShowItem.styleId` |

**Priority** (highest to lowest): **Item → Show → Global**. This is a fixed three-tier cascade.

At each level, the style system supports:

- A **default style** that applies to all presentation windows.
- **Window-name-specific style overrides** that apply only to presentation windows with a matching name. For example, at the show level you might define a default style for all windows plus an override style specifically for the window named "Stream".

**Resolution algorithm** for a given presentation window:

1. Start at the **Item** level. Check if there is a window-name-specific override for this window's name. If yes, use it. Otherwise, use the item's default style. If the item has no style, fall through.
2. Check the **Show** level. Same logic: window-name-specific override first, then default, then fall through.
3. Check the **Global** level. Same logic.
4. Properties cascade: if a higher-priority level does not define a property (or the property is disabled), the next level's value is used.

### 14.2 Style Properties

All style properties are stored as a single JSON blob in the `styles.data` column. The backend only stores and retrieves this JSON — **all style resolution, merging, and CSS calculation happens client-side**.

Each configurable property uses a uniform `{ enabled: boolean; value: T }` shape. When `enabled` is `false`, the property is preserved but skipped during rendering, and the cascade falls through to the next level. This makes the data compact, consistent, and easy to handle in the UI (each property row has a toggle + value editor).

```typescript
/** A single toggleable style property */
interface StyleProp<T> {
  enabled: boolean;
  value: T;
}

interface Style {
  id: number;
  name: string;
  enabled: boolean; // master switch: if false, the entire style is skipped
  css?: string; // raw CSS (advanced)

  // Background
  backgroundImage?: StyleProp<string>; // path / URL
  backgroundVideo?: StyleProp<string>; // path / URL
  backgroundColor?: StyleProp<string>; // hex color

  // Font
  fontFamily?: StyleProp<string>; // primary font, e.g., "Roboto"
  fontFallback?: StyleProp<string[]>; // ordered fallback fonts, e.g., ["Arial", "Helvetica", "sans-serif"]
  fontColor?: StyleProp<string>; // hex color
  fontSize?: StyleProp<string>; // e.g., "4vw", "48px"
  fontBold?: StyleProp<boolean>;
  fontItalic?: StyleProp<boolean>;
  fontUnderline?: StyleProp<boolean>;

  // Spacing
  lineHeight?: StyleProp<string>; // e.g., "1.4", "2em"
  letterSpacing?: StyleProp<string>; // e.g., "0.05em", "2px"
  padding?: StyleProp<string>; // CSS padding, e.g., "20px 40px"

  // Text
  textTransform?: StyleProp<'none' | 'uppercase' | 'lowercase' | 'capitalize'>;
  textAlign?: StyleProp<'left' | 'center' | 'right' | 'justify'>;
  textStroke?: StyleProp<string>; // -webkit-text-stroke, e.g., "1px black"
  textShadow?: StyleProp<string>; // e.g., "2px 2px 4px rgba(0,0,0,0.8)"
  textShadowColor?: StyleProp<string>;

  // Effects
  opacity?: StyleProp<number>; // 0.0 -- 1.0

  // Visibility
  hideText?: boolean; // hides text overlay when true
  hideBackground?: boolean; // hides background image/video when true

  // Next-block preview
  nextLinePreviewColor?: StyleProp<string>; // color for the next-block first-line preview (hex)

  // Window overrides
  windowOverrides?: StyleWindowOverride[]; // per-window-name overrides
}

interface StyleWindowOverride {
  windowName: string; // target presentation window name
  overrideStyleId: number; // the style to apply instead for this window
}
```

> **Note:** Only `padding` is provided (no `margin`). Padding controls the inner spacing of the content area on the presentation window. Margin would be redundant since the presentation content is the only element in the viewport.

### 14.3 Per-Property Enabled Toggle

Each style property uses the `StyleProp<T>` pattern: `{ enabled: boolean; value: T }`. When `enabled` is **`false`**:

- The property value is preserved in the style definition but **not applied** during rendering.
- The cascade falls through to the next level for that specific property.
- This allows the operator to quickly turn individual properties on and off without losing their configured values.
- In the style editor UI, each property row has a small toggle switch next to its value editor.

### 14.4 Per-Level Disable

Each style level can be **disabled entirely** to avoid unwanted changes and make it easier to detect where a style has an effect:

- At the **show** level: a "Disable show style" toggle in the show settings.
- At the **item** level: a "Disable item style" toggle in the item settings.
- When a level is disabled, the cascade skips it entirely and falls through to the next level.
- The `enabled` flag on the `Style` object serves as the master switch.

### 14.5 Style Inspector Dialog

An **Active Styles Inspector** dialog provides a detailed breakdown of the currently active styles for any presentation window:

- Opened from the Style Editor, Window Manager, or a dedicated toolbar button.
- Shows a **property-by-property table** with columns:
  - Property name (e.g., "Font Family", "Font Size", "Background Image").
  - **Effective value** -- the value currently being rendered.
  - **Source level** -- which style level the value comes from (Global / Show / Item).
  - **Source style name** -- the name of the style providing the value.
  - Whether the property is explicitly set or inherited from a lower-priority level.
- Helps the operator understand why a presentation looks a certain way and quickly identify which style to edit.

### 14.6 Font Selection & Fallback

- The **Font Family** field in the style editor is a **searchable dropdown** listing all available fonts on the system.
  - In Electron: uses the system font enumeration API (or a bundled font list).
  - In browser: uses `document.fonts` API or a curated list of web-safe fonts.
- **Font fallback cascade:** The `fontFallback` array defines an ordered list of fallback fonts. The rendered CSS `font-family` is constructed as: `fontFamily, fontFallback[0], fontFallback[1], ..., sans-serif`.
- The fallback list is editable in the style editor via a sortable list (drag to reorder priority).
- **Font availability notification:** If a font stored in the style settings is not available on the current device, a notification/warning is shown in the style editor and optionally as a toast notification. The notification suggests using one of the fallback fonts or installing the missing font.

### 14.7 Style Editor

WYSIWYG editor with controls for:

- **Font family** (searchable dropdown of available fonts) with fallback cascade editor.
- **Font color** (color picker), **size** (slider + input), **bold/italic/underline** toggles.
- **Line height**, **letter spacing** (sliders).
- **Text transform** (dropdown: none/uppercase/lowercase/capitalize).
- **Text alignment** (button group: left/center/right/justify).
- **Text stroke** (color + width).
- **Text shadow** (offset X/Y, blur, color).
- **Opacity** (slider).
- **Padding** (four-sided input with linked/unlinked toggle).
- **Background** (image/video picker from media library, or solid color picker).
- **Hide text / Hide background** toggles (replaces the former display mode options).
- **Per-property enabled toggles** next to each property row.
- **CSS mode:** raw CSS toggle for advanced users.
- **Live preview** on a simulated presentation panel. All changes have **immediate effect** -- editing a style property updates all presentation windows using that style in real-time.
- **Styles library:** Named presets, assignable to any level. Window-name-specific overrides editable per style.

### 14.8 Style Assignment by Window Name

At each style level, the operator can define additional styles that target specific presentation window names:

- In the style editor or show/item settings, an "Add Window Override" button allows selecting a window name (from the account-level list) and assigning a specific style.
- Example: At the show level, the default style might use a blue background, but the window named "Stream" gets a transparent style, and the window named "Stage Monitor" gets a high-contrast style.
- Stored in the `style_window_overrides` database table.

---

## 15. App UI Theme -- Dark & Light Mode

- **`themeSlice`** (Redux) with `toggleTheme` action. Persisted in localStorage (`presenter_theme_mode`).
- Defaults to OS preference. Toggle in Header (MUI `LightMode` / `DarkMode` icons).
- Same primary (`#C44D58`) / secondary (`#4ECDC4`) in both modes. Backgrounds and text colors adapt.
- Presentation windows are unaffected (always dark background + configured style).

---

## 16. Media Management (Images, Videos & Colors)

### 16.1 Media Sources

- Configurable media directory path (in localStorage; served by Electron's local media server or web server).
- Background images/videos on presentation windows. Standalone media show items.
- Flexible video masking (see 12.6). Video playback controls (see 12.7).

### 16.2 Solid Color Media Items

In addition to images and videos, media items support **solid colors**:

- The operator can create a media show item with a **solid color** via a color picker.
- Use cases: quickly displaying a full black screen, white screen, or any custom color during transitions or as a visual break.
- The color picker supports:
  - Hex input (e.g., `#000000`).
  - RGB sliders.
  - Preset swatches for common colors (black, white, red, blue, etc.).
  - Eyedropper / custom color selection.
- When a solid-color media item is active, all presentation windows display the selected color as a full-screen background with no text.
- The color is stored in `ShowItem.mediaColor` with `mediaSubType: 'color'`.

### 16.3 Media Browser

- Thumbnails for images, duration labels for videos, color swatches for solid-color items.
- Search/filter by filename or type (image / video / color).
- Electron: media availability check on show load. Missing files notification.

---

## 17. Multi-Language Support (Song Lyrics)

### 17.1 Per-Line Language Assignment

Each line in a song block can be tagged with a language code (e.g., `EN`, `DE`, `ES`, `FR`). Lines without a tag are treated as the **default language** (set at the account level or overridden locally).

```
[EN] Amazing grace, how sweet the sound
[DE] Erstaunliche Gnade, wie süß der Klang
[EN] That saved a wretch like me
[DE] Die einen Elenden wie mich rettete
```

### 17.2 Language Configuration

- **Account-level default language:** Stored in `account.default_language`. Determines which language lines are shown when no specific filter is applied.
- **Local override:** `presenter_language_override` in localStorage can override the account default per device.
- **Available languages:** Derived from the song data. The system scans all blocks and collects unique language tags.

### 17.3 Per-Window Language Display

Each presentation window can be configured to display a specific set of languages:

- `languages: "all"` -- show all language lines (useful for bilingual display).
- `languages: "EN"` -- show only English lines.
- `languages: "EN,DE"` -- show English and German lines.

This allows different screens to show different languages simultaneously (e.g., main screen in the local language, side screen in English).

### 17.4 Song Editor Language Support

- The song editor shows language tags inline in the text.
- A language tag toolbar allows quickly inserting `[EN]`, `[DE]`, etc.
- The available languages list is configurable per account.
- Preview mode in the editor shows the filtered view per language.

### 17.5 Per-Show-Item Language Override

Each song in the set-list can override the language/translation display for that specific item via `ShowItem.translations`:

- **`translations` field:** An ordered array of language codes (e.g., `["EN", "DE"]`). The first entry is the **primary language** (displayed on top / most prominently). Subsequent entries are secondary translations shown below.
- **Interaction with per-window languages:** The presentation window's `languages` config acts as a **filter** — only languages included in the window config are displayed. Within that filter, the item's `translations` array determines the **display order** and priority. If `translations` is not set on the item, the default account language and per-window config apply as before.
- **UI:** In the sidebar, each song item's popdown menu includes a "Translations" section where the operator can select which languages to show and drag them to set priority order. Small chips below the song item indicate the active override (e.g., "EN primary", "DE").

---

## 18. Band-Specific Orders

### 18.1 Concept

A single song can have **multiple named orderings** (block sequences). Different bands, worship teams, or arrangements may perform the song in a different order. The `"Default"` order is the base arrangement — it is automatically populated during import (CCLI or manual creation) and used as the fallback whenever no band-specific order is selected for a show item.

### 18.2 Data Model

The `orders` field on a song is a JSON object mapping order names to block-name arrays:

```typescript
// Song.orders
{
  "Default": ["Intro", "Verse 1", "Chorus", "Verse 2", "Chorus", "Bridge", "Chorus", "Outro"],
  "Acoustic": ["Verse 1", "Chorus", "Verse 2", "Chorus", "Outro"],
  "Youth Band": ["Intro", "Verse 1", "Verse 2", "Chorus", "Chorus", "Bridge", "Outro"]
}
```

### 18.3 Features

- **Song editor:** Manage orders in a dedicated tab. Add/rename/delete orders. Drag blocks to reorder within an order. Blocks can appear multiple times (e.g., Chorus repeated).
- **Band name autocomplete:** When creating a new order name, previously used band names across all songs are suggested for consistency.
- **Per-show-item order selection:** Each song in the set-list can specify which order to use (`ShowItem.order`). The operator selects from a dropdown of available orders when adding the song to the show.
- **Default order:** If no specific order is selected, the `"Default"` order is used.
- **Musician view integration:** The musician view includes a **band selector** (dropdown) that lets the musician pick their band. The selected band is stored in `presenter_musician_band` (localStorage) and determines which song order is displayed in the musician sidebar and which PDF variant is resolved (see 11.4). Available bands are aggregated from all order names across songs in the current show for easy selection.

---

## 19. OIDC Authentication (OIDC-Only)

### 19.1 Login Flow

1. **Login page** shows account selector dropdown and "Login with OIDC" button. **No mail/license form.** The legacy mail + license authentication has been **removed**.
2. OIDC redirect -> callback -> session.
3. Admin login uses global OIDC config with admin group check.

### 19.2 Provider Types

- Per-tenant (DB-based) and Admin (global config).

### 19.3 Session Handling

- Cookie-based PHP sessions. Frontend checks via `GET /rest/Session`.

---

## 20. Unified Search

### 20.1 Concept

A single search bar in the sidebar/header with a **type filter chip** dropdown that lets the user select what to search for. This replaces having separate search UIs per entity type.

### 20.2 Searchable Types

| Type Chip | MUI Icon        | Searches                               |
| --------- | --------------- | -------------------------------------- |
| `All`     | `Search`        | All types below                        |
| `Songs`   | `MusicNote`     | Songs by title, number, or lyrics text |
| `Media`   | `Image`         | Media files by filename                |
| `Styles`  | `Palette`       | Style presets by name                  |
| `Bible`   | `MenuBook`      | Bible verses by reference              |
| `CCLI`    | `CloudDownload` | CCLI SongSelect (remote, best-effort)  |

### 20.3 UI

- The search bar shows a chip/dropdown **before** the text input where the user selects the type.
- Results are displayed in a dropdown or panel below, grouped by type when "All" is selected.
- Clicking a song result adds it to the show. Clicking a media result adds a media item. Clicking a style result opens the style editor. Clicking a bible result opens the verse picker pre-filled. Clicking a CCLI result triggers import.

### 20.4 Backend

`GET /rest/Search?q=term&type=songs` -- the `type` parameter filters which entities to search. The backend queries the relevant tables with full-text or LIKE search and returns unified results.

---

## 21. Settings & Configuration

### 21.1 Settings Storage

**All settings are stored in localStorage** under keys prefixed with `presenter_`. This applies to both browser and Electron mode, ensuring maximum compatibility and a single source of truth.

### 21.2 Account-Level Settings (Database)

Some settings are stored **per account in the database** so they are shared across devices:

| Setting               | Column                        | Description                                                  |
| --------------------- | ----------------------------- | ------------------------------------------------------------ |
| Default style         | `account.default_style_id`    | Account-wide default presentation style                      |
| Default language      | `account.default_language`    | Default song translation language (e.g., "EN")               |
| Show title template   | `account.show_title_template` | Template with date variables: `{yyyy}`, `{MM}`, `{dd}`, etc. |
| Window names          | `account.window_names`        | JSON array of named window identifiers for this account      |
| Musician names        | `account.musician_names`      | JSON array of musician / instrument names for PDF resolution |
| Show item type config | `show_item_types.*`           | Colors and MUI icon names per item type                      |

> The **default language** can be **overridden locally** in localStorage (`presenter_language_override`). If set, the local value takes precedence. If not, the account default is used.

### 21.3 Client-Side Settings (localStorage)

> **Cleanup:** Legacy settings removed:
>
> - `POPUP_*` -> Window Manager
> - `HIDE_MOUSE` / `SHOW_HIDE_MOUSE` -> per-window `hideMouse` config
> - `SHOW_PREVIEW` -> Window Manager preview
> - `SHOWN_TRANSLATIONS` / `TRANSLATIONS` -> per-window language; available languages = account setting
> - `USE_KEYBOARD_NAVIGATION_*` -> configurable keyboard mapping (see 22)
> - `HEADLINE_SMOOTH_SCROLL_BEHAVIOUR` -> presentation styling
> - `THEME` (boxed/list) -> renamed `CONTROL_LAYOUT`
> - `SHOW_SAVE_FORMAT` -> moved to account-level `show_title_template`

| Setting                              | Type    | Default                 | Description                                                                                       |
| ------------------------------------ | ------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| `presenter_backend_url`              | string  | `http://localhost:9000` | Backend API base URL                                                                              |
| `presenter_theme_mode`               | enum    | `system`                | `dark`, `light`, or `system`                                                                      |
| `presenter_ui_language`              | string  | (none)                  | App UI language override (typesafe-i18n locale, e.g., `en`, `de`). Falls back to account default. |
| `presenter_language_override`        | string  | (none)                  | Local override for account default song lyrics language                                           |
| `presenter_confirm_page_leave`       | boolean | `true`                  | Confirm before leaving page                                                                       |
| `presenter_confirm_show_deletion`    | boolean | `true`                  | Confirm before deleting a show                                                                    |
| `presenter_confirm_show_overwrite`   | boolean | `true`                  | Confirm before overwriting a show                                                                 |
| `presenter_confirm_song_delete`      | boolean | `true`                  | Confirm before deleting a song                                                                    |
| `presenter_default_new_verse_name`   | string  | `Outro`                 | Default name for new blocks                                                                       |
| `presenter_default_verse_name`       | string  | `Vers 1`                | Default first block name                                                                          |
| `presenter_notification_count`       | number  | `4`                     | Max visible notifications                                                                         |
| `presenter_notification_time`        | number  | `3500`                  | Notification auto-dismiss (ms)                                                                    |
| `presenter_override_song_import`     | boolean | `false`                 | Override existing songs on import                                                                 |
| `presenter_reload_song_after_edit`   | boolean | `false`                 | Reload song from server after editing                                                             |
| `presenter_reset_black_on_switch`    | boolean | `false`                 | Reset black screen when switching songs                                                           |
| `presenter_show_limit`               | number  | `10`                    | Shows per page                                                                                    |
| `presenter_next_line_preview`        | boolean | `true`                  | Show first line of next block as preview on presentation                                          |
| `presenter_next_line_preview_color`  | string  | `#AAAAAA`               | Color for the next-block preview line (hex)                                                       |
| `presenter_next_line_translation`    | boolean | `true`                  | Include all displayed languages in next-line preview                                              |
| `presenter_show_delete_from_db`      | boolean | `false`                 | Show delete-from-database in library                                                              |
| `presenter_upload_notifications`     | boolean | `true`                  | Notifications on song upload                                                                      |
| `presenter_song_click`               | enum    | `double-click`          | `click` or `double-click` to select song                                                          |
| `presenter_song_order`               | enum    | `lexicographic`         | `lexicographic` or `numeric` sorting                                                              |
| `presenter_control_layout`           | enum    | `boxed`                 | `boxed` or `list` for control area                                                                |
| `presenter_touch_duration`           | number  | `300`                   | Long-press duration (ms)                                                                          |
| `presenter_verse_click`              | enum    | `double-click`          | `click` or `double-click` for verse/block                                                         |
| `presenter_bible_translation`        | string  | `ESV`                   | Default bible translation                                                                         |
| `presenter_keyboard_mapping`         | JSON    | (defaults)              | Custom keyboard shortcut mapping                                                                  |
| `presenter_window_configs`           | JSON    | `[]`                    | Saved window layout configurations                                                                |
| `presenter_window_presets`           | JSON    | `{}`                    | Named window layout presets                                                                       |
| `presenter_window_footer_visible`    | boolean | `true`                  | Show/hide the window management footer bar                                                        |
| `presenter_media_path`               | string  | (none)                  | Local media directory (Electron)                                                                  |
| `presenter_ws_port`                  | number  | `9001`                  | WebSocket server port (Electron)                                                                  |
| `presenter_auto_check_updates`       | boolean | `true`                  | Auto-check for updates on startup (Electron)                                                      |
| `presenter_musician_name`            | string  | (none)                  | Active musician/instrument name for PDF resolution                                                |
| `presenter_musician_band`            | string  | (none)                  | Active band / order name for musician view (PDF + order)                                          |
| `presenter_musician_page_view`       | enum    | `single`                | `single`, `two-page`, or `continuous` PDF page view mode                                          |
| `presenter_musician_block_indicator` | boolean | `true`                  | Show block selection indicator in musician view                                                   |
| `presenter_midi_mappings`            | JSON    | `{}`                    | MIDI button-to-action mappings, keyed by device name                                              |
| `presenter_midi_tracking_master`     | enum    | `operator`              | `operator` or `midi` — who controls musician view position                                        |

### 21.4 Settings UI

- Grouped sections: General, Behavior, Confirmations, Notifications, Presentation, Musician, Electron.
- Proper typed inputs. Tooltips. Search/filter.
- Theme toggle in header, not in settings.

---

## 22. Keyboard Mapping & WebSocket / Companion Commands

### 22.1 Configurable Keyboard Mapping

Users assign any shortcut to any action via a **Keyboard Mapping Editor** in settings. Stored in localStorage.

Default mappings:

| Key          | Modifier | Action                                 |
| ------------ | -------- | -------------------------------------- |
| `PageUp`     | --       | Previous item                          |
| `PageDown`   | --       | Next item                              |
| `ArrowUp`    | `Ctrl`   | Previous item                          |
| `ArrowDown`  | `Ctrl`   | Next item                              |
| `ArrowUp`    | --       | Previous line                          |
| `ArrowDown`  | --       | Next line (auto-advance to next block) |
| `ArrowLeft`  | --       | Previous block                         |
| `ArrowRight` | --       | Next block                             |
| `B`          | --       | Toggle fade-to-black (all windows)     |
| `F`          | --       | Toggle fullscreen (presentation)       |
| `Escape`     | --       | Close active drawer/dialog             |

### 22.2 WebSocket Server (Electron-Only)

> The PHP backend does **not** support WebSocket. The WebSocket server runs **exclusively** in the Electron main process (Node.js `ws` library). In browser-only mode WebSocket features are not available.

Port configurable (default `9001`). Purposes: Bitfocus Companion, remote control, multi-client sync, musician view sync.

Protocol:

```typescript
interface WSCommand {
  id?: string;
  action: string;
  target?: string; // window name
  payload?: Record<string, any>;
}

interface WSResponse {
  id?: string;
  type: 'response' | 'broadcast';
  action: string;
  success: boolean;
  data?: Record<string, any>;
  error?: string;
}
```

Actions:

| Action                 | Payload                        | Target  | Description                                                                                        |
| ---------------------- | ------------------------------ | ------- | -------------------------------------------------------------------------------------------------- |
| `next_item`            | --                             | --      | Next item in show                                                                                  |
| `prev_item`            | --                             | --      | Previous item                                                                                      |
| `next_block`           | --                             | --      | Next block                                                                                         |
| `prev_block`           | --                             | --      | Previous block                                                                                     |
| `next_line`            | --                             | --      | Next line                                                                                          |
| `prev_line`            | --                             | --      | Previous line                                                                                      |
| `set_item`             | `{ index: number }`            | --      | Jump to item                                                                                       |
| `set_block`            | `{ index: number }`            | --      | Jump to block                                                                                      |
| `set_line`             | `{ index: number }`            | --      | Jump to line within current block                                                                  |
| `fade_to_black`        | --                             | window? | Fade window(s) to black                                                                            |
| `fade_from_black`      | --                             | window? | Show content                                                                                       |
| `toggle_black`         | --                             | window? | Toggle black                                                                                       |
| `freeze_window`        | --                             | window  | Freeze a named window (queue updates)                                                              |
| `unfreeze_window`      | --                             | window  | Unfreeze a named window (apply latest state)                                                       |
| `identify_windows`     | --                             | --      | Trigger all windows to show their name/number overlay                                              |
| `set_display_mode`     | `{ mode: string }`             | window  | Change mode (normal / stream)                                                                      |
| `video_play`           | --                             | window? | Play video (specific window or all)                                                                |
| `video_pause`          | --                             | window? | Pause video (specific window or all)                                                               |
| `video_stop`           | --                             | window? | Stop video (specific window or all)                                                                |
| `video_seek`           | `{ position: number }`         | window? | Seek (seconds)                                                                                     |
| `get_state`            | --                             | --      | Current state (item, block, line)                                                                  |
| `get_windows`          | --                             | --      | List windows with status                                                                           |
| `musician_sync`        | --                             | --      | Broadcast: current song, block, line for musician views                                            |
| `musician_pdf_updated` | `{ songNumber, pdfName }`      | --      | Broadcast: a PDF file was modified (annotation saved); clients show a "new version available" hint |
| `midi_event`           | `{ device, action, musician }` | --      | Broadcast: MIDI navigation event from a musician device (informational)                            |

### 22.3 Companion Command Helper

Helper panel in the app:

- Lists all actions with pre-filled JSON payloads. One-click **copy to clipboard**.
- Target window name dropdown (populated from account-level window names).
- Shows the WebSocket URL: `ws://localhost:9001`.
- Examples:

```json
{ "action": "fade_to_black", "target": "Main Lyrics" }
{ "action": "set_block", "payload": { "index": 0 } }
{ "action": "set_line", "payload": { "index": 2 } }
{ "action": "freeze_window", "target": "Stream" }
{ "action": "identify_windows" }
{ "action": "video_play" }
{ "action": "video_play", "target": "Main Lyrics" }
```

---

## 23. Admin Metrics & Statistics Dashboard

### 23.1 Concept

The admin metrics dashboard provides **usage analytics** for account administrators. It tracks events such as song selections, show creations, logins, and feature usage. The data powers visualizations that help admins understand how the tool is being used.

### 23.2 Event Tracking

Events are recorded via `POST /rest/Metrics` and stored in the `metrics` table. Each event includes:

- **Event type** -- a string identifier (e.g., `song_selected`, `show_created`, `show_loaded`, `block_navigated`, `login`, `presentation_opened`, `style_changed`).
- **Entity type** -- the type of entity involved (e.g., `song`, `show`, `style`, `window`).
- **Entity ID** -- the specific entity (e.g., song number, show title).
- **User sub** -- the OIDC subject identifier of the user (for per-user analytics).
- **Metadata** -- additional JSON data (e.g., device type, display mode, duration).
- **Timestamp** -- when the event occurred.

### 23.3 Dashboard UI

The metrics dashboard is available on the **Admin Page** (`/admin`) and includes:

- **Date range picker** -- filter all charts/tables to a specific time period.
- **Bar charts:**
  - Most played songs (by selection count).
  - Most used shows.
  - Events per day/week/month.
- **Line charts:**
  - Usage trends over time (daily active users, total events).
  - Song usage trends (how often specific songs are selected over time).
- **Pie charts:**
  - Distribution of event types.
  - Distribution of display modes used.
  - Distribution of devices/browsers.
- **Data tables:**
  - Recent events log with filtering and sorting.
  - Top songs with play counts.
  - Top users by activity.
- **Export:** CSV export for all tables and chart data.

### 23.4 Privacy Controls

- **Anonymization option:** Admins can choose to anonymize user identifiers in the metrics data.
- **Retention policy:** Configurable retention period (e.g., 90 days, 1 year). Older events are automatically purged.
- **Opt-out:** Individual users can opt out of detailed tracking (basic event counts are still recorded without user identification).
- **Data deletion:** Admins can manually delete all metrics data for the account.

### 23.5 Backend Queries

- `GET /rest/Metrics?from=&to=&event=&entity_type=&limit=` -- Filterable query with pagination.
- `POST /rest/Metrics` -- Record a new event (called by the frontend on significant user actions).
- The backend aggregates data for chart endpoints to avoid transferring raw event logs to the frontend for large datasets.

---

## 24. Internationalization (App UI)

- **typesafe-i18n** with React adapter. English (base) + German.
- `.typesafe-i18n.json`: `"outputPath": "./frontend/src/i18n"`.
- **Runtime language switching:** The active locale is switchable at runtime via the **header language selector** (compact flag icons, e.g., 🇬🇧 / 🇩🇪). The selector shows all available locales.
- **Default locale:** Resolved from the account-level `default_language` setting. Overridden per device by `presenter_ui_language` in localStorage.
- **Distinct from song lyrics language:** The app UI language (this section) controls menus, labels, tooltips, and dialogs. Song lyrics language (§17) controls which translation lines are displayed in the presentation. These are independent settings.

---

## 25. Migration Script (PHP)

> **Note:** This spec is still a **draft**. Since nothing has been implemented yet, the `install.sql` file defines the canonical initial schema for new installations. The migration script below is only needed for **existing databases** (from the legacy PHP app) that need to be upgraded to the new schema.

### 25.1 Why PHP

The migration script is written in **PHP** (not TypeScript) because:

- It runs in the same environment as the backend (same DB connection, same config).
- No additional Node.js dependency needed on the server.
- Can be executed via CLI (`php migrate.php`) or triggered from the admin panel.

### 25.2 `migrate.php`

A PHP script that:

1. Connects to the MySQL database using the existing `config.php`.
2. Checks the current schema version (stored in a `schema_version` table or similar).
3. Applies pending migrations in order:

- Add new tables: `styles`, `style_window_overrides`, `metrics`, `show_item_types`.
- Add new columns to `account` (`default_style_id`, `default_language`, `show_title_template`, `window_names`, `musician_names`), `shows` (`style_id`), `songs` (`style_id`).
- Migrate `songs.order` from comma-separated string to JSON `{ "Default": [...] }`.
- Migrate `shows.order` from number array to typed `ShowItem` array.
- Insert default `show_item_types` rows per account.
- Remove legacy `mail`+`license` session logic from Session controller.

4. Backs up affected data before modifying.
5. Supports `--dry-run` flag to preview changes without applying.
6. Logs all actions.

### 25.3 Frontend Data Migration

Detect old localStorage format (from the electron-app prototype), offer to import to server.

---

## 26. Testing & Quality _(optional)_

- **Vitest** + happy-dom for unit tests. **Playwright** for E2E.
- ESLint (flat), Prettier, TypeScript strict, CI checks.

> **Note:** This section is optional. The project currently relies on TypeScript strict mode, ESLint, and Prettier for quality assurance. Full test infrastructure (Vitest, Playwright) can be added later as needed.

---

## 27. Build, Release & CI/CD _(CI/CD: optional)_

```json
{
  "scripts": {
    "dev": "concurrently \"typesafe-i18n\" \"vite dev\" \"php -S localhost:8000\"",
    "dev:frontend": "vite dev",
    "dev:backend": "php -S localhost:8000 -t ./",
    "build": "tsc --noEmit && vite build",
    "build:electron": "electron-vite build",
    "build:deploy": "vite build --config vite.config.ts",
    "package:win": "npm run build:electron && electron-builder --win",
    "package:mac": "npm run build:electron && electron-builder --mac",
    "package:linux": "npm run build:electron && electron-builder --linux",
    "lint": "eslint .",
    "format": "prettier --write .",
    "typecheck": "tsc --noEmit",
    "typesafe-i18n": "typesafe-i18n"
  }
}
```

### 27.1 Deployment Build (`build:deploy`)

The `build:deploy` script produces a self-contained `dist/` folder ready for deployment to a PHP web server:

1. **Frontend build:** Vite builds the frontend with three entry points:

- **Main app** (`index.html`) — the primary control SPA.
- **Musician view** (`musician.html`) — the standalone musician PDF view.
- **Presentation window** (`presentation.html`) — the presentation renderer.

2. **Backend copy via `vite-plugin-static-copy`:** The Vite build automatically copies all necessary PHP backend files into `dist/` alongside the frontend assets:

- `api/` — all REST controllers.
- `classes/` — PHP utility classes.
- `rest.php`, `oidc.php`, `install.sql`, `migrate.php`, `.htaccess` — root PHP files.
- `config-sample.php` — sample config (but **not** `config.php`, which is environment-specific and git-ignored).
- `favicon.ico`, `favicon.svg` — favicons.

3. **No separate build script needed:** The `vite-plugin-static-copy` plugin handles file copying as part of the Vite build pipeline, eliminating the need for a separate `scripts/deploy.mjs` script.
4. **Exclusions:** `config.php`, `data/`, `node_modules/`, `electron/`, `.env`, test files, and source TypeScript files are **not** included in `dist/`.
5. **Result:** The `dist/` folder can be deployed directly to an Apache/Nginx server with PHP. The administrator copies `config-sample.php` to `config.php` and configures it. The `data/` folder is created automatically by the server at runtime.

> **CI/CD (optional):** PR checks (lint, typecheck, test), release workflow, and auto-update can be added later via `.github/workflows/`.

---

## 28. Non-Functional Requirements

| Requirement        | Target                                                            |
| ------------------ | ----------------------------------------------------------------- |
| **Performance**    | Presentation window 60fps. Block switching < 16ms.                |
| **Responsiveness** | Control UI usable on tablets (768px+).                            |
| **Accessibility**  | Keyboard-navigable. Color contrast in both themes.                |
| **Security**       | OIDC only. Session-based. CSP. Context isolation in Electron.     |
| **Offline**        | Electron caches loaded songs. Presentation works without backend. |
| **Browser**        | Chrome/Edge 120+, Firefox 120+, Safari 17+.                       |
| **Electron**       | Windows 10+, macOS 12+, Ubuntu 22.04+.                            |
| **Scalability**    | Hundreds of songs, dozens of shows per account.                   |

---

## 29. Future Ideas / Nice-to-Have

1. **Remote control app** -- mobile PWA.
2. **Collaborative editing** -- multi-user via WebSocket.
3. **Countdown timer** -- pre-service countdown on screens.
4. **Multi-user roles** -- viewer, operator, editor, admin.
5. **Touch-optimized mode** -- larger targets, gestures.
6. **Auto-advance timer** -- advance blocks after configurable duration.
7. **Annotation layer** -- draw/highlight on live presentation screens in real-time (operator overlay, not PDF).
8. **PDF annotation conflict resolution** -- handle simultaneous edits by multiple musicians to the same PDF; merge or last-write-wins with notification.
9. **Offline PDF annotation queue** -- when a musician is disconnected, queue annotation changes locally and sync them when reconnected.
10. **Smart block-to-PDF mapping** -- automatic detection of block regions on PDF pages, reducing manual mapping effort.
11. **PDF annotation templates / stamps** -- reusable annotation stamps for common musical notations (repeat signs, dynamics, coda, dal segno, etc.).
12. **Style version history / undo** -- track changes to style presets over time with the ability to revert to previous versions.
13. **Band / musician profiles** -- save preferred settings (band, instrument, PDF view mode, annotation colors) as a reusable profile.
14. **Chord chart integration** -- display chord symbols above lyrics lines for musicians, alongside or instead of PDF sheet music.
15. **Rehearsal mode with tempo / metronome** -- built-in metronome with configurable BPM per song for practice sessions.
16. **Set-list templates** -- reusable show structures (e.g., "Sunday Morning Template") that can be cloned and filled with different songs.
17. **MIDI operator control** -- extend MIDI support beyond musician view to the operator's control view (foot-switch for next block, etc.).
18. **Service worker PDF caching** -- progressive web app caching for PDFs to enable full offline musician view in browser mode.

---

## Glossary

| Term                    | Definition                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Song**                | A worship song with metadata, text blocks, and ordering.                                                                                                            |
| **Block**               | A named section of a song (e.g., "Verse 1", "Chorus").                                                                                                              |
| **Line**                | A single line of text within a block. Individually selectable by the operator for precise navigation and stream-mode display.                                       |
| **Line Selection**      | The ability to select individual lines within a block, used for stream-mode two-line display and as an orientation aid for the operator.                            |
| **Order**               | The sequence of blocks for a specific arrangement.                                                                                                                  |
| **Default Order**       | The `"Default"` key in `Song.orders` — the base arrangement, auto-populated on import, used as fallback when no band-specific order is selected.                    |
| **Song Key**            | The musical key of a song (e.g., "C", "G", "Bb"). Optional. Used for PDF variant resolution and display in the sidebar.                                             |
| **Show**                | A set-list: an ordered collection of typed items for an event.                                                                                                      |
| **Show Item**           | A typed entry in a show (song, media, or bible verse) with optional per-item overrides (order, key, translations).                                                  |
| **Style**               | A named set of visual properties (fonts, colors, backgrounds, spacing) stored as JSON with per-property enable toggles.                                             |
| **Style Level**         | One of three cascading tiers: Global (account), Show (set-list), or Item (song/media/verse).                                                                        |
| **Font Fallback**       | An ordered list of fallback fonts used when the primary font is unavailable.                                                                                        |
| **Presentation Window** | A separate window/screen displaying content.                                                                                                                        |
| **Window Name**         | An identifier for one or more windows; actions and style overrides target by name.                                                                                  |
| **Window Freeze**       | A per-window toggle that queues content updates without rendering them until unfrozen.                                                                              |
| **Window Identify**     | A command that causes all presentation windows to briefly display their name and number overlay.                                                                    |
| **Video Mask**          | A flexible percentage-based crop region applied to a video.                                                                                                         |
| **Next-Block Preview**  | An optional preview line at the bottom of the presentation window showing the first line of the upcoming block, with configurable color and multi-language support. |
| **Musician View**       | A separate page/window showing PDF sheet music in sync with the show. Works in browser (manual mode) and Electron (auto-sync mode).                                 |
| **Musician Name**       | A custom identifier (personal name or instrument) used to resolve which PDF variant to display.                                                                     |
| **Musician Band**       | The band / order name selected by a musician device, determining which song order and PDF variant to use. Stored in localStorage.                                   |
| **PDF Dashboard**       | A web-based view for browsing, searching, uploading, and managing PDF sheet music files on the server.                                                              |
| **PDF Annotation**      | A comment, drawing, or highlight saved directly into a PDF file, viewable in the musician view and in any standard PDF reader.                                      |
| **MIDI Learn**          | A feature that maps MIDI device buttons to app actions by listening for the next MIDI message and associating it with a chosen action.                              |
| **Explicit Save**       | The UX principle that all data mutations require a manual Save/Update action — no auto-save. An unsaved-changes indicator is always shown.                          |
| **App UI Language**     | The language used for the app interface (menus, labels, tooltips), controlled by typesafe-i18n. Distinct from song lyrics language.                                 |
| **CCLI**                | Christian Copyright Licensing International.                                                                                                                        |
| **OIDC**                | OpenID Connect -- authentication protocol.                                                                                                                          |
| **License**             | An account identifier (originally a CCLI license number).                                                                                                           |
| **Companion**           | Bitfocus Companion -- external controller software (StreamDeck etc.).                                                                                               |
| **Metrics**             | Usage analytics events recorded for admin dashboards.                                                                                                               |

---

_This document is the complete requirements specification for the Presenter application rewrite. It consolidates all existing functionality from both the PHP web app and the Electron prototype, along with all new features and enhancements._

---

## 30. Open Questions & Review Notes

This section captures inconsistencies, undefined cases, and items needing reconsideration discovered during a full audit of the specification.

### 30.1 Resolved Ambiguities (Confirmed Decisions)

| #   | Topic                           | Resolution                                                                                                                                                           |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Song.orders `"Default"` key** | Every song must have a `"Default"` order. It is auto-populated during import and serves as the canonical fallback. Confirmed in §9.1 and §18.1.                      |
| 2   | **State management**            | All client state is managed via Redux slices. No React Context is used. Confirmed in §6.3.                                                                           |
| 3   | **No auto-save**                | All entities require explicit Save. Confirmed as a global UX principle in §6.1.                                                                                      |
| 4   | **PDFs server-side**            | PDFs stored in `data/{account}/pdfs/` on the server. Served via authenticated REST. Electron's `pdfServer.ts` demoted to optional offline cache. Confirmed in §11.2. |
| 5   | **Bible translation selection** | `config.php` defines the API connection; the user selects the translation at runtime from a dynamically fetched list. Confirmed in §10.2–10.3.                       |

### 30.2 Open Questions

| #   | Topic                                                        | Description                                                                                                                                                                                                        | Recommendation                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **PDF offline fallback strategy**                            | With server-side PDFs (§11.2), what happens when the musician device is offline? The spec mentions `pdfCache.ts` as optional but doesn't define caching rules.                                                     | Define a maximum cache size and LRU eviction policy. Pre-cache all PDFs for the current show on load. Consider service worker caching for browser-only mode (listed in §29 as future idea).                                                          |
| 2   | **`presenter_ui_language` vs `presenter_language_override`** | Two settings with similar names — one for app UI language (§24), one for song lyrics language (§17). Risk of developer/user confusion.                                                                             | Consider renaming: `presenter_ui_locale` for the app UI, keep `presenter_language_override` for lyrics. Document the distinction prominently.                                                                                                        |
| 3   | **Per-show-item translations vs per-window languages**       | `ShowItem.translations` (§17.5) and `WindowConfig.languages` (§12.5) both control which language lines are displayed. The spec says window config filters first, then item translations reorder within the filter. | Confirm this is the desired behavior. Edge case: what if `ShowItem.translations` contains a language not in `WindowConfig.languages`? — It should be silently ignored (window config is the hard filter).                                            |
| 4   | **Bible bold formatting persistence**                        | `ShowItem.bibleFormattedSegments` stores bold ranges (§8.2). These must survive show save/load.                                                                                                                    | Confirm that `bibleFormattedSegments` is serialized as part of the show JSON in the `shows` DB table. The backend must not strip unknown fields from the `order` JSON column.                                                                        |
| 5   | **Song key and CCLI import**                                 | CCLI `.txt` files do not contain key information.                                                                                                                                                                  | Key must always be set manually after import. The import flow should not fail or warn about missing key — it's optional.                                                                                                                             |
| 6   | **MIDI browser constraints**                                 | Web MIDI API requires HTTPS or localhost (§11.10). In browser-only mode over HTTP, MIDI won't work.                                                                                                                | Document this in setup instructions. Recommend HTTPS for production deployments. In Electron, localhost is always available so MIDI works without HTTPS.                                                                                             |
| 7   | **`data/` folder permissions**                               | The `data/` folder must be writable by the PHP process (§11.2). On shared hosting this may require specific permissions.                                                                                           | Document `chmod 755` or `775` requirement in the setup guide. The server should check write permissions on startup and show a clear error if not writable.                                                                                           |
| 8   | **ShowItem growing complexity**                              | With new fields (`translations`, `key`, `bibleFormattedSegments`, `order`, `styleId`), the `ShowItem` interface is getting large.                                                                                  | Acceptable for now since all fields are optional and the JSON is compact. If more fields are added in the future, consider grouping into sub-objects (e.g., `songOverrides: { order, key, translations }`, `bibleOverrides: { formattedSegments }`). |
| 9   | **PDF filename uniqueness**                                  | The folder structure (§11.2) uses filenames like `Acoustic.pdf`, `Acoustic-C.pdf`. If a musician name happens to match a band order name (e.g., both "Acoustic"), there's an ambiguity.                            | The resolution priority (§11.2) handles this: musician name is checked first. Document that musician names and band order names should ideally not overlap.                                                                                          |
| 10  | **Polling interval for PDF updates**                         | The spec recommends 30-second polling (§11.2, §11.9). For active rehearsal sessions with frequent annotation saves, this may feel slow.                                                                            | 30 seconds is a reasonable default. Consider making the interval configurable or implementing exponential backoff (fast polling during active editing, slow otherwise).                                                                              |
| 11  | **Presentation window `postMessage` security**               | Browser-mode presentation windows use `postMessage` (§12.4). Origin validation is not specified.                                                                                                                   | The renderer must validate `event.origin` against the known backend URL to prevent cross-origin attacks. Document in the security section.                                                                                                           |
| 12  | **Migration: local PDFs to server**                          | Existing Electron users may have local PDF files that need to be migrated to the server's `data/` folder.                                                                                                          | Add a one-time migration tool (CLI or UI) to §25 that uploads local PDFs to the server. This is a manual step, not automated.                                                                                                                        |
| 13  | **Style JSON validation**                                    | With the `styles.data` JSON column (§5.1), there's no schema validation at the DB level. A malformed JSON blob could break the style editor.                                                                       | The backend should validate the incoming JSON against the `Style` interface structure on write. Return a clear 400 error for invalid data.                                                                                                           |
| 14  | **Bible API error handling**                                 | If the configured bible API is down or the `translations_endpoint` returns an error (§10.2), the BibleVersePicker will show an empty translation list.                                                             | Show a user-friendly error message in the picker UI. Cache the last successful translation list in localStorage as a fallback.                                                                                                                       |
| 15  | **`PdfDashboard.tsx` scope**                                 | `PdfDashboard.tsx` in §4 covers both PDF browsing/searching and import/upload. It's a combined component.                                                                                                          | Acceptable. If it grows too large during implementation, split into `PdfBrowser.tsx` + `PdfUploader.tsx`.                                                                                                                                            |

### 30.3 Cross-Reference Consistency Checks

| Check                                                                        | Status  | Notes                                                                                      |
| ---------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| All Redux slices listed in §6.3 have matching files in §4 project structure  | ✅ Pass | `showSlice`, `presentationSlice`, `settingsSlice`, `themeSlice`, `songsSlice` all present. |
| All REST endpoints in §5.2 have matching controller files in §4              | ✅ Pass | `BibleTranslations.php` and `Pdfs.php` added.                                              |
| All localStorage settings in §21.3 are referenced somewhere in the spec      | ✅ Pass | New settings (`presenter_ui_language`, `presenter_midi_*`) referenced in §24, §11.10.      |
| All WebSocket actions in §22.2 are described                                 | ✅ Pass | `midi_event` added with description.                                                       |
| `ShowItem` fields match the descriptions in §6.4, §8.2, §17.5                | ✅ Pass | `translations`, `key`, `bibleFormattedSegments` documented in all relevant sections.       |
| `Song` interface fields match §9.1, §9.4 (editor), §18 (orders)              | ✅ Pass | `key` field added to interface and to editor metadata tab.                                 |
| PDF folder structure in §11.2 matches resolution rules                       | ✅ Pass | 6-step priority with key variants documented.                                              |
| `presenter_pdf_path` removed from §21.3                                      | ✅ Pass | Replaced by server-side `data/` folder.                                                    |
| No remaining references to `ThemeContext`                                    | ✅ Pass | Replaced with `themeSlice` in §6.3 and §15.                                                |
| No remaining references to `SongsProvider` or `SettingsProvider` as contexts | ✅ Pass | Removed from §4 and §6.3.                                                                  |
| Explicit save referenced in §6.1, §6.4, §8.3                                 | ✅ Pass | Consistent across all sections.                                                            |
| `PdfDashboard.tsx` in §4 aligns with §11.6                                   | ✅ Pass | Renamed from `PdfImporter.tsx` to match section title.                                     |
