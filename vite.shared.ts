/**
 * Shared Vite configuration used by both `electron.vite.config.ts` and `vite.config.ts`.
 */
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import type { Plugin, Rolldown, UserConfig } from 'vite';

const git = (args: string) =>
  execSync(`git ${args}`, { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();

/**
 * Build identity shown in Settings, so it is obvious which build a device or deployment runs.
 * The package version alone does not change between deployments, hence the commit — marked
 * `-dirty` when built from uncommitted changes. Without git (e.g. a source tarball) it is empty.
 */
export const appBuildDefines = (() => {
  const { version } = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string };
  let commit = '';
  try {
    commit = git('rev-parse --short HEAD') + (git('status --porcelain --untracked-files=no') ? '-dirty' : '');
  } catch {
    /* not a git checkout */
  }
  return {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  };
})();

/**
 * Packages pptx-vanilla-viewer imports for features the app leaves off, resolved to an empty module:
 * - lazily, and not installed or not wanted: 3D charts (`three`), rendering under Node, live
 *   collaboration (`yjs` and its `y-websocket` / `y-webrtc` providers, ~200 kB never started);
 * - `pptx-viewer-mcp`, its AI assistant's tools. It is imported up front and brings a second copy
 *   of the PowerPoint core, zod and an EMF converter — about 3 MB of the renderer chunk. The tools
 *   are only stored at load, never called without the assistant. Its `/schemas` stay real: they
 *   are read at load.
 * Matched exactly, so a stub never swallows a subpath.
 */
const STUBBED = [
  'three/examples/jsm/controls/OrbitControls.js',
  'three/examples/jsm/loaders/GLTFLoader.js',
  'three',
  '@napi-rs/canvas',
  'yjs',
  'y-websocket',
  'y-webrtc',
  'pptx-viewer-mcp',
];
const exactly = (id: string) => new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`);

/**
 * Build warnings the renderer drops: names imported from the stub above. It exports nothing on
 * purpose — the viewer only stores its assistant's tools, and never starts collaboration — so
 * each of those ~60 names being undefined is the point, not a mistake. Everything else is shown.
 */
export const rendererOnWarn: NonNullable<Rolldown.InputOptions['onwarn']> = (warning, warn) => {
  if (warning.code === 'IMPORT_IS_UNDEFINED' && warning.message.includes('optionalPeerStub')) return;
  warn(warning);
};

/**
 * The largest a renderer chunk may grow (minified, kB) before the build says so — except the
 * PowerPoint viewer: one lazy chunk of ~6.5 MB, loaded only when a deck opens, and not something
 * a split would make smaller. Vite's own check cannot leave one chunk out, so it is set out of
 * reach (`chunkSizeWarningLimit: CHUNK_CHECK_OFF`) and this plugin checks instead.
 */
const CHUNK_LIMIT_KB = 800;
export const CHUNK_CHECK_OFF = Number.MAX_SAFE_INTEGER;
export const chunkSizeCheck = (): Plugin => {
  // The desktop build keeps its renderer unminified, so its sizes say nothing about download size.
  let minified = true;
  return {
    name: 'chunk-size-check',
    apply: 'build',
    configResolved(config) {
      minified = config.build.minify !== false;
    },
    generateBundle(_options, bundle) {
      if (!minified) return;
      for (const file of Object.values(bundle)) {
        if (file.type !== 'chunk' || file.name === 'pptxDocument') continue;
        const kb = Buffer.byteLength(file.code) / 1000;
        if (kb > CHUNK_LIMIT_KB)
          this.warn(`${file.fileName} is ${Math.round(kb)} kB, over the ${CHUNK_LIMIT_KB} kB a renderer chunk should stay under`);
      }
    },
  };
};

/** Renderer resolves aliases (shared between Electron and standalone builds). */
export const rendererAliases = [
  { find: '@', replacement: resolve(__dirname, 'src/renderer/src') },
  { find: '@renderer', replacement: resolve(__dirname, 'src/renderer/src') },
  ...STUBBED.map((id) => ({ find: exactly(id), replacement: resolve(__dirname, 'src/renderer/src/document/optionalPeerStub.ts') })),
];

/** Renderer rollup input entries for the full web build (all pages). */
export const rendererInputs: Record<string, string> = {
  admin: resolve(__dirname, 'src/renderer/admin.html'),
  control: resolve(__dirname, 'src/renderer/control.html'),
  login: resolve(__dirname, 'src/renderer/login.html'),
  main: resolve(__dirname, 'src/renderer/index.html'),
  musician: resolve(__dirname, 'src/renderer/musician.html'),
  presentation: resolve(__dirname, 'src/renderer/presentation.html'),
  spotifyPlayer: resolve(__dirname, 'src/renderer/spotify-player.html'),
};

/**
 * Renderer rollup input entries for the Electron build.
 * Admin and musician views are web-only; Electron uses its own window management.
 */
export const electronRendererInputs: Record<string, string> = {
  login: resolve(__dirname, 'src/renderer/login.html'),
  main: resolve(__dirname, 'src/renderer/index.html'),
  presentation: resolve(__dirname, 'src/renderer/presentation.html'),
  // Framed by the Set List dialog: the only page whose CSP lets Spotify's embed run.
  spotifyPlayer: resolve(__dirname, 'src/renderer/spotify-player.html'),
};

/**
 * Backend target for the dev-server proxy.
 * Defaults to the local PHP dev backend started by `yarn dev:backend`.
 * Override with the VITE_DEV_BACKEND env var to develop against a deployed
 * backend, e.g. `VITE_DEV_BACKEND=https://presenter.efsh.de`.
 */
const devBackend = process.env.VITE_DEV_BACKEND ?? 'http://localhost:8000';

/**
 * Paths are forwarded unchanged: Apache rewrites `/rest/*` → `rest.php/*`
 * via .htaccess, and the local `php -S` backend does the same via
 * `dev-router.php` (rest.php parses REQUEST_URI expecting a literal
 * `rest` segment, so `/rest.php/*` URLs would fail).
 */
const proxyEntry = {
  target: devBackend,
  changeOrigin: true,
  // Make backend cookies (PHP session) valid for the localhost dev origin
  cookieDomainRewrite: '',
};

/** Shared dev-server config. */
export const sharedServerConfig: UserConfig['server'] = {
  port: 5173,
  proxy: {
    '/rest': proxyEntry,
    '/oidc': proxyEntry,
  },
};
