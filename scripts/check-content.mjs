import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import {
  CHAPTER7_AREAS,
  CHAPTER8_RESOURCES,
  CHAPTERS,
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

let expectedOffset = 0;
for (const [index, node] of model.nodes.entries()) {
  if (node.sourceOffset !== expectedOffset) {
    errors.push(`Nó ${index}: esperado offset ${expectedOffset}, recebido ${node.sourceOffset}.`);
  }
  expectedOffset = node.sourceOffset + node.sourceText.length;
}
if (expectedOffset !== source.length) errors.push('A cobertura de nós não consome a fonte por inteiro.');

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

const resourceAreas = model.nodes.filter((node) => node.kind === 'resource-area-heading');
if (resourceAreas.length !== EXPECTED_COUNTS.chapter8Areas) errors.push('Número inválido de áreas de recursos.');
const resourceGroups = model.nodes.filter((node) => node.kind === 'resource-group');
const expectedResourceLabels = CHAPTER8_RESOURCES.flatMap((area) => area.groups);
if (resourceGroups.length !== expectedResourceLabels.length) errors.push('Número inválido de grupos de recursos.');
resourceGroups.forEach((node, index) => {
  if (node.data.title !== expectedResourceLabels[index]) errors.push(`Grupo de recursos fora de ordem: ${node.data.title}.`);
  if (!node.data.items.length) errors.push(`Grupo de recursos vazio: ${node.data.title}.`);
});

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

const report = {
  source: {
    characters: model.stats.sourceCharacters,
    bytes: model.stats.sourceBytes,
    nodes: model.stats.nodeCount,
    coverage: `${expectedOffset}/${source.length}`,
  },
  counts: {
    routes: model.routes.length,
    glossaryEntries: model.stats.glossaryEntries,
    steps: stepCounts,
    activities: model.stats.activities,
    areas: CHAPTER7_AREAS.length,
    diagrams: model.stats.diagrams,
    resourceAreas: resourceAreas.length,
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
