import { ROUTES } from './source-map.js';

const THEME_STORAGE_KEY = 'kit-agrupamento-tema';
const scheduleFrame = window.requestAnimationFrame?.bind(window) ?? ((callback) => window.setTimeout(callback, 0));
const routeByHash = new Map(ROUTES.map((route) => [route.hash, route]));
const routeById = new Map(ROUTES.map((route) => [route.id, route]));

export function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-PT')
    .trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function accentInsensitivePattern(query) {
  return String(query)
    .split('')
    .map((character) => {
      const base = character.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return `${escapeRegExp(base)}[\\u0300-\\u036f]*`;
    })
    .join('');
}

function availableStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeStorageGet(storage) {
  try {
    return storage?.getItem(THEME_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function safeStorageSet(storage, value) {
  try {
    storage?.setItem(THEME_STORAGE_KEY, value);
  } catch {
    // A preferência apenas vive nesta página quando o armazenamento está bloqueado.
  }
}

function getSystemTheme() {
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function hrefForTarget(routeId, target) {
  const route = routeById.get(routeId);
  if (!route) return '#/inicio';
  if (!target || target === route.id) return route.hash;
  return `${route.hash}?anchor=${encodeURIComponent(target)}`;
}

function parseLocationHash(hash = window.location.hash) {
  const raw = hash || '#/inicio';
  const queryIndex = raw.indexOf('?');
  const routeHash = queryIndex === -1 ? raw : raw.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : raw.slice(queryIndex + 1);
  const route = routeByHash.get(routeHash);
  return {
    route,
    routeHash,
    anchor: new URLSearchParams(query).get('anchor'),
    known: Boolean(route),
  };
}

function routeLabel(routeId) {
  return routeById.get(routeId)?.label ?? 'Guia';
}

function createExcerpt(text, query, radius = 72) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  const fragment = document.createDocumentFragment();
  let match = null;
  let pattern = null;

  try {
    pattern = new RegExp(accentInsensitivePattern(query), 'iu');
    match = pattern.exec(clean);
  } catch {
    pattern = null;
  }

  if (!match) {
    fragment.append(clean.slice(0, radius * 2));
    return fragment;
  }

  const start = Math.max(0, match.index - radius);
  const end = Math.min(clean.length, match.index + match[0].length + radius);
  if (start > 0) fragment.append('…');
  fragment.append(clean.slice(start, match.index));
  fragment.append(document.createElement('mark'));
  fragment.lastChild.textContent = clean.slice(match.index, match.index + match[0].length);
  fragment.append(clean.slice(match.index + match[0].length, end));
  if (end < clean.length) fragment.append('…');
  return fragment;
}

function setResultActive(options, index) {
  options.forEach((option, optionIndex) => {
    const active = optionIndex === index;
    option.classList.toggle('is-active', active);
    option.setAttribute('aria-selected', String(active));
  });
}

export function activityMatchesFilters(card, filters) {
  if (filters.area && card.dataset.area !== filters.area) return false;
  if (filters.format && card.dataset.format !== filters.format) return false;
  if (filters.ods) {
    const codes = new Set((card.dataset.ods || '').split(/\s+/u).filter(Boolean));
    if (card.dataset.odsAll !== 'true' && !codes.has(filters.ods)) return false;
  }
  return true;
}

export function initInteractions(model, rendered, elements) {
  const {
    contentRoot,
    navigationRoot,
    searchInput,
    searchResults,
    liveRegion,
    filterStatus,
    menuButton,
    navigationPanel,
    navigationBackdrop,
    navigationClose,
    themeButton,
    printButton,
    progressBar,
    skipLink = document.querySelector('.skip-link'),
  } = elements;

  const sections = new Map(rendered.routeSections.map((section) => [section.dataset.route, section]));
  const navLinks = new Map(rendered.navLinks.map((link) => [link.dataset.route, link]));
  const cleanups = [];
  let activeResultIndex = -1;
  let currentSearchResults = [];
  let lastDrawerFocus = null;
  let printState = null;

  function announce(message) {
    if (!liveRegion) return;
    liveRegion.textContent = '';
    scheduleFrame(() => {
      liveRegion.textContent = message;
    });
  }

  function focusTarget(target) {
    if (!target) return;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    target.scrollIntoView?.({ block: 'start', behavior: 'auto' });
  }

  function applyRoute({ focus = true, fallback = false } = {}) {
    const locationState = parseLocationHash();
    let route = locationState.route;
    let anchor = locationState.anchor;

    if (!route) {
      route = routeById.get('inicio');
      anchor = null;
      window.history.replaceState(null, '', route.hash);
      announce('Endereço não reconhecido. Foi aberto o início do guia.');
    }

    sections.forEach((section, id) => {
      const active = id === route.id;
      section.hidden = !active;
      const link = navLinks.get(id);
      if (active) link?.setAttribute('aria-current', 'page');
      else link?.removeAttribute('aria-current');
    });

    document.title = route.id === 'inicio'
      ? route.title
      : `${route.title} · Kit Agrupamento Sustentável`;

    if (focus) {
      const section = sections.get(route.id);
      const routeTitle = section?.querySelector('h1');
      const target = anchor ? document.getElementById(anchor) : routeTitle;
      scheduleFrame(() => focusTarget(target || routeTitle));
    }
    updateProgress();
    return route;
  }

  const onHashChange = () => applyRoute({ fallback: true });
  window.addEventListener('hashchange', onHashChange);
  cleanups.push(() => window.removeEventListener('hashchange', onHashChange));

  if (skipLink) {
    const onSkip = (event) => {
      event.preventDefault();
      contentRoot.focus();
      contentRoot.scrollIntoView?.({ block: 'start' });
    };
    skipLink.addEventListener('click', onSkip);
    cleanups.push(() => skipLink.removeEventListener('click', onSkip));
  }

  function drawerIsOpen() {
    return navigationPanel.dataset.open === 'true';
  }

  function openDrawer() {
    lastDrawerFocus = document.activeElement;
    navigationPanel.dataset.open = 'true';
    navigationBackdrop.hidden = false;
    menuButton.setAttribute('aria-expanded', 'true');
    document.body.classList.add('drawer-open');
    navigationClose.focus();
  }

  function closeDrawer({ restoreFocus = true } = {}) {
    if (!drawerIsOpen()) return;
    delete navigationPanel.dataset.open;
    navigationBackdrop.hidden = true;
    menuButton.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('drawer-open');
    if (restoreFocus && lastDrawerFocus instanceof HTMLElement) lastDrawerFocus.focus();
  }

  function toggleDrawer() {
    if (drawerIsOpen()) closeDrawer();
    else openDrawer();
  }

  menuButton.addEventListener('click', toggleDrawer);
  navigationClose.addEventListener('click', () => closeDrawer());
  navigationBackdrop.addEventListener('click', () => closeDrawer());
  navigationRoot.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeDrawer({ restoreFocus: false });
  });
  cleanups.push(
    () => menuButton.removeEventListener('click', toggleDrawer),
    () => navigationBackdrop.removeEventListener('click', closeDrawer),
  );

  function onDrawerKeydown(event) {
    if (!drawerIsOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDrawer();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(navigationPanel.querySelectorAll('a[href], button:not([disabled])')).filter((item) => !item.hidden);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  navigationPanel.addEventListener('keydown', onDrawerKeydown);
  cleanups.push(() => navigationPanel.removeEventListener('keydown', onDrawerKeydown));

  const wideScreen = globalThis.matchMedia?.('(min-width: 64rem)');
  const onWideScreen = (event) => {
    if (event.matches) closeDrawer({ restoreFocus: false });
  };
  wideScreen?.addEventListener?.('change', onWideScreen);
  cleanups.push(() => wideScreen?.removeEventListener?.('change', onWideScreen));

  function closeSearch({ restoreActive = false } = {}) {
    searchResults.hidden = true;
    searchResults.replaceChildren();
    searchInput.setAttribute('aria-expanded', 'false');
    searchInput.removeAttribute('aria-activedescendant');
    activeResultIndex = -1;
    currentSearchResults = [];
    if (restoreActive) searchInput.focus();
  }

  function renderSearchResults() {
    const query = searchInput.value.trim();
    if (!query) {
      closeSearch();
      return [];
    }

    const normalized = normalizeSearchText(query);
    const matches = rendered.searchEntries
      .filter((entry) => normalizeSearchText(`${entry.title} ${entry.text}`).includes(normalized))
      .slice(0, 12);
    const fragment = document.createDocumentFragment();
    currentSearchResults = matches;

    if (!matches.length) {
      const empty = document.createElement('div');
      empty.className = 'search-empty';
      empty.textContent = 'Nenhum resultado';
      fragment.append(empty);
      searchResults.replaceChildren(fragment);
      searchResults.hidden = false;
      searchInput.setAttribute('aria-expanded', 'true');
      announce('Nenhum resultado encontrado.');
      return matches;
    }

    matches.forEach((entry, index) => {
      const option = document.createElement('a');
      option.className = 'search-result';
      option.id = `search-result-${index}`;
      option.href = hrefForTarget(entry.route, entry.target);
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.dataset.route = entry.route;

      const route = document.createElement('span');
      route.className = 'search-result__route';
      route.textContent = routeLabel(entry.route);
      const title = document.createElement('strong');
      title.textContent = entry.title;
      const excerpt = document.createElement('span');
      excerpt.className = 'search-result__excerpt';
      excerpt.append(createExcerpt(entry.text, query));
      option.append(route, title, excerpt);
      fragment.append(option);
    });

    searchResults.replaceChildren(fragment);
    searchResults.hidden = false;
    searchInput.setAttribute('aria-expanded', 'true');
    activeResultIndex = -1;
    announce(`${matches.length}${matches.length === 12 ? '+' : ''} resultado${matches.length === 1 ? '' : 's'} encontrado${matches.length === 1 ? '' : 's'}.`);
    return matches;
  }

  function onSearchKeydown(event) {
    const options = Array.from(searchResults.querySelectorAll('[role="option"]'));
    if (event.key === 'Escape') {
      closeSearch({ restoreActive: true });
      return;
    }
    if (event.key === 'ArrowDown' && options.length) {
      event.preventDefault();
      activeResultIndex = (activeResultIndex + 1) % options.length;
      setResultActive(options, activeResultIndex);
      searchInput.setAttribute('aria-activedescendant', options[activeResultIndex].id);
      options[activeResultIndex].scrollIntoView?.({ block: 'nearest' });
    } else if (event.key === 'ArrowUp' && options.length) {
      event.preventDefault();
      activeResultIndex = activeResultIndex <= 0 ? options.length - 1 : activeResultIndex - 1;
      setResultActive(options, activeResultIndex);
      searchInput.setAttribute('aria-activedescendant', options[activeResultIndex].id);
      options[activeResultIndex].scrollIntoView?.({ block: 'nearest' });
    } else if (event.key === 'Enter' && activeResultIndex >= 0 && options[activeResultIndex]) {
      event.preventDefault();
      const selected = options[activeResultIndex];
      window.location.hash = selected.hash;
      closeSearch();
    }
  }

  searchInput.addEventListener('input', renderSearchResults);
  searchInput.addEventListener('keydown', onSearchKeydown);
  searchResults.addEventListener('click', () => closeSearch());
  cleanups.push(
    () => searchInput.removeEventListener('input', renderSearchResults),
    () => searchInput.removeEventListener('keydown', onSearchKeydown),
    () => searchResults.removeEventListener('click', closeSearch),
  );

  function onDocumentPointerDown(event) {
    if (!event.target.closest('.search')) closeSearch();
  }
  document.addEventListener('pointerdown', onDocumentPointerDown);
  cleanups.push(() => document.removeEventListener('pointerdown', onDocumentPointerDown));

  function onGlobalKeydown(event) {
    const target = event.target;
    const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
    if (event.key === '/' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  }
  document.addEventListener('keydown', onGlobalKeydown);
  cleanups.push(() => document.removeEventListener('keydown', onGlobalKeydown));

  const activityCards = Array.from(contentRoot.querySelectorAll('.activity-card'));
  const areaFilter = contentRoot.querySelector('#filter-area');
  const formatFilter = contentRoot.querySelector('#filter-format');
  const odsFilter = contentRoot.querySelector('#filter-ods');
  const clearFilters = contentRoot.querySelector('#clear-filters');
  const activityCount = contentRoot.querySelector('#activity-count');
  const filterEmpty = contentRoot.querySelector('#filter-empty');

  function applyActivityFilters({ announceResult = true } = {}) {
    const filters = {
      area: areaFilter?.value ?? '',
      format: formatFilter?.value ?? '',
      ods: odsFilter?.value ?? '',
    };
    let visible = 0;
    activityCards.forEach((card) => {
      const matches = activityMatchesFilters(card, filters);
      card.hidden = !matches;
      if (matches) visible += 1;
    });

    contentRoot.querySelectorAll('.activity-area').forEach((area) => {
      area.hidden = !Array.from(area.querySelectorAll('.activity-card')).some((card) => !card.hidden);
    });

    if (activityCount) activityCount.textContent = `${visible} de ${activityCards.length} atividades`;
    if (filterEmpty) filterEmpty.hidden = visible !== 0;
    if (clearFilters) clearFilters.disabled = !filters.area && !filters.format && !filters.ods;
    if (announceResult) {
      const message = `${visible} ${visible === 1 ? 'atividade disponível' : 'atividades disponíveis'}.`;
      if (filterStatus) filterStatus.textContent = message;
      else announce(message);
    }
    return visible;
  }

  function clearAllFilters() {
    if (areaFilter) areaFilter.value = '';
    if (formatFilter) formatFilter.value = '';
    if (odsFilter) odsFilter.value = '';
    applyActivityFilters();
    areaFilter?.focus();
  }

  [areaFilter, formatFilter, odsFilter].filter(Boolean).forEach((control) => {
    control.addEventListener('change', () => applyActivityFilters());
  });
  clearFilters?.addEventListener('click', clearAllFilters);
  applyActivityFilters({ announceResult: false });
  cleanups.push(() => clearFilters?.removeEventListener('click', clearAllFilters));

  let currentTheme = safeStorageGet(availableStorage());
  if (!['light', 'dark'].includes(currentTheme)) currentTheme = getSystemTheme();

  function paintThemeButton() {
    const dark = currentTheme === 'dark';
    themeButton.setAttribute('aria-pressed', String(dark));
    themeButton.setAttribute('aria-label', dark ? 'Ativar tema claro' : 'Ativar tema escuro');
    themeButton.firstElementChild.textContent = dark ? '☀' : '☾';
  }

  function applyTheme(theme, persist = false) {
    currentTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = currentTheme;
    if (persist) safeStorageSet(availableStorage(), currentTheme);
    paintThemeButton();
  }

  function toggleTheme() {
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark', true);
    announce(`Tema ${currentTheme === 'dark' ? 'escuro' : 'claro'} ativado.`);
  }

  themeButton.addEventListener('click', toggleTheme);
  cleanups.push(() => themeButton.removeEventListener('click', toggleTheme));
  applyTheme(currentTheme);

  const colorScheme = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  const onColorScheme = (event) => {
    const stored = safeStorageGet(availableStorage());
    if (!stored) applyTheme(event.matches ? 'dark' : 'light');
  };
  colorScheme?.addEventListener?.('change', onColorScheme);
  cleanups.push(() => colorScheme?.removeEventListener?.('change', onColorScheme));

  function updateProgress() {
    const denominator = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = denominator > 0 ? Math.min(1, Math.max(0, window.scrollY / denominator)) : 0;
    progressBar.style.transform = `scaleX(${ratio})`;
  }

  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress, { passive: true });
  cleanups.push(
    () => window.removeEventListener('scroll', updateProgress),
    () => window.removeEventListener('resize', updateProgress),
  );

  function prepareForPrint() {
    if (printState) return;
    printState = {
      routes: rendered.routeSections.map((section) => [section, section.hidden]),
      details: Array.from(contentRoot.querySelectorAll('details')).map((details) => [details, details.open]),
      activities: activityCards.map((card) => [card, card.hidden]),
      areas: Array.from(contentRoot.querySelectorAll('.activity-area')).map((area) => [area, area.hidden]),
    };
    document.documentElement.classList.add('is-printing');
    rendered.routeSections.forEach((section) => { section.hidden = false; });
    contentRoot.querySelectorAll('details').forEach((details) => { details.open = true; });
    activityCards.forEach((card) => { card.hidden = false; });
    contentRoot.querySelectorAll('.activity-area').forEach((area) => { area.hidden = false; });
  }

  function restoreAfterPrint() {
    if (!printState) return;
    printState.routes.forEach(([section, hidden]) => { section.hidden = hidden; });
    printState.details.forEach(([details, open]) => { details.open = open; });
    printState.activities.forEach(([card, hidden]) => { card.hidden = hidden; });
    printState.areas.forEach(([area, hidden]) => { area.hidden = hidden; });
    document.documentElement.classList.remove('is-printing');
    printState = null;
    updateProgress();
  }

  function printDocument() {
    prepareForPrint();
    try {
      window.print();
    } catch {
      restoreAfterPrint();
    }
  }

  window.addEventListener('beforeprint', prepareForPrint);
  window.addEventListener('afterprint', restoreAfterPrint);
  printButton.addEventListener('click', printDocument);
  cleanups.push(
    () => window.removeEventListener('beforeprint', prepareForPrint),
    () => window.removeEventListener('afterprint', restoreAfterPrint),
    () => printButton.removeEventListener('click', printDocument),
  );

  applyRoute({ fallback: true });

  return {
    applyRoute,
    applyActivityFilters,
    clearAllFilters,
    closeSearch,
    normalizeSearchText,
    openDrawer,
    closeDrawer,
    prepareForPrint,
    restoreAfterPrint,
    printDocument,
    updateProgress,
    get currentRoute() {
      return parseLocationHash().route?.id ?? 'inicio';
    },
    get theme() {
      return currentTheme;
    },
    destroy() {
      cleanups.forEach((cleanup) => cleanup());
    },
  };
}
