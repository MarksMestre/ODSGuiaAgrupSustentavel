/**
 * Verificação de fumo: percorre o site como um utilizador.
 *
 * Ao contrário dos testes, isto corre em Node simples, onde `import.meta.glob`
 * não existe. É por isso que o número de blocos de Progresso Pessoal não é
 * verificado aqui — o pathname do glob devolve `{}` fora de um bundler. A
 * verificação completa vive em `npm test`, que passa pelo Vite.
 */

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM(readFileSync('index.html', 'utf8'), {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});

Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  Node: dom.window.Node,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
});
dom.window.matchMedia ??= () => ({
  matches: false, addEventListener() {}, removeEventListener() {},
});

const { parseDocument, validateParsedDocument } = await import('../src/content/parser.js');
const { renderApplication } = await import('../src/content/renderer.js');
const { initInteractions } = await import('../src/content/interactions.js');
const { CHAPTERS, chapterNavName } = await import('../src/content/source-map.js');

const q = (selector) => document.querySelector(selector);
const model = parseDocument(readFileSync('file.md', 'utf8'));
const rendered = renderApplication(model, {
  contentRoot: q('#app-content'),
  navigationRoot: q('#primary-navigation'),
});

const controller = initInteractions(model, rendered, {
  contentRoot: q('#app-content'),
  navigationRoot: q('#primary-navigation'),
  searchInput: q('#document-search'),
  searchResults: q('#search-results'),
  liveRegion: q('#live-region'),
  filterStatus: q('#filter-status'),
  menuButton: q('#menu-button'),
  navigationPanel: q('#navigation-panel'),
  navigationBackdrop: q('#navigation-backdrop'),
  navigationClose: q('#navigation-close'),
  themeButton: q('#theme-button'),
  printButton: q('#print-button'),
  progressBar: q('#reading-progress-bar'),
});

const go = (hash) => {
  window.location.hash = hash;
  window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
};
const visible = () => [...document.querySelectorAll('.route-section')].filter((el) => !el.hidden);

const failures = [];
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures.push(`${label}: esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`);
  }
  console.log(`  ${ok ? 'ok  ' : 'FALHA'} ${label}`);
};

console.log('\nSmoke test do site');
console.log('==================');

check('a fonte não tem erros de parsing', validateParsedDocument(model), []);
check('onze rotas publicadas', model.routes.length, 11);
check('a navegação tem seis grupos',
  [...document.querySelectorAll('[data-nav-group]')].map((el) => el.dataset.navGroup),
  ['explorar', 'inicio', 'referencias-rapidas', 'capitulos', 'jogos', 'final']);
check('o convite no topo da barra lateral conta o que há',
  q('.nav-hero__stats')?.textContent, `${CHAPTERS.length} capítulos · 30 jogos`);
check('o convite dá acesso à pesquisa',
  q('.nav-hero__search')?.tagName, 'BUTTON');
check('a navegação mostra o nome editorial dos capítulos',
  q('[data-route="capitulo-2"] .nav-link__name')?.textContent,
  chapterNavName(CHAPTERS[1].heading));
check('as ligações sem número não ficam numa coluna estreita',
  [...document.querySelectorAll('#primary-navigation .nav-link:not([data-route^="capitulo-"])')]
    .filter((a) => !a.classList.contains('nav-link--plain')).length, 0);
check('a navegação lista os trinta jogos',
  document.querySelectorAll('[data-game-nav]').length, 30);
check('a navegação lista as cinco áreas',
  document.querySelectorAll('.nav-games__area').length, 5);

go('#/capitulo/7');
check('o Capítulo 7 abre', visible().map((el) => el.dataset.route), ['capitulo-7']);
check('o Capítulo 7 tem trinta cartões',
  visible()[0]?.querySelectorAll('.activity-card').length, 30);
check('cada cartão tem jogo e ficha',
  document.querySelectorAll('[data-game-link]').length
    + document.querySelectorAll('.activity-action--print').length, 60);

go('#/jogo/15');
check('a página de jogo abre', visible().map((el) => el.dataset.route), ['jogo']);
check('a página de jogo mostra o título',
  visible()[0]?.querySelector('h1')?.textContent, 'Jogo dos Salários');
check('o Capítulo 7 fica realçado na navegação',
  q('#primary-navigation [aria-current]')?.dataset.route, 'capitulo-7');
check('o jogo fica realçado na lista',
  q('.nav-games__link.is-active')?.dataset.gameNav, '15');

go('#/jogo/99');
check('um jogo inexistente dá erro, não falha',
  visible()[0]?.querySelector('h1')?.textContent, 'Jogo não encontrado');
check('a página de erro oferece saída',
  visible()[0]?.querySelector('.game-back')?.getAttribute('href'), '#/capitulo/7');

go('#/capitulo/7');
const areaFilter = q('#filter-area');
areaFilter.value = 'area-do-planeta';
areaFilter.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
check('o filtro por área reduz os cartões',
  [...document.querySelectorAll('.activity-card')].filter((el) => !el.hidden).length, 6);
check('o filtro anuncia o resultado',
  q('#filter-status')?.textContent, '6 atividades disponíveis.');

go('#/inicio');
check('voltar ao início funciona', visible().map((el) => el.dataset.route), ['inicio']);

const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
check('não há ids duplicados', [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))], []);

controller.destroy?.();
console.log('');
if (failures.length) {
  console.error(`${failures.length} verificação(ões) falharam:`);
  for (const item of failures) console.error(`  - ${item}`);
  process.exitCode = 1;
} else {
  console.log('Smoke test passou.');
}