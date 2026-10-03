import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { CHAPTER7_AREAS, ECONOMICS_TABLE } from '../src/content/source-map.js';
import { parseDocument, validateParsedDocument } from '../src/content/parser.js';

const source = readFileSync('file.md', 'utf8');
let model;

beforeAll(() => {
  model = parseDocument(source);
});

describe('modelo de conteúdo sem perdas', () => {
  it('reproduz todos os caracteres e offsets por uma única vez', () => {
    // Nós e trechos excluídos, pela ordem na fonte, devolvem a fonte inteira:
    // o Capítulo 8 não é publicado, mas também não se perde nada.
    const segments = [
      ...model.nodes.map((node) => ({ start: node.sourceOffset, text: node.sourceText })),
      ...model.excluded.map((range) => ({ start: range.start, text: source.slice(range.start, range.end) })),
    ].sort((a, b) => a.start - b.start);

    expect(segments.map((segment) => segment.text).join('')).toBe(source);
    expect(
      segments.reduce((total, segment) => total + segment.text.length, 0),
    ).toBe(source.length);
    expect(validateParsedDocument(model)).toEqual([]);
    expect(model.stats).toMatchObject({
      sourceCharacters: 30_100,
      sourceBytes: 31_493,
      glossaryEntries: 19,
      activities: 30,
      diagrams: 4,
      references: 8,
      tools: 2,
    });
  });

  it('mantém a ordem das onze rotas publicadas', () => {
    expect(model.routes.map((route) => route.id)).toEqual([
      'inicio',
      'glossario',
      'indice',
      'capitulo-1',
      'capitulo-2',
      'capitulo-3',
      'capitulo-4',
      'capitulo-5',
      'capitulo-6',
      'capitulo-7',
      'referencias',
    ]);
  });

  it('retira o Capítulo 8 do modelo e da fonte publicada', () => {
    // O capítulo é cortado da fonte na fronteira do Capítulo 7.
    expect(model.excluded).toHaveLength(1);
    const [excluded] = model.excluded;
    expect(source.slice(excluded.start, excluded.end)).toContain('Espaço Influencers');

    // Nenhum nó publicado pode estar dentro do capítulo excluído, nem ser de um
    // tipo que só ele produz.
    const insideExcluded = model.nodes.filter(
      (node) => node.sourceOffset >= excluded.start && node.sourceOffset < excluded.end,
    );
    expect(insideExcluded).toEqual([]);
    expect(model.nodes.some((node) => node.kind === 'resource-group')).toBe(false);

    // A rota `capitulo-7` termina onde o capítulo excluído começa.
    const chapter7 = model.routeMap.get('capitulo-7');
    expect(chapter7.sourceEnd).toBe(excluded.start);
  });

  it('recupera os 19 termos do glossário em três grupos', () => {
    const groups = model.nodes.filter((node) => node.kind === 'glossary-group');
    expect(groups).toHaveLength(3);
    expect(groups.map((group) => group.data.entries.length)).toEqual([9, 6, 4]);
    expect(groups[0].data.entries[1].term).toBe('$\\text{CO}_2$');
  });

  it('recupera dez passos em cada capítulo 4, 5 e 6', () => {
    const count = (route, kind) => model.nodes.filter((node) => node.route.id === route && node.kind === kind).length;
    expect(count('capitulo-4', 'step')).toBe(10);
    expect(count('capitulo-6', 'step')).toBe(10);
    expect(model.nodes.find((node) => node.route.id === 'capitulo-5' && node.kind === 'diagram').data.steps).toHaveLength(10);
  });

  it('mantém cinco áreas e seis atividades por área na ordem de origem', () => {
    const activities = model.nodes.filter((node) => node.kind === 'activity');
    expect(activities).toHaveLength(30);
    CHAPTER7_AREAS.forEach((area) => {
      const matching = activities.filter((node) => node.data.area === area.title);
      expect(matching.map((node) => node.data.title)).toEqual(area.activities.map((activity) => activity.title));
    });
  });

  it('classifica seis expressões TeX e treze valores monetários', () => {
    expect(model.dollarSpans).toHaveLength(19);
    expect(model.dollarSpans.filter((span) => span.type === 'math')).toHaveLength(6);
    expect(model.dollarSpans.filter((span) => span.type === 'currency')).toHaveLength(13);
    expect(model.dollarSpans.find((span) => span.sourceText === '$100€$').type).toBe('currency');
  });

  it('preserva a linha anómala da tabela económica', () => {
    const activity = model.nodes.find((node) => node.kind === 'activity' && node.data.title === 'Jogo dos Salários');
    expect(activity.data.table.rows).toHaveLength(ECONOMICS_TABLE.rows.length);
    expect(activity.data.table.rows.at(-1)).toMatchObject({
      category: 'Atividades de Lazer / Cultura',
      cost: '$50€$',
      points: ' cada4 cada',
      sourceText: ECONOMICS_TABLE.rows.at(-1),
    });
  });

  it('mantém os dois domínios das ferramentas', () => {
    expect(source).toContain('ods.pt');
    expect(source).toContain('footprintcalculator.org');
  });
});
