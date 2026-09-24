import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

function sourceFallbackPlugin() {
  return {
    name: 'source-fallback',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'file.md',
        source: readFileSync(new URL('./file.md', import.meta.url)),
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [sourceFallbackPlugin()],
  publicDir: false,
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    setupFiles: ['./tests/setup.js'],
    restoreMocks: true,
  },
});
