/**
 * Standalone Vite config for browser-only (PHP deployment) builds.
 * Used by `build:deploy` script. Outputs to `dist/` for Apache/Nginx hosting.
 *
 * For Electron builds, `electron.vite.config.ts` is used instead.
 */
import { resolve } from 'path';
import { readdirSync, existsSync } from 'fs';
import { extname, basename } from 'path';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import react from '@vitejs/plugin-react';
import { rendererAliases, rendererInputs, sharedServerConfig } from './vite.shared';
import { errorFallbackPlugin } from './vite.plugin.error-fallback';
const root = resolve(__dirname, 'src/renderer');
const dist = 'dist';
const distApp = 'dist-app';
const outDir = resolve(__dirname, dist);
const INSTALLER_EXTS = new Set(['.exe', '.dmg', '.AppImage', '.deb', '.snap', '.rpm', '.pkg']);
const src = (path: string) => `../../${path}`;
export default defineConfig({
  root,
  resolve: {
    alias: rendererAliases,
  },
  build: {
    outDir,
    emptyOutDir: true,
    target: ['es2020', 'chrome87', 'safari14', 'firefox78', 'edge88'],
    rollupOptions: {
      input: rendererInputs,
    },
  },
  server: sharedServerConfig,
  plugins: [
    react(),
    errorFallbackPlugin(),
    viteStaticCopy({
      targets: [
        { src: src('api/*'), dest: outDir },
        { src: src('classes/*'), dest: outDir },
        { src: src('src/renderer/src/assets/icon.ico'), dest: outDir, rename: { name: 'favicon.ico', stripBase: 2 } },
        { src: src('src/renderer/src/assets/icon.svg'), dest: outDir, rename: { name: 'favicon.svg', stripBase: 2 } },
        {
          src: [src('.htaccess'), src('config-sample.php'), src('oidc.php'), src('rest.php')],
          dest: dist,
        },
        ...(() => {
          const srcDir = resolve(__dirname, distApp);
          if (!existsSync(srcDir)) return [];
          return readdirSync(srcDir)
            .filter((f) => INSTALLER_EXTS.has(extname(f)))
            .map((file) => {
              const ext = extname(file);
              const stripped = basename(file, ext).replace(/-\d+(?:\.\d+)*-/, '-');
              return {
                src: src(`${distApp}/${file}`),
                dest: `${outDir}/app`,
                rename: { name: stripped + ext, stripBase: 1 },
              };
            });
        })(),
      ],
    }),
  ],
});
