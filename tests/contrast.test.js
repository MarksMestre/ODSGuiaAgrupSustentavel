import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import progressConfig from '../content.config.json' with { type: 'json' };

const css = readFileSync('src/styles.css', 'utf8');

/** Variáveis CSS declaradas num selector. */
function cssVariables(selector) {
  const at = css.indexOf(selector);
  if (at === -1) return {};
  const block = css.slice(at, css.indexOf('}', at));
  const found = {};
  for (const [, name, value] of block.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{3,6})/gu)) {
    found[name] = value;
  }
  return found;
}

const light = cssVariables(':root {');
const dark = cssVariables(':root[data-theme="dark"] {');

/** Luminância relativa, conforme WCAG 2.1. */
function luminance(colour) {
  const hex = colour.replace('#', '');
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const channels = [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((value) => (
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

const ACCENTS = ['--progress-1-accent', '--progress-2-accent', '--progress-3-accent', '--progress-4-accent'];

describe('contraste do Progresso Pessoal', () => {
  it.each([
    ['claro', light],
    ['escuro', dark],
  ])('os acentos das Secções chegam a 3:1 no tema %s', (_theme, palette) => {
    const backgrounds = [palette['--paper'], palette['--paper-soft']];
    for (const name of ACCENTS) {
      const accent = palette[name];
      expect(accent, `${name} não está definido`).toMatch(/^#[0-9a-fA-F]{6}$/u);
      const worst = Math.min(...backgrounds.map((background) => contrast(accent, background)));
      expect(worst, `${name} (${accent})`).toBeGreaterThanOrEqual(3);
    }
  });

  it.each([
    ['claro', light],
    ['escuro', dark],
  ])('o texto do tema mantém contraste AA no tema %s', (_theme, palette) => {
    for (const background of [palette['--paper'], palette['--paper-soft']]) {
      expect(contrast(palette['--ink'], background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('nenhuma cor de Secção é usada como fundo de texto', () => {
    // As cores do CNE não passam WCAG: #FDD400 com branco dá 1,44:1. Por isso
    // entram como acento e nunca como `background` ou `color` de texto.
    for (const meta of progressConfig.progress.sections) {
      expect(contrast(meta.color, '#ffffff'), `${meta.tab} ${meta.color}`).toBeLessThan(4.5);
    }
    // O acento só pode aparecer em `border`, `background` de marcador ou `outline`.
    // As únicas propriedades que podem receber o acento: a barra lateral da
    // Secção e o marcador. `color` nunca, porque a cor do texto é a do tema.
    const uses = [...css.matchAll(/([\w-]+)\s*:\s*var\(--progress-\d-accent\b/gu)]
      .map((match) => match[1]);
    expect(uses.length).toBeGreaterThan(0);
    for (const property of new Set(uses)) {
      expect(['border-inline-start-color', 'background'], `propriedade "${property}"`).toContain(property);
    }
  });

  it('usa as quatro Secções da configuração, por ordem', () => {
    expect(progressConfig.progress.sections.map((section) => section.tab))
      .toEqual(['1Sec', '2Sec', '3Sec', '4Sec']);
    expect(ACCENTS).toHaveLength(progressConfig.progress.sections.length);
  });

  it('as Secções distinguem-se sem depender só da cor', () => {
    // O nome e a branch são sempre renderizados; a cor é um acento. A faixa
    // etária continua válida na configuração — é o registo do quadro do CNE e
    // alimenta o artefacto de taxonomia — mas já não é mostrada no site.
    for (const meta of progressConfig.progress.sections) {
      expect(meta.label).toMatch(/Secção/u);
      expect(meta.branch).toBeTruthy();
      expect(meta.ages).toMatch(/^\d+–\d+$/u);
    }
    const branches = progressConfig.progress.sections.map((section) => section.branch);
    expect(new Set(branches).size).toBe(4);
  });
});