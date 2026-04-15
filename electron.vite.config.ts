import { resolve } from 'path';
import { defineConfig } from 'electron-vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import react from '@vitejs/plugin-react';

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
      alias: {
        '@': resolve('src/renderer/src'),
        '@renderer': resolve('src/renderer/src'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve('src/renderer/index.html'),
          presentation: resolve('src/renderer/presentation.html'),
          musician: resolve('src/renderer/musician.html'),
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/rest': {
          target: 'http://localhost:8000',
          changeOrigin: false,
          secure: false,
          rewrite: (path) => path.replace(/^\/rest(?=\/|$|\?)/, '/rest.php/rest'),
        },
        '/oidc': {
          target: 'http://localhost:8000',
          changeOrigin: false,
          secure: false,
          rewrite: (path) => path.replace(/^\/oidc(?=\/|$|\?)/, '/oidc.php'),
        },
      },
    },
    plugins: [
      react(),
      viteStaticCopy({
        silent: true,
        targets: [
          { src: 'api/**', dest: 'api' },
          { src: 'classes/**', dest: 'classes' },
          {
            src: [
              '.htaccess',
              'config-sample.php',
              'favicon.ico',
              'favicon.svg',
              'oidc.php',
              'rest.php',
              'presentation.html',
              'musician.html',
            ],
            dest: '.',
          },
        ],
      }),
    ],
  },
});
