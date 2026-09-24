import DOMPurify from 'dompurify';
import katex from 'katex';
import MarkdownIt from 'markdown-it';
import { EXTERNAL_DOMAINS, ROUTES, VALID_MATH, slugify } from './source-map.js';
import { validateParsedDocument } from './parser.js';

const markdown = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
  breaks: false,
  presets: null,
});

const MARKDOWN_ALLOWED_TAGS = [
  'a', 'abbr', 'b', 'br', 'code', 'em', 'i', 'mark', 's', 'span', 'strong', 'sub', 'sup',
];
const MARKDOWN_ALLOWED_ATTR = ['href', 'title', 'class'];
const KATEX_ALLOWED_TAGS = [
  ...MARKDOWN_ALLOWED_TAGS,
  'annotation', 'math', 'menclose', 'merror', 'mfrac', 'mi', 'mmultiscripts', 'mn', 'mo',
  'mover', 'mpadded', 'mphantom', 'mprescripts', 'mroot', 'mrow', 'ms', 'mspace', 'msqrt',
  'mstyle', 'msub', 'msubsup', 'msup', 'mtable', 'mtd', 'mtext', 'mtr', 'semantics', 'svg',
  'path', 'line', 'rect',
];
const KATEX_ALLOWED_ATTR = [
  ...MARKDOWN_ALLOWED_ATTR,
  'aria-hidden', 'class', 'data', 'd', 'encoding', 'fill', 'height', 'preserveAspectRatio',
  'role', 'style', 'transform', 'viewBox', 'width', 'x', 'x1', 'x2', 'xmlns', 'y', 'y1', 'y2',
];

const validMath = new Set(VALID_MATH);
const externalDomainPattern = new RegExp(`(?<![\\w@])(${EXTERNAL_DOMAINS.map((domain) => domain.replace('.', '\\.')).join('|')})(?![\\w.-])`, 'giu');

function element(tagName, attributes = {}, children = []) {
  const node = document.createElement(tagName);
  Object.entries(attributes).forEach(([name, value]) => {
    if (value === undefined || value === null || value === false) return;
    if (name === 'class') node.className = value;
    else if (name === 'text') node.textContent = value;
    else if (name === 'dataset') Object.assign(node.dataset, value);
    else if (name.startsWith('aria') || name === 'role') node.setAttribute(name, String(value));
    else node.setAttribute(name, String(value));
  });

  const childList = Array.isArray(children) ? children : [children];
  childList.flat(Infinity).forEach((child) => {
    if (child === undefined || child === null || child === false) return;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return node;
}

function fragmentFromCleanHtml(html, config) {
  const clean = DOMPurify.sanitize(html, config);
  const template = document.createElement('template');
  template.innerHTML = clean;
  return template.content;
}

function normalizeVisibleDomains(text) {
  return text.replace(externalDomainPattern, (domain) => `[${domain}](https://${domain})`);
}

function normalizeLinks(container) {
  container.querySelectorAll('a[href]').forEach((link) => {
    const safe = sanitizeUrl(link.getAttribute('href'));
    if (!safe) {
      link.removeAttribute('href');
      return;
    }
    link.setAttribute('href', safe);
    if (/^https?:/i.test(safe)) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

function renderMarkdownInline(text) {
  const html = markdown.renderInline(normalizeVisibleDomains(text));
  const fragment = fragmentFromCleanHtml(html, {
    ALLOWED_TAGS: MARKDOWN_ALLOWED_TAGS,
    ALLOWED_ATTR: MARKDOWN_ALLOWED_ATTR,
  });
  normalizeLinks(fragment);
  return fragment;
}

function renderMath(expression) {
  const html = katex.renderToString(expression, {
    displayMode: false,
    output: 'htmlAndMathml',
    strict: 'warn',
    throwOnError: false,
    trust: false,
  });
  return fragmentFromCleanHtml(html, {
    ALLOWED_TAGS: KATEX_ALLOWED_TAGS,
    ALLOWED_ATTR: KATEX_ALLOWED_ATTR,
  });
}

export function renderInlineText(text) {
  const fragment = document.createDocumentFragment();
  const pattern = /\$([^$]*)\$/g;
  let cursor = 0;

  for (const match of String(text).matchAll(pattern)) {
    fragment.append(renderMarkdownInline(String(text).slice(cursor, match.index)));
    if (validMath.has(match[1])) fragment.append(renderMath(match[1]));
    else fragment.append(renderMarkdownInline(match[0]));
    cursor = match.index + match[0].length;
  }

  fragment.append(renderMarkdownInline(String(text).slice(cursor)));
  return fragment;
}

export function sanitizeUrl(value, baseUrl = document.baseURI) {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (!candidate || candidate.startsWith('//') || candidate.includes('\\')) return null;
  if (candidate.startsWith('#')) return candidate;

  try {
    const url = new URL(candidate, baseUrl);
    const base = new URL(baseUrl);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      if (url.origin === base.origin) return `${url.pathname}${url.search}${url.hash}`;
      return url.href;
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveAssetPath(reference, baseUrl = document.baseURI) {
  if (typeof reference !== 'string') return null;
  const candidate = reference.trim();
  if (!candidate || candidate.startsWith('/') || candidate.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(candidate)) {
    return null;
  }
  const base = new URL(baseUrl);
  const resolved = new URL(candidate, base);
  if (resolved.origin !== base.origin) return null;
  const baseDirectory = base.pathname.endsWith('/') ? base.pathname : base.pathname.slice(0, base.pathname.lastIndexOf('/') + 1);
  if (!resolved.pathname.startsWith(baseDirectory)) return null;
  return `${resolved.pathname}${resolved.search}`;
}

export function collectAssetReferences(markdownText) {
  const references = new Set();
  const markdownPattern = /!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/gu;
  const htmlPattern = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/giu;
  for (const match of String(markdownText).matchAll(markdownPattern)) references.add(match[1]);
  for (const match of String(markdownText).matchAll(htmlPattern)) references.add(match[1]);
  return [...references];
}

function heading(level, text, id, idRegistry) {
  const base = slugify(id || text) || `secao-${idRegistry.size + 1}`;
  let unique = base;
  let suffix = 2;
  while (idRegistry.has(unique)) unique = `${base}-${suffix++}`;
  idRegistry.add(unique);
  return element(`h${level}`, { id: unique, text });
}

function addInline(elementNode, text) {
  elementNode.append(renderInlineText(text));
}

function sourceTable(headers, rows, className, caption) {
  const table = element('table', { class: className });
  if (caption) table.append(element('caption', { text: caption }));
  const head = element('thead');
  const headRow = element('tr');
  headers.forEach((header) => headRow.append(element('th', { scope: 'col', text: header })));
  head.append(headRow);
  table.append(head);

  const body = element('tbody');
  rows.forEach((row) => {
    const tr = element('tr', row.attributes);
    row.cells.forEach((cell, index) => {
      const cellNode = element(index === 0 ? 'th' : 'td', {
        ...(index === 0 ? { scope: 'row' } : {}),
        'data-label': headers[index],
      });
      addInline(cellNode, cell);
      tr.append(cellNode);
    });
    body.append(tr);
  });
  table.append(body);
  return table;
}

function renderDiagram(node) {
  const fragment = document.createDocumentFragment();
  const details = element('details', { class: 'diagram-disclosure' });
  details.append(element('summary', { text: 'Diagrama original' }));
  const scroll = element('div', {
    class: 'diagram-scroll',
    tabindex: '0',
    role: 'region',
    'aria-label': 'Diagrama original com deslocamento horizontal',
  });
  scroll.append(element('pre', { 'aria-label': `Diagrama original: ${node.data.diagram}` }, node.data.text));
  details.append(scroll);
  fragment.append(details);

  if (node.data.steps?.length) {
    const semanticSteps = element('ol', { class: 'semantic-steps', 'aria-label': 'Passos do projeto ODS' });
    node.data.steps.forEach((step) => {
      const item = element('li');
      addInline(item, step);
      semanticSteps.append(item);
    });
    fragment.append(semanticSteps);
  }
  return fragment;
}

function renderFivePsTable(node) {
  const rebuiltRows = node.data.rows.map((row) => {
    const match = row.values.match(/^(ODS(?:\s+\d{1,2})(?:(?:,| e)\s+\d{1,2})*)(.*)$/u);
    if (!match) throw new Error(`Linha dos 5 P’s não pode ser dividida: ${row.principle}`);
    return {
      attributes: { 'data-p': slugify(row.principle) },
      cells: [row.principle, match[1], match[2]],
    };
  });

  return sourceTable(node.data.headers, rebuiltRows, 'five-p-table', node.data.caption);
}

function renderOperationalGroup(node, idRegistry) {
  const section = element('section', { class: 'operational-group' });
  section.append(heading(3, node.data.title, `operacional-${slugify(node.data.title)}`, idRegistry));
  const list = element('ul', { class: 'check-list' });
  node.data.items.forEach((item) => {
    const li = element('li');
    const colon = item.text.indexOf(':');
    if (colon !== -1 && colon < 42) {
      li.append(element('strong', { text: item.text.slice(0, colon + 1) }));
      addInline(li, item.text.slice(colon + 1));
    } else {
      addInline(li, item.text);
    }
    list.append(li);
  });
  section.append(list);
  return section;
}

function renderStep(node, idRegistry) {
  const li = element('li', { class: 'stepper-item', dataset: { step: String(node.number) } });
  li.append(element('span', { class: 'step-number', 'aria-hidden': 'true', text: String(node.number).padStart(2, '0') }));
  const content = element('div', { class: 'step-content' });
  content.append(heading(3, node.data.title, `passo-${node.data.number}-${slugify(node.data.title)}`, idRegistry));
  if (node.data.text) {
    const paragraph = element('p');
    addInline(paragraph, node.data.text);
    content.append(paragraph);
  }
  if (node.data.items?.length) {
    const list = element('ul', { class: 'check-list' });
    node.data.items.forEach((item) => {
      const liItem = element('li');
      addInline(liItem, item);
      list.append(liItem);
    });
    content.append(list);
  }
  li.append(content);
  return li;
}

function renderActivity(node, idRegistry) {
  const article = element('article', {
    class: `activity-card activity-card--${node.data.color}`,
    id: `atividade-${node.data.number}-${slugify(node.data.title)}`,
    dataset: {
      area: slugify(node.data.area),
      format: node.data.format,
      ods: extractOdsCodes(node.data.ods).join(' '),
      odsAll: /Todos os 17 ODS/u.test(node.data.ods) ? 'true' : 'false',
      searchEntry: 'activity',
    },
    'aria-labelledby': `atividade-${node.data.number}-${slugify(node.data.title)}-titulo`,
  });

  const header = element('header', { class: 'activity-card__header' });
  header.append(element('p', { class: 'activity-area-label', text: node.data.area }));
  const title = heading(3, node.data.fullTitle, `atividade-${node.data.number}-${slugify(node.data.title)}-titulo`, idRegistry);
  article.id = title.id.replace(/-titulo$/, '');
  article.setAttribute('aria-labelledby', title.id);
  header.append(title);
  article.append(header);

  const metadata = element('dl', { class: 'activity-meta' });
  const fields = [
    [node.data.odsLabel, node.data.ods],
    ['Formato:', node.data.format],
    ['Participantes:', node.data.participants],
    ['Duração:', node.data.duration],
    ['Materiais:', node.data.materials],
  ];
  fields.forEach(([label, value]) => {
    metadata.append(element('dt', { text: label }));
    const dd = element('dd');
    addInline(dd, value);
    metadata.append(dd);
  });
  article.append(metadata);

  if (node.data.table) {
    const table = sourceTable(
      node.data.table.headers,
      node.data.table.rows.map((row) => ({ cells: [row.category, row.cost, row.points] })),
      'data-table economics-table',
      node.data.table.caption,
    );
    article.append(table);
  }

  const dynamics = element('section', { class: 'activity-dynamics' });
  dynamics.append(element('h4', { text: 'Dinâmica:' }));
  if (node.data.dynamics.intro) {
    const intro = element('p');
    addInline(intro, node.data.dynamics.intro);
    dynamics.append(intro);
  }
  if (node.data.dynamics.stages.length) {
    const stages = element('ol', { class: 'stage-list' });
    node.data.dynamics.stages.forEach((stage) => {
      const li = element('li');
      const label = stage.text.slice(0, stage.label.length);
      li.append(element('strong', { text: label }));
      addInline(li, stage.text.slice(stage.label.length));
      stages.append(li);
    });
    dynamics.append(stages);
  }
  article.append(dynamics);
  return article;
}

function extractOdsCodes(value) {
  const codes = new Set();
  for (const match of String(value).matchAll(/\bODS\s+(\d{1,2})\b/giu)) {
    const code = Number(match[1]);
    if (code >= 1 && code <= 17) codes.add(String(code));
  }
  return [...codes];
}

function renderFilters(model) {
  const activities = model.nodes.filter((node) => node.kind === 'activity');
  const formats = [...new Set(activities.map((node) => node.data.format))];
  const filters = element('section', { class: 'activity-filters', 'aria-label': 'Filtrar jogos e workshops' });

  const controls = element('div', { class: 'filter-controls' });
  const areaControl = element('div', { class: 'filter-control' });
  areaControl.append(element('label', { for: 'filter-area', text: 'Área' }));
  const areaSelect = element('select', { id: 'filter-area' });
  areaSelect.append(element('option', { value: '', text: 'Todas as áreas' }));
  [...new Set(activities.map((node) => node.data.area))].forEach((area) => {
    areaSelect.append(element('option', { value: slugify(area), text: area }));
  });
  areaControl.append(areaSelect);
  controls.append(areaControl);

  const formatControl = element('div', { class: 'filter-control' });
  formatControl.append(element('label', { for: 'filter-format', text: 'Formato' }));
  const formatSelect = element('select', { id: 'filter-format' });
  formatSelect.append(element('option', { value: '', text: 'Todos os formatos' }));
  formats.forEach((format) => formatSelect.append(element('option', { value: format, text: format })));
  formatControl.append(formatSelect);
  controls.append(formatControl);

  const odsControl = element('div', { class: 'filter-control' });
  odsControl.append(element('label', { for: 'filter-ods', text: 'ODS associado' }));
  const odsSelect = element('select', { id: 'filter-ods' });
  odsSelect.append(element('option', { value: '', text: 'Todos os ODS' }));
  for (let code = 1; code <= 17; code += 1) {
    odsSelect.append(element('option', { value: String(code), text: `ODS ${code}` }));
  }
  odsControl.append(odsSelect);
  controls.append(odsControl);

  const clear = element('button', { id: 'clear-filters', class: 'secondary-button', type: 'button', text: 'Limpar filtros' });
  controls.append(clear);
  filters.append(controls);
  filters.append(element('p', { id: 'activity-count', class: 'filter-count', text: `${activities.length} de ${activities.length} atividades` }));
  filters.append(element('p', { id: 'filter-empty', class: 'filter-empty', text: 'Nenhuma atividade corresponde aos filtros.', hidden: true }));
  return filters;
}

function renderChapter7(routeNodes, idRegistry) {
  const fragment = document.createDocumentFragment();
  let filtersInserted = false;
  let currentGroup = null;

  routeNodes.forEach((node) => {
    if (node.kind === 'area-heading' && !filtersInserted) {
      fragment.append(renderFilters({ nodes: routeNodes }));
      filtersInserted = true;
    }
    if (node.kind === 'area-heading') {
      currentGroup = element('section', { class: `activity-area activity-area--${node.data.color}`, id: node.data.id });
      currentGroup.append(heading(2, node.data.title, `${node.data.id}-titulo`, idRegistry));
      currentGroup.dataset.searchEntry = 'area';
      currentGroup.dataset.searchTitle = node.data.title;
      fragment.append(currentGroup);
    } else if (node.kind === 'activity') {
      const activity = renderActivity(node, idRegistry);
      (currentGroup ?? fragment).append(activity);
    } else {
      fragment.append(renderNode(node, idRegistry));
    }
  });
  return fragment;
}

function renderChapter8(routeNodes, idRegistry) {
  const fragment = document.createDocumentFragment();
  let currentGroup = null;
  routeNodes.forEach((node) => {
    if (node.kind === 'resource-area-heading') {
      currentGroup = element('section', { class: `resource-area resource-area--${node.data.color}`, id: node.data.id });
      currentGroup.append(heading(2, node.data.title, `${node.data.id}-titulo`, idRegistry));
      fragment.append(currentGroup);
    } else if (node.kind === 'resource-group') {
      const details = element('details', { class: 'resource-group', open: true });
      details.append(element('summary', {}, heading(3, node.data.title, `recurso-${slugify(node.data.title)}`, idRegistry)));
      const list = element('ul', { class: 'resource-list' });
      node.data.items.forEach((item) => {
        const li = element('li');
        addInline(li, item);
        list.append(li);
      });
      details.append(list);
      (currentGroup ?? fragment).append(details);
    } else {
      fragment.append(renderNode(node, idRegistry));
    }
  });
  return fragment;
}

function renderNode(node, idRegistry) {
  switch (node.kind) {
    case 'route-title': {
      const fragment = document.createDocumentFragment();
      if (node.data.publisher) fragment.append(element('p', { class: 'publisher-line', text: node.data.publisher }));
      if (node.data.sectionTitle) fragment.append(heading(2, node.data.sectionTitle, 'ficha-tecnica', idRegistry));
      if (node.data.immediateHeading) fragment.append(heading(2, node.data.immediateHeading, node.data.immediateHeading, idRegistry));
      return fragment;
    }
    case 'heading':
      return heading(node.data.level, node.data.text, node.data.text, idRegistry);
    case 'paragraph': {
      const paragraph = element('p', { class: 'source-paragraph' });
      addInline(paragraph, node.sourceText);
      return paragraph;
    }
    case 'opening-field': {
      const item = element('div', { class: 'metadata-item' });
      item.append(element('dt', { text: node.data.label }));
      const value = element('dd');
      addInline(value, node.data.value);
      item.append(value);
      return item;
    }
    case 'glossary-group': {
      const section = element('section', { class: 'glossary-group' });
      section.append(heading(2, node.data.title, node.data.title, idRegistry));
      const list = element('dl', { class: 'glossary-list' });
      node.data.entries.forEach((entry) => {
        const term = element('dt');
        addInline(term, entry.term);
        const definition = element('dd');
        addInline(definition, entry.definition);
        list.append(term, definition);
      });
      section.append(list);
      return section;
    }
    case 'index-entry': {
      const item = element('li');
      const link = element('a', { href: node.data.href, text: node.data.text });
      item.append(link);
      return item;
    }
    case 'quotation': {
      const blockquote = element('blockquote', { class: 'pull-quote' });
      const quote = element('p');
      addInline(quote, node.sourceText);
      blockquote.append(quote);
      return blockquote;
    }
    case 'attribution': {
      const attribution = element('p', { class: 'attribution' });
      addInline(attribution, node.sourceText);
      return attribution;
    }
    case 'five-p-table':
      return renderFivePsTable(node);
    case 'labelled-item': {
      const section = element('section', { class: 'labelled-item' });
      section.append(heading(3, node.data.label, node.data.label, idRegistry));
      const paragraph = element('p');
      addInline(paragraph, node.data.value);
      section.append(paragraph);
      return section;
    }
    case 'operational-group':
      return renderOperationalGroup(node, idRegistry);
    case 'step':
      return renderStep(node, idRegistry);
    case 'diagram':
      return renderDiagram(node);
    case 'area-heading':
    case 'resource-area-heading':
    case 'activity':
      return renderNodeByContainer(node, idRegistry);
    case 'resource-group': {
      const section = element('section', { class: 'resource-group' });
      section.append(heading(3, node.data.title, node.data.title, idRegistry));
      const list = element('ul');
      node.data.items.forEach((item) => {
        const li = element('li');
        addInline(li, item);
        list.append(li);
      });
      section.append(list);
      return section;
    }
    case 'reference-entry': {
      const item = element('li');
      addInline(item, node.data.text);
      return item;
    }
    case 'tool-entry': {
      const item = element('li', { class: 'tool-entry' });
      item.append(element('span', { class: 'tool-entry__icon', 'aria-hidden': 'true', text: '↗' }));
      const content = element('div');
      content.append(element('strong', { text: node.data.label }));
      addInline(content, node.data.value);
      item.append(content);
      return item;
    }
    default: {
      const paragraph = element('p', { class: 'unmapped-source' });
      addInline(paragraph, node.sourceText);
      return paragraph;
    }
  }
}

function renderNodeByContainer(node, idRegistry) {
  if (node.kind === 'activity') return renderActivity(node, idRegistry);
  if (node.kind === 'area-heading') return heading(2, node.data.title, node.data.id, idRegistry);
  return heading(2, node.data.title, node.data.id, idRegistry);
}

function renderRouteContent(route, routeNodes, idRegistry) {
  if (route.id === 'inicio') {
    const first = routeNodes[0];
    const fragment = document.createDocumentFragment();
    fragment.append(renderNode(first, idRegistry));
    const list = element('dl', { class: 'publication-metadata' });
    routeNodes.slice(1).forEach((node) => list.append(renderNode(node, idRegistry)));
    fragment.append(list);
    return fragment;
  }
  if (route.id === 'glossario') {
    const fragment = document.createDocumentFragment();
    routeNodes.slice(1).forEach((node) => fragment.append(renderNode(node, idRegistry)));
    return fragment;
  }
  if (route.id === 'indice') {
    const list = element('ol', { class: 'source-index-list' });
    routeNodes.slice(1).forEach((node) => list.append(renderNode(node, idRegistry)));
    return list;
  }
  if (route.id === 'capitulo-7') return renderChapter7(routeNodes, idRegistry);
  if (route.id === 'capitulo-8') return renderChapter8(routeNodes, idRegistry);
  if (['capitulo-4', 'capitulo-6'].includes(route.id)) {
    const fragment = document.createDocumentFragment();
    const list = element('ol', { class: 'stepper' });
    routeNodes.forEach((node) => {
      if (node.kind === 'step') list.append(renderNode(node, idRegistry));
      else fragment.append(renderNode(node, idRegistry));
    });
    fragment.append(list);
    return fragment;
  }
  if (route.id === 'referencias') {
    const fragment = document.createDocumentFragment();
    const bibliography = element('ol', { class: 'bibliography-list' });
    const tools = element('ul', { class: 'tools-list', 'aria-label': 'Ferramentas' });
    routeNodes.slice(1).forEach((node) => {
      if (node.kind === 'reference-entry') bibliography.append(renderNode(node, idRegistry));
      else tools.append(renderNode(node, idRegistry));
    });
    fragment.append(bibliography, tools);
    return fragment;
  }

  const fragment = document.createDocumentFragment();
  routeNodes.forEach((node) => fragment.append(renderNode(node, idRegistry)));
  return fragment;
}

function renderNavigation(navigationRoot) {
  const fragment = document.createDocumentFragment();
  ROUTES.forEach((route) => {
    const link = element('a', {
      class: 'nav-link',
      href: route.hash,
      dataset: { route: route.id },
    });
    if (route.id.startsWith('capitulo-')) {
      const number = route.label.match(/\d+/u)?.[0];
      if (number) link.append(element('span', { class: 'nav-link__number', text: number }));
      link.append(element('span', { text: route.id === 'capitulo-7' ? 'Jogos e Workshops' : route.label.replace(/^Capítulo \d+:?\s*/u, route.label) }));
    } else {
      link.append(element('span', { text: route.label }));
    }
    fragment.append(link);
  });
  navigationRoot.replaceChildren(fragment);
  return [...navigationRoot.querySelectorAll('[data-route]')];
}

export function renderApplication(model, { contentRoot, navigationRoot }) {
  const errors = validateParsedDocument(model);
  if (errors.length) throw new Error(`Modelo de conteúdo inválido: ${errors.join(' ')}`);

  const documentRoot = document.documentElement;
  documentRoot.idRegistry = new Set(['conteudo', ...ROUTES.map((route) => route.id)]);
  const idRegistry = documentRoot.idRegistry;
  const fragment = document.createDocumentFragment();
  const routeSections = [];

  model.routes.forEach((route) => {
    const section = element('section', {
      class: 'route-section',
      id: route.id,
      dataset: { route: route.id },
      'aria-labelledby': `${route.id}-titulo`,
    });
    const title = element('h1', {
      id: `${route.id}-titulo`,
      class: 'route-title',
      tabindex: '-1',
      text: route.title,
    });
    section.append(title);
    const routeNodes = model.nodes.filter((node) => node.route.id === route.id);
    section.append(renderRouteContent(route, routeNodes, idRegistry));
    fragment.append(section);
    routeSections.push(section);
  });

  contentRoot.replaceChildren(fragment);
  contentRoot.setAttribute('aria-busy', 'false');
  const navLinks = renderNavigation(navigationRoot);

  return {
    routeSections,
    navLinks,
    idRegistry,
    ids: [...idRegistry],
    searchEntries: [
      ...routeSections.map((section) => ({
        route: section.dataset.route,
        title: section.querySelector('h1')?.textContent ?? '',
        target: section.id,
        text: section.textContent ?? '',
        type: 'route',
      })),
      ...[...contentRoot.querySelectorAll('[data-search-entry="activity"]')].map((card) => ({
        route: 'capitulo-7',
        title: card.querySelector('h3')?.textContent ?? '',
        target: card.id,
        text: card.textContent ?? '',
        type: 'activity',
      })),
    ],
  };
}

export function getRenderedAssetReport(model) {
  const references = collectAssetReferences(model.source);
  return {
    references,
    resolved: references.map((reference) => ({ reference, path: resolveAssetPath(reference) })),
  };
}
