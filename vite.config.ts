import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const r = (p: string) => resolve(root, p);

/**
 * The extension is built in three passes because Manifest V3 mixes module
 * contexts that Rollup cannot emit in a single output:
 *
 *  - `main`        → ES modules: service worker, offscreen doc, popup, options.
 *  - `content`     → single IIFE bundle (isolated-world content script).
 *  - `interceptor` → single IIFE bundle (MAIN-world content script).
 *
 * Content scripts run as classic scripts, so they must be self-contained IIFEs
 * (no `import`/`export`). Pages and the worker are real ES modules.
 *
 * `npm run build` runs the three passes then copies static assets (see
 * scripts/postbuild.mjs). The first pass cleans `dist`; the rest append.
 */
export default defineConfig(({ mode }) => {
  const shared = {
    resolve: { alias: { '@': r('src') } },
    define: { __DEV__: JSON.stringify(mode === 'development') },
  };

  // --- IIFE single-entry passes (content scripts) ---
  const iifeEntry = (name: string, entry: string) => ({
    ...shared,
    build: {
      outDir: 'dist/assets',
      emptyOutDir: false,
      target: 'es2022',
      sourcemap: false,
      minify: false as const,
      lib: {
        entry: r(entry),
        name,
        formats: ['iife'] as const,
        fileName: () => `${name}.js`,
      },
    },
  });

  if (mode === 'content') {
    return iifeEntry('content', 'src/content/content.ts');
  }
  if (mode === 'interceptor') {
    return iifeEntry('interceptor', 'src/hooks/interceptor.ts');
  }

  // --- main pass: ES-module contexts ---
  return {
    ...shared,
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      target: 'es2022',
      sourcemap: false,
      minify: false as const,
      modulePreload: false as const,
      rollupOptions: {
        input: {
          popup: r('src/popup/popup.html'),
          options: r('src/options/options.html'),
          offscreen: r('src/offscreen/offscreen.html'),
          background: r('src/background/background.ts'),
        },
        output: {
          format: 'es',
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/chunks/[name].js',
          assetFileNames: 'assets/[name].[ext]',
        },
      },
    },
  };
});
