import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parseDocument } from '../src/content/parser.js';
import { renderApplication, renderInlineText, sanitizeUrl } from '../src/content/renderer.js';

const source = readFileSync('file.md', 'utf8');
const model = parseDocument(source);
let contentRoot;
let navigationRoot;
let rendered;

beforeAll(() => {
  document.body.innerHTML = '<main id="content"></main><nav id="navigation"></nav>';
  contentRoot = document.querySelector('#content');
  navigationRoot = document.querySelector('#navigation');
  rendered = renderApplication(model, { contentRoot, navigationRoot });
});

beforeEach(() => {
  document.body.innerHTML = '<main id="content"></main><nav id="navigation"></nav>';
  contentRoot = document.querySelector('#content');
  navigationRoot = document.querySelector('#navigation');
  rendered = renderApplication(model, { contentRoot, navigationRoot });
});

describe('renderização semântica', () => {
  it('renderiza todas as rotas, atividades e diagramas uma vez', () => {
    expect(rendered.routeSections).toHaveLength(12);
    expect(contentRoot.querySelectorAll('h1')).toHaveLength(12);
    expect(contentRoot.querySelectorAll('.activity-card')).toHaveLength(30);
    expect(contentRoot.querySelectorAll('section.activity-area')).toHaveLength(5);
    expect(contentRoot.querySelectorAll('.diagram-disclosure')).toHaveLength(4);
    expect(contentRoot.querySelectorAll('.resource-area')).toHaveLength(5);
  });

  it('não cria IDs duplicados e resolve todos os destinos do índice', () => {
    const ids = [...contentRoot.querySelectorAll('[id]')].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    const links = [...contentRoot.querySelectorAll('.source-index-list a')];
    expect(links).toHaveLength(19);
    links.forEach((link) => {
      const url = new URL(link.href, window.location.href);
      const [routeHash, query] = url.hash.split('?');
      expect(routeHash).toMatch(/^#\/(inicio|glossario|indice|capitulo\/\d|referencias)$/u);
      const anchor = new URLSearchParams(query ?? '').get('anchor');
      if (anchor) expect(document.getElementById(anchor)).not.toBeNull();
    });
  });

  it('reconstrói as duas tabelas com valores exatos', () => {
    const fivePRows = contentRoot.querySelectorAll('.five-p-table tbody tr');
    expect(fivePRows).toHaveLength(5);
    expect([...fivePRows[0].children].map((cell) => cell.textContent)).toEqual([
      'Pessoas',
      'ODS 1, 2, 3, 4, 5, 6',
      'Erradicar a pobreza e a fome; dignidade, igualdade e bem-estar para todos num ambiente saudável.',
    ]);
    const economicsRows = contentRoot.querySelectorAll('.economics-table tbody tr');
    expect(economicsRows).toHaveLength(11);
    expect([...Array.from(economicsRows).at(-1).children].map((cell) => cell.textContent)).toEqual([
      'Atividades de Lazer / Cultura',
      '$50€$',
      ' cada4 cada',
    ]);
  });

  it('renderiza apenas as seis expressões TeX aprovadas', () => {
    expect(contentRoot.querySelectorAll('.katex')).toHaveLength(6);
    expect(contentRoot.textContent).toContain('$100€$');
    expect(contentRoot.textContent).toContain('$200€$');
  });

  it('mantém os quatro diagramas em blocos pre sem truncamento', () => {
    const diagrams = [...contentRoot.querySelectorAll('.diagram-disclosure')];
    expect(diagrams).toHaveLength(4);
    diagrams.forEach((diagram) => {
      const pre = diagram.querySelector('pre');
      expect(pre.textContent.length).toBeGreaterThan(50);
    });
    expect(diagrams.some((diagram) => diagram.querySelector('pre').textContent.includes('──>'))).toBe(true);
    expect(diagrams.some((diagram) => diagram.querySelector('pre').textContent.includes('▼'))).toBe(true);
  });
});

describe('segurança de markup, mathematics e URLs', () => {
  it('exibe HTML e scripts como texto inerte', () => {
    const fragment = renderInlineText('<img src=x onerror="alert(1)"><script>alert(1)</script>');
    expect(fragment.querySelector('img')).toBeNull();
    expect(fragment.querySelector('script')).toBeNull();
    expect(fragment.textContent).toBe('<img src=x onerror="alert(1)"><script>alert(1)</script>');
  });

  it('rejeita URLs-executáveis e endereços de protocolos proibidos', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeUrl('data:text/html,test')).toBeNull();
    expect(sanitizeUrl('vbscript:msgbox(1)')).toBeNull();
    expect(sanitizeUrl('file:///C:/secret.txt')).toBeNull();
    expect(sanitizeUrl('//example.com')).toBeNull();
    expect(sanitizeUrl('https://example.com/path')).toBe('https://example.com/path');
    expect(renderInlineText('[ligação](javascript:alert(1))').querySelector('a')?.getAttribute('href') ?? null).toBeNull();
  });

  it('normaliza apenas os dois domínios conhecidos para HTTPS', () => {
    const links = Array.from(contentRoot.querySelectorAll('a[href^="https://"]')).filter((link) => ['ods.pt', 'footprintcalculator.org'].includes(link.textContent));
    expect([...new Set(links.map((link) => link.textContent))].sort()).toEqual(['footprintcalculator.org', 'ods.pt']);
    links.forEach((link) => {
      expect(link.href).toBe(`https://${link.textContent}/`);
      expect(link.rel).toContain('noopener');
    });
  });
});
