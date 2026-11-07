/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };
import { gtag } from './scripts/gtag';

const PORT = 5190;

export default defineConfig(({ mode }) => ({
  // Relative base so the same build runs from a GitHub Pages project path or a custom domain.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
      $app: fileURLToPath(new URL('./src/app', import.meta.url)),
      // The app builds from libopenlaser's source, so a change there shows up at once.
      libopenlaser: fileURLToPath(new URL('./packages/libopenlaser/src', import.meta.url)),
    },
    conditions: mode === 'test' ? ['browser'] : undefined,
  },
  plugins: [
    svelte(),
    gtag(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'mark.svg', 'apple-touch-icon.png', 'og-image.png'],
      manifest: {
        name: 'openlaser',
        short_name: 'openlaser',
        description: 'Laser engraver and cutter control in your browser. Free, open source, works offline.',
        theme_color: '#0E0F11',
        background_color: '#0E0F11',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        file_handlers: [
          {
            action: './',
            accept: {
              'application/x-openlaser-project': ['.olaser'],
              'text/x-gcode': ['.gcode', '.nc', '.gc', '.ngc'],
              'image/svg+xml': ['.svg'],
            },
          },
        ],
      },
      workbox: {
        // wasm: HarfBuzz, which shapes Bangla and other scripts for text outlines offline too.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest,json,wasm}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Fonts picked for text and their picker previews keep working offline once seen.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/fontsource\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fontsource-ttf',
              expiration: { maxEntries: 200 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-font-previews',
              expiration: { maxEntries: 2000 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  // harfbuzzjs finds its .wasm next to itself (import.meta.url); pre-bundling would move it.
  optimizeDeps: { exclude: ['harfbuzzjs'] },
  worker: { format: 'es' },
  server: { port: PORT, strictPort: true },
  preview: { port: PORT, strictPort: true },
  test: {
    include: ['tests/unit/**/*.test.ts', 'packages/libopenlaser/test/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30_000,
  },
}));
