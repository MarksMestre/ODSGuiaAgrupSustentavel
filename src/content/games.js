/**
 * Dados dos jogos gerados pelo pipeline editorial.
 *
 * `content/games-map.json` é gerado por `python scripts/build_content.py` e é a
 * fonte de verdade para o número, o título, a área e os ODS de cada jogo. As
 * fichas em `source/games/` são carregadas como texto para a página individual.
 */

// `games-map.json` é sempre gerado antes da construção, logo pode ser
// importado directamente. Já `content.progress.json` é opcional — pode não
// existir — e é por isso lido de forma tolerante, abaixo.
import gamesMap from '../../content/games-map.json' with { type: 'json' };

export const GAMES = Object.freeze(
  (Array.isArray(gamesMap?.games) ? gamesMap.games : []).map((entry) =>
    Object.freeze({ ...entry, ods: Array.isArray(entry.ods) ? entry.ods : [] }),
  ),
);

export const GAME_AREAS = Object.freeze(
  [...new Set(GAMES.map((game) => game.area))],
);

/**
 * Mapeamento jogo → trilhos, escrito à mão por um dirigente.
 *
 * O ficheiro é **opcional**: pode não existir. Um `import` estático quebraria a
 * construção nesse caso, por isso usa-se `import.meta.glob`, que devolve `{}`
 * quando o padrão não casa com nada e com isso o bloco de Progresso Pessoal
 * simplesmente não aparece.
 *
 * Uma falha de progresso nunca pode impedir o site de funcionar.
 */
let progressFiles = {};
try {
  // Chamada literal: é assim que o Vite a reconhece e a transforma em imports
  // estáticos. Fora de um bundler (Node simples) não existe e devolve `{}`.
  progressFiles = import.meta.glob('../../content.progress.json', {
    eager: true,
    import: 'default',
  });
} catch {
  progressFiles = {};
}

export const progressSelections = Object.values(progressFiles)[0] ?? { sections: {} };

/** Secções do CNE, por ordem de idade. Os valores vêm de `content.config.json`. */
export const SECTION_ORDER = Object.freeze(['1Sec', '2Sec', '3Sec', '4Sec']);

const byNumber = new Map(GAMES.map((game) => [game.number, game]));

export function getGame(number) {
  return byNumber.get(Number(number)) ?? null;
}

export function gameRoute(number) {
  return `#/jogo/${number}`;
}

export function gamePrintUrl(number) {
  return `source/games/${String(number).padStart(2, '0')}Game.html`;
}

/**
 * Chave de emparelhamento entre uma atividade do `file.md` e uma ficha.
 *
 * O `file.md` reinicia a numeração em cada área (1..6 nas cinco áreas), por isso
 * o número sozinho não identifica nada: seis atividades têm o número 1. A chave
 * é o **título normalizado**, que é único em todo o capítulo.
 */
export function activityKey(titleSlug) {
  return titleSlug;
}

export function progressSelectionsFor(sectionTab) {
  const sections = progressSelections?.sections;
  if (!sections || typeof sections !== 'object') return {};
  const entry = sections[sectionTab];
  return entry && typeof entry === 'object' ? entry : {};
}

export function progressNoteFor(sectionTab, gameNumber) {
  const entry = progressSelectionsFor(sectionTab)[String(gameNumber)];
  if (!entry || typeof entry !== 'object') return null;
  const note = typeof entry.note === 'string' ? entry.note.trim() : '';
  return note || null;
}

export function progressTrilhoKeysFor(sectionTab, gameNumber) {
  const entry = progressSelectionsFor(sectionTab)[String(gameNumber)];
  if (!entry || typeof entry !== 'object' || !Array.isArray(entry.trilhos)) return [];
  return entry.trilhos.filter((key) => typeof key === 'string');
}

export function gameHasProgress(sectionTab, gameNumber) {
  return progressTrilhoKeysFor(sectionTab, gameNumber).length > 0;
}