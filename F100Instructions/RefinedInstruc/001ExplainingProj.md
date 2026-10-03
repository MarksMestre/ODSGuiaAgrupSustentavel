# 001 — Refined Specification: Kit Agrupamento Sustentável

**Status:** refined from [`F100Instructions/001ExplainingProj.md`](../001ExplainingProj.md)
**Scope:** build the interactive platform from `source1.docx`, `source2.docx`, `gamesSource.docx`; generate one game sheet per game; exclude the Influencers section.
**Supersedes:** nothing. **Refines:** the original brief. Where the two disagree, this document wins.

---

## 0. Decision log

These four points were open in the original brief. They are now settled; do not re-open them without an explicit instruction.

| ID | Decision | Rationale |
|----|----------|-----------|
| **D1** | Games are **Capítulo 7** (`Jogos e Workshops`); Influencers is **Capítulo 8** and is excluded from the site. | Matches the printed table of contents in `source1.docx` and the existing `src/content/source-map.js`. The original brief's "Section 6 / Section 7" is treated as an off-by-one in prose, not as a renumbering request. |
| **D2** | A Python stage **rebuilds `file.md`** and feeds the **existing** parser/renderer/interactions pipeline unchanged. | `parser.js`, `source-map.js`, `check-content.mjs` and all tests are hard-wired to a single flattened Markdown source. Replacing that with JSON would rewrite ~1 400 lines of working, tested code for no user-visible gain. |
| **D3** | Game sheets are emitted as **`{n}Game.md`** (canonical, versionable) **plus `{n}Game.html`** (print view). | Markdown is diffable, greppable and feeds the site's existing `markdown-it` pipeline. The HTML sibling lets a leader print a paper field sheet without ever opening Markdown. Avoids `.docx` round-tripping and binary diff-hostility. |
| **D4** | The template's **`Progresso / Sistema de Especialidades`** row is filled with a visible placeholder and reported in the build report. | No source document contains this data. Silently dropping the row would hide a real content gap; blocking the build would stall the whole site on one optional field. |

---

## 1. Non-negotiables

1. **Stack is fixed.** Vite + vanilla ES modules. No UI framework, no TypeScript, no CSS framework. `package.json` dependencies stay as they are (`markdown-it`, `katex`, `dompurify`) plus dev deps (`vite`, `vitest`, `jsdom`).
2. **Editorial content is never hardcoded in components.** Text lives in generated/authored content files; `src/content/*` only interprets structure.
3. **Language is European Portuguese** (`lang="pt-PT"`). Preserve the escutista register: *agrupamento*, *animador*, *secção*, *subunidade*, *acampamento*, *campo*. Use the second-person plural (*o teu regroupamento / a tua secção*) as the source does. Do not import `PT-BR` spellings or Brazilian grammatical forms.
4. **Capítulo 8 — Espaço Influencers is out of scope.** Its content must not appear in routes, navigation, search index, sitemap or `file.md` output consumed by the site.
5. **Accessibility is a requirement, not a polish step.** WCAG 2.1 AA: keyboard operation of the whole navbar and every game filter, visible focus, `aria-current` on the active route, live-region announcements, `prefers-reduced-motion`, `prefers-contrast`, `forced-colors`, and a print stylesheet that produces usable paper output.
6. **Portuguese is the only locale.** Do not add an i18n framework.
7. **Everything must be re-runnable.** A non-technical editor must be able to change a `.docx`, run one command, and get a correct site.

---

## 2. Source inventory (measured, not assumed)

All figures below were read directly from the files. Do not re-derive them by hand; the build report regenerates them.

| File | Paragraphs (non-empty) | Tables | Text boxes | Notes |
|------|------------------------|--------|-----------|-------|
| `source/source1.docx` | 221 | 0 | 192 | Cover, glossary, TOC, Cap. 1–4 (partially) |
| `source/source2.docx` | 254 | 0 | 0 | Cap. 4 (rest), 5, 6, bibliography |
| `source/gamesSource.docx` | 749 | 2 top-level (+2 nested in text boxes) | 176 | Cap. 7 — 29 games |
| `source/games/00GameSheetTemplate.docx` | 0 | 1 (7×2) | 0 | Field-label schema |

### 2.1 Chapter → file mapping

| Chapter | Title | Source |
|---------|-------|--------|
| — | Capa, ficha técnica, Nota Legal | `source1.docx` |
| — | Siglas e Abreviaturas / Estrangeirismos / Designações escutistas | `source1.docx` |
| — | Índice Geral | `source1.docx` |
| 1 | Introdução ao Kit Agrupamento Sustentável | `source1.docx` |
| 2 | Os Objetivos de Desenvolvimento Sustentável e o Escutismo (2.1–2.3) | `source1.docx` |
| 3 | Guia para uma Sede Sustentável (3.1 Área Educativa, 3.2 Área Operacional) | `source1.docx` |
| 4 | Guia para um Acampamento Sustentável (10 passos) | `source1.docx` → `source2.docx` |
| 5 | Como Criar um Projeto ODS (10 passos) | `source2.docx` |
| 6 | Como Criar uma Parceria para a Sustentabilidade (10 passos) | `source2.docx` |
| 7 | Jogos e Workshops — Oferta Pedagógica | `gamesSource.docx` |
| 8 | Espaço Influencers | **EXCLUDED** |
| — | Bibliografia, Materiais & Ferramentas | `source2.docx` |

`source1.docx` and `source2.docx` are a **continuous split of one document** (page numbers run 5→31 then 26→43; the Cap. 4 step "Localização e Campo e Transporte" opens `source2.docx`). Concatenate in that order; never reorder or interleave.

---

## 3. Blocker: `file.md` cannot be mechanically flattened

This is the most important finding in this specification and it dictates the whole architecture.

### 3.1 Current repository state

`git status` reports `file.md` as **deleted**. It was the sole editorial source and is still referenced by:

- `src/main.js:3` — `import source from '../file.md?raw'`
- `scripts/check-content.mjs:17` — `readFileSync(new URL('../file.md', ...))`
- `vite.config.js:12` — `sourceFallbackPlugin()` emits `./file.md` as the no-JavaScript fallback
- `index.html:85` — the `<noscript>` link to `./file.md`
- `README.md` — describes it as the immutable editorial source

`npm run build`, `npm run check:content` and `npm test` all fail today. This must be fixed before any site work.

### 3.2 Why a straight docx → Markdown dump will not satisfy the parser

`src/content/source-map.js` asserts structural markers that **do not exist in any of the three DOCX files**. Verified by direct string search of `word/document.xml`:

| Asserted by `source-map.js` | Present in the DOCX? |
|---|---|
| `'PrincípioODS CorrespondentesFoco Principal'` (5 P's table, 5 rows) | **No.** `Princípio`, `ODS Correspondentes`, `Foco Principal` appear nowhere. The 5 P's exist only as five prose lines. |
| `'Os 10 Passos do Acampamento Sustentável'` (ASCII diagram) | **No.** Only the heading `10 Passos paRa planeaR un AcampamenTo SusTenTÁvel`. |
| `'[1. Explorar] ──> [2. Identificar] ──> …'` (parceria diagram, 4 box-drawing diagrams total) | **No.** |
| `'                  ┌────────────────────────────────────────┐'` (Catálogo 30 box diagram) | **No.** |
| `ECONOMICS_TABLE` 11 rows, `'Categoria de DespesaCustoPontos de Estatuto Social'` | Table exists in `gamesSource.docx` but as a 14×11 Word grid with merged cells, not as flattened text. |
| Normalised chapter headings, e.g. `'Capítulo 3: Guia para uma Sede Sustentável'` | Present, but **inside text boxes** — see §3.3. |

The original `file.md` was therefore a **hand-curated rewrite**: tables were authored, diagrams were re-drawn as ASCII art, headings and the glossary were restructured, and the reference list was reformatted. Roughly 120 `<w:drawing>` and 88 `<w:pict>` elements in `source1.docx` confirm the original diagrams are **images**, not text.

**Conclusion:** the pipeline must be *generated body + authored overlay*, not a full auto-flatten. Automating 100 % of `file.md` is not achievable and must not be attempted.

### 3.3 Text boxes must be traversed

Chapter titles (`Capítulo 1: …` … `Capítulo 8: …`, `Jogos e Workshops`, `Espaço Influencers`) exist in `word/document.xml` but are **not** returned by `python-docx`'s `document.paragraphs`, because they live in `w:txbxContent` inside `mc:AlternateContent` (`source1.docx`: 192 text boxes, 176 `AlternateContent`; `gamesSource.docx`: 176 / 352).

The extractor must therefore walk the raw OOXML tree, not `document.paragraphs`, and must:

- descend into `w:txbxContent`;
- when handling `mc:AlternateContent`, read **`mc:Choice` only** and discard `mc:Fallback`, otherwise every boxed string is emitted twice;
- preserve reading order relative to body paragraphs (box anchors by the offset of their containing paragraph).

A naive `python-docx` extraction silently loses all chapter headings. This was verified: `document.paragraphs` yields `Capítulo 5` / `Capítulo 6` in `source2.docx` but returns **no** chapter headings at all for `source1.docx` and `gamesSource.docx`.

### 3.4 Required architecture

```
source/*.docx  ──►  [Python: extract + clean]  ──►  build/extracted/*.json
                                                        │
source/authored/*.md (hand-curated overlay) ───────────┤
                                                        ▼
                                              [Python: assemble]  ──►  file.md
                                                                        │
source/gamesSource.docx ──► [Python: game sheets] ──► source/games/{n}Game.md + .html
                                                                        │
                                                                        ▼
                                        Vite app: parser.js → renderer.js → interactions.js
                                                                        │
                                                                        ▼
                                                          npm run check:content  (gate)
```

---

## 4. Stage A — Python editorial pipeline

### 4.1 Module layout

Add under `scripts/`, alongside the existing `check-content.mjs` (do not create a competing top-level folder):

| File | Responsibility |
|------|----------------|
| `scripts/content/__init__.py` | Package marker |
| `scripts/content/config.py` | Loads `content.config.json`, resolves paths, validates |
| `scripts/content/ooxml.py` | Low-level OOXML walk: paragraphs, text boxes, tables, merged cells, reading order |
| `scripts/content/clean.py` | Text normalisation: casing, hyphenation, artefacts, whitespace |
| `scripts/content/structure.py` | Recognises chapters, sub-sections, steps, activity fields |
| `scripts/content/flatten.py` | Emits the Markdown body for `file.md` |
| `scripts/content/games.py` | Parses the 29 games + assigns areas + reads the template schema |
| `scripts/content/assemble.py` | Merges generated body + authored overlay into `file.md` |
| `scripts/content/report.py` | Builds the JSON + human-readable build report |
| `scripts/build_content.py` | **Single entry point** (`python scripts/build_content.py`) |
| `scripts/requirements.txt` | `python-docx>=1.2`, `lxml>=5.0` |

`content.config.json` lives at the repository root and is the **only** file a non-coder needs to edit for paths, toggles and naming. Keep every magic string out of the `.py` files.

### 4.2 Cleanliness and reproducibility

- Python 3.11+ standard library plus the two pinned deps. Target a `.venv` created by `scripts/setup_env.cmd`.
- `build_content.py` must be **idempotent**: two consecutive runs on unchanged inputs produce byte-identical output. Verify with `git diff --exit-code`.
- Writes are atomic (temp file + `os.replace`) so an interrupted run cannot leave a half-written `file.md`.
- Non-zero exit code on any error; warnings do not fail the build but are always listed in the report.

### 4.3 Text normalisation rules (`clean.py`)

These are all observed defects in the sources; each needs a deterministic rule.

| Defect | Example in source | Rule |
|---------|-------------------|------|
| **Baked-in small-caps casing** | `DRAmATizAçÃO`, `NEgOciAR nA ONU`, `JOgO dOs SAlários`, `CApíTulo 5` | Not a `w:smallCaps` run property (0 occurrences) — the casing is literally in the text. Recover title case by upper-casing a letter only when it is word-initial or follows a non-letter. Preserve deliberate acronyms (`ODS`, `CNE`, `OMME`, `ONU`, `ONGD`, `GEE`, `KPI`, `LED`, `PE`, `BP`, `DGS`, `UE`) via an allow-list. Handle titles split across two paragraphs before normalising. |
| **Intra-word hyphenation** | `con-teúdos`, `subuni-dade`, `de-terminada` → `conteúdos`, `subunidade`, `determinada` | Join when the hyphen sits between two lowercase letters and the joined form is a word; keep genuine hyphens (`Eco-labels`, `não-formais`, `5 R's`) — rule: keep the hyphen when either side is uppercase, or the token is in the keep-list. |
| **Run-together words** | `concebidapara` | Detect and split only with an explicit dictionary of observed joins. Never guess. |
| **Page-number artefacts** | Paragraphs containing only `44`, `45`, `96` in style `Normal` | Drop any paragraph whose entire content is an integer 1–200 and whose neighbours are blank. |
| **Stray numbering in headings** | `2.1` in a `Normal` paragraph immediately before a `Heading 3` | Merge the numeric prefix into the heading and drop the standalone paragraph. |
| **TOC lines** | `Capítulo 1: Introdução ao Kit Agrupamento Sustentável\t5` | Detect the TOC block (tab + trailing page number) and use it to *validate* chapter order, never to emit body text. |
| **Inline URLs** | `http://www.footprintcalculator.org` | Autolink and route through `sanitizeUrl()`; keep the visible text. |
| **Run-in fields** | Games 12 and 17 pack `Formato:`, `Número de participantes:`, `Duração:` into one paragraph | Split on the known label set before field extraction (§5.3). |
| **Merged table cells** | `gamesSource.docx` 14×11 grid repeats merged cell text across columns | De-duplicate by grid span (`w:gridSpan`, `w:vMerge`) so each logical cell appears once. |

Anything not covered by a rule above must be **surfaced in the report as `unclassified`**, not silently dropped. Silent loss of editorial content is the primary failure mode to avoid.

### 4.4 `file.md` assembly contract

`file.md` must satisfy, byte-for-byte where applicable:

1. Every literal marker string in `src/content/source-map.js` (`TOP_LEVEL_MARKERS`, `CHAPTERS[].heading`, `OPENING_FIELDS`, `GLOSSARY_GROUPS`, `INDEX_ENTRIES`, `CHAPTER_2_5P_TABLE`, `CHAPTER_4/5/6/7_DIAGRAM`, `ACTIVITY_FIELDS`, `ECONOMICS_TABLE`, `REFERENCE_ENTRIES`, `TOOL_ENTRIES`, `VALID_MATH`).
2. Every count in `EXPECTED_COUNTS` (`routes: 12`, `glossaryGroups: 3`, `glossaryEntries: 19`, `chapter7Areas: 5`, `chapter7Activities: 30`, `chapter8Areas: 5`, `bibliographyEntries: 8`, `tools: 2`, `diagrams: 4`, `dollarSpans: 19`, `validMathSpans: 6`, `currencySpans: 13`).
3. Node contiguity: `parser.js` requires the concatenated node `sourceText` to reproduce the source **exactly**, with no gaps and correct `sourceOffset` values.

**Execution order is mandatory:** generate → run `npm run check:content` → fix the discrepancy at its true origin. Never edit `dist/`, never loosen `source-map.js` to silence a failure, and never hand-patch `file.md` (it is generated). If a marker genuinely no longer exists because the editorial source changed, update `source-map.js` **deliberately and in the same commit**, as `README.md` already prescribes.

### 4.5 Authored overlay

Content that cannot be derived from the DOCX lives in `source/authored/`, one Markdown file per concern, each with a header comment explaining what it is and why it is manual:

| File | Supplies |
|------|----------|
| `source/authored/00-ficha-tecnica.md` | Cover fields, `OPENING_FIELDS` labels, Nota Legal |
| `source/authored/01-glossario.md` | The three glossary groups and 19 terms |
| `source/authored/02-indice.md` | `Índice Geral` entries and their targets |
| `source/authored/03-tabela-5ps.md` | The 5 P's table (3 columns × 5 rows) |
| `source/authored/04-diagramas.md` | The 4 ASCII diagrams |
| `source/authored/05-referencias.md` | 8 bibliography entries + 2 tools |
| `source/authored/06-ods17.md` | The 17 ODS with pt-PT names, colours and icons, for game filtering |

If an overlay file is missing, the build **fails** with a clear message naming the file. A silently missing overlay would produce a subtly wrong site.

---

## 5. Game sheet generation (Capítulo 7)

### 5.1 Input and template

- Source: `source/gamesSource.docx` → exactly **29** games at `Heading 1`.
- Template: `source/games/00GameSheetTemplate.docx` → one 7×2 table. Column 0 holds the labels, column 1 is the empty value cell.

**The template is the schema, read at runtime.** The generator must open `00GameSheetTemplate.docx`, read the label in each row's first cell, and map source fields onto whatever labels are present. Labels must **not** be hardcoded, so that editing the template in Word changes the output with no code change. If the template gains or loses a row, the build adapts and reports the change.

### 5.2 Label → source field mapping

| Template row label | Source in `gamesSource.docx` | Coverage |
|---|---|---|
| `Nome do Jogo` | `Heading 1` title, casing-normalised | 29/29 |
| `Objetivos de Desenvolvimento Sustentável` | `ODS:` | 29/29 |
| `Progresso` / `Sistema de Especialidades` | **no source exists** | 0/29 → placeholder (**D4**) |
| `Objetivos` | `Objetivos:` | 29/29 |
| `Duração e Participantes` | `Formato:` + `Número de participantes:` + `Duração:` | `Formato` 29/29; participants and duration **27/29** |
| `Material` | `Material:` | 29/29 |
| `Instruções` | `Instruções:` (plus variant labels, §5.3) | 28/29 |

Note the **merge**: the template has one `Duração e Participantes` row but the source has three separate fields, and the template has **no** `Formato` row. Decision: `Formato` is rendered as a bolded lead-in inside the `Duração e Participantes` cell (`**Formato:** Presencial/Online`), preserving the information without inventing a template row.

### 5.3 Field irregularities that must be handled

| Game | Irregularity | Handling |
|------|--------------|----------|
| #12 `Qual o Tamanho da Tua Pegada?` | `Formato:`, `Número de participantes:`, `Duração:` all in **one** paragraph | Run-in field splitter |
| #17 `O Orçamento nas Tuas Mãos` | Same run-in paragraph | Run-in field splitter |
| #25 `Jogo do Quim dos ODS` | `Instruções:` label **absent**; instead `Instruções para formato presencial:` **and** `Instruções para formato virtual:` | Both variants concatenate into the `Instruções` cell under their own sub-headings. **This game legitimately has two formats.** |
| All | `ODS:` values include `Todos` and `Todos.` (games 24, 27, 28) | Normalise to the full 17-ODS list for filtering; render as `Todos os ODS` |
| Several | Titles split over two paragraphs (`O cAminhO` + `pARA A TERRA dA IguAldAdE`, `PEixinhO` + `dAs DEsiguAldAdEs`, `O mundO` + `Sem Todos os Empregos`, …) | Join before normalising, using the line-break-within-`Heading 1` pattern |
| #15 `Jogo dos Salários` | Nested 14×11 economics table | Emit as a Markdown table inside the relevant cell; preserve the anomalous source row verbatim |
| #29 `Negociar na ONU` | Nested 15×1 role list | Emit as a list |

Missing values render as `—` plus a report entry. Never invent content.

### 5.4 Area assignment

`gamesSource.docx` contains **no area headings** — the five areas are only named in `source1.docx`'s table of contents. Membership is therefore **data, not derivation**.

`build_content.py` generates `content/games-map.json` on first run from document order (6 per area, in the printed order Pessoas → Planeta → Prosperidade → Paz → Parcerias), then treats it as editable. A non-coder adds a game by dropping it into the DOCX and either appending it in the right place or editing `content/games-map.json`; the mapping is never hardcoded in Python.

### 5.5 Output

Naming follows the brief: `source/games/{n}Game.{extension}`, `n ∈ [0, 30]`.

| File | Purpose |
|------|---------|
| `source/games/00GameSheetTemplate.docx` | `n = 0`, the untouched template |
| `source/games/01Game.md` … `29Game.md` | Canonical sheets, numbered by document order |
| `source/games/NNGame.html` | Print view of the same data, one self-contained file, `@media print` ready |
| `content/games-map.json` | Stable `n` → title/area/slug map |

**Numbering must be stable.** Once assigned, a game's `n` never changes, even if games are reordered in the DOCX later; `games-map.json` owns the identity and the generator reconciles by normalised title. New games take the next free `n`. Deleting a game leaves a gap rather than renumbering, so external links stay valid. Out-of-range or duplicate `n` values are hard errors.

Markdown shape, following the template's row order:

```markdown
# 01Game

| Campo | Valor |
| --- | --- |
| Nome do Jogo | Dramatização de Realidades |
| Objetivos de Desenvolvimento Sustentável | 1 |
| Progresso / Sistema de Especialidades | *A preencher pelo animador.* |
| Objetivos | Contribuir para a reflexão sobre as desigualdades… |
| Duração e Participantes | **Formato:** Presencial. **Participantes:** 13. **Duração:** 1 hora. |
| Material | Caraterização das personagens. |
| Instruções | 1. … |
```

### 5.6 Build report

`build/content-report.json` plus a readable console summary:

```json
{
  "generatedAt": "…",
  "sources": [{ "file": "source/gamesSource.docx", "sha256": "…", "paragraphs": 749 }],
  "games": { "expected": 30, "found": 29, "sheets": 29, "byArea": { "Pessoas": 6, "Planeta": 6, "Prosperidade": 6, "Paz": 6, "Parcerias": 5 } },
  "missing": [{ "game": "…", "field": "Duração", "sheet": "12Game.md" }],
  "placeholders": [{ "sheet": "01Game.md", "field": "Progresso / Sistema de Especialidades" }],
  "unclassified": [],
  "errors": []
}
```

### 5.7 Missing game — needs an editorial answer

`source-map.js` lists **30** activities, including **`Descobre +ODS`**, in the *Parcerias* area. That game is **absent from `gamesSource.docx`** (the strings `Descobre` and `+ODS` do not occur in the file). The source's own introduction also promises "30 jogos".

Three options; pick one before `check-content.mjs` can pass:

- **(a)** Supply the missing `Descobre +ODS` content and add it to `gamesSource.docx`. Keeps `chapter7Activities: 30`, gives *Parcerias* 6 games, and satisfies the printed promise. **Recommended.**
- **(b)** Confirm the kit is really 29 games. Then update `EXPECTED_COUNTS.chapter7Activities` to `29` and `CHAPTER7_AREAS[4]` to 5 activities **in the same commit**, and correct the "30 jogos" sentence in the source.
- **(c)** Leave a placeholder game. Rejected: it fabricates content.

---

## 6. Stage B — the site

### 6.1 Navbar

The existing navbar is a slide-in drawer (`#navigation-panel` + `#menu-button`) that becomes a persistent sidebar at ≥ 64 rem. **Keep that component and its behaviour.** Do not introduce a second navigation pattern.

Requirements:

1. Generated from `ROUTES` in `source-map.js` — never hand-written markup in `index.html`.
2. Grouped, with the group headings coming from the route list:

   ```
   Início
   Glossário · Índice geral
   1 Introdução ao Kit Agrupamento Sustentável
   2 Os ODS e o Escutismo
   3 Guia para uma Sede Sustentável
   4 Guia para um Acampamento Sustentável
   5 Como Criar um Projeto ODS
   6 Como Criar uma Parceria para a Sustentabilidade
   7 Jogos e Workshops          ◀ own group, see 6.2
   Bibliografia e ferramentas
   ```

3. **Jogos e Workshops is a first-class navbar group**, expandable to the five areas and, under each, its games. This satisfies the brief's "this section needs to be navigable in the navbar".
4. `aria-current="page"` on the active route; `aria-expanded` on group toggles; `aria-controls` wired to the panel id.
5. Full keyboard support: `Tab` order, `Enter`/`Space` activation, `Esc` to close and return focus to `#menu-button`, arrow-key traversal within the drawer, and a visible focus ring that survives `forced-colors`.
6. `Cap 7` active state must survive a deep link into a specific game (`#/jogo/15`).
7. The drawer must not trap focus or scroll-lock incorrectly on desktop, where it is a static sidebar.

### 6.2 Routes

Hash routing (`#/…`) stays — it is what allows deployment to any static host without rewrite rules.

| Route | Page |
|-------|------|
| `#/inicio` … `#/capitulo/6` | Existing chapters, unchanged behaviour |
| `#/capitulo/7` | Games hub: the 5 areas, filters, cards |
| `#/jogo/{n}` | Single game, rendered from `source/games/{n}Game.md` |
| `#/referencias` | Bibliografia, Materiais & Ferramentas |
| `#/ficha/{n}.html` | Opens the printable sheet (new tab, `rel="noopener"`) |

`#/jogo/{n}` resolves `n` through `content/games-map.json` for title, area and ODS. Unknown `n` → a styled "Jogo não encontrado" page with a link back to the hub, not a crash. The 30th slot may legitimately be empty (§5.7 option b).

### 6.3 Game discovery on the hub

- Cards showing title, area badge, ODS chips, format, duration, participant count.
- Filters, reusing the existing `renderFilters()` / `activityMatchesFilters()` machinery: **área** (5 values) and **ODS** (17 values + "Todos"). Filtering must announce results via `#filter-status` and must be keyboard and screen-reader operable.
- ODS colour coding reuses the `:root` custom properties in `styles.css`; add no new palette.
- Each card links to `#/jogo/{n}` **and** offers "Imprimir ficha" → `#/ficha/{n}.html`.

### 6.4 Search

`interactions.js` already builds an accent-insensitive index over the parsed model. Extend it to include the game sheets so `Duracao`, `pegada`, `Quim` etc. are findable. Results must be grouped by page and must deep-link to `#/jogo/{n}`.

### 6.5 Print

`@media print` must yield: no drawer, no search, no filter controls, no progress bar; the active chapter only; URLs revealed for external links; and a "print all sheets" affordance that produces one game per page.

### 6.6 Excluded content

Capítulo 8 must not appear in: `ROUTES`, `source-map.js` chapters, `file.md`, the search index, the sitemap, or any footer link. Add an automated assertion so a regression is caught — see §7.2.

---

## 7. Verification

### 7.1 Commands

Add to `package.json`:

```json
{
  "content:setup":  "scripts\\setup_env.cmd",
  "content:build":  "python scripts/build_content.py",
  "content:check":  "python scripts/build_content.py --check",
  "content:report": "python scripts/build_content.py --report-only",
  "prebuild":       "npm run content:build",
  "prevalidate":    "npm run content:build"
}
```

`--check` regenerates into a temp directory and diffs against the committed output, so it is safe in CI.

The existing chain becomes:

```
npm run content:build   →  npm run check:content  →  npm test  →  npm run build
```

`scripts/check-content.mjs` remains the **independent** parity gate and stays independent of the Python stage — two implementations must not share a bug. Extend it, do not weaken it.

### 7.2 New automated assertions

Add to `check-content.mjs` (Node side, so it validates what the site actually receives):

1. No occurrence of Influencers markers (`Espaço Influencers`, `Capítulo 8`) in `file.md`, in the DOM, or in any route hash.
2. Exactly one `<h1>` per route; heading levels never skip.
3. Every `id` unique (already present — keep).
4. Every navbar link resolves to a real route **and** a real element id.
5. Exactly `content/games-map.json` many game sheets exist, `01…NN` contiguous, no gaps beyond declared deletions.
6. Each `.md` sheet has all 7 template rows in template order.
7. Every sheet's title matches its entry in `games-map.json`.
8. No unresolved `A preencher pelo animador` placeholder outside the `Progresso` row.
9. No `unclassified` entries in the build report.
10. Idempotency: two consecutive `content:build` runs leave `git diff` empty.

### 7.3 Vitest additions (`tests/`)

- `content-parser.test.js` — extend: routes list, group ordering, step counts, table integrity, marker presence.
- `games.test.js` *(new)* — label mapping from the template, run-in field splitting, `Instruções` variants, `ODS: Todos` expansion, missing-field placeholders, numbering stability.
- `interactions.test.js` — extend: keyboard traversal of the drawer, `aria-current`, filter announcements, deep link into `#/jogo/{n}`, unknown-`n` fallback.
- `renderer-security.test.js` — extend: DOMPurify still strips injected markup from game-sheet Markdown; `sanitizeUrl` rejects `javascript:` in sheet content; `EXTERNAL_DOMAINS` allow-list still holds.

### 7.4 Definition of Done

- [ ] `python scripts/build_content.py` rebuilds `file.md` and all sheets idempotently from the three DOCX + overlay.
- [ ] `npm run check:content` passes with zero errors and zero warnings.
- [ ] `npm test` passes; new `games.test.js` included.
- [ ] `npm run build` produces `dist/` with `file.md` and all `{n}Game.html` present.
- [ ] `npm run preview` serves a working site; every navbar item reachable; no console errors.
- [ ] Navbar contains a Jogos e Workshops group listing 5 areas and every game; deep links work.
- [ ] Influencers content is provably absent (§7.2 assertion 1).
- [ ] A sheet prints cleanly on A4 in both light and dark themes.
- [ ] Keyboard-only walkthrough of navbar + filters + a full game page passes.
- [ ] `README.md` rewritten: the non-coder workflow is the **first** section, with screenshots of "edit the Word file → double-click `run.cmd` → open the site".
- [ ] The §5.7 decision is resolved and `EXPECTED_COUNTS` matches reality.

### 7.5 Non-coder experience

The single most important usability requirement, since the editor "doesn't know how to code".

1. `scripts\run.cmd` — double-click. Creates the venv on first run, installs deps, builds content, runs the checks, starts `vite preview`, and pauses on failure with a plain-language message.
2. `scripts\setup_env.cmd` — one-time environment creation, run automatically by `run.cmd`.
3. Zero code edits for routine work: to change a game, edit the Word file and re-run `run.cmd`. To renumber or re-file a game, edit `content/games-map.json`. To change output paths or toggles, edit `content.config.json`.
4. Every failure message names the file, the paragraph, and what to do — e.g. `source/gamesSource.docx: jogo 25 — não foi encontrada a etiqueta "Instruções:". Adicione-a ou edite o mapa em content/games-map.json.`
5. A `docs/EDITORIAL.md` in plain Portuguese, no jargon, with a troubleshooting section.

### 7.6 Non-goals

No search backend or service. No accounts, login or progress tracking. No CMS. No i18n. No analytics or telemetry. No image optimisation pipeline or CDN. No PWA/offline support. No content in Capítulo 8. No rewriting `parser.js`/`renderer.js`/`interactions.js` beyond what §6 requires — and if a change there proves unavoidable, raise it before making it.

---

## 8. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Overlay content drifts from the DOCX | Silent editorial divergence | Overlay files carry a "source: manual, last reviewed" header; `content:check` diffs regenerated body against overlay and warns |
| `file.md` markers stop matching `source-map.js` | Build fails, or worse, parses wrongly | `check-content.mjs` is the gate; fix the true origin, never the assertion |
| Text-box traversal double-reads `mc:Fallback` | Every boxed string duplicated | Read `mc:Choice` only; add a test asserting chapter headings appear exactly once |
| Casing recovery mangles acronyms | `ODS` → `Ods` | Explicit acronym allow-list; snapshot test over all 29 game titles |
| Merged-cell de-duplication drops real data | Lost table content | Assert the economics table keeps all 11 logical rows |
| 29 vs 30 games | `chapter7Activities` mismatch | Resolve §5.7 before writing parser changes |
| `python` not on PATH for the editor | Pipeline cannot run | `run.cmd` locates `py -3` / `python`, and prints an install link if neither exists |
| Scope creep into Capítulo 8 | Site contradicts the brief | Automated assertion §7.2.1 |
