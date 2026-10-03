import { existsSync, readFileSync } from 'node:fs';
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
    // Onze rotas: o Capítulo 8 (Espaço Influencers) não é publicado.
    expect(rendered.routeSections).toHaveLength(11);
    expect(contentRoot.querySelectorAll('h1')).toHaveLength(11);
    expect(contentRoot.querySelectorAll('.activity-card')).toHaveLength(30);
    expect(contentRoot.querySelectorAll('section.activity-area')).toHaveLength(5);
    expect(contentRoot.querySelectorAll('.diagram-disclosure')).toHaveLength(4);
    // As áreas de recursos eram do Capítulo 8, que não é publicado.
    expect(contentRoot.querySelectorAll('.resource-area')).toHaveLength(0);
    expect(contentRoot.textContent).not.toMatch(/Influencers/u);
  });

  it('mostra um bloco de progresso por jogo, agrupado Secção → Área → Trilho', () => {
    // Requer taxonomia e mapeamento; sem eles o bloco simplesmente não existe,
    // o que é verificado por `npm run progress:degrade`.
    const blocks = contentRoot.querySelectorAll('.progress-block');
    if (!existsSync('build/progress-taxonomy.json')) {
      expect(blocks).toHaveLength(0);
      return;
    }
    expect(blocks).toHaveLength(30);

    for (const block of blocks) {
      const tabs = [...block.querySelectorAll('.progress-section')].map((el) => el.dataset.section);
      expect(tabs.length).toBeGreaterThan(0);
      expect(new Set(tabs).size).toBe(tabs.length);
      for (const tab of tabs) expect(['1Sec', '2Sec', '3Sec', '4Sec']).toContain(tab);

      // Cada Secção tem áreas e, dentro de cada área, trilhos.
      for (const section of block.querySelectorAll('.progress-section')) {
        const areas = [...section.querySelectorAll('.progress-area')];
        expect(areas.length).toBeGreaterThan(0);
        for (const area of areas) {
          expect(area.querySelector('.progress-area__name').textContent).toBeTruthy();
          expect(area.querySelectorAll('.progress-trilho').length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('distingue as quatro Secções sem depender só da cor', () => {
    const sections = [...contentRoot.querySelectorAll('.progress-section')].slice(0, 4);
    if (!sections.length) return; // sem mapeamento: nada a verificar
    const indexes = sections.map((el) => el.dataset.sectionIndex);
    expect(new Set(indexes).size).toBe(4);
    for (const section of sections) {
      const summary = section.querySelector('.progress-section__summary').textContent;
      expect(summary).toMatch(/Secção/u);
      expect(summary).toMatch(/\d+–\d+/u);
    }
  });

  it('revela os descritores do trilho e o Caderno de Pista', () => {
    const trilho = contentRoot.querySelector('.progress-trilho');
    if (!trilho) return; // sem taxonomia
    const descriptors = trilho.querySelector('.progress-trilho__descriptors');
    expect(descriptors).not.toBeNull();
    expect(descriptors.textContent).toMatch(/Atitudes/u);
    expect(descriptors.textContent).toMatch(/Será que/u);
    expect(descriptors.textContent).toMatch(/observar/u);

    const reference = contentRoot.querySelector('.progress-reference');
    expect(reference.getAttribute('href')).toMatch(/^https:\/\/drive\.google\.com/u);
    expect(reference.getAttribute('rel')).toContain('noopener');
  });

  it('trata os descritores como conteúdo não fiável', () => {
    // Vêm de uma folha externa: têm de passar por DOMPurify.
    for (const descriptors of contentRoot.querySelectorAll('.progress-trilho__descriptors')) {
      expect(descriptors.querySelector('script')).toBeNull();
      expect(descriptors.querySelector('iframe')).toBeNull();
    }
    for (const link of contentRoot.querySelectorAll('.progress-reference')) {
      expect(link.getAttribute('href') ?? '').not.toMatch(/^javascript:/iu);
    }
  });

  it('liga cada cartão à ficha para impressão e ao jogo individual', () => {
    const print = [...contentRoot.querySelectorAll('.activity-action--print')];
    const detail = [...contentRoot.querySelectorAll('[data-game-link]')];
    expect(print).toHaveLength(30);
    expect(detail).toHaveLength(30);
    for (const link of print) {
      // O `href` é relativo a `index.html`, por isso começa por `source/`.
      expect(link.getAttribute('href')).toMatch(/^(?:\.\.\/)?source\/games\/\d{2}Game\.html$/u);
    }
    for (const link of detail) {
      expect(link.getAttribute('href')).toMatch(/^#\/jogo\/\d{1,2}$/u);
    }
  });

  it('não cria IDs duplicados com o bloco de progresso', () => {
    const ids = [...contentRoot.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('não cria IDs duplicados e resolve todos os destinos do índice', () => {
    const ids = [...contentRoot.querySelectorAll('[id]')].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    const links = [...contentRoot.querySelectorAll('.source-index-list a')];
    // Dezanove entradas, menos a do Capítulo 8, que não é publicado.
    expect(links).toHaveLength(18);
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
