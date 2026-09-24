import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDocument } from '../src/content/parser.js';
import { renderApplication } from '../src/content/renderer.js';
import { activityMatchesFilters, initInteractions, normalizeSearchText } from '../src/content/interactions.js';

const source = readFileSync('file.md', 'utf8');
const model = parseDocument(source);
const indexHtml = readFileSync('index.html', 'utf8');
let controller;
let contentRoot;
let navigationRoot;
let rendered;

function query(selector) {
  return document.querySelector(selector);
}

function mountApplication() {
  const dom = new JSDOM(indexHtml, { url: 'https://example.test/' });
  document.documentElement.lang = dom.window.document.documentElement.lang;
  document.documentElement.dir = dom.window.document.documentElement.dir;
  document.body.replaceChildren(...[...dom.window.document.body.childNodes].map((node) => document.importNode(node, true)));
  window.history.replaceState(null, '', '#/inicio');
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');

  contentRoot = query('#app-content');
  navigationRoot = query('#primary-navigation');
  rendered = renderApplication(model, { contentRoot, navigationRoot });
  controller = initInteractions(model, rendered, {
    contentRoot,
    navigationRoot,
    searchInput: query('#document-search'),
    searchResults: query('#search-results'),
    liveRegion: query('#live-region'),
    filterStatus: query('#filter-status'),
    menuButton: query('#menu-button'),
    navigationPanel: query('#navigation-panel'),
    navigationBackdrop: query('#navigation-backdrop'),
    navigationClose: query('#navigation-close'),
    themeButton: query('#theme-button'),
    printButton: query('#print-button'),
    progressBar: query('#reading-progress-bar'),
  });
}

beforeAll(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

beforeEach(() => {
  mountApplication();
});

afterEach(() => {
  controller.destroy();
  vi.restoreAllMocks();
});

describe('normalização e pesquisa', () => {
  it('remove acentos e maiúsculas sem perder o texto pesquisável', () => {
    expect(normalizeSearchText('  AÇÕES, INCLUSÃO  ')).toBe('acoes, inclusao');
  });

  it('mostra resultados e permite navegação pelo teclado', () => {
    const input = query('#document-search');
    input.value = 'saude';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const options = [...query('#search-results').querySelectorAll('[role="option"]')];
    expect(options.length).toBeGreaterThan(0);
    expect(options.some((option) => option.textContent.includes('Corrida da Saúde'))).toBe(true);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(input.getAttribute('aria-activedescendant')).toBe('search-result-0');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(query('#search-results').hidden).toBe(true);
    expect(document.activeElement).toBe(input);

    input.value = 'saude';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(window.location.hash).toBe('#/capitulo/7');
  });

  it('apresenta um estado explícito quando não há resultados', () => {
    const input = query('#document-search');
    input.value = 'palavra-inexistente-123';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(query('#search-results').textContent).toContain('Nenhum resultado');
    expect(query('#search-results').querySelectorAll('[role="option"]')).toHaveLength(0);
  });
});

describe('filtros das atividades', () => {
  it('combina área, formato e ODS com semântica AND e preserva a ordem', () => {
    const area = query('#filter-area');
    const format = query('#filter-format');
    const ods = query('#filter-ods');
    area.value = 'area-do-planeta';
    format.value = 'Presencial';
    ods.value = '1';
    [area, format, ods].forEach((control) => control.dispatchEvent(new Event('change', { bubbles: true })));

    const visible = [...contentRoot.querySelectorAll('.activity-card:not([hidden])')];
    expect(visible.map((card) => card.dataset.title ?? card.querySelector('h3').textContent)).toEqual([
      '2. Água: Bem de Todos, para Todos!',
    ]);
    expect(query('#activity-count').textContent).toBe('1 de 30 atividades');
    expect(query('#filter-empty').hidden).toBe(true);
  });

  it('trata a areas sem correspondência como conjunto vazio e limpa tudo', () => {
    const area = query('#filter-area');
    area.value = 'area-das-pessoas';
    area.dispatchEvent(new Event('change', { bubbles: true }));
    const format = query('#filter-format');
    format.value = 'Online ou Presencial';
    format.dispatchEvent(new Event('change', { bubbles: true }));
    expect(contentRoot.querySelectorAll('.activity-card:not([hidden])')).toHaveLength(0);
    expect(query('#filter-empty').hidden).toBe(false);

    query('#clear-filters').click();
    expect(contentRoot.querySelectorAll('.activity-card:not([hidden])')).toHaveLength(30);
  });

  it('inclui atividades com todos os ODS em qualquer filtro de ODS', () => {
    const card = contentRoot.querySelector('.activity-card[data-ods-all="true"]');
    expect(activityMatchesFilters(card, { area: '', format: '', ods: '1' })).toBe(true);
  });
});

describe('rotas, tema, gaveta e impressão', () => {
  it('aceita links profundos e redireciona endereços inválidos', async () => {
    window.location.hash = '#/capitulo/7?anchor=atividade-6-corrida-da-saude';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(query('#capitulo-7').hidden).toBe(false);
    expect(document.getElementById('atividade-6-corrida-da-saude')).not.toBeNull();

    window.location.hash = '#/rota-inexistente';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(window.location.hash).toBe('#/inicio');
    await new Promise((resolve) => window.setTimeout(resolve, 5));
    expect(query('#live-region').textContent).toContain('Endereço não reconhecido');
  });

  it('alterna o tema e sobrevive a falhas de armazenamento', () => {
    controller.destroy();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => mountApplication()).not.toThrow();
    const initial = document.documentElement.dataset.theme;
    query('#theme-button').click();
    expect(document.documentElement.dataset.theme).not.toBe(initial);
    expect(query('#theme-button').getAttribute('aria-pressed')).toBe(String(document.documentElement.dataset.theme === 'dark'));
  });

  it('mantém e fecha a gaveta com Escape', () => {
    const menu = query('#menu-button');
    menu.click();
    expect(query('#navigation-panel').dataset.open).toBe('true');
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    query('#navigation-panel').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(query('#navigation-panel').dataset.open).toBeUndefined();
    expect(menu.getAttribute('aria-expanded')).toBe('false');
  });

  it('expõe todas as rotas para impressão e restaura o estado anterior', () => {
    const area = query('#filter-area');
    area.value = 'area-do-planeta';
    area.dispatchEvent(new Event('change', { bubbles: true }));
    const details = contentRoot.querySelector('details');
    details.open = false;

    controller.prepareForPrint();
    expect(contentRoot.querySelectorAll('.route-section:not([hidden])')).toHaveLength(12);
    expect(contentRoot.querySelectorAll('.activity-card:not([hidden])')).toHaveLength(30);
    expect(details.open).toBe(true);

    controller.restoreAfterPrint();
    expect(contentRoot.querySelectorAll('.route-section:not([hidden])')).toHaveLength(1);
    expect(contentRoot.querySelectorAll('.activity-card:not([hidden])')).toHaveLength(6);
    expect(details.open).toBe(false);
  });
});
