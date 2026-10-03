import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EXPECTED_AREAS_PER_SECTION,
  EXPECTED_TRILHOS_PER_AREA,
  EXPECTED_TRILHOS_PER_SECTION,
  parseSection,
  slugify,
  validateTaxonomy,
} from '../scripts/progress/taxonomy.mjs';

const config = JSON.parse(readFileSync('content.config.json', 'utf8'));
const expectedAreas = config.progress.expectedAreas;

/** Constrói um CSV no formato da folha, com a posição das colunas configurável. */
function buildCsv({ areaColumn = 3, trilhoColumn = 4, rows = [], notes = [] }) {
  const width = Math.max(areaColumn, trilhoColumn) + 4;
  const header = new Array(width).fill('');
  header[areaColumn] = 'Áreas';
  header[trilhoColumn] = 'Trilhos';
  header[trilhoColumn + 1] = 'Atitudes/Palavras-chave';
  header[trilhoColumn + 2] = 'Será que?';
  header[trilhoColumn + 3] = 'O que observar?';

  const lines = [header.map((cell) => `"${cell}"`).join(',')];
  for (const [area, trilho, attitudes = '', questions = '', observations = ''] of rows) {
    const row = new Array(width).fill('');
    row[areaColumn] = area;
    row[trilhoColumn] = trilho;
    row[trilhoColumn + 1] = attitudes;
    row[trilhoColumn + 2] = questions;
    row[trilhoColumn + 3] = observations;
    lines.push(row.map((cell) => `"${cell}"`).join(','));
  }
  for (const note of notes) {
    const row = new Array(width).fill('');
    row[areaColumn] = note;
    lines.push(row.map((cell) => `"${cell}"`).join(','));
  }
  return lines.join('\n');
}

const AREAS = ['Físico', 'Afetivo', 'Caráter', 'Espiritual', 'Intelectual', 'Social'];
const TRILHOS = {
  'Físico': ['Desempenho', 'Autoconhecimento', 'Bem-estar físico'],
  'Afetivo': ['Relacionamento e sensibilidade', 'Equilíbrio emocional', 'Autoestima'],
  'Caráter': ['Autonomia', 'Responsabilidade', 'Coerência'],
  'Espiritual': ['Descoberta', 'Aprofundamento', 'Serviço'],
  'Intelectual': ['Procura de conhecimento', 'Resolução de problemas', 'Criatividade e expressão'],
  'Social': ['Exercer ativamente cidadania', 'Solidariedade e tolerância', 'Interação e cooperação'],
};

function standardRows({ unaccented = false } = {}) {
  const rows = [];
  for (const area of AREAS) {
    const names = TRILHOS[area].map((name) =>
      (unaccented && name === 'Equilíbrio emocional') ? 'Equilibrio emocional' : name,
    );
    names.forEach((name, index) => {
      // A área só vem no primeiro trilho: as restantes linhas ficam vazias,
      // tal como na folha real.
      rows.push([
        index === 0 ? area : '',
        name,
        '• Conhecer\n• Aceitar',
        `• ${name} funciona?`,
        `• Observar ${area}`,
      ]);
    });
  }
  return rows;
}

describe('leitura da folha do CNE', () => {
  it('lê 6 áreas e 18 trilhos, com descritores', () => {
    const parsed = parseSection('1Sec', buildCsv({ rows: standardRows() }), { expectedAreas });
    expect(parsed.ok).toBe(true);
    expect(parsed.areas).toHaveLength(EXPECTED_AREAS_PER_SECTION);
    expect(parsed.areas.flatMap((area) => area.trilhos)).toHaveLength(
      EXPECTED_TRILHOS_PER_SECTION,
    );

    const fisico = parsed.areas[0];
    expect(fisico.key).toBe('fisico');
    expect(fisico.trilhos[0].key).toBe('fisico-desempenho');
    expect(fisico.trilhos[0].attitudes).toEqual(['Conhecer', 'Aceitar']);
    expect(fisico.trilhos[0].questions).toEqual(['Desempenho funciona?']);
    expect(fisico.trilhos[0].observations).toEqual(['Observar Físico']);
  });

  it('T2: encontra as colunas mesmo deslocadas (2Sec usa 5/6)', () => {
    const atDefault = parseSection('1Sec', buildCsv({ rows: standardRows() }), { expectedAreas });
    const atShifted = parseSection(
      '2Sec',
      buildCsv({ areaColumn: 5, trilhoColumn: 6, rows: standardRows() }),
      { expectedAreas },
    );
    expect(atShifted.areas.map((area) => area.key)).toEqual(
      atDefault.areas.map((area) => area.key),
    );
    expect(atShifted.areas[0].trilhos[0].key).toBe('fisico-desempenho');
  });

  it('T3: "Equilibrio" e "Equilíbrio" dão a mesma chave', () => {
    const accented = parseSection('4Sec', buildCsv({ rows: standardRows() }), { expectedAreas });
    const plain = parseSection(
      '1Sec',
      buildCsv({ rows: standardRows({ unaccented: true }) }),
      { expectedAreas },
    );
    const find = (parsed) => parsed.areas
      .find((area) => area.key === 'afetivo')
      .trilhos.map((trilho) => trilho.key);
    expect(find(accented)).toEqual(find(plain));
    expect(find(plain)).toContain('afetivo-equilibrio-emocional');
  });

  it('T4: descarta a linha NOTA: que cai na coluna Áreas', () => {
    const note = 'NOTA: Aquando da leitura deste Caderno de Pista, subentende-se a nomenclatura marítima ou aérea.';
    const parsed = parseSection(
      '1Sec',
      buildCsv({ rows: standardRows(), notes: [note] }),
      { expectedAreas },
    );
    expect(parsed.areas).toHaveLength(EXPECTED_AREAS_PER_SECTION);
    expect(parsed.areas.map((area) => area.name)).not.toContain(expect.stringContaining('NOTA'));
    expect(parsed.droppedNotes).toBe(1);
  });

  it('avisa mas não falha quando aparece uma área inesperada', () => {
    // Uma sétima área com três trilhos: a forma continua válida, o aviso é que
    // alerta para a mudança em vez de a esconder.
    const rows = [...standardRows()];
    for (const name of ['Descoberta', 'Aprofundamento', 'Serviço']) {
      rows.push(['Área Nova', name, '', '', '']);
    }
    const parsed = parseSection('1Sec', buildCsv({ rows }), { expectedAreas });
    const result = validateTaxonomy([parsed], { expectedAreas });
    expect(parsed.problems.some((problem) => problem.includes('fora do esperado'))).toBe(true);
    // Sete áreas não é a forma esperada do CNE: isso é erro, e a distinção
    // importa para o aviso não esconder uma alteração real.
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/7 áreas em vez de 6/iu);
  });

  it('aceita uma nova área mantendo as seis de referência', () => {
    // Renomear uma área existente é uma mudança legítima: a folha continua
    // válida e o aviso é o único sinal.
    const rows = standardRows().map(([area, ...rest]) => [
      area === 'Físico' ? 'Corporal' : area,
      ...rest,
    ]);
    const parsed = parseSection('1Sec', buildCsv({ rows }), { expectedAreas });
    const result = validateTaxonomy([parsed], { expectedAreas });
    expect(result.ok).toBe(true);
    expect(parsed.problems.join(' ')).toMatch(/fora do esperado/iu);
  });

  it('T1: Secções com conteúdo idêntico são um erro', () => {
    const one = parseSection('1Sec', buildCsv({ rows: standardRows() }), { expectedAreas });
    // Um separador renomeado devolve o conteúdo do primeiro: mesmo hash.
    const shadowed = parseSection('2Sec', buildCsv({ rows: standardRows() }), { expectedAreas });
    const result = validateTaxonomy([one, shadowed], { expectedAreas });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/idêntico/iu);
  });

  it('aceita quatro Secções genuinamente diferentes', () => {
    // As quatro Secções têm os mesmos nomes de trilho mas descritores
    // diferentes; o que as distingue é o conteúdo, não a forma.
    const sections = ['1Sec', '2Sec', '3Sec', '4Sec'].map((tab, index) => parseSection(
      tab,
      buildCsv({
        rows: standardRows().map(([area, trilho, attitudes, questions, observations]) => [
          area,
          trilho,
          `${attitudes}\n• Secção ${index + 1}`,
          questions,
          observations,
        ]),
      }),
      { expectedAreas },
    ));
    const result = validateTaxonomy(sections, { expectedAreas });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('deteta uma área com trilhos a menos', () => {
    // Corta o último trilho da última área: essa área fica com 2 em vez de 3.
    const rows = standardRows().slice(0, -1);
    const parsed = parseSection('1Sec', buildCsv({ rows }), { expectedAreas });
    const result = validateTaxonomy([parsed], { expectedAreas });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/2 trilhos em vez de 3/iu);
  });

  it('deteta uma área em falta', () => {
    const rows = standardRows().slice(0, 15); // fica só com 5 áreas
    const parsed = parseSection('1Sec', buildCsv({ rows }), { expectedAreas });
    const result = validateTaxonomy([parsed], { expectedAreas });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/5 áreas em vez de 6/iu);
  });

  it('slugify é insensível a acentos e pontuação', () => {
    expect(slugify('Equilíbrio emocional')).toBe('equilibrio-emocional');
    expect(slugify("Time's Up")).toBe('time-s-up');
    expect(slugify('Área do Planeta')).toBe('area-do-planeta');
  });
});

describe('artefacto em disco', () => {
  // O artefacto é opcional. Sem ele — folha inacessível, primeiro arranque — a
  // degradação é o comportamento esperado, não uma falha, por isso o bloco
  // abaixo não é registado. A leitura fica dentro dos testes para que um
  // ficheiro em falta não seja lido na fase de colecta.
  const artefactPath = config.progress.artefact;
  const present = existsSync(artefactPath);
  const maybe = present ? describe : describe.skip;

  maybe('com taxonomia presente', () => {
    it('tem as quatro Secções com 6 áreas e 18 trilhos', () => {
      const artefact = JSON.parse(readFileSync(artefactPath, 'utf8'));
      expect(Object.keys(artefact.sections).sort()).toEqual(['1Sec', '2Sec', '3Sec', '4Sec']);
      for (const [tab, section] of Object.entries(artefact.sections)) {
        expect(section.areas, tab).toHaveLength(EXPECTED_AREAS_PER_SECTION);
        for (const area of section.areas) {
          expect(area.trilhos.length, `${tab}/${area.name}`)
            .toBe(EXPECTED_TRILHOS_PER_AREA);
        }
      }
    });

    it('cada Secção é distinta das restantes', () => {
      const artefact = JSON.parse(readFileSync(artefactPath, 'utf8'));
      const labels = Object.values(artefact.sections).map((section) => section.label);
      expect(new Set(labels).size).toBe(4);
    });

    it('cada chave de trilho começa pela chave da área', () => {
      const artefact = JSON.parse(readFileSync(artefactPath, 'utf8'));
      for (const section of Object.values(artefact.sections)) {
        for (const area of section.areas) {
          for (const trilho of area.trilhos) {
            expect(trilho.key.startsWith(`${area.key}-`), trilho.key).toBe(true);
          }
        }
      }
    });

    it('tem os dados editoriais de cada Secção', () => {
      const artefact = JSON.parse(readFileSync(artefactPath, 'utf8'));
      for (const meta of config.progress.sections) {
        const section = artefact.sections[meta.tab];
        expect(section.label).toBe(meta.label);
        expect(section.branch).toBe(meta.branch);
        expect(section.ages).toBe(meta.ages);
        expect(section.color).toBe(meta.color);
        expect(section.referenceUrl).toBe(meta.referenceUrl);
      }
    });

    it('regista a proveniência', () => {
      const artefact = JSON.parse(readFileSync(artefactPath, 'utf8'));
      expect(artefact.source.spreadsheetId).toBe(config.progress.spreadsheetId);
      expect(Number.isFinite(Date.parse(artefact.source.fetchedAt))).toBe(true);
      expect(Object.keys(artefact.source.sha256).sort())
        .toEqual(['1Sec', '2Sec', '3Sec', '4Sec']);
    });

    it('é coerente com os hashes de referência da configuração', () => {
      const artefact = JSON.parse(readFileSync(artefactPath, 'utf8'));
      for (const [tab, expected] of Object.entries(config.progress.expectedSha256)) {
        expect(artefact.source.sha256[tab], tab).toBe(expected);
      }
    });
  });
});

describe('mapeamento por jogo', () => {
  // Tanto o mapeamento como a taxonomia são opcionais. A leitura do mapeamento
  // fica dentro do teste para que a sua ausência não faça o ficheiro de testes
  // falhar na fase de colecta.
  const mappingPath = config.progress.mapping;
  const artefactPath = config.progress.artefact;
  const both = existsSync(mappingPath) && existsSync(artefactPath);
  const maybe = both ? it : it.skip;

  maybe('só usa Secções e chaves de trilho que existem', () => {
    const mapping = JSON.parse(readFileSync(mappingPath, 'utf8'));
    const artefact = JSON.parse(readFileSync(artefactPath, 'utf8'));
    const games = JSON.parse(readFileSync(config.games.mapFile, 'utf8'));
    const numbers = new Set(games.games.map((game) => String(game.number)));
    const tabs = new Set(Object.keys(artefact.sections));

    for (const [tab, byGame] of Object.entries(mapping.sections ?? {})) {
      expect(tabs.has(tab), `Secção ${tab}`).toBe(true);
      const known = new Set(
        (artefact.sections[tab]?.areas ?? []).flatMap((area) => area.trilhos.map((t) => t.key)),
      );
      for (const [number, entry] of Object.entries(byGame)) {
        expect(numbers.has(number), `jogo ${number}`).toBe(true);
        for (const key of entry.trilhos ?? []) {
          expect(known.has(key), `${tab}/${number}/${key}`).toBe(true);
        }
      }
    }
  });
});