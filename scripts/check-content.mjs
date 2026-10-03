import { existsSync, readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import {
  CHAPTER7_AREAS,
  ECONOMICS_TABLE,
  EXPECTED_COUNTS,
  GLOSSARY_GROUPS,
  INDEX_ENTRIES,
  REFERENCE_ENTRIES,
  ROUTES,
  TOOL_ENTRIES,
} from '../src/content/source-map.js';
import { parseDocument, validateParsedDocument } from '../src/content/parser.js';

const source = readFileSync(new URL('../file.md', import.meta.url), 'utf8');
const errors = [];
const warnings = [];
const model = parseDocument(source);
errors.push(...validateParsedDocument(model));

// Cobertura: os nós e os trechos excluídos (Capítulo 8) têm de consumir a
// fonte por inteiro, pela ordem.
const segments = [
  ...model.nodes.map((node) => ({ start: node.sourceOffset, end: node.sourceOffset + node.sourceText.length })),
  ...model.excluded.map((range) => ({ start: range.start, end: range.end })),
].sort((a, b) => a.start - b.start);
let expectedOffset = 0;
for (const [index, segment] of segments.entries()) {
  if (segment.start !== expectedOffset) {
    errors.push(`Segmento ${index}: esperado offset ${expectedOffset}, recebido ${segment.start}.`);
  }
  expectedOffset = Math.max(expectedOffset, segment.end);
}
if (expectedOffset !== source.length) errors.push('A cobertura não consome a fonte por inteiro.');

const glossaryGroups = model.nodes.filter((node) => node.kind === 'glossary-group');
if (glossaryGroups.length !== EXPECTED_COUNTS.glossaryGroups) errors.push('Número inválido de grupos de glossário.');
glossaryGroups.forEach((node, index) => {
  const expected = GLOSSARY_GROUPS[index];
  if (node.data.title !== expected.title) errors.push(`Grupo de glossário ${index + 1} fora de ordem.`);
  if (node.data.entries.length !== expected.terms.length) errors.push(`Entradas inválidas em ${expected.title}.`);
  node.data.entries.forEach((entry, entryIndex) => {
    const expectedTerm = expected.terms[entryIndex].replace(/:$/u, '');
    if (entry.term !== expectedTerm) errors.push(`Entrada fora de ordem em ${expected.title}: ${entry.term}.`);
  });
});

const stepCounts = Object.fromEntries(['capitulo-4', 'capitulo-5', 'capitulo-6'].map((route) => {
  const routeNodes = model.nodes.filter((node) => node.route.id === route);
  const count = route === 'capitulo-5'
    ? routeNodes.find((node) => node.kind === 'diagram')?.data.steps.length ?? 0
    : routeNodes.filter((node) => node.kind === 'step').length;
  return [route, count];
}));
Object.entries(stepCounts).forEach(([route, count]) => {
  if (count !== 10) errors.push(`${route} contém ${count} passos em vez de 10.`);
});

const activities = model.nodes.filter((node) => node.kind === 'activity');
if (activities.length !== EXPECTED_COUNTS.chapter7Activities) errors.push('Número inválido de atividades.');
CHAPTER7_AREAS.forEach((area) => {
  const areaActivities = activities.filter((node) => node.data.area === area.title);
  if (areaActivities.length !== 6) errors.push(`${area.title} não contém seis atividades.`);
  areaActivities.forEach((activity, index) => {
    const expected = area.activities[index];
    if (!expected || activity.data.number !== expected.number || activity.data.title !== expected.title) {
      errors.push(`Atividade fora de ordem em ${area.title}.`);
    }
  });
});

// Os recursos do Capítulo 8 (Espaço Influencers) não são publicados: o
// capítulo é excluído na fonte, logo não há áreas nem grupos de recursos.
// A ausência é o resultado esperado, não um erro.

const fivePRows = model.nodes.find((node) => node.kind === 'five-p-table')?.data.rows ?? [];
if (fivePRows.length !== 5) errors.push('A tabela dos 5 P’s não contém cinco linhas.');
const economicsRows = activities.find((node) => node.data.title === 'Jogo dos Salários')?.data.table?.rows ?? [];
if (economicsRows.length !== ECONOMICS_TABLE.rows.length) errors.push('A tabela económica não contém todas as linhas.');
if (economicsRows.at(-1)?.sourceText !== ECONOMICS_TABLE.rows.at(-1)) {
  errors.push('A linha económica anómala não foi preservada exatamente.');
}

const referenceNodes = model.nodes.filter((node) => node.kind === 'reference-entry');
const toolNodes = model.nodes.filter((node) => node.kind === 'tool-entry');
if (referenceNodes.some((node, index) => node.data.text !== REFERENCE_ENTRIES[index])) {
  errors.push('As referências bibliográficas não estão completas ou na ordem da fonte.');
}
if (toolNodes.some((node, index) => node.sourceText !== TOOL_ENTRIES[index])) {
  errors.push('As ferramentas não estão completas ou na ordem da fonte.');
}

const diagrams = model.nodes.filter((node) => node.kind === 'diagram');
if (diagrams.length !== EXPECTED_COUNTS.diagrams) errors.push('Número inválido de diagramas.');
diagrams.forEach((node) => {
  const textOffset = source.indexOf(node.data.text, node.sourceOffset);
  const nodeEnd = node.sourceOffset + node.sourceText.length;
  if (textOffset < 0 || textOffset + node.data.text.length > nodeEnd) {
    errors.push(`Texto do diagrama ${node.data.diagram} não coincide com a fonte.`);
  }
});

if (model.dollarSpans.length !== EXPECTED_COUNTS.dollarSpans) errors.push('Número inválido de segmentos com dólares.');
if (model.dollarSpans.filter((span) => span.type === 'math').length !== EXPECTED_COUNTS.validMathSpans) {
  errors.push('Número inválido de expressões TeX válidas.');
}
if (model.dollarSpans.filter((span) => span.type === 'currency').length !== EXPECTED_COUNTS.currencySpans) {
  errors.push('Número inválido de valores monetários literais.');
}

if (/<\/?[a-z][^>]*>/iu.test(source)) warnings.push('A fonte contém algo semelhante a HTML; confirme a sanitização.');
const assetReferences = [...source.matchAll(/!\[[^\]]*\]\(([^)\s]+)/gu)].map((match) => match[1]);
if (assetReferences.length) warnings.push(`A fonte contém ${assetReferences.length} referência(s) de ativos.`);

const dom = new JSDOM('<!doctype html><main id="content"></main><nav id="navigation"></nav>', {
  url: 'https://example.test/',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  Node: dom.window.Node,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
});
const { collectAssetReferences, renderApplication, sanitizeUrl } = await import('../src/content/renderer.js');
const rendered = renderApplication(model, {
  contentRoot: document.querySelector('#content'),
  navigationRoot: document.querySelector('#navigation'),
});

const allIds = [...document.querySelectorAll('[id]')].map((element) => element.id);
const duplicateIds = [...new Set(allIds.filter((id, index) => allIds.indexOf(id) !== index))];
if (duplicateIds.length) errors.push(`IDs duplicados: ${duplicateIds.join(', ')}.`);

const indexLinks = [...document.querySelectorAll('.source-index-list a')];
if (indexLinks.length !== INDEX_ENTRIES.length) errors.push('O Índice Geral não contém todos os enlaces de origem.');
for (const link of indexLinks) {
  const url = new URL(link.href, 'https://example.test/');
  const [routeHash, query = ''] = url.hash.split('?');
  const route = ROUTES.find((candidate) => candidate.hash === routeHash);
  const anchor = new URLSearchParams(query).get('anchor');
  if (!route || (anchor && !document.getElementById(anchor))) {
    errors.push(`Destino inválido no Índice Geral: ${link.getAttribute('href')}.`);
  }
}

const unsafeLinks = [...document.querySelectorAll('a[href]')]
  .map((link) => link.getAttribute('href'))
  .filter((href) => sanitizeUrl(href) === null);
if (unsafeLinks.length) errors.push(`Links inseguros renderizados: ${unsafeLinks.join(', ')}.`);

const renderedAssets = collectAssetReferences(source);
if (renderedAssets.length !== assetReferences.length) errors.push('A deteção de ativos diverge entre o verificador e o renderer.');

// -------------------------------------------------_capítulo 8 fora do site

// O Capítulo 8 (Espaço Influencers) está fora do âmbito: asingual na rota, na
// navegação e no DOM. A verificação é automatizada para que uma reintrodução
// acidental não passe despercebida.
//
// A fonte editorial ainda guarda o Capítulo 8 e é isso que permite reconstruir
// as 30 atividades (incluindo «Descobre +ODS», que falta no Word), por isso a
// ausência é exigida a partir do ponto em que o site é montado — não na fonte.
if (ROUTES.some((route) => route.id === 'capitulo-8')) {
  errors.push('ROUTES ainda inclui "capitulo-8". Remova-o de src/content/source-map.js.');
}
for (const marker of ['Influencers', 'influencers']) {
  if ((document.body.textContent ?? '').includes(marker)) {
    errors.push(`O DOM renderizado ainda contém "${marker}".`);
    break;
  }
}
const navText = [...document.querySelectorAll('#navigation a')].map((a) => a.textContent).join(' ');
if (/influencers/iu.test(navText)) errors.push('A navegação ainda lista "Influencers".');
if ([...document.querySelectorAll('[data-route="capitulo-8"]')].length) {
  errors.push('O DOM ainda contém uma secção com data-route="capitulo-8".');
}

// ------------------------------------------------------ fichas de jogo

const config = JSON.parse(readFileSync(new URL('../content.config.json', import.meta.url), 'utf8'));
const gameMap = JSON.parse(readFileSync(new URL(`../${config.games.mapFile}`, import.meta.url), 'utf8'));
const games = Array.isArray(gameMap.games) ? gameMap.games : [];

if (games.length !== config.games.expectedCount) {
  errors.push(`content/games-map.json tem ${games.length} jogos; o guia anuncia ${config.games.expectedCount}.`);
}

const gameNumbers = games.map((game) => game.number);
const duplicateNumbers = [...new Set(gameNumbers.filter((n, i) => gameNumbers.indexOf(n) !== i))];
if (duplicateNumbers.length) errors.push(`Números de jogo duplicados: ${duplicateNumbers.join(', ')}.`);

const outOfRange = gameNumbers.filter((n) => n < config.games.firstNumber || n > config.games.lastNumber);
if (outOfRange.length) errors.push(`Números de fora de [${config.games.firstNumber}, ${config.games.lastNumber}]: ${outOfRange.join(', ')}.`);

const gameSlugs = games.map((game) => game.slug);
const duplicateSlugs = [...new Set(gameSlugs.filter((s, i) => gameSlugs.indexOf(s) !== i))];
if (duplicateSlugs.length) errors.push(`Slugs de jogo duplicados: ${duplicateSlugs.join(', ')}.`);

// Cada ficha tem de existir em .md e .html, ter as linhas do molde e o título
// certo. Os rótulos vêm do molde, lidos em tempo de execução pelo pipeline.
const template = JSON.parse(readFileSync(new URL('../build/template-schema.json', import.meta.url), 'utf8'));
const templateLabels = template.labels ?? [];

const sheetIssues = [];
for (const game of games) {
  const sheetName = `${String(game.number).padStart(2, '0')}Game`;
  const mdPath = new URL(`../source/games/${sheetName}.md`, import.meta.url);
  const htmlPath = new URL(`../source/games/${sheetName}.html`, import.meta.url);

  if (!existsSync(mdPath)) { sheetIssues.push(`${sheetName}.md em falta`); continue; }
  if (!existsSync(htmlPath)) { sheetIssues.push(`${sheetName}.html em falta`); continue; }

  const sheet = readFileSync(mdPath, 'utf8');
  let cursor = -1;
  for (const label of templateLabels) {
    const row = `| ${label} |`;
    const at = sheet.indexOf(row);
    if (at === -1) { sheetIssues.push(`${sheetName}.md: falta a linha "${label}"`); continue; }
    if (at < cursor) sheetIssues.push(`${sheetName}.md: a linha "${label}" está fora de ordem`);
    cursor = at;
  }
  if (!sheet.includes(`**Título:** ${game.title}`)) {
    sheetIssues.push(`${sheetName}.md: o título não corresponde ao mapa ("${game.title}")`);
  }
}
errors.push(...sheetIssues);

// O molde nunca é gerado nem alterado.
if (!existsSync(new URL(`../${config.games.template}`, import.meta.url))) {
  errors.push(`Molde em falta: ${config.games.template}`);
}

// -------------------------------------------------- taxonomia de progresso

const progressReport = { present: false, sections: 0, areas: 0, trilhos: 0, staleDays: null };
const artefactPath = new URL(`../${config.progress.artefact}`, import.meta.url);
if (existsSync(artefactPath)) {
  progressReport.present = true;
  const artefact = JSON.parse(readFileSync(artefactPath, 'utf8'));
  const trilhoKeys = new Set();

  for (const meta of config.progress.sections) {
    const section = artefact.sections?.[meta.tab];
    if (!section) continue;
    progressReport.sections += 1;
    progressReport.areas += section.areas.length;
    for (const area of section.areas) {
      for (const trilho of area.trilhos) {
        trilhoKeys.add(`${meta.tab}:${trilho.key}`);
        if (!trilho.key.startsWith(`${area.key}-`)) {
          errors.push(`progresso: a chave "${trilho.key}" não corresponde à área "${area.key}".`);
        }
      }
    }
  }
  progressReport.trilhos = trilhoKeys.size;

  // As quatro Secções têm de ser distintas: duas iguais significam que um
  // separador da folha foi renomeado e a folha devolveu o primeiro em seu lugar.
  const hashes = Object.values(artefact.source?.sha256 ?? {});
  if (new Set(hashes).size !== hashes.length) {
    errors.push('progresso: duas Secções têm conteúdo idêntico. Provavelmente um separador foi renomeado.');
  }

  const fetchedAt = Date.parse(artefact.source?.fetchedAt ?? '');
  if (Number.isFinite(fetchedAt)) {
    progressReport.staleDays = Math.round((Date.now() - fetchedAt) / 86_400_000);
    if (progressReport.staleDays > config.progress.maxAgeDays) {
      warnings.push(`A taxonomia do Progresso Pessoal tem ${progressReport.staleDays} dias. Corra \`npm run progress:refresh\`.`);
    }
  }
}

// O mapeamento por jogo só é validado quando a taxonomia existe.
if (progressReport.present && existsSync(new URL(`../${config.progress.mapping}`, import.meta.url))) {
  const mapping = JSON.parse(readFileSync(new URL(`../${config.progress.mapping}`, import.meta.url), 'utf8'));
  const validNumbers = new Set(gameNumbers.map(String));
  for (const [tab, byGame] of Object.entries(mapping.sections ?? {})) {
    if (!config.progress.tabs.includes(tab)) {
      errors.push(`content.progress.json: Secção desconhecida "${tab}".`);
      continue;
    }
    for (const [number, entry] of Object.entries(byGame ?? {})) {
      if (!validNumbers.has(number)) {
        errors.push(`content.progress.json: o jogo ${number} não existe em games-map.json (${tab}).`);
      }
    }
  }
}

const report = {
  source: {
    characters: model.stats.sourceCharacters,
    bytes: model.stats.sourceBytes,
    nodes: model.stats.nodeCount,
    excludedSegments: model.excluded.length,
    excludedCharacters: model.excludedText.length,
    coverage: `${expectedOffset}/${source.length}`,
  },
  counts: {
    routes: model.routes.length,
    glossaryEntries: model.stats.glossaryEntries,
    steps: stepCounts,
    activities: model.stats.activities,
    areas: CHAPTER7_AREAS.length,
    diagrams: model.stats.diagrams,
    bibliographyEntries: model.stats.references,
    tools: model.stats.tools,
    dollarSpans: model.dollarSpans.length,
  },
  dom: {
    ids: allIds.length,
    duplicateIds,
    indexLinks: indexLinks.length,
    unsafeLinks: unsafeLinks.length,
    assets: renderedAssets.length,
  },
  warnings,
  errors,
};

console.log(JSON.stringify(report, null, 2));
if (errors.length) {
  console.error(`Falha na verificação de conteúdo: ${errors.length} erro(s).`);
  process.exitCode = 1;
} else {
  console.log('Conteúdo validado: cobertura integral, contagens corretas e destinos resolvidos.');
}
