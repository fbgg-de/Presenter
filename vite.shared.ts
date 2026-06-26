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

/** Shared dev-server config. */
export const sharedServerConfig: UserConfig['server'] = {
  port: 5173,
};
