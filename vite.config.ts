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

const root = resolve(__dirname, 'src/renderer');
const dist = 'dist';
const outDir = resolve(__dirname, dist);

const src = (path: string) => `../../${path}`;

export default defineConfig({
  root,
  resolve: {
    alias: rendererAliases,
  },
  build: {
    outDir,
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
        { src: src('api/*'), dest: outDir },
        { src: src('app/*'), dest: outDir },
        { src: src('classes/*'), dest: outDir },
        { src: src('src/renderer/src/assets/icon.ico'), dest: outDir, rename: { name: 'favicon.ico', stripBase: 2 } },
        { src: src('src/renderer/src/assets/icon.svg'), dest: outDir, rename: { name: 'favicon.svg', stripBase: 2 } },
        {
          src: [src('.htaccess'), src('config-sample.php'), src('install.sql'), src('migrate.php'), src('oidc.php'), src('rest.php')],
          dest: dist,
        },
      ],
    }),
  ],
});
