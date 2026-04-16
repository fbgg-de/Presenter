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

/** Renderer rollup input entries (shared between Electron and standalone builds). */
export const rendererInputs: Record<string, string> = {
  main: resolve(__dirname, 'src/renderer/index.html'),
  presentation: resolve(__dirname, 'src/renderer/presentation.html'),
  musician: resolve(__dirname, 'src/renderer/musician.html'),
};

/** Shared dev-server config. */
export const sharedServerConfig: UserConfig['server'] = {
  port: 5173,
};

