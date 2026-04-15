# Presenter

A worship-lyrics presentation tool. Display song lyrics on one or more screens during church services or worship events. Supports songs, bible verses, media items, and PDF sheet music for musicians.

**Demo:** https://presenter.efsh.de

---

## Quick Start

### Prerequisites

- **Node.js** 20+
- **Yarn** 4 (`corepack enable && corepack prepare yarn@4.13.0 --activate`)
- **PHP** 8.2+ (for backend dev server)
- **MySQL** 9+ / MariaDB 11+ (for database)

### Install Dependencies

```bash
yarn install
```

### Development

#### Browser-Only (Frontend + PHP Backend)

```bash
# Start both frontend dev server and PHP backend
yarn dev

# Or start them separately:
yarn dev:frontend    # Electron + Vite dev server (port 5173)
yarn dev:backend     # PHP built-in server (port 8000)
yarn dev:web         # Browser-only Vite dev server (no Electron)
```

#### Electron Desktop App

```bash
yarn dev:frontend    # Starts Electron app with HMR
```

### Build

#### For PHP Web Server Deployment

```bash
yarn build:deploy
```

This produces a self-contained `dist/` folder ready for Apache/Nginx + PHP:

- Frontend assets (HTML, JS, CSS)
- PHP backend (api/, classes/, rest.php, oidc.php)
- Database schema (install.sql)
- Configuration template (config-sample.php)

**Deployment steps:**

1. Copy `dist/` contents to your web server
2. Copy `config-sample.php` to `config.php` and configure database + OIDC
3. Import `install.sql` into your MySQL database
4. Ensure `data/` directory is writable by PHP

#### For Electron Desktop App

```bash
yarn build:win       # Windows
yarn build:mac       # macOS
yarn build:linux     # Linux
```

### Type Checking

```bash
yarn typecheck       # Check both web and node configs
yarn typecheck:web   # Frontend only
yarn typecheck:node  # Electron/Node only
```

### Linting & Formatting

```bash
yarn lint            # ESLint
yarn format          # Prettier
```

---

## Project Structure

```
presenter/
├── api/                    # PHP REST controllers
├── classes/                # PHP utility classes
├── src/
│   ├── main/               # Electron main process
│   ├── preload/            # Electron preload scripts
│   ├── renderer/           # React SPA (Vite)
│   │   ├── src/
│   │   │   ├── api/        # RTK Query API
│   │   │   ├── components/ # React components
│   │   │   ├── hooks/      # Custom hooks
│   │   │   ├── i18n/       # Internationalization (EN/DE)
│   │   │   ├── pages/      # Route pages
│   │   │   ├── presentation/ # Presentation window renderer
│   │   │   ├── routes/     # Auth guards
│   │   │   ├── song/       # Song model & parser
│   │   │   ├── store/      # Redux slices
│   │   │   └── utils/      # Utilities
│   │   ├── index.html      # Main SPA entry
│   │   ├── presentation.html # Presentation window
│   │   └── musician.html   # Musician PDF view
│   └── shared/             # Shared types (main + renderer)
├── scripts/                # Build & deploy scripts
├── config-sample.php       # PHP config template
├── rest.php                # REST API router
├── oidc.php                # OIDC callback handler
├── install.sql             # Database schema
├── migrate.php             # Database migration
├── electron.vite.config.ts # Electron + Vite config
├── vite.config.ts          # Browser-only Vite config
└── package.json
```

---

## Tech Stack

| Layer    | Technology                                                |
| -------- | --------------------------------------------------------- |
| Frontend | React 19, TypeScript 6, MUI 7, Redux Toolkit 2, RTK Query |
| Build    | Vite 8, electron-vite 5                                   |
| i18n     | typesafe-i18n (EN + DE)                                   |
| Backend  | PHP 8.5+, MySQL 9+                                        |
| Auth     | OIDC (OpenID Connect)                                     |
| Desktop  | Electron 38+                                              |
| PDF      | react-pdf, pdfjs-dist                                     |
| Charts   | Recharts 3                                                |

---

## Features

- **Song management** — Create, edit, import (CCLI SongSelect .txt), organize songs
- **Set-list management** — Drag-and-drop show builder with songs, media, and bible verses
- **Presentation windows** — Multiple simultaneous windows with Normal and Stream modes
- **Style system** — Three-level cascade (Global → Show → Item) with per-window overrides
- **Bible verse integration** — Configurable Bible API with translation selection
- **Musician PDF view** — Server-side PDF storage, band-specific variants, auto-sync
- **Media support** — Images, videos, and solid colors
- **Dark/Light mode** — OS-aware theme with manual toggle
- **Keyboard shortcuts** — Fully configurable keyboard mapping
- **Admin dashboard** — Account/provider management, metrics, logs
- **Internationalization** — English and German
- **OBS integration** — Transparent background for Browser Source
- **WebSocket** — Bitfocus Companion support, musician sync (Electron only)

---

## License

© Marcel Birkholz
