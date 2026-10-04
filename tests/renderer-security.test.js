import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parseDocument } from '../src/content/parser.js';
import { renderApplication, renderInlineText, sanitizeUrl } from '../src/content/renderer.js';
import { CHAPTERS, chapterNavName } from '../src/content/source-map.js';
import { GAMES } from '../src/content/games.js';

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
      // O nome da branch identifica a Secção; a faixa etária já não aparece.
      expect(summary).toMatch(/Lobitos|Exploradores|Pioneiros|Caminheiros/u);
      expect(summary).not.toMatch(/\d+–\d+/u);
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

  it('abre a barra lateral com um convite que diz o que há para ler', () => {
    const hero = navigationRoot.querySelector('[data-nav-group="explorar"]');
    expect(hero).not.toBeNull();
    // Primeiro de tudo, para que o convite seja o que se vê ao abrir a barra.
    expect(navigationRoot.firstElementChild).toBe(hero);

    const chapters = hero.querySelector('.nav-hero__stats').textContent;
    expect(chapters).toContain(String(GAMES.length));
    expect(chapters).toMatch(/\d+ jogos/u);
    // As contagens são calculadas, não escritas: tem de bater certo com o mapa.
    const expectedChapters = CHAPTERS.length;
    expect(chapters).toContain(`${expectedChapters} capítulos`);
    // E o atalho para a pesquisa é um botão, não texto decorativo.
    expect(hero.querySelector('[data-nav-search]').tagName).toBe('BUTTON');
  });

  it('nomeia os capítulos na navegação com o título editorial', () => {
    // O nome vem de `CHAPTERS[].heading`, a mesma cadeia que o parser usa para
    // encontrar o capítulo. Escrever o nome à mão aqui faria a barra divergir.
    for (const chapter of CHAPTERS) {
      const link = navigationRoot.querySelector(`[data-route="${chapter.id}"]`);
      expect(link, chapter.id).not.toBeNull();
      const name = link.querySelector('.nav-link__name').textContent;
      expect(name).toBe(chapterNavName(chapter.heading));
      expect(name).not.toBe('');
      expect(name).not.toMatch(/^Capítulo\s+\d+$/u);
    }
  });

  it('mantém o número do capítulo legível sem depender da cor', () => {
    const link = navigationRoot.querySelector('[data-route="capitulo-7"]');
    const number = link.querySelector('.nav-link__number');
    expect(number.textContent).toBe('7');
    // O número é decorativo: o nome completo é que identifica o destino.
    expect(number.getAttribute('aria-hidden')).toBe('true');
    expect(link.textContent).toBe('7Jogos e Workshops — Oferta Pedagógica');
    // E o `title` dá o nome inteiro a quem passa o rato, já que o limite de
    // linhas é só de CSS.
    expect(link.querySelector('.nav-link__name').getAttribute('title'))
      .toBe('Jogos e Workshops — Oferta Pedagógica');
  });

  it('as ligações sem número ocupam a largura toda da barra', () => {
    // `Início`, `Glossário` e `Bibliografia` não têm número à esquerda. Se usassem
    // a grelha de duas colunas sem o número, o texto ficava na coluna de 1.4 rem
    // e appearcia cortado em «Inic».
    for (const routeId of ['inicio', 'glossario', 'indice', 'referencias']) {
      const link = navigationRoot.querySelector(`[data-route="${routeId}"]`);
      expect(link, routeId).not.toBeNull();
      expect(link.classList.contains('nav-link--plain'), routeId).toBe(true);
      expect(link.querySelector('.nav-link__number'), routeId).toBeNull();
      expect(link.textContent, routeId).not.toBe('');
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
