/**
 * Taxonomia do Progresso Pessoal: leitura e validação da folha do CNE.
 *
 * Quatro armadilhas da folha real, todas reproduzidas e defendidas aqui:
 *
 *   T1  Um separador desconhecido devolve HTTP 200 com os dados do primeiro
 *       separador. `sheet=99Sec` devolveu bytes idênticos a `1Sec`. O estado
 *       HTTP não serve como verificação: valida-se a forma e a distinção.
 *   T2  As colunas não estão nas mesmas posições em todos os separadores:
 *       `Áreas`/`Trilhos` são 3/4 em 1Sec, 3Sec e 4Sec, mas 5/6 em 2Sec.
 *       As colunas são localizadas pelo nome do cabeçalho.
 *   T3  Há deriva de acentos: `Equilibrio emocional` (1Sec, 2Sec, 3Sec) e
 *       `Equilíbrio emocional` (4Sec). A identidade é um slug sem acentos.
 *   T4  Uma linha `NOTA:` aparece na coluna `Áreas` (1Sec e 3Sec, linha 20) e
 *       não é uma sétima área.
 */

import { createHash } from 'node:crypto';
import { normalizeText, parseCsv, splitBullets } from './csv.mjs';

export const EXPECTED_AREAS_PER_SECTION = 6;
export const EXPECTED_TRILHOS_PER_AREA = 3;
export const EXPECTED_TRILHOS_PER_SECTION =
  EXPECTED_AREAS_PER_SECTION * EXPECTED_TRILHOS_PER_AREA;

const NOTA_PATTERN = /^NOTA\b/iu;
const AREA_PATTERN = /^(áreas?|areas?)$/iu;
const TRILHO_PATTERN = /^(trilhos?|paths?)$/iu;

/** Slug sem acentos, minúsculas, só `[a-z0-9-]`. Idêntico ao `slugify` do site. */
export function slugify(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

export function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function columnIndex(header, pattern) {
  return header.findIndex((cell) => pattern.test(normalizeText(cell)));
}

/**
 * Converte o CSV de um separador na taxonomia dessa Secção.
 *
 * @param {string} tab
 * @param {string} text CSV bruto
 * @param {{expectedAreas?: string[], strict?: boolean}} [options]
 */
export function parseSection(tab, text, options = {}) {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  const problems = [];

  // T2: o cabeçalho pode não estar na primeira linha.
  let headerIndex = -1;
  for (let index = 0; index < Math.min(rows.length, 15); index += 1) {
    const header = rows[index];
    if (
      header.some((cell) => AREA_PATTERN.test(normalizeText(cell))) &&
      header.some((cell) => TRILHO_PATTERN.test(normalizeText(cell)))
    ) {
      headerIndex = index;
      break;
    }
  }
  if (headerIndex === -1) {
    return { tab, ok: false, problems: [`${tab}: não encontrei o cabeçalho (Áreas/Trilhos).`], areas: [] };
  }

  const header = rows[headerIndex];
  const areaColumn = columnIndex(header, AREA_PATTERN);
  const trilhoColumn = columnIndex(header, TRILHO_PATTERN);
  if (areaColumn === -1 || trilhoColumn === -1) {
    return {
      tab,
      ok: false,
      problems: [`${tab}: cabeçalho sem colunas Áreas/Trilhos reconhecíveis.`],
      areas: [],
    };
  }

  const descriptorColumns = header
    .map((cell, index) => ({ cell: normalizeText(cell), index }))
    .filter(({ cell, index }) => index !== areaColumn && index !== trilhoColumn && cell !== '');

  const expectedAreas = options.expectedAreas ?? [];
  const areas = [];
  const seenTrilhos = new Set();
  let currentArea = null;
  let droppedNotes = 0;

  for (const row of rows.slice(headerIndex + 1)) {
    const rawArea = normalizeText(row[areaColumn] ?? '');
    const rawTrilho = normalizeText(row[trilhoColumn] ?? '');

    // T4: a nota de rodapé não é uma área.
    if (NOTA_PATTERN.test(rawArea)) {
      droppedNotes += 1;
      currentArea = null;
      continue;
    }
    if (!rawArea && !rawTrilho) continue;

    if (rawArea) {
      if (!currentArea || currentArea.name !== rawArea) {
        currentArea = { key: slugify(rawArea), name: rawArea, trilhos: [] };
        areas.push(currentArea);
      }
    }
    if (!currentArea) continue;
    if (!rawTrilho) continue;

    const key = `${currentArea.key}-${slugify(rawTrilho)}`;
    if (seenTrilhos.has(key)) {
      problems.push(`${tab}: trilho repetido dentro da secção: ${key}`);
      continue;
    }
    seenTrilhos.add(key);

    const entry = { key, name: rawTrilho };
    for (const { cell, index } of descriptorColumns) {
      const value = normalizeText(row[index] ?? '');
      if (!value) continue;
      if (/atitudes|palavras-chave/iu.test(cell)) entry.attitudes = splitBullets(value);
      else if (/ser[aá] que/iu.test(cell)) entry.questions = splitBullets(value);
      else if (/observar/iu.test(cell)) entry.observations = splitBullets(value);
    }
    currentArea.trilhos.push(entry);
  }

  if (expectedAreas.length) {
    const unknown = areas
      .map((area) => area.name)
      .filter((name) => !expectedAreas.includes(name));
    // Aviso, não erro: uma sétima área deve aparecer, não desaparecer.
    if (unknown.length) {
      problems.push(
        `${tab}: áreas fora do esperado (${expectedAreas.join(', ')}): ${unknown.join(', ')}`,
      );
    }
  }

  return {
    tab,
    ok: true,
    problems,
    droppedNotes,
    areas,
    sha256: sha256(normalizeText(text)),
  };
}

/**
 * Valida o conjunto: forma por Secção e distinção entre Secções (T1).
 *
 * @returns {{ok: boolean, errors: string[], warnings: string[]}}
 */
export function validateTaxonomy(
  sections,
  { expectedAreas = [], strict = true } = {},
) {
  const errors = [];
  const warnings = [];
  const present = sections.filter(Boolean);
  // Uma área é conhecida se constar da lista de referência *ou* de qualquer
  // Secção. Sem esta tolerância, uma sétima área nueva seriairiada em todas as
  // Secções e o aviso "fora do esperado" nunca chegaria a existir.
  const knownAreas = new Set(expectedAreas);
  for (const section of present) {
    for (const area of section.areas) knownAreas.add(area.name);
  }

  for (const section of present) {
    for (const problem of section.problems ?? []) warnings.push(problem);
    if (section.areas.length !== EXPECTED_AREAS_PER_SECTION) {
      errors.push(
        `${section.tab}: ${section.areas.length} áreas em vez de ${EXPECTED_AREAS_PER_SECTION}.`,
      );
    }
    for (const area of section.areas) {
      if (area.trilhos.length !== EXPECTED_TRILHOS_PER_AREA) {
        errors.push(
          `${section.tab} / ${area.name}: ${area.trilhos.length} trilhos em vez de ${EXPECTED_TRILHOS_PER_AREA}.`,
        );
      }
      for (const trilho of area.trilhos) {
        if (!trilho.key.startsWith(`${area.key}-`)) {
          errors.push(
            `${section.tab}: a chave "${trilho.key}" não corresponde à área "${area.key}".`,
          );
        }
      }
    }
  }

  // T1: duas Secções com o mesmo conteúdo significam que uma sombreou a outra.
  const byHash = new Map();
  for (const section of present) {
    const existing = byHash.get(section.sha256);
    if (existing) {
      errors.push(
        `${section.tab} e ${existing} devolvem conteúdo idêntico. `
          + 'Provavelmente um separador foi renomeado e a folha devolveu o primeiro em seu lugar.',
      );
    } else {
      byHash.set(section.sha256, section.tab);
    }
  }

  if (!strict && present.length === 0) {
    warnings.push('Nenhuma Secção foi lida.');
  }
  return { ok: errors.length === 0, errors, warnings };
}