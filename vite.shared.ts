/**
 * Shared Vite configuration used by both `electron.vite.config.ts` and `vite.config.ts`.
 */
import { resolve } from 'path';
import type { UserConfig } from 'vite';

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
};

/**
 * Renderer rollup input entries for the Electron build.
 * Admin and musician views are web-only; Electron uses its own window management.
 */
export const electronRendererInputs: Record<string, string> = {
  login: resolve(__dirname, 'src/renderer/login.html'),
  main: resolve(__dirname, 'src/renderer/index.html'),
  presentation: resolve(__dirname, 'src/renderer/presentation.html'),
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
