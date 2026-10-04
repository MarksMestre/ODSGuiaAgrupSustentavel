/**
 * As fichas de jogo em `source/games/` são artefactos gerados e versionados, e
 * por isso são também a superfície de teste do estágio Python: não há um
 * executor de testes em Python neste projeto, e o `check:content` valida o
 * que o sítio recebe em vez de chamar o código que o produziu.
 *
 * Estes testes verificam a *forma* do que é gerado — a hierarquia das listas, a
 * separação das linhas do `Duração e Participantes`, a paleta do sítio — e não o
 * texto editorial, que muda legitimamente sempre que o Word é revisto.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import gamesMap from '../content/games-map.json' with { type: 'json' };

const games = gamesMap.games;

// Caminhos relativos à raiz do repositório, como nos restantes testes.
function sheetPath(number, extension) {
  return join('source', 'games', `${String(number).padStart(2, '0')}Game.${extension}`);
}

function sheet(number, extension) {
  return readFileSync(sheetPath(number, extension), 'utf8');
}

function markdownCell(text, label) {
  const row = text.split('\n').find((line) => line.startsWith(`| ${label} |`));
  if (!row) throw new Error(`A linha "${label}" não existe.`);
  return row.slice(`| ${label} |`.length, row.lastIndexOf('|'));
}

function htmlCell(text, label) {
  const at = text.indexOf(`<th scope="row">${label}</th>`);
  if (at === -1) throw new Error(`A célula "${label}" não existe.`);
  const rest = text.slice(at);
  const open = rest.indexOf('<td>');
  const close = rest.indexOf('</td>', open);
  return rest.slice(open + 4, close);
}

/** Os blocos de lista de topo de uma célula, na ordem em que aparecem. */
function listBlocks(cell) {
  return [...cell.matchAll(/<(ol|ul)>/gu)].map((match) => match[1]);
}

describe('fichas: hierarquia das instruções', () => {
  it('o jogo 1 mantém as personagens como marcas dentro do primeiro passo', () => {
    // O defeito reportado: as treze personagens eram numeradas 2. a 14., e a
    // reflexão final chegava a 16.
    const cell = markdownCell(sheet(1, 'md'), 'Instruções');
    expect(cell).toMatch(/<ol><li><strong>1\.<\/strong>/u);
    expect(cell).toMatch(/<ul><li>Zaki/u);
    expect(cell).toMatch(/<li>Paolo/u);
    expect(cell).toMatch(/<strong>2\.<\/strong> No final/u);
    // `Local:` é texto corrente, não um passo.
    expect(cell).toContain('Local: Aldeia do interior, no Quénia.');
    expect(cell).not.toMatch(/<strong>15\.<\/strong>/u);
  });

  it('o jogo 3 numera cada parte de fora, com a Parte 2 a recomeçar', () => {
    const cell = markdownCell(sheet(3, 'md'), 'Instruções');
    const marker = '<strong>Parte 2: Desenho do mapa. (40’)</strong><br>';
    expect(cell).toContain('Parte 1:');
    expect(cell).toContain(marker);

    const [firstPart, secondPart] = cell.split(marker);
    expect(firstPart).toContain('<strong>1.</strong>');
    expect(firstPart).toContain('<strong>4.</strong>');
    // A parte recomeça: é o que o animador espera no papel.
    expect(secondPart).toContain('<strong>1.</strong>');
    expect(secondPart).not.toContain('<strong>5.</strong>');
    expect(listBlocks(cell)).toEqual(['ol', 'ol']);
  });

  it('o jogo 5 traz só as sete instruções, sem o baralho', () => {
    // O caso mais grave: as 137 cartas do baralho eram numeradas como
    // instruções, e a célula tinha 12 877 caracteres.
    const text = sheet(5, 'md');
    expect(text.length).toBeLessThan(4000);
    const cell = markdownCell(text, 'Instruções');
    expect(listBlocks(cell)).toEqual(['ol']);
    expect([...cell.matchAll(/<li>/gu)]).toHaveLength(7);
    // Nenhum nome de personagem do baralho: são 137 parágrafos que não são
    // instruções e que já ocuparam esta célula.
    expect(cell).not.toMatch(/Sara|André|Jessica|Tiago/u);
  });

  it('o jogo 13 põe as perguntas dentro do passo que as traz', () => {
    // As marcas são filhas do segundo passo numerado, não uma lista irmã: é a
    // diferença entre sub-passos e continuação do jogo.
    const cell = markdownCell(sheet(13, 'md'), 'Instruções');
    expect(listBlocks(cell)).toEqual(['ol', 'ul']);
    const stepTwo = cell.slice(
      cell.indexOf('<li><strong>2.</strong>'),
      cell.indexOf('</ul>'),
    );
    expect(stepTwo).toContain('<ul><li>Achas que existe trabalho escravo');
    expect(stepTwo).toContain('Como podem as pessoas podem ajudar');
    expect([...cell.matchAll(/<strong>(\d+)\.<\/strong>/gu)].map((m) => m[1]))
      .toEqual(['1', '2', '3']);
  });

  it('o jogo 25 separa as duas variantes de formato', () => {
    // As duas variantes eram uma corrida corrida de oito passos.
    const cell = markdownCell(sheet(25, 'md'), 'Instruções');
    expect(cell).toContain('Instruções para formato presencial:');
    const blocks = cell.split('<br>');
    const afterHeading = blocks.slice(blocks.indexOf('<strong>Instruções para formato presencial:</strong>') + 1).join('<br>');
    expect(afterHeading).toContain('<strong>1.</strong>');
  });

  it('o jogo 28 mantém as suas sete instruções e o 29 ganha as suas quatro', () => {
    // O «Descobre +ODS» está aninhado dentro do «Desenho Estragado» no Word.
    const twentyEight = markdownCell(sheet(28, 'md'), 'Instruções');
    const twentyNine = markdownCell(sheet(29, 'md'), 'Instruções');
    expect([...twentyEight.matchAll(/<li>/gu)]).toHaveLength(7);
    expect([...twentyNine.matchAll(/<li>/gu)]).toHaveLength(4);
    expect(twentyEight).not.toContain('Nas realidades locais');
    expect(twentyNine).toContain('Nas realidades locais');
  });

  it('o jogo 10 numera as três construções e aninha os materiais', () => {
    // O jogo 10 é o caso onde o cabeçalho também é item numerado: tratá-lo como
    // cabeçalho fazia as suas sub-listas serem lidas como anexo, e o jogo perdia
    // as instruções todas.
    const cell = markdownCell(sheet(10, 'md'), 'Instruções');
    // Uma `<ol>` com três `<li>`, cada um com a sua `<ul>` de materiais.
    expect(listBlocks(cell)).toEqual(['ol', 'ul', 'ul', 'ul']);
    expect([...cell.matchAll(/<strong>(\d+)\.<\/strong>/gu)].map((m) => m[1]))
      .toEqual(['1', '2', '3']);
    expect(cell).toContain('Corta-se 4 tábuas de madeira');
    expect(cell).toContain('Abrigos para borboletas');
    expect(cell).toContain('Abrigo para abelhas-solitárias');
    expect(cell).toContain('Abrigo para Joaninhas');
  });

  it('a numeração nunca corre sem que o texto justifique', () => {
    // A forma do defeito era uma lista corrida de 1 a 16 com as personagens
    // numeradas como passos. Um jogo pode legitimately ter muitos passos; o que
    // não pode é ter uma lista de centenas de entradas curtas, que é a assinatura
    // de conteúdo que entrou por engano (o baralho do jogo 5 tinha 137).
    for (const game of games) {
      const cell = markdownCell(sheet(game.number, 'md'), 'Instruções');
      const items = [...cell.matchAll(/<li>/gu)];
      expect(items.length, game.sheet).toBeLessThan(60);
    }
  });

  it('as listas aninhadas estão dentro do passo que as traz', () => {
    // Se a `<ul>` dos materiais fechasse depois do `</li>` do passo, o Markdown
    // seria uma lista irmã e a sub-hierarquia desapareceria ao ser renderizada.
    // A verificação confirma a estrutura: uma lista filha abre dentro de um `<li>`
    // e fecha antes de ele terminar.
    for (const game of games) {
      const cell = markdownCell(sheet(game.number, 'md'), 'Instruções');
      const tags = [...cell.matchAll(/<(\/?)(ol|ul|li)>/gu)].map((m) => m[1] + m[2]);
      let depth = 0;
      // Para cada `<li>` aberto, a profundidade de listas em que abriu.
      const itemDepths = [];

      for (const tag of tags) {
        const closing = tag.startsWith('/');
        const name = closing ? tag.slice(1) : tag;

        if (name === 'li') {
          if (closing) {
            if (!itemDepths.length) {
              throw new Error(`${game.sheet}: </li> sem <li>.`);
            }
            // Uma lista filha tem de estar fechada quando o passo fecha.
            if (depth !== itemDepths.pop()) {
              throw new Error(
                `${game.sheet}: lista ainda aberta quando o <li> fecha `
                + `(${depth} em vez de ${itemDepths.at(-1) ?? 0}).`,
              );
            }
          } else {
            itemDepths.push(depth);
          }
          continue;
        }

        if (closing) {
          if (!depth) {
            throw new Error(`${game.sheet}: </${name}> fecha uma lista que não abriu.`);
          }
          depth -= 1;
          continue;
        }
        // Uma lista filha abre dentro de um `<li>`; uma de topo, sem.
        if (depth && !itemDepths.length) {
          throw new Error(`${game.sheet}: <${name}> abre fora de um <li>.`);
        }
        depth += 1;
      }

      expect(depth, `${game.sheet}: listas por fechar`).toBe(0);
      expect(itemDepths.length, `${game.sheet}: <li> por fechar`).toBe(0);
    }
  });

  it('o .md e o .html concordam sobre quantas listas há', () => {
    for (const game of games) {
      const inMarkdown = listBlocks(markdownCell(sheet(game.number, 'md'), 'Instruções'));
      const inHtml = listBlocks(htmlCell(sheet(game.number, 'html'), 'Instruções'));
      expect(inHtml, `${game.sheet}: listas divergentes`).toEqual(inMarkdown);
    }
  });
});

describe('fichas: linha "Duração e Participantes"', () => {
  it('tem uma linha por campo, e não uma frase corrida', () => {
    for (const game of games) {
      if (!game.format || !game.participants || !game.duration) continue;
      const cell = markdownCell(sheet(game.number, 'md'), 'Duração e Participantes');
      expect(cell, game.sheet).toContain('<br>');
      expect(cell.split('<br>'), game.sheet).toHaveLength(3);
      expect(cell, game.sheet).toMatch(/\*\*Formato:\*\*/u);
      expect(cell, game.sheet).toMatch(/\*\*Participantes:\*\*/u);
      expect(cell, game.sheet).toMatch(/\*\*Duração:\*\*/u);
    }
  });

  it('o .html mostra os três campos em negrito e em linhas separadas', () => {
    const cell = htmlCell(sheet(1, 'html'), 'Duração e Participantes');
    expect(cell).toContain('<strong>Formato:</strong>');
    expect(cell).toContain('<strong>Participantes:</strong>');
    expect(cell).toContain('<strong>Duração:</strong>');
    expect(cell.match(/<br \/>/gu)).toHaveLength(2);
  });
});

describe('fichas: o Markdown é renderizado e a paleta é a do sítio', () => {
  it('não deixa nenhum `**` por renderizar', () => {
    for (const game of games) {
      const html = sheet(game.number, 'html');
      const visible = html
        .replace(/<style[\s\S]*?<\/style>/gu, '')
        .replace(/<script[\s\S]*?<\/script>/gu, '');
      expect(visible, `${game.sheet}: "**" à vista`).not.toContain('**');
    }
  });

  it('usa as cores e as margens de impressão do sítio', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    const sheetHtml = sheet(1, 'html');
    // Se uma cor mudar no sítio, esta verificação passa a falhar e a ficha é
    // regenerada em vez de ficar com a paleta antiga.
    for (const token of ['--green-800', '--paper-soft', '--ink', '--line', '--radius-md']) {
      expect(css, `${token} não está em styles.css`).toContain(`${token}:`);
      expect(sheetHtml, `${token} não está na ficha`).toContain(`${token}:`);
    }
    const pageMargin = css.match(/@page\s*\{[^}]*margin:\s*([^;]+);/su)?.[1]?.trim();
    expect(pageMargin).toBeTruthy();
    expect(sheetHtml).toContain(`margin: ${pageMargin}`);
  });

  it('assinala a área do jogo com a mesma cor dos cartões do Capítulo 7', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    expect(css).toContain('--people:');
    // O mapeamento tem de ser exacto: «Pessoas» e «Parcerias» partilham a letra
    // «P», e uma correspondência por semelhança punha todas as fichas no mesmo
    // verde sem dar erro.
    const expected = {
      'Área das Pessoas': 'people',
      'Área do Planeta': 'planet',
      'Área da Prosperidade': 'prosperity',
      'Área da Paz': 'peace',
      'Área das Parcerias': 'partnerships',
    };
    const seen = new Set();
    for (const game of games) {
      const slug = expected[game.area];
      expect(slug, `área desconhecida: ${game.area}`).toBeTruthy();
      expect(sheet(game.number, 'html'), game.sheet).toContain(`sheet--${slug}`);
      seen.add(slug);
    }
    // Todas as cinco áreas aparecem em pelo menos uma ficha.
    expect(seen.size).toBe(5);
  });

  it('mantém os ODS monetários legíveis em vez de os interpretar', () => {
    // `$100€$` não pode virar KaTeX: a ficha é autónoma e não o carrega.
    const cell = markdownCell(sheet(15, 'md'), 'Objetivos');
    expect(cell).toContain('$200€$');
    expect(htmlCell(sheet(15, 'html'), 'Objetivos')).not.toContain('katex');
  });
});

describe('fichas: o molde continua a mandar', () => {
  it('todas as fichas têm as linhas do molde pela ordem', () => {
    const template = JSON.parse(readFileSync('build/template-schema.json', 'utf8'));
    for (const game of games) {
      const text = sheet(game.number, 'md');
      let cursor = -1;
      for (const label of template.labels) {
        const at = text.indexOf(`| ${label} |`);
        expect(at, `${game.sheet}: falta "${label}"`).toBeGreaterThan(-1);
        expect(at, `${game.sheet}: "${label}" fora de ordem`).toBeGreaterThan(cursor);
        cursor = at;
      }
    }
  });

  it('o `.html` de cada jogo existe e é autónomo', () => {
    for (const game of games) {
      expect(existsSync(sheetPath(game.number, 'html')), `${game.sheet} em falta`).toBe(true);
      const html = sheet(game.number, 'html');
      expect(html).toContain('<!doctype html>');
      expect(html).toContain('lang="pt-PT"');
      // Autónoma: sem folhas de estilo nem tipos de letra externos.
      expect(html).not.toMatch(/<link\b/u);
      expect(html).not.toMatch(/@import/u);
    }
  });
});
