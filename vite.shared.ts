/**
 * Shared Vite configuration used by both `electron.vite.config.ts` and `vite.config.ts`.
 */
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import type { UserConfig } from 'vite';

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

/** Renderer resolves aliases (shared between Electron and standalone builds). */
export const rendererAliases: Record<string, string> = {
  '@': resolve(__dirname, 'src/renderer/src'),
  '@renderer': resolve(__dirname, 'src/renderer/src'),
};

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
