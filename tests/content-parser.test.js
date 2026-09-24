import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { CHAPTER7_AREAS, CHAPTER8_RESOURCES, ECONOMICS_TABLE } from '../src/content/source-map.js';
import { parseDocument, validateParsedDocument } from '../src/content/parser.js';

const source = readFileSync('file.md', 'utf8');
let model;

beforeAll(() => {
  model = parseDocument(source);
});

describe('modelo de conteúdo sem perdas', () => {
  it('reproduz todos os caracteres e offsets por uma única vez', () => {
    expect(model.nodes.map((node) => node.sourceText).join('')).toBe(source);
    expect(model.nodes.reduce((total, node) => total + node.sourceText.length, 0)).toBe(source.length);
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

  it('mantém a ordem das doze rotas', () => {
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
      'capitulo-8',
      'referencias',
    ]);
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

  it('mantém os cinco grupos de recursos e os dois domínios', () => {
    const areas = model.nodes.filter((node) => node.kind === 'resource-area-heading');
    const groups = model.nodes.filter((node) => node.kind === 'resource-group');
    expect(areas.map((node) => node.data.title)).toEqual(CHAPTER8_RESOURCES.map((area) => area.title));
    expect(groups.map((node) => node.data.title)).toEqual(CHAPTER8_RESOURCES.flatMap((area) => area.groups));
    expect(source).toContain('ods.pt');
    expect(source).toContain('footprintcalculator.org');
  });
});
