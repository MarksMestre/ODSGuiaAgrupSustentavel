import {
  ACTIVITY_FIELDS,
  CHAPTER_2_5P_TABLE,
  CHAPTER_4_DIAGRAM,
  CHAPTER_5_DIAGRAM,
  CHAPTER_6_DIAGRAM,
  CHAPTER7_AREAS,
  CHAPTER_7_DIAGRAM,
  CHAPTER8_RESOURCES,
  CHAPTERS,
  ECONOMICS_TABLE,
  EXPECTED_COUNTS,
  GLOSSARY_GROUPS,
  INDEX_ENTRIES,
  OPENING_FIELDS,
  REFERENCE_ENTRIES,
  ROUTES,
  TOOL_ENTRIES,
  TOP_LEVEL_MARKERS,
  VALID_MATH,
  slugify,
} from './source-map.js';

export class ContentParseError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ContentParseError';
    this.details = details;
  }
}

const DYNAMIC_STAGE_MARKERS = Object.freeze([
  'Fase 1 (15 min):',
  'Fase 2 (45 min):',
  'Etapa 1:',
  'Etapa 2:',
  'Ronda 1:',
  'Ronda 2:',
  'Ronda 3:',
  'Fase de Lobbying (20 min):',
  'Assembleia Plenária (45 min):',
]);

function requireRange(start, end, label) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) {
    throw new ContentParseError(`Intervalo inválido para ${label}.`, { start, end });
  }
}

function findRequired(text, marker, start = 0, context = 'fonte') {
  const offset = text.indexOf(marker, start);
  if (offset === -1) {
    throw new ContentParseError(`Marcador não encontrado em ${context}: ${JSON.stringify(marker)}.`, {
      marker,
      start,
    });
  }
  return offset;
}

function findOptional(text, marker, start = 0) {
  return text.indexOf(marker, start);
}

function splitList(text) {
  if (!text) return [];
  return text.split(/(?<=\.)\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/u);
}

function routeHref(target, anchor) {
  return anchor ? `${target}?anchor=${encodeURIComponent(anchor)}` : target;
}

function splitLabelValue(sourceText, label) {
  if (!sourceText.startsWith(label)) {
    throw new ContentParseError(`O segmento não começa pelo rótulo ${JSON.stringify(label)}.`, { sourceText });
  }
  return {
    label,
    value: sourceText.slice(label.length),
  };
}

function splitNestedDynamics(text, absoluteStart) {
  const found = DYNAMIC_STAGE_MARKERS
    .map((marker) => ({ marker, offset: findOptional(text, marker) }))
    .filter((entry) => entry.offset !== -1)
    .sort((a, b) => a.offset - b.offset);

  const stages = found.map((entry, index) => {
    const start = entry.offset;
    const end = found[index + 1]?.offset ?? text.length;
    return {
      label: entry.marker,
      text: text.slice(start, end),
      sourceOffset: absoluteStart + start,
    };
  });

  return {
    intro: found.length ? text.slice(0, found[0].offset) : text,
    stages,
  };
}

function classifyDollarSpans(text) {
  const spans = [];
  const pattern = /\$([^$]*)\$/g;
  for (const match of text.matchAll(pattern)) {
    const expression = match[1];
    spans.push({
      sourceText: match[0],
      expression,
      sourceOffset: match.index,
      type: VALID_MATH.includes(expression) ? 'math' : 'currency',
    });
  }
  return spans;
}

function createParser(source) {
  if (typeof source !== 'string' || source.length === 0) {
    throw new ContentParseError('A fonte Markdown está vazia.');
  }

  const nodes = [];
  const routes = [];
  const routeMap = new Map();

  function addNode(kind, route, start, end, data = {}) {
    requireRange(start, end, kind);
    const previous = nodes.at(-1);
    if (previous && start !== previous.sourceOffset + previous.sourceText.length) {
      throw new ContentParseError('Os nós do conteúdo não são contíguos.', {
        kind,
        start,
        previousEnd: previous.sourceOffset + previous.sourceText.length,
      });
    }
    const node = Object.freeze({
      kind,
      route,
      sourceOffset: start,
      sourceText: source.slice(start, end),
      data: Object.freeze(data),
    });
    nodes.push(node);
    return node;
  }

  function addRange(route, start, end, data = {}) {
    return addNode(data.kind ?? 'text', route, start, end, data);
  }

  function findChapterStarts() {
    const glossaryStart = findRequired(source, TOP_LEVEL_MARKERS.glossary, 0, 'abertura');
    const indexStart = findRequired(source, TOP_LEVEL_MARKERS.index, glossaryStart, 'glossário');
    const starts = [];

    for (let index = 0; index < CHAPTERS.length; index += 1) {
      const marker = CHAPTERS[index].heading;
      const searchStart = index === 0
        ? indexStart
        : starts.at(-1).offset + CHAPTERS[index - 1].heading.length;
      let offset = findRequired(source, marker, searchStart, `início do capítulo ${index + 1}`);

      if (index === 0) {
        const second = findRequired(source, marker, offset + marker.length, 'corpo do capítulo 1');
        offset = second;
      }

      starts.push({ marker, offset });
    }

    const referencesStart = findRequired(
      source,
      TOP_LEVEL_MARKERS.references,
      starts.at(-1).offset,
      'referências',
    );

    return { glossaryStart, indexStart, starts, referencesStart };
  }

  function parseOpening(route, start, end) {
    let cursor = start;
    const titleOffset = findRequired(source, TOP_LEVEL_MARKERS.title, cursor, route.id);
    const publisherOffset = findRequired(source, TOP_LEVEL_MARKERS.publisher, cursor + TOP_LEVEL_MARKERS.title.length, route.id);
    const fichaOffset = findRequired(source, TOP_LEVEL_MARKERS.fichaTecnica, publisherOffset + TOP_LEVEL_MARKERS.publisher.length, route.id);
    addRange(route, cursor, fichaOffset + TOP_LEVEL_MARKERS.fichaTecnica.length, {
      kind: 'route-title',
      text: TOP_LEVEL_MARKERS.title,
      publisher: TOP_LEVEL_MARKERS.publisher,
      sectionTitle: TOP_LEVEL_MARKERS.fichaTecnica,
    });

    cursor = fichaOffset + TOP_LEVEL_MARKERS.fichaTecnica.length;

    OPENING_FIELDS.forEach((label, index) => {
      const fieldStart = findRequired(source, label, cursor, `${route.id}: ${label}`);
      const nextLabel = OPENING_FIELDS[index + 1];
      const fieldEnd = nextLabel
        ? findRequired(source, nextLabel, fieldStart + label.length, route.id)
        : end;
      const fieldText = source.slice(fieldStart, fieldEnd);
      const split = splitLabelValue(fieldText, label);
      addRange(route, fieldStart, fieldEnd, {
        kind: 'opening-field',
        label: split.label,
        value: split.value,
      });
      cursor = fieldEnd;
    });

    if (cursor !== end) throw new ContentParseError('Abertura não reconstruída por completo.', { cursor, end });
  }

  function parseGlossary(route, start, end) {
    let cursor = start;
    const firstGroupOffset = findRequired(source, GLOSSARY_GROUPS[0].title, cursor, route.id);
    addRange(route, cursor, firstGroupOffset, {
      kind: 'route-title',
      text: TOP_LEVEL_MARKERS.glossary,
    });
    cursor = firstGroupOffset;

    GLOSSARY_GROUPS.forEach((group, groupIndex) => {
      const groupStart = findRequired(source, group.title, cursor, `${route.id}: ${group.title}`);
      const nextGroup = GLOSSARY_GROUPS[groupIndex + 1];
      const groupEnd = nextGroup
        ? findRequired(source, nextGroup.title, groupStart + group.title.length, route.id)
        : end;
      const entries = [];

      group.terms.forEach((term, termIndex) => {
        const entryStart = findRequired(source, term, cursor, `${group.title}: ${term}`);
        const nextTerm = group.terms[termIndex + 1];
        const entryEnd = nextTerm
          ? findRequired(source, nextTerm, entryStart + term.length, group.title)
          : groupEnd;
        const entryText = source.slice(entryStart, entryEnd);
        const termLabel = term.endsWith(':') ? term : `${term}:`;
        const split = splitLabelValue(entryText, termLabel);
        entries.push({
          term: termLabel.slice(0, -1),
          definition: split.value,
          sourceOffset: entryStart,
        });
        cursor = entryEnd;
      });

      addRange(route, groupStart, groupEnd, {
        kind: 'glossary-group',
        title: group.title,
        entries,
      });
      cursor = groupEnd;
    });

    if (cursor !== end) throw new ContentParseError('Glossário não reconstruído por completo.', { cursor, end });
  }

  function parseIndex(route, start, end) {
    let cursor = start;
    const firstEntryOffset = findRequired(source, INDEX_ENTRIES[0].text, cursor, route.id);
    addRange(route, cursor, firstEntryOffset, {
      kind: 'route-title',
      text: TOP_LEVEL_MARKERS.index,
    });
    cursor = firstEntryOffset;

    INDEX_ENTRIES.forEach((entry, index) => {
      const entryStart = findRequired(source, entry.text, cursor, `${route.id}: ${entry.text}`);
      const nextEntry = INDEX_ENTRIES[index + 1];
      const entryEnd = nextEntry
        ? findRequired(source, nextEntry.text, entryStart + entry.text.length, route.id)
        : end;
      addRange(route, entryStart, entryEnd, {
        kind: 'index-entry',
        text: entry.text,
        href: routeHref(entry.target, entry.anchor),
        target: entry.target,
        anchor: entry.anchor,
      });
      cursor = entryEnd;
    });

    if (cursor !== end) throw new ContentParseError('Índice não reconstruído por completo.', { cursor, end });
  }

  function parseChapter1(route, start, end) {
    const headingEnd = start + CHAPTERS[0].heading.length;
    addRange(route, start, headingEnd, { kind: 'route-title', text: CHAPTERS[0].heading });
    const firstSentenceEnd = source.indexOf('.', headingEnd);
    if (firstSentenceEnd === -1 || firstSentenceEnd + 1 >= end) {
      throw new ContentParseError('Não foi possível recuperar os dois parágrafos do Capítulo 1.');
    }
    addRange(route, headingEnd, firstSentenceEnd + 1, { kind: 'paragraph' });
    addRange(route, firstSentenceEnd + 1, end, { kind: 'paragraph' });
  }

  function parseFivePsTable(route, start, end) {
    const headerText = CHAPTER_2_5P_TABLE.start;
    if (source.slice(start, start + headerText.length) !== headerText) {
      throw new ContentParseError('Cabeçalho da tabela dos 5 P’s não coincide com a fonte.', { start });
    }

    const headers = ['Princípio', 'ODS Correspondentes', 'Foco Principal'];
    const rows = [];
    let rowStart = start + headerText.length;

    CHAPTER_2_5P_TABLE.rows.forEach((principle, index) => {
      const actual = findRequired(source, principle, rowStart, 'tabela dos 5 P’s');
      const nextPrinciple = CHAPTER_2_5P_TABLE.rows[index + 1];
      const rowEnd = nextPrinciple
        ? findRequired(source, nextPrinciple, actual + principle.length, 'tabela dos 5 P’s')
        : end;
      if (actual !== rowStart) {
        throw new ContentParseError('Linha inesperado na tabela dos 5 P’s.', { expected: rowStart, actual });
      }
      rows.push({
        principle,
        values: source.slice(actual + principle.length, rowEnd),
        sourceOffset: actual,
      });
      rowStart = rowEnd;
    });

    addRange(route, start, end, {
      kind: 'five-p-table',
      caption: 'Tabela dos 5 P’s',
      headers,
      rows,
    });
  }

  function parseChapter2(route, start, end) {
    const chapter = CHAPTERS[1];
    const headingEnd = start + chapter.heading.length;
    const firstSubsectionStart = findRequired(source, chapter.subsections[0].heading, headingEnd, chapter.id);
    addRange(route, start, firstSubsectionStart + chapter.subsections[0].heading.length, {
      kind: 'route-title',
      text: chapter.heading,
      immediateHeading: chapter.subsections[0].heading,
    });

    const subsectionStarts = chapter.subsections.map((subsection, index) =>
      findRequired(source, subsection.heading, index === 0 ? firstSubsectionStart : headingEnd, chapter.id),
    );

    const firstContentStart = subsectionStarts[0] + chapter.subsections[0].heading.length;
    const quoteStart = findRequired(source, '"', firstContentStart, 'citação Brundtland');
    const contextStart = findRequired(source, 'Aprovados em 2015', quoteStart, 'contexto dos ODS');
    const attributionOffset = findRequired(source, '— Relatório Brundtland (1987)', quoteStart, 'atribuição Brundtland');
    const tableStart = findRequired(source, CHAPTER_2_5P_TABLE.start, contextStart, 'tabela dos 5 P’s');

    addRange(route, quoteStart, attributionOffset, { kind: 'quotation' });
    addRange(route, attributionOffset, contextStart, { kind: 'attribution' });
    addRange(route, contextStart, tableStart, { kind: 'paragraph' });
    parseFivePsTable(route, tableStart, subsectionStarts[1]);

    addRange(route, subsectionStarts[1], subsectionStarts[1] + chapter.subsections[1].heading.length, {
      kind: 'heading',
      level: 2,
      text: chapter.subsections[1].heading,
    });
    addRange(route, subsectionStarts[1] + chapter.subsections[1].heading.length, subsectionStarts[2], {
      kind: 'paragraph',
    });

    addRange(route, subsectionStarts[2], subsectionStarts[2] + chapter.subsections[2].heading.length, {
      kind: 'heading',
      level: 2,
      text: chapter.subsections[2].heading,
    });
    addRange(route, subsectionStarts[2] + chapter.subsections[2].heading.length, end, {
      kind: 'paragraph',
    });
  }

  function parseOperationalGroup(route, group, start, end) {
    const headingEnd = start + group.heading.length;
    const items = [];

    group.items.forEach((item, index) => {
      const itemStart = findRequired(source, item, headingEnd, `${group.heading}: ${item}`);
      const nextItem = group.items[index + 1];
      const itemEnd = nextItem
        ? findRequired(source, nextItem, itemStart + item.length, group.heading)
        : end;
      items.push({ text: source.slice(itemStart, itemEnd), sourceOffset: itemStart });
    });

    addRange(route, start, end, {
      kind: 'operational-group',
      title: group.heading,
      items,
    });
  }

  function parseChapter3(route, start, end) {
    const chapter = CHAPTERS[2];
    const headingEnd = start + chapter.heading.length;
    const educational = chapter.subsections[0];
    const operational = chapter.subsections[1];
    const educationalStart = findRequired(source, educational.heading, headingEnd, chapter.id);
    const operationalStart = findRequired(source, operational.heading, educationalStart, chapter.id);
    addRange(route, start, educationalStart + educational.heading.length, {
      kind: 'route-title',
      text: chapter.heading,
      immediateHeading: educational.heading,
    });

    educational.items.forEach((label, index) => {
      const itemStart = findRequired(source, label, educationalStart + educational.heading.length, educational.heading);
      const next = educational.items[index + 1];
      const itemEnd = next
        ? findRequired(source, next, itemStart + label.length, educational.heading)
        : operationalStart;
      const itemText = source.slice(itemStart, itemEnd);
      const split = splitLabelValue(itemText, label);
      addRange(route, itemStart, itemEnd, {
        kind: 'labelled-item',
        label: split.label,
        value: split.value,
      });
    });

    addRange(route, operationalStart, operationalStart + operational.heading.length, {
      kind: 'heading',
      level: 2,
      text: operational.heading,
    });

    let groupStart = operationalStart + operational.heading.length;
    operational.groups.forEach((group, index) => {
      const nextGroup = operational.groups[index + 1];
      const groupEnd = nextGroup
        ? findRequired(source, nextGroup.heading, groupStart, operational.heading)
        : end;
      parseOperationalGroup(route, group, groupStart, groupEnd);
      groupStart = groupEnd;
    });
  }

  function parseChapter4(route, start, end) {
    const chapter = CHAPTERS[3];
    const headingEnd = start + chapter.heading.length;
    const diagramStart = findRequired(source, CHAPTER_4_DIAGRAM.start, headingEnd, chapter.id);
    const firstStep = findRequired(source, chapter.steps[0], diagramStart, chapter.id);
    addRange(route, start, firstStep, {
      kind: 'diagram',
      diagram: 'acampamento',
      routeTitle: chapter.heading,
      text: source.slice(diagramStart, firstStep),
    });

    chapter.steps.forEach((label, index) => {
      const stepStart = findRequired(source, label, firstStep, chapter.id);
      const nextLabel = chapter.steps[index + 1];
      const stepEnd = nextLabel
        ? findRequired(source, nextLabel, stepStart + label.length, chapter.id)
        : end;
      const stepText = source.slice(stepStart, stepEnd);
      const split = splitLabelValue(stepText, label);
      const nested = chapter.nested[index + 1] ?? [];
      let intro = split.value;
      const nestedStart = nested.length
        ? findRequired(source, nested[0], stepStart + label.length, `${label}: ${nested[0]}`)
        : -1;

      if (nestedStart !== -1) {
        intro = source.slice(stepStart + label.length, nestedStart);
      }

      addRange(route, stepStart, stepEnd, {
        kind: 'step',
        number: index + 1,
        title: label.replace(/:$/, ''),
        text: intro,
        items: nested,
      });
    });
  }

  function parseChapter5(route, start, end) {
    const chapter = CHAPTERS[4];
    const headingEnd = start + chapter.heading.length;
    addRange(route, start, headingEnd, { kind: 'route-title', text: chapter.heading });

    const diagramStart = findRequired(source, CHAPTER_5_DIAGRAM.start, headingEnd, chapter.id);
    addRange(route, headingEnd, diagramStart, { kind: 'paragraph' });
    addRange(route, diagramStart, end, {
      kind: 'diagram',
      diagram: 'projeto-ods',
      text: source.slice(diagramStart, end),
      steps: chapter.steps,
    });
  }

  function parseChapter6(route, start, end) {
    const chapter = CHAPTERS[5];
    const headingEnd = start + chapter.heading.length;
    const leadStart = findRequired(source, chapter.leadHeading, headingEnd, chapter.id);
    addRange(route, start, leadStart + chapter.leadHeading.length, {
      kind: 'route-title',
      text: chapter.heading,
      immediateHeading: chapter.leadHeading,
    });

    const diagramStart = findRequired(source, CHAPTER_6_DIAGRAM.start, leadStart + chapter.leadHeading.length, chapter.id);
    addRange(route, leadStart + chapter.leadHeading.length, diagramStart, { kind: 'paragraph' });
    const diagramEnd = source.indexOf('\n', diagramStart);
    const firstStep = findRequired(source, chapter.steps[0], diagramStart, chapter.id);
    addRange(route, diagramStart, firstStep, {
      kind: 'diagram',
      diagram: 'parceria',
      text: source.slice(diagramStart, firstStep),
    });

    chapter.steps.forEach((label, index) => {
      const stepStart = findRequired(source, label, firstStep, chapter.id);
      const nextLabel = chapter.steps[index + 1];
      const stepEnd = nextLabel
        ? findRequired(source, nextLabel, stepStart + label.length, chapter.id)
        : end;
      const stepText = source.slice(stepStart, stepEnd);
      const split = splitLabelValue(stepText, label);
      addRange(route, stepStart, stepEnd, {
        kind: 'step',
        number: index + 1,
        title: label.replace(/:$/, ''),
        text: split.value,
        items: [],
      });
    });

    if (!Number.isInteger(diagramEnd) || diagramEnd < diagramStart) {
      throw new ContentParseError('Diagrama original da parceria sem fim de linha recuperável.');
    }
  }

  function parseEconomicsTable(start, end) {
    const header = ECONOMICS_TABLE.start;
    if (source.slice(start, start + header.length) !== header) {
      throw new ContentParseError('Cabeçalho da tabela económica não coincide com a fonte.', { start });
    }

    const rows = [];
    let rowStart = start + header.length;
    ECONOMICS_TABLE.rows.forEach((row, index) => {
      const actual = findRequired(source, row, rowStart, 'tabela económica');
      const nextRow = ECONOMICS_TABLE.rows[index + 1];
      const rowEnd = nextRow ? findRequired(source, nextRow, actual + row.length, 'tabela económica') : end;
      if (actual !== rowStart) {
        throw new ContentParseError('Linha inesperada na tabela económica.', { expected: rowStart, actual });
      }
      const match = row.match(/^([^\$]+)(\$[^$]+\$)(.*)$/u);
      if (!match) throw new ContentParseError('Linha económica não pode ser preservada nas três células.', { row });
      rows.push({
        category: match[1],
        cost: match[2],
        points: match[3],
        sourceText: row,
        sourceOffset: actual,
      });
      rowStart = rowEnd;
    });

    return {
      caption: 'Tabela de despesas do Jogo dos Salários',
      headers: ['Categoria de Despesa', 'Custo', 'Pontos de Estatuto Social'],
      rows,
    };
  }

  function parseActivity(route, area, activity, start, end) {
    const fullTitle = `${activity.number}. ${activity.title}`;
    const titleEnd = start + fullTitle.length;
    const odsLabels = ['ODS Associado:', 'ODS Associados:'];
    let odsLabel = odsLabels
      .map((label) => ({ label, offset: findOptional(source, label, titleEnd) }))
      .filter((entry) => entry.offset !== -1 && entry.offset < end)
      .sort((a, b) => a.offset - b.offset)[0];

    if (!odsLabel) {
      const attachedLabelOffset = findOptional(source, ' Associados:', titleEnd);
      if (attachedLabelOffset === titleEnd) {
        odsLabel = { label: ' Associados:', offset: attachedLabelOffset };
      }
    }

    if (!odsLabel) {
      throw new ContentParseError(`Campo ODS ausente em ${area.title} — ${activity.title}.`);
    }

    const fieldOffsets = ACTIVITY_FIELDS.map((label) => ({
      label,
      offset: findRequired(source, label, odsLabel.offset + odsLabel.label.length, fullTitle),
    }));
    const isEconomicsActivity = activity.title === 'Jogo dos Salários';
    const tableStart = isEconomicsActivity
      ? findRequired(source, ECONOMICS_TABLE.start, fieldOffsets[2].offset, fullTitle)
      : -1;
    const materialsEnd = isEconomicsActivity ? tableStart : fieldOffsets[4].offset;
    const durationEnd = fieldOffsets[3].offset;
    const dynamicsStart = fieldOffsets[4].offset;
    const dynamicsText = source.slice(dynamicsStart + 'Dinâmica:'.length, end);
    const dynamics = splitNestedDynamics(dynamicsText, dynamicsStart + 'Dinâmica:'.length);

    const table = isEconomicsActivity
      ? parseEconomicsTable(tableStart, dynamicsStart)
      : null;

    addRange(route, start, end, {
      kind: 'activity',
      number: activity.number,
      title: activity.title,
      fullTitle,
      area: area.title,
      color: area.color,
      odsLabel: odsLabel.label,
      ods: source.slice(odsLabel.offset + odsLabel.label.length, fieldOffsets[0].offset).trimStart(),
      format: source.slice(fieldOffsets[0].offset + fieldOffsets[0].label.length, fieldOffsets[1].offset).trimStart(),
      participants: source.slice(fieldOffsets[1].offset + fieldOffsets[1].label.length, fieldOffsets[2].offset).trimStart(),
      duration: source.slice(fieldOffsets[2].offset + fieldOffsets[2].label.length, durationEnd).trimStart(),
      materials: source.slice(fieldOffsets[3].offset + fieldOffsets[3].label.length, materialsEnd).trimStart(),
      dynamics,
      table,
    });
  }

  function parseChapter7(route, start, end) {
    const chapter = CHAPTERS[6];
    const headingEnd = start + chapter.heading.length;
    addRange(route, start, headingEnd, { kind: 'route-title', text: chapter.heading });

    const diagramStart = findRequired(source, CHAPTER_7_DIAGRAM.start, headingEnd, chapter.id);
    addRange(route, headingEnd, diagramStart, { kind: 'paragraph' });
    addRange(route, diagramStart, findRequired(source, CHAPTER7_AREAS[0].title, diagramStart, chapter.id), {
      kind: 'diagram',
      diagram: 'catalogo-30',
      text: source.slice(
        diagramStart,
        findRequired(source, CHAPTER7_AREAS[0].title, diagramStart, chapter.id),
      ),
    });

    let cursor = findRequired(source, CHAPTER7_AREAS[0].title, diagramStart, chapter.id);
    CHAPTER7_AREAS.forEach((area, areaIndex) => {
      const firstActivityTitle = `${area.activities[0].number}. ${area.activities[0].title}`;
      const activityStart = findRequired(source, firstActivityTitle, cursor, area.title);
      addRange(route, cursor, activityStart, {
        kind: 'area-heading',
        title: area.title,
        color: area.color,
        id: `area-${slugify(area.title)}`,
      });

      const nextArea = CHAPTER7_AREAS[areaIndex + 1];
      const areaEnd = nextArea
        ? findRequired(source, nextArea.title, activityStart, chapter.id)
        : end;
      let activityCursor = activityStart;

      area.activities.forEach((activity, activityIndex) => {
        const title = `${activity.number}. ${activity.title}`;
        const currentStart = findRequired(source, title, activityCursor, `${area.title}: ${title}`);
        const nextActivity = area.activities[activityIndex + 1];
        const currentEnd = nextActivity
          ? findRequired(source, `${nextActivity.number}. ${nextActivity.title}`, currentStart + title.length, area.title)
          : areaEnd;
        parseActivity(route, area, activity, currentStart, currentEnd);
        activityCursor = currentEnd;
      });

      cursor = areaEnd;
    });
  }

  function parseChapter8(route, start, end) {
    const chapter = CHAPTERS[7];
    const headingEnd = start + chapter.heading.length;
    addRange(route, start, headingEnd, { kind: 'route-title', text: chapter.heading });

    const firstArea = findRequired(source, CHAPTER8_RESOURCES[0].title, headingEnd, chapter.id);
    addRange(route, headingEnd, firstArea, { kind: 'paragraph' });
    let cursor = firstArea;

    CHAPTER8_RESOURCES.forEach((area, areaIndex) => {
      const firstGroup = findRequired(source, area.groups[0], cursor, area.title);
      addRange(route, cursor, firstGroup, {
        kind: 'resource-area-heading',
        title: area.title,
        color: area.color,
        id: `recursos-${slugify(area.title)}`,
      });

      const nextArea = CHAPTER8_RESOURCES[areaIndex + 1];
      const areaEnd = nextArea
        ? findRequired(source, nextArea.title, firstGroup, chapter.id)
        : end;
      let groupCursor = firstGroup;

      area.groups.forEach((label, groupIndex) => {
        const groupStart = findRequired(source, label, groupCursor, `${area.title}: ${label}`);
        const nextGroup = area.groups[groupIndex + 1];
        const groupEnd = nextGroup
          ? findRequired(source, nextGroup, groupStart + label.length, area.title)
          : areaEnd;
        const fullText = source.slice(groupStart, groupEnd);
        const split = splitLabelValue(fullText, label);
        addRange(route, groupStart, groupEnd, {
          kind: 'resource-group',
          title: label,
          items: splitList(split.value),
        });
        groupCursor = groupEnd;
      });

      cursor = areaEnd;
    });
  }

  function parseReferences(route, start, end) {
    const headingEnd = start + TOP_LEVEL_MARKERS.references.length;
    addRange(route, start, headingEnd, {
      kind: 'route-title',
      text: TOP_LEVEL_MARKERS.references,
    });

    let cursor = headingEnd;
    REFERENCE_ENTRIES.forEach((entry, index) => {
      const entryStart = findRequired(source, entry, cursor, `${route.id}: ${entry}`);
      const next = REFERENCE_ENTRIES[index + 1];
      const entryEnd = next
        ? findRequired(source, next, entryStart + entry.length, route.id)
        : findRequired(source, TOOL_ENTRIES[0], entryStart + entry.length, route.id);
      addRange(route, entryStart, entryEnd, { kind: 'reference-entry', text: entry });
      cursor = entryEnd;
    });

    TOOL_ENTRIES.forEach((entry, index) => {
      const entryStart = findRequired(source, entry, cursor, `${route.id}: ${entry}`);
      const next = TOOL_ENTRIES[index + 1];
      const entryEnd = next ? findRequired(source, next, entryStart + entry.length, route.id) : end;
      const separator = entry.indexOf(': ');
      addRange(route, entryStart, entryEnd, {
        kind: 'tool-entry',
        label: entry.slice(0, separator + 1),
        value: entry.slice(separator + 2),
      });
      cursor = entryEnd;
    });
  }

  function build() {
    const { glossaryStart, indexStart, starts, referencesStart } = findChapterStarts();
    const boundaries = [
      { id: 'inicio', start: 0, end: glossaryStart },
      { id: 'glossario', start: glossaryStart, end: indexStart },
      { id: 'indice', start: indexStart, end: starts[0].offset },
      ...CHAPTERS.map((chapter, index) => ({
        id: chapter.id,
        start: starts[index].offset,
        end: index === CHAPTERS.length - 1 ? referencesStart : starts[index + 1].offset,
      })),
      { id: 'referencias', start: referencesStart, end: source.length },
    ];

    ROUTES.forEach((route, index) => {
      if (route.id !== boundaries[index].id) {
        throw new ContentParseError('A ordem das rotas não coincide com o mapa da fonte.');
      }
      const range = boundaries[index];
      routeMap.set(route.id, {
        ...route,
        sourceOffset: range.start,
        sourceEnd: range.end,
        sourceLength: range.end - range.start,
      });
      routes.push(routeMap.get(route.id));
    });

    routes.forEach((route) => {
      switch (route.id) {
        case 'inicio':
          parseOpening(route, route.sourceOffset, route.sourceEnd);
          break;
        case 'glossario':
          parseGlossary(route, route.sourceOffset, route.sourceEnd);
          break;
        case 'indice':
          parseIndex(route, route.sourceOffset, route.sourceEnd);
          break;
        case 'capitulo-1':
          parseChapter1(route, route.sourceOffset, route.sourceEnd);
          break;
        case 'capitulo-2':
          parseChapter2(route, route.sourceOffset, route.sourceEnd);
          break;
        case 'capitulo-3':
          parseChapter3(route, route.sourceOffset, route.sourceEnd);
          break;
        case 'capitulo-4':
          parseChapter4(route, route.sourceOffset, route.sourceEnd);
          break;
        case 'capitulo-5':
          parseChapter5(route, route.sourceOffset, route.sourceEnd);
          break;
        case 'capitulo-6':
          parseChapter6(route, route.sourceOffset, route.sourceEnd);
          break;
        case 'capitulo-7':
          parseChapter7(route, route.sourceOffset, route.sourceEnd);
          break;
        case 'capitulo-8':
          parseChapter8(route, route.sourceOffset, route.sourceEnd);
          break;
        case 'referencias':
          parseReferences(route, route.sourceOffset, route.sourceEnd);
          break;
        default:
          throw new ContentParseError(`Rota sem parser: ${route.id}.`);
      }
    });

    const dollarSpans = classifyDollarSpans(source);
    return Object.freeze({
      source,
      nodes: Object.freeze(nodes),
      routes: Object.freeze(routes),
      routeMap,
      dollarSpans: Object.freeze(dollarSpans),
      stats: Object.freeze({
        sourceCharacters: source.length,
        sourceBytes: new TextEncoder().encode(source).byteLength,
        nodeCount: nodes.length,
        glossaryEntries: nodes.filter((node) => node.kind === 'glossary-group').reduce((sum, node) => sum + node.data.entries.length, 0),
        activities: nodes.filter((node) => node.kind === 'activity').length,
        diagrams: nodes.filter((node) => node.kind === 'diagram').length,
        references: nodes.filter((node) => node.kind === 'reference-entry').length,
        tools: nodes.filter((node) => node.kind === 'tool-entry').length,
      }),
    });
  }

  return build();
}

export function parseDocument(source) {
  return createParser(source);
}

export function validateParsedDocument(document) {
  const errors = [];
  const { source, nodes, routes, dollarSpans } = document;

  if (source !== nodes.map((node) => node.sourceText).join('')) {
    errors.push('A concatenação dos nós não reproduz a fonte completa.');
  }

  let expectedOffset = 0;
  nodes.forEach((node, index) => {
    if (node.sourceOffset !== expectedOffset) {
      errors.push(`Deslocamento inesperado no nó ${index}: ${node.sourceOffset}; esperado ${expectedOffset}.`);
    }
    if (node.sourceText !== source.slice(node.sourceOffset, node.sourceOffset + node.sourceText.length)) {
      errors.push(`Texto bruto divergente no nó ${index}.`);
    }
    expectedOffset += node.sourceText.length;
  });

  if (expectedOffset !== source.length) errors.push('A cobertura não termina no fim da fonte.');
  if (routes.length !== EXPECTED_COUNTS.routes) errors.push(`Esperadas ${EXPECTED_COUNTS.routes} rotas.`);
  if (routes.map((route) => route.id).join('|') !== ROUTES.map((route) => route.id).join('|')) {
    errors.push('A ordem das rotas não corresponde à ordem da fonte.');
  }
  if (document.stats.glossaryEntries !== EXPECTED_COUNTS.glossaryEntries) {
    errors.push(`Esperadas ${EXPECTED_COUNTS.glossaryEntries} entradas de glossário.`);
  }
  if (document.stats.activities !== EXPECTED_COUNTS.chapter7Activities) {
    errors.push(`Esperados ${EXPECTED_COUNTS.chapter7Activities} atividades.`);
  }
  if (document.stats.diagrams !== EXPECTED_COUNTS.diagrams) {
    errors.push(`Esperados ${EXPECTED_COUNTS.diagrams} diagramas.`);
  }
  if (document.stats.references !== EXPECTED_COUNTS.bibliographyEntries) {
    errors.push(`Esperadas ${EXPECTED_COUNTS.bibliographyEntries} referências bibliográficas.`);
  }
  if (document.stats.tools !== EXPECTED_COUNTS.tools) errors.push(`Esperadas ${EXPECTED_COUNTS.tools} ferramentas.`);

  for (const route of routes) {
    const routeNodes = nodes.filter((node) => node.route.id === route.id);
    const concatenated = routeNodes.map((node) => node.sourceText).join('');
    if (concatenated !== source.slice(route.sourceOffset, route.sourceEnd)) {
      errors.push(`Cobertura inválida na rota ${route.id}.`);
    }
  }

  if (dollarSpans.length !== EXPECTED_COUNTS.dollarSpans) {
    errors.push(`Esperados ${EXPECTED_COUNTS.dollarSpans} segmentos delimitados por dólares.`);
  }
  const mathCount = dollarSpans.filter((span) => span.type === 'math').length;
  const currencyCount = dollarSpans.filter((span) => span.type === 'currency').length;
  if (mathCount !== EXPECTED_COUNTS.validMathSpans) errors.push(`Esperados ${EXPECTED_COUNTS.validMathSpans} segmentos TeX válidos.`);
  if (currencyCount !== EXPECTED_COUNTS.currencySpans) errors.push(`Esperados ${EXPECTED_COUNTS.currencySpans} valores monetários literais.`);

  return errors;
}
