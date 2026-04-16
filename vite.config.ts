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
import { rendererAliases, rendererInputs, sharedServerConfig } from './vite.shared';

const src = (path: string) => `../../${path}`;

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  resolve: {
    alias: rendererAliases,
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: rendererInputs,
    },
  },
  server: sharedServerConfig,
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
