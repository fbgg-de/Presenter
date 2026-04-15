/**
 * Standalone Vite config for browser-only (PHP deployment) builds.
 * Used by `build:deploy` script. Outputs to `dist/` for Apache/Nginx hosting.
 *
 * For Electron builds, `electron.vite.config.ts` is used instead.
 */
import { resolve } from 'path';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import react from '@vitejs/plugin-react';

const src = (path: string) => `../../${path}`;

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@renderer': resolve(__dirname, 'src/renderer/src'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/renderer/index.html'),
        presentation: resolve(__dirname, 'src/renderer/presentation.html'),
        musician: resolve(__dirname, 'src/renderer/musician.html'),
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
      targets: [
        { src: src('api/*'), dest: '.' },
        { src: src('classes/*'), dest: '.' },
        {
          src: [
            src('.htaccess'),
            src('config-sample.php'),
            src('favicon.ico'),
            src('favicon.svg'),
            src('install.sql'),
            src('migrate.php'),
            src('oidc.php'),
            src('rest.php'),
          ],
          dest: 'dist',
        },
      ],
    }),
  ],
});
