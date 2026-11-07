import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The trace worker is emitted next to the modules and found relative to them.
  base: './',
  resolve: {
    // Tests import the library by its own name, the way users do.
    alias: { libopenlaser: fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    lib: {
      entry: {
        geometry: 'src/geometry/index.ts',
        project: 'src/project/index.ts',
        cam: 'src/cam/index.ts',
        machine: 'src/machine/index.ts',
        import: 'src/import/index.ts',
        fonts: 'src/fonts/index.ts',
        shapes: 'src/shapes/index.ts',
        trace: 'src/trace/index.ts',
      },
      formats: ['es'],
    },
    rolldownOptions: { external: ['clipper2-ts', 'fflate', 'harfbuzzjs', 'nanoid', 'opentype.js'] },
    // Bundlers minify the app that uses it; readable code is easier to debug.
    minify: false,
    sourcemap: true,
    target: 'es2022',
  },
  test: {
    name: 'libopenlaser',
    include: ['test/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['test/setup.ts'],
    testTimeout: 30_000,
  },
  worker: { format: 'es' },
});
