#!/usr/bin/env node
/**
 * Personal Progress: busca a taxonomia na folha do CNE e valida o mapeamento.
 *
 *   node scripts/progress/build-progress.mjs --refresh  # busca na folha e escreve
 *   node scripts/progress/build-progress.mjs            # valida sem rede
 *   node scripts/progress/build-progress.mjs --check    # verifica e sai
 *   node scripts/progress/build-progress.mjs --keys     # lista os valores válidos
 *
 * A folha não envia cabeçalhos CORS, por isso a leitura só pode ser feita aqui,
 * no momento da construção — nunca no navegador.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSection, validateTaxonomy } from './taxonomy.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

const TIMEOUT_MS = 15_000;
const ATTEMPTS = 2;

/* ------------------------------------------------------------- config */

async function loadConfig() {
  const file = path.join(ROOT, 'content.config.json');
  const raw = await readFile(file, 'utf8');
  return JSON.parse(raw);
}

const config = await loadConfig();
const progressConfig = config.progress ?? {};
const artefactPath = path.join(ROOT, progressConfig.artefact ?? 'build/progress-taxonomy.json');
const mappingPath = path.join(ROOT, progressConfig.mapping ?? 'content.progress.json');

/* ------------------------------------------------------------- fetch */

/**
 * Lê um separador da folha.
 *
 * Um separador desconhecido devolve HTTP 200 com os dados do primeiro, por isso
 * o conteúdo é validado em `validateTaxonomy` e o estado HTTP não é suficiente.
 */
async function fetchTab(tab) {
  const url = progressConfig.endpoint
    .replace('{spreadsheetId}', progressConfig.spreadsheetId)
    .replace('{tab}', encodeURIComponent(tab));

  let lastError = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: process.env.PROGRESS_SHEET_TOKEN
          ? { authorization: `Bearer ${process.env.PROGRESS_SHEET_TOKEN}` }
          : {},
      });
      const contentType = response.headers.get('content-type') ?? '';

      // Acesso revogado devolve HTML com HTTP 404.
      if (!response.ok || contentType.includes('text/html')) {
        lastError = `${tab}: HTTP ${response.status} (${contentType || 'sem tipo'})`;
        continue;
      }
      return { tab, text: await response.text() };
    } catch (error) {
      lastError = `${tab}: ${error.message}`;
    }
  }
  return { tab, error: lastError };
}

/* ------------------------------------------------------------- build */

function buildArtefact(sections, sectionMeta, fetchedAt) {
  const sha256 = {};
  for (const section of sections) {
    if (section) sha256[section.tab] = section.sha256;
  }
  return {
    $generated:
      'NÃO EDITAR — gerado por `npm run progress:refresh`. '
      + 'Edite content.progress.json, não este ficheiro.',
    source: {
      spreadsheetId: progressConfig.spreadsheetId,
      url: `https://docs.google.com/spreadsheets/d/${progressConfig.spreadsheetId}/edit`,
      endpoint: progressConfig.endpoint,
      fetchedAt,
      sha256,
    },
    sections: Object.fromEntries(
      sections.map((section, index) => {
        const meta = sectionMeta[index];
        if (!section) return [meta.tab, null];
        return [
          meta.tab,
          {
            label: meta.label,
            branch: meta.branch,
            ages: meta.ages,
            color: meta.color,
            ink: meta.ink,
            referenceUrl: meta.referenceUrl,
            areas: section.areas,
          },
        ];
      }),
    ),
  };
}

async function readExistingArtefact() {
  if (!existsSync(artefactPath)) return null;
  try {
    return JSON.parse(await readFile(artefactPath, 'utf8'));
  } catch {
    return null;
  }
}

async function refresh() {
  const sectionMeta = progressConfig.sections ?? [];
  const tabs = progressConfig.tabs ?? sectionMeta.map((entry) => entry.tab);
  const warnings = [];

  console.log(`A buscar ${tabs.length} separadores na folha do CNE…`);
  const results = await Promise.all(tabs.map((tab) => fetchTab(tab)));

  const fetched = [];
  for (const result of results) {
    if (result.error) {
      warnings.push(result.error);
      fetched.push(null);
      continue;
    }
    const parsed = parseSection(result.tab, result.text, {
      expectedAreas: progressConfig.expectedAreas ?? [],
    });
    fetched.push(parsed);
    console.log(
      `  ${parsed.ok ? 'ok ' : 'ERRO'} ${result.tab}`
      + (parsed.ok
        ? ` — ${parsed.areas.length} áreas, ${parsed.areas.reduce((total, area) => total + area.trilhos.length, 0)} trilhos`
        : ''),
    );
  }

  const validation = validateTaxonomy(fetched);
  for (const warning of validation.warnings) warnings.push(warning);

  // Defesas T1/T3: falha de forma ruidosa em vez de escrever dados errados.
  if (!validation.ok) {
    console.error('\nA folha não pôde ser lida com confiança:');
    for (const error of validation.errors) console.error(`  - ${error}`);
    console.error('\nO ficheiro em build/progress-taxonomy.json não foi alterado.');
    for (const warning of warnings) console.warn(`  aviso: ${warning}`);
    return 1;
  }

  // Divergência de hash é esperada sempre que o CNE edita a folha.
  const expected = progressConfig.expectedSha256 ?? {};
  for (const section of fetched) {
    if (!section) continue;
    const baseline = expected[section.tab];
    if (baseline && baseline !== section.sha256) {
      warnings.push(
        `${section.tab}: o conteúdo mudou desde a última revisão `
        + `(${baseline.slice(0, 12)}… → ${section.sha256.slice(0, 12)}…).`,
      );
    }
  }

  const fetchedAt = new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z');
  const artefact = buildArtefact(fetched, sectionMeta, fetchedAt);

  await mkdir(path.dirname(artefactPath), { recursive: true });
  await writeFile(artefactPath, `${JSON.stringify(artefact, null, 2)}\n`, 'utf8');
  console.log(`\nEscrito ${path.relative(ROOT, artefactPath)}`);

  for (const warning of warnings) console.warn(`  aviso: ${warning}`);
  return 0;
}

/* --------------------------------------------------------- validação */

function collectTrilhoKeys(artefact) {
  const keys = new Map();
  for (const [tab, section] of Object.entries(artefact?.sections ?? {})) {
    if (!section) continue;
    for (const area of section.areas ?? []) {
      for (const trilho of area.trilhos ?? []) keys.set(`${tab}:${trilho.key}`, trilho);
    }
  }
  return keys;
}

async function validateMapping() {
  const errors = [];
  const warnings = [];
  const notes = [];

  const artefact = await readExistingArtefact();
  const trilhos = collectTrilhoKeys(artefact);
  if (!artefact) {
    warnings.push(
      'build/progress-taxonomy.json ainda não existe. '
      + 'Corra `npm run progress:refresh` para trazer a taxonomia da folha.',
    );
  } else {
    const fetchedAt = Date.parse(artefact.source?.fetchedAt ?? '');
    const maxAgeDays = progressConfig.maxAgeDays ?? 90;
    if (Number.isFinite(fetchedAt)) {
      const days = (Date.now() - fetchedAt) / 86_400_000;
      if (days > maxAgeDays) {
        warnings.push(
          `A taxonomia tem ${Math.round(days)} dias. `
          + 'Corra `npm run progress:refresh` para a atualizar.',
        );
      }
    }
  }

  const games = JSON.parse(await readFile(path.join(ROOT, 'content/games-map.json'), 'utf8'));
  const gameNumbers = new Set((games.games ?? []).map((game) => String(game.number)));

  let selections = { sections: {} };
  if (existsSync(mappingPath)) {
    try {
      selections = JSON.parse(await readFile(mappingPath, 'utf8'));
    } catch (error) {
      errors.push(`content.progress.json não é JSON válido: ${error.message}`);
    }
  } else {
    warnings.push(
      'content.progress.json ainda não existe. '
      + 'O bloco de Progresso Pessoal simply não é mostrado.',
    );
  }

  const knownTabs = new Set(progressConfig.tabs ?? []);
  const sections = selections.sections ?? {};

  for (const [tab, gamesByNumber] of Object.entries(sections)) {
    if (knownTabs.size && !knownTabs.has(tab)) {
      errors.push(
        `Secção desconhecida "${tab}". Valores válidos: ${[...knownTabs].join(', ')}.`,
      );
      continue;
    }
    for (const [rawNumber, entry] of Object.entries(gamesByNumber ?? {})) {
      const label = `${tab} jogo ${rawNumber}`;
      if (!gameNumbers.has(rawNumber)) {
        errors.push(
          `${label}: não existe no content/games-map.json. `
          + 'Verifique o número em `npm run progress:keys`.',
        );
        continue;
      }
      if (entry?.note !== undefined && String(entry.note).length > 140) {
        errors.push(`${label}: a nota tem mais de 140 caracteres.`);
      }
      for (const key of entry?.trilhos ?? []) {
        const qualified = `${tab}:${key}`;
        if (trilhos.size && !trilhos.has(qualified)) {
          const elsewhere = [...trilhos.keys()].filter((candidate) => candidate.endsWith(`:${key}`));
          const hint = elsewhere.length
            ? ` O trilho existe noutra Secção (${elsewhere.map((item) => item.split(':')[0]).join(', ')}).`
            : '';
          errors.push(`${label}: trilho desconhecido "${key}".${hint}`);
          continue;
        }
        notes.push(qualified);
      }
    }
  }

  // Uma Secção por preencher é informação, nunca erro: o mapeamento cresce aos poucos.
  for (const tab of knownTabs) {
    const withTrilhos = Object.values(sections[tab] ?? {}).filter(
      (entry) => (entry?.trilhos ?? []).length > 0,
    ).length;
    if (withTrilhos === 0) {
      warnings.push(`${tab}: ainda sem trilhos mapeados.`);
    }
  }

  const declaredGames = new Set();
  for (const gamesByNumber of Object.values(sections)) {
    for (const rawNumber of Object.keys(gamesByNumber ?? {})) declaredGames.add(rawNumber);
  }
  const unmapped = [...gameNumbers].filter((number) => !declaredGames.has(number));

  return { errors, warnings, notes, mapped: notes.length, unmapped: unmapped.length, trilhos };
}

function printKeys() {
  if (!existsSync(artefactPath)) {
    console.error(
      'Ainda não há taxonomia. Corra `npm run progress:refresh` '
      + 'para trazer a folha do CNE.',
    );
    return 1;
  }
  const artefact = JSON.parse(readFileSync(artefactPath, 'utf8'));
  for (const meta of progressConfig.sections ?? []) {
    const section = artefact.sections?.[meta.tab];
    console.log(`\n${meta.tab} — ${meta.label} · ${meta.branch} · ${meta.ages}`);
    if (!section) {
      console.log('  (sem dados)');
      continue;
    }
    for (const area of section.areas ?? []) {
      console.log(`  ${area.name}`);
      for (const trilho of area.trilhos ?? []) console.log(`    ${trilho.key}`);
    }
  }
  return 0;
}

/* -------------------------------------------------------------- main */

const args = new Set(process.argv.slice(2));

/** Escreve a saída e sai sem `process.exit`, que no Windows pode deixar o
 *  processo num estado assertions com handles do fetch por fechar. */
function finish(code) {
  process.exitCode = code;
}

if (args.has('--keys')) {
  finish(printKeys());
} else if (args.has('--refresh')) {
  finish(await refresh());
} else {
  const result = await validateMapping();
  console.log('\nProgresso Pessoal');
  console.log('===================');
  console.log(`  mapeamentos válidos : ${result.mapped}`);
  console.log(`  jogos sem mapeamento: ${result.unmapped}`);
  for (const warning of result.warnings) console.warn(`  aviso: ${warning}`);
  for (const error of result.errors) console.error(`  ERRO: ${error}`);
  console.log(result.errors.length ? '\nHá erros a corrigir.' : '\nEstá tudo certo.');
  finish(result.errors.length ? 1 : 0);
}