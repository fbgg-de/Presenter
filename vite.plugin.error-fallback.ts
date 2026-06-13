/**
 * Vite plugin: error-fallback
 *
 * Compiles `src/renderer/src/error-fallback.ts` as a standalone IIFE bundle
 * (via esbuild) and injects it into every HTML page as a classic (non-module)
 * `<script>` tag **at the very top of `<head>`**, so it runs synchronously
 * before any ES-module code – giving us a reliable early-error capture layer.
 *
 * Why not `type="module"`?
 *   Module scripts are always deferred; they cannot catch errors that occur
 *   during the initialisation of other modules that load in parallel.
 *
 * CSP note:
 *   The injected tag references `./error-fallback.js` – a same-origin file –
 *   so the existing `script-src 'self'` CSP rule already covers it.
 */

import { build as esbuildBuild, type BuildOptions } from 'esbuild';
import { resolve } from 'path';
import type { Plugin } from 'vite';

const ENTRY_POINT = resolve(__dirname, 'src/renderer/src/error-fallback.ts');

/** Shared esbuild options for compiling the fallback script. */
function buildOptions(minify: boolean): BuildOptions {
  return {
    entryPoints: [ENTRY_POINT],
    bundle: true,
    format: 'iife',
    minify,
    write: false,
    platform: 'browser',
    // Keep the same browser targets as the main build.
    target: ['es2020', 'chrome87', 'safari14', 'firefox78', 'edge88'],
  };
}

/** Compile the TS source to an IIFE string. */
async function compile(minify: boolean): Promise<string> {
  const result = await esbuildBuild(buildOptions(minify));
  const output = result.outputFiles?.[0];
  if (!output) {
    throw new Error('[error-fallback-plugin] esbuild produced no output');
  }
  return output.text;
}

export function errorFallbackPlugin(): Plugin {
  /** Holds the compiled IIFE code during a build. */
  let compiledCode = '';

  return {
    name: 'error-fallback',

    // ── Build mode ──────────────────────────────────────────────────────────

    /** Compile the TS → IIFE once at build start. */
    async buildStart() {
      compiledCode = await compile(true);
    },

    /** Emit the compiled script as a standalone asset so it lands at the
     *  root of `outDir` (next to the HTML files). */
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'error-fallback.js',
        source: compiledCode,
      });
    },

    // ── Dev-server mode ─────────────────────────────────────────────────────

    /** Register a middleware that serves the compiled IIFE on
     *  `GET /error-fallback.js`. Re-compiles lazily on first request. */
    configureServer(server) {
      server.middlewares.use('/error-fallback.js', async (_req, res) => {
        try {
          if (!compiledCode) {
            compiledCode = await compile(false);
          }
          res.setHeader('Content-Type', 'application/javascript');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(compiledCode);
        } catch (err) {
          res.statusCode = 500;
          res.end(String(err));
        }
      });
    },

    /** Invalidate compiled code when the source file changes so the next
     *  request to /error-fallback.js picks up the latest version. */
    handleHotUpdate({ file }) {
      if (file === ENTRY_POINT) {
        compiledCode = '';
      }
    },

    // ── HTML transformation ─────────────────────────────────────────────────

    transformIndexHtml: {
      /** Run before Vite's own HTML processing so the tag is in place when
       *  Vite scans for module entry points. */
      order: 'pre',

      handler(html) {
        // Remove any existing error-fallback script tag (module or otherwise).
        const cleaned = html.replace(/<script\b[^>]*\bsrc="[^"]*error-fallback[^"]*"[^>]*>\s*<\/script>\n?/g, '');

        const tag = '<script src="./error-fallback.js"></script>';

        // Locate the end of the <head> section so we only search within it.
        const headEndIdx = cleaned.search(/<\/head>/i);
        const headSection = headEndIdx !== -1 ? cleaned.slice(0, headEndIdx) : cleaned;

        // Inject before the first <script> tag found inside <head>.
        const firstScriptIdx = headSection.search(/<script[\s>]/i);
        if (firstScriptIdx !== -1) {
          // The indentation before the first <script> is already in the slice;
          // we just append our tag + a newline + the same indentation.
          return cleaned.slice(0, firstScriptIdx) + tag + cleaned.slice(firstScriptIdx);
        }

        // No <script> in <head>: append as the last entry before </head>.
        if (headEndIdx !== -1) {
          // Capture the indentation in front of </head> so we can reuse it.
          return cleaned.replace(/(\s*)<\/head>/i, `\n    ${tag}\n$1</head>`);
        }

        // Fallback: no </head> found – return unchanged.
        return cleaned;
      },
    },
  };
}
