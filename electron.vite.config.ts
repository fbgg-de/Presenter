import { resolve } from 'path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { rendererAliases, electronRendererInputs, sharedServerConfig } from './vite.shared';
import { errorFallbackPlugin } from './vite.plugin.error-fallback';
export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // Only 'electron' and Node.js built-ins are external.
        // npm packages (electron-updater, ws, font-list, etc.) are bundled
        // directly into the main-process output so node_modules is not needed
        // at runtime and can be excluded from the packaged app entirely.
        external: [
          'electron',
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
        // @electron-toolkit/preload is bundled into preload output
        external: ['electron'],
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
        input: electronRendererInputs,
      },
    },
    server: sharedServerConfig,
    plugins: [react(), errorFallbackPlugin()],
  },
});
