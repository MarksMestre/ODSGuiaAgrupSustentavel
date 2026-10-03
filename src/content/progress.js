/**
 * Progresso Pessoal: junta a taxonomia (da folha do CNE) ao mapeamento por jogo.
 *
 * Duas fontes, com responsabilidades distintas:
 *
 *   taxonomia  — quais `Secção → Área → Trilho` existem e o que se observa em
 *                cada um. Vem de `build/progress-taxonomy.json`, gerado por
 *                `npm run progress:refresh` a partir da folha do CNE.
 *   mapeamento — que trilhos cada jogo pode contribuir para. É escrito à mão por
 *                um dirigente em `content.progress.json`; não é dedutível.
 *
 * Nenhuma das duas pode ser inventada: a taxonomia nunca é digitada à mão e o
 * mapeamento nunca é gerado.
 *
 * Todo o módulo degrada em silêncio: se faltar a taxonomia, se o JSON estiver
 * corrompido ou se um trilho não existir, `loadProgress` devolve `null` e o site
 * omite o bloco. Uma falha do Progresso Pessoal nunca pode impedir o site de
 * funcionar.
 */

import progressConfig from '../../content.config.json' with { type: 'json' };

/**
 * Taxonomia do Progresso Pessoal, vinda da folha do CNE.
 *
 * O artefacto é gerado por `npm run progress:refresh` e é **opcional**: pode não
 * existir, por isso é importado com `import.meta.glob` em vez de um `import`
 * estático, que quebraria a construção. Sem taxonomia, `loadProgress()` devolve
 * `null` e o bloco não aparece. Uma falha de progresso nunca pode impedir o
 * site de funcionar.
 */
let taxonomyFiles = {};
try {
  // Chamada literal, para o Vite a transformar. Fora de um bundler devolve `{}`.
  taxonomyFiles = import.meta.glob('../../build/progress-taxonomy.json', {
    eager: true,
    import: 'default',
  });
} catch {
  taxonomyFiles = {};
}

const taxonomyArtefact = Object.values(taxonomyFiles)[0] ?? null;
import {
  SECTION_ORDER,
  gameHasProgress,
  progressNoteFor,
  progressTrilhoKeysFor,
} from './games.js';

export const SECTION_META = Object.freeze(
  (progressConfig.progress?.sections ?? []).map((section) => Object.freeze(section)),
);

/** Secções pela ordem de idade, com os valores editoriais da configuração. */
export const SECTIONS = Object.freeze(
  SECTION_META.map((meta) => Object.freeze({ ...meta, tab: meta.tab })),
);

function taxonomyByTab() {
  const sections = taxonomyArtefact?.sections;
  if (!sections || typeof sections !== 'object') return null;
  const result = new Map();
  for (const meta of SECTIONS) {
    const section = sections[meta.tab];
    if (!section || !Array.isArray(section.areas)) continue;
    const byKey = new Map();
    for (const area of section.areas) {
      for (const trilho of area.trilhos ?? []) {
        byKey.set(trilho.key, { ...trilho, areaKey: area.key, areaName: area.name });
      }
    }
    result.set(meta.tab, byKey);
  }
  return result.size ? result : null;
}

/**
 * Carrega o Progresso Pessoal.
 *
 * @returns {null | {sections: Map<string, object>, fetchedAt: string|null}}
 */
export function loadProgress() {
  const byTab = taxonomyByTab();
  if (!byTab) return null;
  return {
    sections: byTab,
    fetchedAt: taxonomyArtefact?.source?.fetchedAt ?? null,
  };
}

export function progressSections(progress) {
  if (!progress) return [];
  return SECTIONS
    .filter((meta) => progress.sections.has(meta.tab))
    .map((meta) => ({
      tab: meta.tab,
      label: meta.label,
      branch: meta.branch,
      ages: meta.ages,
      color: meta.color,
      ink: meta.ink,
      referenceUrl: meta.referenceUrl,
    }));
}

/**
 * Trilhos declarados para um jogo, agrupados por Secção e depois por Área.
 *
 * Um trilho desconhecido é ignorado (e não inventa-se nada); um jogo sem
 * mapeamento devolve `[]`.
 */
export function progressForGame(progress, gameNumber) {
  if (!progress) return [];
  const groups = [];

  for (const meta of SECTIONS) {
    const keys = progressTrilhoKeysFor(meta.tab, gameNumber);
    if (!keys.length) continue;

    const known = progress.sections.get(meta.tab);
    if (!known) continue;

    const byArea = new Map();
    for (const key of keys) {
      const trilho = known.get(key);
      if (!trilho) continue; // chave desconhecida: ignorada, não inventada
      if (!byArea.has(trilho.areaKey)) {
        byArea.set(trilho.areaKey, {
          key: trilho.areaKey,
          name: trilho.areaName,
          trilhos: [],
        });
      }
      byArea.get(trilho.areaKey).trilhos.push(trilho);
    }
    if (!byArea.size) continue;

    groups.push({
      tab: meta.tab,
      label: meta.label,
      branch: meta.branch,
      ages: meta.ages,
      color: meta.color,
      ink: meta.ink,
      referenceUrl: meta.referenceUrl,
      note: progressNoteFor(meta.tab, gameNumber),
      areas: [...byArea.values()],
      count: [...byArea.values()].reduce((total, area) => total + area.trilhos.length, 0),
    });
  }

  return groups;
}

export function gameHasAnyProgress(gameNumber) {
  return SECTION_ORDER.some((tab) => gameHasProgress(tab, gameNumber));
}

export function trilhoCountForGame(gameNumber) {
  return SECTION_ORDER.reduce(
    (total, tab) => total + progressTrilhoKeysFor(tab, gameNumber).length,
    0,
  );
}