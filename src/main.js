import 'katex/dist/katex.min.css';
import './styles.css';
import source from '../file.md?raw';
import { parseDocument, validateParsedDocument } from './content/parser.js';
import { renderApplication } from './content/renderer.js';
import { initInteractions } from './content/interactions.js';

function requiredElement(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Elemento obrigatório ausente: ${selector}`);
  return element;
}

function showFatalError(contentRoot, error) {
  console.error(error);
  const container = document.createElement('section');
  container.className = 'fatal-error';
  const title = document.createElement('h1');
  title.textContent = 'Não foi possível preparar o guia';
  const message = document.createElement('p');
  message.textContent = 'A edição integral continua disponível no documento original.';
  const link = document.createElement('a');
  link.href = './file.md';
  link.textContent = 'Abrir documento original';
  container.append(title, message, link);
  contentRoot.replaceChildren(container);
  contentRoot.setAttribute('aria-busy', 'false');
}

try {
  const model = parseDocument(source);
  const errors = validateParsedDocument(model);
  if (errors.length) throw new Error(errors.join(' '));

  const contentRoot = requiredElement('#app-content');
  const rendered = renderApplication(model, {
    contentRoot,
    navigationRoot: requiredElement('#primary-navigation'),
  });

  initInteractions(model, rendered, {
    contentRoot,
    navigationRoot: requiredElement('#primary-navigation'),
    searchInput: requiredElement('#document-search'),
    searchResults: requiredElement('#search-results'),
    liveRegion: requiredElement('#live-region'),
    filterStatus: requiredElement('#filter-status'),
    menuButton: requiredElement('#menu-button'),
    navigationPanel: requiredElement('#navigation-panel'),
    navigationBackdrop: requiredElement('#navigation-backdrop'),
    navigationClose: requiredElement('#navigation-close'),
    themeButton: requiredElement('#theme-button'),
    printButton: requiredElement('#print-button'),
    progressBar: requiredElement('#reading-progress-bar'),
  });
} catch (error) {
  showFatalError(requiredElement('#app-content'), error);
}
