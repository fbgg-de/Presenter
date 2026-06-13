import { resolve } from 'path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { rendererAliases, rendererInputs, sharedServerConfig } from './vite.shared';
import { errorFallbackPlugin } from './vite.plugin.error-fallback';
export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: [
          'electron',
          'electron-updater',
          '@electron-toolkit/utils',
          'ws',
          'path',
          'fs',
          'http',
          'url',
          'os',
          'crypto',
          'stream',
          'util',
          'events',
          'assert',
          'constants',
          'net',
          'tls',
          'buffer',
          'child_process',
        ],
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        external: ['electron', '@electron-toolkit/preload'],
        input: {
          index: resolve('src/preload/index.ts'),
          presentation: resolve('src/preload/presentation.ts'),
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: rendererAliases,
    },
    build: {
      rollupOptions: {
        input: rendererInputs,
      },
    },
    server: sharedServerConfig,
    plugins: [react(), errorFallbackPlugin()],
  },
});
