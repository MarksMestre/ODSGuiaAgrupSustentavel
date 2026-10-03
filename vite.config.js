import { readdirSync, readFileSync } from 'node:fs';
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

/**
 * Copia as fichas de jogo para `dist/source/games/`.
 *
 * `publicDir` está desligado, por isso os ficheiros não são copiados
 * automaticamente. Sem isto, o botão «Imprimir ficha» levaria a um 404: as
 * fichas são ficheiros gerados, não importação de módulos.
 */
function gameSheetsPlugin() {
  return {
    name: 'game-sheets',
    apply: 'build',
    generateBundle() {
      const directory = new URL('./source/games/', import.meta.url);
      for (const name of readdirSync(directory)) {
        if (!/^\d{2}Game\.(md|html)$/u.test(name)) continue;
        this.emitFile({
          type: 'asset',
          fileName: `source/games/${name}`,
          source: readFileSync(new URL(`./source/games/${name}`, import.meta.url)),
        });
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [sourceFallbackPlugin(), gameSheetsPlugin()],
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
