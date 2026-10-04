# 003 — Refined Specification: Navigation Clarity and Game-Sheet Fidelity

**Status:** refined from [`F100Instructions/003Problems.md`](../003Problems.md)
**Objective:** fix the six defects found while navigating the published site — the inert "Explore o guia" sidebar header, chapter links labelled only "Capítulo N", the per-Secção age indicator, the destroyed list hierarchy inside the game sheets, the missing line breaks in the `Duração e Participantes` row, and the print sheets that ignore both Markdown and the site's own design language.
**Depends on:** [`001ExplainingProj.md`](./001ExplainingProj.md) (game-sheet pipeline, template-driven rows) and [`002AddProgressToGames.md`](./002AddProgressToGames.md) (the Progress block whose header carries the age indicator). Both are implemented; this document changes them, it does not redesign them.
**Supersedes:** nothing. **Refines:** the original brief. The trailing word "Navegating" in the raw file is read as the section title of the brief and carries no requirement.

---

## 0. How to read this document

The raw brief numbers two different problems as "5". They are kept apart here, and every raw item is mapped to exactly one work item so nothing is lost.

| Raw item | Refined | Where | Size |
|---|---|---|---|
| 1 — "Explore o guia" is not appealing | **P1** | §4 | S |
| 2 — chapters have no name in the sidebar | **P2** | §5 | S |
| 3 — remove the age-gap indicator per Secção | **P3** | §6 | XS |
| 4 — text/numeric-list hierarchy not preserved | **P4** | §7 | L |
| 5 (first) — line breaks in `Duração e Participantes` | **P5** | §8 | XS |
| 5 (second) — `**` inert in `.html`; sheets ignore the site design | **P6** | §9 | M |

**Size:** XS ≈ under 30 lines · S ≈ under 120 · M ≈ a module plus its tests · L ≈ a new data model in the extraction stage.

Everything below was measured against the real sources (`source/gamesSource.docx`, `file.md`, `src/`, `source/games/*.md|html`) before being written down. Numbers, file paths and line numbers are reproducible with `npm run content:report` and the probes cited in each section.

---

## 1. Decision log

| ID | Decision | Rationale |
|----|----------|-----------|
| **D1** | The "Explore o guia" block becomes the **first navigation group**, rendered by `renderer.js`, not static markup in `index.html`. Its counts are derived from the model and `games-map.json`; its search shortcut is a real `<button>` wired in `interactions.js`. | The sidebar is entirely JS-generated (`index.html:60` is an empty `<nav>`), so a hard-coded hero would be the only hand-written part of it and would drift from the real counts. Each module keeps its role: `renderer` builds, `interactions` wires behaviour. Cost: `scripts/smoke.mjs:77-79` asserts five nav groups and must be updated to six — an intentional, asserted change. |
| **D2** | The sidebar chapter name is **derived from the source heading** through one helper in `source-map.js`, not typed into `ROUTES`. | `CHAPTERS[i].heading` (`source-map.js:80-224`) is already the literal string the parser uses to *find* each chapter in `file.md`. Deriving from it makes "extract the name from the source" literally true and impossible to drift. |
| **D3** | The age indicator is removed **at the render boundary only**. `ages` stays in `content.config.json` and in the committed `build/progress-taxonomy.json`. | `build/progress-taxonomy.json` is a committed, provenance-stamped artefact that can only be regenerated with network access, and `npm run progress:check` diffs the freshly fetched sheet against it. Deleting a field from the config would invalidate that committed artefact for **zero** user-visible gain. The data stays as the factual record of the CNE framework; the UI stops showing it. |
| **D4** | List hierarchy is recovered from **`w:numPr` + `word/numbering.xml`**, not guessed from indentation or from text patterns. | Measured: every list item in `gamesSource.docx` carries a real `w:numPr`, and every abstract numbering definition in the file resolves to `decimal` or `bullet`. The structure is *in the document*; the current code simply never reads it (`ooxml.py` has no `numPr` accessor and never opens `numbering.xml`). |
| **D5** | The instruction block has an explicit **boundary rule**, validated against all 29 Word entries, rather than "take everything until the next game". | Measured: today the block swallows annexes — *Peixinho* absorbs its entire 137-paragraph card deck, *Corrida da Saúde* its 15 questions, *A Certeza no Caos* its 18 resources, *Jogo dos Salários* its 6 salary cards. `05Game.md` is 13 613 characters, 12 877 of them in the `Instruções` cell. The rule in §7.3 classifies all 29 entries correctly. |
| **D6** | `Instruções` keeps its **table row**; the hierarchy is expressed as nested `<ol>`/`<ul>` **inside the cell**. | The row contract comes from `00GameSheetTemplate.docx` and is asserted by `scripts/check-content.mjs:216-223`. Moving `Instruções` out of the table would break the template-driven guarantee that 001 exists to provide. Nested HTML inside a Markdown table cell renders in every mainstream Markdown viewer and is exactly what the HTML sheet needs. |
| **D7** | One outline model, **two serialisers** (Markdown and HTML). The Markdown cell and the HTML `<td>` are produced from the same node list. | Prevents the two artefacts from disagreeing — the defect the brief describes. It also means the `**` fix (P6a) and the hierarchy fix (P4) are the same code path, not two patches. |
| **D8** | The HTML sheet's design tokens are **read from `src/styles.css` at generation time** and inlined into the sheet. | The site already has one palette (`styles.css:1-48`). Copying it into `sheets.py` would create a second source of truth that silently rots; linking the site's stylesheet is impossible because the sheet is a standalone file opened directly from `dist/`. A failed extraction is a hard error naming the file. |
| **D9** | The embedded **"Descobre +"** game found inside *Desenho Estragado* is extracted as its own game, mapped to `Descobre +ODS` (game 29). Editorial confirmation required before shipping. | Measured: the Word file nests a complete second game — title, `Ods:`, `Objetivos:`, `Formato:`, `Número de participantes:`, `Duração:`, `Material:` and its own `Instruções:` — inside the `Heading 1` of *Desenho Estragado*, as a numbered paragraph rather than a heading. That is why the Word has 29 `Heading 1` and the map has 30 games. See §7.7 and §13. |

---

## 2. Non-negotiables

1. **Stack unchanged.** Node/Vite, vanilla ES modules, no framework, no TypeScript, no CSS framework. Python 3.11 + standard library for the content stage; **no new Python dependency**.
2. **Editorial content is never hardcoded in code.** Chapter names come from `file.md`; game fields come from `file.md` + the Word; the sheet rows come from the `.docx` template; colours and paths come from `content.config.json` / `styles.css`.
3. **`check-content.mjs` stays an independent gate.** It must not import the Python stage's logic, and it must be *strengthened*, never relaxed, to accommodate a change here.
4. **Fix the true origin.** Never edit `source/games/*` by hand (they are committed generated artefacts), never edit `dist/`, and never weaken an assertion to make a build pass.
5. **Everything stays re-runnable and idempotent.** `python scripts/build_content.py` twice in a row leaves `git diff` empty; no timestamps in generated output.
6. **Portuguese (pt-PT), escutista register**, in all user-visible strings. The specification prose stays English, as in 001 and 002.
7. **Accessibility.** WCAG 2.1 AA. The new hero block, the new chapter names and the new nested lists must all pass keyboard and screen-reader use; colour never carries meaning alone.
8. **The print sheet stays standalone and offline.** One self-contained `.html` file, no external CSS, no web fonts, no network, printable on A4.

---

## 3. Measured starting point

### 3.1 Navigation (P1, P2, P3)

| Fact | Evidence |
|---|---|
| "Explore o guia" is a bare uppercase `<p>` in the sidebar header | `index.html:56-59`; styles `styles.css:441-455` |
| The sidebar is 100 % JS-generated; `#primary-navigation` starts empty | `index.html:60`, `renderer.js:802-825` |
| Chapter links render the literal string `Capítulo N` | `renderer.js:839` — `route.label.replace(/^Capítulo \d+:?\s*/u, route.label)` passes the label as the *replacement*, and the pattern matches the whole label, so it is a no-op |
| Only `capitulo-7` has a real name, hard-coded | `renderer.js:837-838` |
| The real names are already available | `ROUTES[].title` and `CHAPTERS[].heading`, `source-map.js:31-37` / `:80-224` |
| Longest chapter name is 56 characters | `Capítulo 2: Os Objetivos de Desenvolvimento Sustentável e o Escutismo` |
| Sidebar text column is ≈ 13.4 rem after the 1.75 rem number badge | `--sidebar-width: 17.5rem` (`styles.css:31`), `.nav-link` padding (`:476-497`) |
| The age indicator is rendered in exactly one place | `renderer.js:476` — `` ` · ${group.branch} · ${group.ages}` `` |
| It is asserted in three places | `tests/renderer-security.test.js:75`, `tests/contrast.test.js:90`, `tests/progress.test.js:258` |

### 3.2 Instruction hierarchy in the Word source (P4)

`source/gamesSource.docx` has **1 322 body paragraphs**, **29 `Heading 1`** game entries, **62 `w:sectPr`** section breaks (one or more per game) and a populated `word/numbering.xml` with **15 `w:num`** definitions over 15 abstract definitions.

Key measurements:

- **Every** instruction list item carries a `w:numPr` with a real `ilvl` and `numId`. There is no list written as literal `1.` text.
- Levels in use: `ilvl` 0, 1 and 2. Formats in use: `decimal` and `bullet` only.
- **The game's own `Heading 1` is itself a numbered item** (`ilvl 0`, e.g. `numId 1`). Therefore the first *real* list level inside a game is usually `ilvl 1`, and `ilvl 0` reappearing later means **a new list**, not a parent. This single fact drives the level-normalisation rule in §7.4.
- Multi-column sections exist and are meaningful: 46 sections with 1 column, 13 with 4, 2 with 2, 1 with 3. They are where the **card decks and resource lists** live.

Current damage in the committed artefacts:

| Game | Today's `Instruções` cell | Cause |
|---|---|---|
| *Peixinho das Desigualdades* (`05Game.md`) | **144 steps, 12 877 characters** — the whole 137-paragraph card deck is numbered as instructions | annexes not bounded (§7.3) |
| *Corrida da Saúde* (`06Game`) | instructions + the 15 `Perguntas:` | annex heading not recognised |
| *A Certeza no Caos* (`07Game`) | instructions + the 18 `Recursos:` | same |
| *Reciclagem 2.0* (`11Game`) | instructions + the 44 `Cartões:` | same |
| *Jogo dos Salários* (`15Game`) | instructions + the 6 `Cartões de salário:` values | same |
| *Qual a Tua Posição?* (`22Game`) | instructions + the 12 `Afirmações Para O Jogo` | same |
| *Jogo do Quim dos ODS* (`25Game`) | one flat run of 8 — two *distinct* instruction variants (`… para formato Virtual` / `… Presencial`) merged | headings inside the block flattened |
| *O Caminho* (`03Game`) | one flat run of 10 — `Parte 1` and `Parte 2` merged, `Parte 2` items continuing the same count | headings + renumbering |
| *A Rota do Vestuário* (`18Game`) | one flat run of 12 — `1ª Parte` and `2ª Parte` merged | same |
| *Desenho Estragado dos ODS* (`28Game`) | one flat run of 12 — includes the 4 steps of the **nested** game «Descobre +ODS» | D9 |
| `Descobre +ODS` (`29Game`) | falls back to the `Dinâmica` paragraph — the Word has no `Heading 1` for it | D9 |
| *Dramatização de Realidades* (`01Game`) | 13 character bullets numbered `2.`–`14.`; `Local: …` numbered `15.`; closing reflection numbered `16.` | hierarchy discarded |

### 3.3 Sheet rendering (P5, P6)

| Fact | Evidence |
|---|---|
| `Duração e Participantes` is joined with a single space | `sheets.py:139` — `' '.join(parts)` |
| Multi-line values are collapsed to `<br>` inside one cell | `sheets.py:171` — `re.sub(r'\s*\n\s*', '<br>', …)` |
| The HTML renderer never runs Markdown, so `**` leaks as text | `sheets.py:293-304` — `_html_value` only recognises a flat top-level `\d+.` list |
| Literal `**` is visible in the published sheets | `source/games/01Game.html:42` and `:44` |
| The HTML sheet invents its own palette | `sheets.py:246-272` — hard-coded `#16211c`, `#f2f6f4`, `#c3cec8`, `max-width: 46rem` |
| The site has one palette and one print block to reuse | `styles.css:1-48`, `styles.css:1901-1913` (`@page { margin: 16mm 14mm }`) |
| `Objetivos` loses a sentence boundary in 2 games | `03Game.md:11` — `…obstáculos previstos.Fase 2 (45 min):…`; also game 19. Measured: 3 games contain a `Fase`/`Etapa`/`Ronda`/`Parte` marker, 2 of them run together. |

---

## 4. P1 — "Explore o guia" becomes a real invitation

### 4.1 What it is today

A 0.72 rem uppercase `<p>` in `--ink-muted`, sitting on the same visual plane as everything else. It looks like a label, not an entry point, and it does nothing.

### 4.2 Target

A single **hero card** at the top of the navigation, visually distinct from the link list (filled, dark green, white text) the way the site header is distinct from the page, containing three things:

1. **The eyebrow** — the existing words "Explore o guia", now at a readable size (`0.95rem`, weight 800) instead of a 0.72 rem uppercase micro-label.
2. **A count line** — `7 capítulos · 30 jogos`, **computed** from `NAV_GROUPS`/`ROUTES` and `GAMES.length`. Never a literal.
3. **A search shortcut button** — `<kbd>/</kbd> Procurar no guia`, which moves focus to `#document-search` and closes the drawer on small screens. The site already binds `/` globally (`interactions.js:619-625`); the button makes that shortcut discoverable instead of folklore.

```
┌──────────────────────────────────────┐
│  Explore o guia                      │  ← --green-900 → --green-800 gradient
│  7 capítulos · 30 jogos              │  ← --green-100
│  [ ⌕  Procurar no guia        / ]    │  ← outlined chip, --line on green
└──────────────────────────────────────┘
```

### 4.3 Implementation

- **`index.html`**: delete the `<p>Explore o guia</p>` from `.navigation-heading`; keep the container and `#navigation-close` (the drawer focus trap and `interactions.js:446` depend on them).
- **`renderer.js`**: new `renderNavHero()` returning
  `<div class="nav-group nav-hero" data-nav-group="explorar">`, prepended inside `renderNavigation()` before the `NAV_GROUPS` loop so it is not part of the declarative group list (it is chrome, not content). It imports `GAMES` from `games.js` — `renderer.js` already does for `renderGameSubnav()`.
- **`interactions.js`**: one delegated listener on `[data-nav-search]` → `searchInput.focus()` (and `closeDrawer()` when the viewport is below `64rem`).
- **`styles.css`**: `.nav-hero__card` uses only existing tokens —
  `background: linear-gradient(135deg, var(--green-900), var(--green-800))`, `color: #f7fbf8`, `border-radius: var(--radius-md)`, `box-shadow: var(--shadow-sm)`, `padding: 0.9rem 1rem`.
  Contrast: `#f7fbf8` on `#174c3a` ≈ 10:1; `--green-100` (`#dcece4`) on `#174c3a` ≈ 8:1. Both pass AA with margin; add them to `tests/contrast.test.js` so a future palette change cannot break the hero silently.
- **Print**: the hero is hidden inside the existing `@media print` block (`styles.css:1922-1932` already hides `.navigation-panel`).

### 4.4 Rejected alternatives

| Alternative | Why not |
|---|---|
| Keep the `<p>` and only restyle it | A restyled label still does nothing and still reads as chrome. The brief asks for something that attracts the reader to the bar; a dead label cannot. |
| Add an image or an illustration | No image assets exist, no build step for them, and it would not survive `print-color-adjust` or high-contrast modes. |
| Make the whole hero a link to `#/indice` | Ties "explore" to one page. A search entry point serves all thirty games. |

---

## 5. P2 — The chapter names come from the source

### 5.1 Root cause

```js
// src/content/renderer.js:836-840
link.append(element('span', {
  text: route.id === 'capitulo-7'
    ? 'Jogos e Workshops'
    : route.label.replace(/^Capítulo \d+:?\s*/u, route.label),
}));
```

`ROUTES[].label` is `'Capítulo 1'`. The pattern `^Capítulo \d+:?\s*` matches that entire string, and the replacement argument is the string itself — so the result is `'Capítulo 1'`. The intent was clearly to strip the prefix from the *full* title, which was never passed in.

### 5.2 Fix — one derivation, from the marker the parser already uses

In `source-map.js`, next to `CHAPTERS`:

```js
/** `Capítulo 3: Guia para uma Sede Sustentável` -> `Guia para uma Sede Sustentável`. */
export const CHAPTER_PREFIX_RE = /^Capítulo\s+\d+\s*[:.–—-]?\s*/u;

export function chapterNavName(heading) {
  return String(heading).replace(CHAPTER_PREFIX_RE, '').trim();
}

export function chapterNumber(heading) {
  return String(heading).match(/^Capítulo\s+(\d+)/u)?.[1] ?? null;
}
```

`renderNavLink()` then uses `CHAPTERS.find((c) => c.id === route.id)?.heading ?? route.title` as its single source, and deletes the `capitulo-7` special case: *Jogos e Workshops — Oferta Pedagógica* is what the source says, so that is what the sidebar says.

Resulting sidebar:

```
①  Introdução ao Kit Agrupamento Sustentável
②  Os Objetivos de Desenvolvimento Sustentável e o Escutismo
③  Guia para uma Sede Sustentável
④  Guia para um Acampamento Sustentável
⑤  Como Criar um Projeto ODS
⑥  Como Criar uma Parceria para a Sustentabilidade
⑦  Jogos e Workshops — Oferta Pedagógica
```

### 5.3 Layout, because 56 characters do not fit in 13.4 rem

The names are up to 2.4× the current text. Three changes in `styles.css`, no HTML change:

1. `.nav-link` becomes `display: grid; grid-template-columns: 1.4rem 1fr; align-items: start;` — the name gets its own column and can wrap.
2. `.nav-link__number` stops being a 1.75 rem **circle** and becomes a 1.4 rem rounded chip (`border-radius: 0.35rem`), reclaiming ≈ 0.4 rem of text width and reading less like a bullet.
3. `.nav-link__name` gets `-webkit-line-clamp: 2` + `overflow: hidden` so a pathological name can never push the sidebar to three lines. Because the clamp is **CSS-only**, the DOM text stays complete: screen readers, `Ctrl+F` and the search index keep the full name. Add `title="<full name>"` for pointer users.

`min-height: 2.75rem` stays — it is the 44 px touch target required by WCAG 2.5.5 and is already relied on by the drawer.

### 5.4 Guardrails

- `scripts/check-content.mjs` gains: **no** nav link text may match `/^Capítulo\s+\d+$/u`, and for each `CHAPTERS[i]` the nav link text must equal `chapterNavName(CHAPTERS[i].heading)` and be non-empty. Both computed independently from `CHAPTERS`, so a hand-edit of the sidebar cannot pass.
- `tests/interactions.test.js` gains: the active chapter link still receives `aria-current="page"` and its accessible name is the full chapter name.

### 5.5 Rejected alternatives

| Alternative | Why not |
|---|---|
| Add a `navLabel` field to each `ROUTES` entry | A second copy of the name, to be kept in sync by hand. The brief explicitly asks for extraction from the source. |
| Abbreviate the names ("Introdução", "ODS e Escutismo", …) | Abbreviations are editorial decisions that would have to be invented; the full names are the source's own. |
| Truncate to one line | Loses "Parceria", "Acampamento" and "Sustentável" — the three words that distinguish chapters 3, 4 and 6. |

---

## 6. P3 — Remove the age-gap indicator

### 6.1 Change

One line, `src/content/renderer.js:476`:

```js
// before
name.append(element('span', { class: 'progress-section__branch', text: ` · ${group.branch} · ${group.ages}` }));
// after
name.append(element('span', { class: 'progress-section__branch', text: ` · ${group.branch}` }));
```

The summary becomes `Secção I · Lobitos · 8 trilhos` instead of `Secção I · Lobitos · 6–10 · 8 trilhos`. The Secção name and the branch name both remain, so the four sections are still distinguishable by text and not only by the accent colour — `tests/contrast.test.js:86-95`'s intent is preserved.

### 6.2 What does *not* change (D3)

- `content.config.json` keeps `"ages"` for all four sections. It is the editorial record of the CNE framework and it is written into `build/progress-taxonomy.json` (`scripts/progress/build-progress.mjs:105`), a **committed** artefact. `npm run progress:check` diffs a freshly fetched sheet against that file; removing the field would make the check fail until someone with network access re-ran `progress:refresh`, for no user-visible benefit.
- `src/content/progress.js:100,143` keeps passing `ages` in the data objects. The data layer exposes the full editorial metadata; the *view* decides what to show. This keeps the change to a single boundary and keeps `tests/progress.test.js:258` meaningful.
- `scripts/progress/build-progress.mjs:312` may keep printing the ages to the console — that is a build log, not the site.

### 6.3 Tests to update

| File | Change |
|---|---|
| `tests/renderer-security.test.js:67-77` | Rename to *"distingue as quatro Secções sem depender só da cor"* → assert the summary matches `/Secção/u`, matches the branch name, and **does not** match `/\d+–\d+/u`. An inverted assertion is stronger than the one it replaces. |
| `tests/contrast.test.js:86-95` | Replace `expect(meta.ages).toMatch(/^\d+–\d+$/u)` with a DOM-wide assertion: no element inside `.progress-section` contains a `\d+–\d+` range. Update the comment on line 87, which currently states the opposite. |
| `scripts/progress/degrade-check.py:70` | Comment only. |

---

## 7. P4 — Preserve the text and numeric-list hierarchy

This is the substantive item. It is a **data-model change in the extraction stage**, not a rendering patch.

### 7.1 Root cause

```python
# scripts/content/games.py:435-469 — returns list[str]; the is_list flag is discarded
values = [clean.tidy_whitespace(text) for _, text in raw_steps]
…
return steps            # list[str]

# scripts/content/sheets.py:142-146 — numbers whatever it receives, flat
lines = [f'{index}. {step}' for index, step in enumerate(game.detailed_steps, 1)]
```

Three separate losses, all confirmed:

1. `games.py` computes `list_flags` (`is_list`) at line 354 and uses it only to decide whether a paragraph continues a split title. It never records the level.
2. `ooxml.py` has no accessor for `w:numPr` and never opens `word/numbering.xml`, so `ilvl` and `numFmt` are unavailable.
3. `sheets.py` renumbers from 1 with `enumerate`, so any structure that survived would still be flattened, and every list restarts nowhere.

### 7.2 The model

```python
# scripts/content/games.py
@dataclass(frozen=True)
class Step:
    kind: str    # 'heading' | 'ordered' | 'bullet' | 'para'
    text: str
    level: int   # 0 = base level of the block; deeper = nested
```

`Game.detailed_steps` becomes `list[Step]`. `report.games.withDetailedSteps` in `build_content.py:226` is unaffected. `align_games()` assigns the outline instead of a flat list.

New readers in `ooxml.py` (no new dependency, same raw-XML approach):

| Addition | Purpose |
|---|---|
| `Document.numbering` → `Numbering` | Lazy parse of `word/numbering.xml`: `numId → abstractNumId → {ilvl: (numFmt, lvlText)}`. `Numbering.is_ordered(num_id, level)` returns `True` for `decimal`, `lowerLetter`, `upperLetter`, `lowerRoman`, `upperRoman`. |
| `paragraph_numbering(p)` → `tuple[str, int] \| None` | Reads `w:pPr/w:numPr` → `(numId, ilvl)`, defaulting `ilvl` to `0`. |
| `Document.body_items()` → `list[BodyItem]` | One pass over `w:body` yielding `(kind, element, section_index, columns)`. `kind` is `'paragraph' \| 'table'`; `columns` comes from the `w:sectPr` that closes the section. Replaces the hand-rolled `paragraphs = [child for child in body if …]` loop at `games.py:344`. |
| `Block.num_id` / `Block.level` | Populated in `_blocks_of()` so `body_blocks()` callers also get the numbering. |

`games.py:376-415` then walks `body_items()` instead of raw paragraphs and builds the outline.

### 7.3 Where the instruction block starts and ends

**Start.** The paragraph whose text begins with `Instruções`, allowing `Instruções:`, `Instruções para formato Virtual:` and `Instruções para formato Presencial:`. Any text on the same paragraph after the label becomes the first `para` step — measured: *Reciclagem 2.0* and *O Pacote de Açúcar* both carry a run-in sentence.

**End.** The block stops at the **first** of these, scanning forward:

| # | Rule | Measured justification |
|---|---|---|
| E1 | The paragraph is in a **different `w:sectPr` section whose `w:cols/@num` > 1** | The card decks are laid out in columns. *Peixinho*: instructions in section 7 (1 column), then 17 multi-column sections holding 137 card paragraphs. Same mechanism in *Reciclagem 2.0* (2 col), *Jogo dos Salários* (2 col), *A Certeza no Caos* (3 col). |
| E2 | A **Heading 2** | *Jogo dos Salários* → `Cartões de Compra⇥Preço⇥Pontos`, the header of the economics table. |
| E3 | A **Heading 3 that is a label**: matches `^[^:]{0,60}:\s*$` | `Perguntas:`, `Recursos:`, `Cartões:`, `Cartões de salário:` — four games, four annexes, all of them labels ending in a colon. |
| E4 | A **Heading 3 whose first following list item is deeper than the block's base level** | `Afirmações Para O Jogo` in *Qual a Tua Posição?* (items at `ilvl 2` against a base of `1`). This is the only annex heading without a colon. |
| E5 | A paragraph that begins **another game's field block** (`Ods:`, `Objetivos:`, `Formato:`, `Número de participantes:`, `Duração:`, `Material:` in sequence) | Catches `Descobre +` nested inside *Desenho Estragado* (D9). |
| E6 | The next `Heading 1`, or the end of the document | Existing behaviour. |

**Kept as content, not as a boundary:**

| Pattern | Measured examples | Why |
|---|---|---|
| `^(instru\|.*\bparte\b)` case-insensitive | `Parte 2: Desenho do mapa. (40’)`, `2ª Parte – A Viagem`, `1ª Parte – A Origem`, `Instruções para formato Presencial:` | These are **stages of the instructions**, not annexes. They become `heading` steps. |

**Always dropped:** empty paragraphs and bare page numbers (`clean.is_page_number`). **Always kept:** every other paragraph, as a `para` step — that is how `Local: Aldeia do interior, no Quénia.` (*Dramatização*), `Versão Online: …` (*Jogo dos Salários*) and the two closing reflections of *Negociar na ONU* survive as prose instead of being numbered.

### 7.4 Level normalisation and renumbering

- `base` = the level of the **first** list item in the block — **not the minimum**. Measured reason: the game's own `Heading 1` is a numbered item at `ilvl 0`, so the first real list level is usually `1`, and an `ilvl 0` item appearing later is a *new* list.
- A step's rendered level is `max(0, ilvl − base)`.
- A step whose raw level is **shallower** than `base` **starts a new list** (the previous list is closed). This is what makes `Parte 2` restart at 1 in *O Caminho*, *Qual o Tamanho da Tua Pegada?*, *A Rota do Vestuário* and *Jogo do Quim dos ODS*.
- A change of `kind` (`ordered` ↔ `bullet`) at the same level also starts a new list.
- The generator writes the numbers **explicitly** for Markdown (it cannot rely on a renderer restarting a list across a `<br>`), and uses `<ol>` for HTML, which restarts naturally. Both come from the same node list (D7).

### 7.5 Measured outcome, all 29 Word entries

Validated by prototyping the rule against `source/gamesSource.docx`. `ol` = ordered, `ul` = bullet, `p` = prose, `H` = stage heading.

| Map # | Game | Outline produced | vs. today |
|---|---|---|---|
| 1 | Dramatização de Realidades | `ol×1 → ul×13 → p → ol×1` | **fixes the brief's example**: bullets under step 1, reflection as step 2, `Local:` as prose |
| 2 | Jogo Justo | `ol×2` | unchanged |
| 3 | O Caminho | `p (Parte 1) → ol×4 → H "Parte 2: Desenho do mapa. (40’)" → ol×4` | **fixes the brief's second example** |
| 4 | Muda os Teus Óculos | `ol×5 → p → ol×1` | closing note stops being a step |
| 5 | Peixinho das Desigualdades | `ol×7` | **from 144 steps / 12 877 chars to 7 steps** |
| 6 | Corrida da Saúde | `ol×6` | drops the 15 questions |
| 7 | A Certeza no Caos | `ol×4` | drops the 18 resources |
| 8 | Água | `ol×8` | unchanged |
| 9 | Alterações Climáticas | `ol×5 → ul×5` | bullets stop being steps 6-10 |
| 10 | Hotéis para Insetos | `p → H "Abrigos para borboleta" → ol×5 → H "Abrigo para abelhas-so" → ol×4 → H "Abrigo para Joaninhas" → ol×3` | three named rounds, each numbered from 1 |
| 11 | Reciclagem 2.0 | `p (run-in) → ol×4` | drops 44 card rows |
| 12 | Qual o Tamanho da Tua Pegada? | `p → ol×4 → H "2ª parte – Discussão…" → ol×5` | two parts, each from 1 |
| 13 | Quantos Queres | `ol×2 → ul×8 → ol×1` | **fixes the brief's example 1 pattern** |
| 14 | E se eu não fosse à escola? | `ol×3` | unchanged |
| 15 | Jogo dos Salários | `ol×5 → p ("Versão Online: …")` | drops the 6 salary values, keeps the online variant |
| 16 | O Mundo | `ol×3` | unchanged |
| 17 | O Orçamento | `ol×1 → ul×5 → ol×1` | bullets stop being steps 2-6 |
| 18 | A Rota do Vestuário | `p → ol×4 → H "2ª Parte – A Viagem" → p → ul×3 → ol×2` | two parts preserved |
| 19 | Time's Up | `ol×4 → ul×3 → ol×3` | bullets stop being steps 5-7 |
| 20 | 3 Coisas | `ol×7` | unchanged |
| 21 | O Novo Planeta | `ol×5` | unchanged |
| 22 | Qual a Tua Posição? | `ol×5` | drops the 12 statements |
| 23 | Olha a Notícia! | `ol×5` | unchanged |
| 24 | Representar é Humano | `ol×4` | unchanged |
| 25 | Jogo do Quim dos ODS | `ol×4 → H "Instruções para formato Presencial:" → ol×4` | **two variants stop being one run of 8** |
| 26 | Jogo da Memória | `ol×5` | unchanged |
| 27 | O Pacote de Açúcar | `p` | no list in the Word; unchanged (falls back to the `Dinâmica` sentence) |
| 28 | Desenho Estragado dos ODS | `ol×7` | drops the 4 steps that belong to «Descobre +ODS» |
| 29 | Descobre +ODS | `ol×4` | **gains real instructions** (was the `Dinâmica` paragraph) — D9 |
| 30 | Negociar na ONU | `p → ol×1 → p×3 → ul×5 → p×2 → ol×12 → p×2` | timing labels and reflections stop being steps |

*Rows are numbered by `content/games-map.json`. The Word has 29 `Heading 1` entries; map 29 is the block nested inside map 28 (D9) and map 30 is Word `Heading 1` #29.*

### 7.6 Serialisation

**Markdown** (`sheets.py`, inside the `Instruções` cell — D6):

```html
| Instruções | <strong>1.</strong> O animador pede ao grupo que construa uma peça …<ul><li>Zaki – Homem de 50 anos…</li>…</ul><strong>2.</strong> No final, é importante refletir-se… |
```

Rules: one `<br>`-separated line per top-level block; ordered steps carry their explicit number in a `<strong>`; nested levels are real `<ul>`/`<ol>` elements; headings become `<strong>Heading:</strong>` on their own line. `_escape_cell()` stops collapsing `\n` — it now escapes only `|` and converts residual newlines to `<br>`.

**HTML** (`sheets.py`): the same node list rendered as `<ol>` / `<ul>` / `<p>` / `<h4>` inside the `<td>`, with the ordered lists restarting naturally.

### 7.7 The nested game (D9)

`read_games_from_docx()` currently yields 29 entries. The change also yields a **30th** pseudo-entry for the `Descobre +` block found inside *Desenho Estragado*, detected by rule E5 (a complete second field block plus its own `Instruções:`). `align_games()` matches it to map game 29 `Descobre +ODS` by the existing `difflib` title similarity within the same area, and game 28 keeps only its own seven steps.

This is **editorial content moving between two sheets**, so it needs the editor's confirmation before shipping. If it is declined, the fallback is explicit and cheap: skip E5, leave game 28 with 11 steps as today, and leave game 29 falling back to its `Dinâmica` sentence. Record the answer in `content.config.json` rather than in code — e.g. `games.nestedGameRule: "extract" | "ignore"` — so the choice is visible and reversible. See §13.

---

## 8. P5 — Line breaks in `Duração e Participantes`

### 8.1 Change

```python
# scripts/content/sheets.py:132-139
parts: list[str] = []
…
return '\n'.join(parts) if parts else MISSING_VALUE   # was: ' '.join(parts)
```

Everything downstream already cooperates: `_escape_cell()` turns `\n` into `<br>` for the Markdown cell, and the HTML serialiser emits `<br />`. The published result is exactly the brief's example:

```markdown
| Duração e Participantes | **Formato:** Presencial ou Online<br>**Participantes:** Secção organizada em subunidades<br>**Duração:** 60 minutos |
```

```html
<tr><th scope="row">Duração e Participantes</th><td><strong>Formato:</strong> Presencial ou Online<br /><strong>Participantes:</strong> Secção organizada em subunidades<br /><strong>Duração:</strong> 60 minutos</td></tr>
```

`build_content.py:276-281` counts one `Progresso / Sistema de Especialidades` placeholder per sheet; nothing there depends on the join character.

### 8.2 P5b — the same treatment for run-together stage markers (small, flagged)

`clean.py` gains one narrow rule: insert a line break before `Fase \d`, `Etapa \d`, `Ronda \d` or `Parte \d` when it directly follows a sentence terminator **with no space**. Measured: 3 games match, 2 of them are actually run together (*O Caminho* map 3, *Time's Up* map 19). It applies to the `Objetivos` cell only. Every application is listed in `build/content-report.json` as a normalisation note, following the `clean.Normalisation.notes` convention already in place — the editor can see exactly what changed and revert any single case.

---

## 9. P6 — The HTML sheets must speak the site's design language

### 9.1 P6a — Markdown must actually render

`sheets.py` gains `inline_markdown(text)`, applied after `html.escape()` so no user text can inject markup:

| Input | Output |
|---|---|
| `**ODS 1** (Erradicar a Pobreza)` | `<strong>ODS 1</strong> (Erradicar a Pobreza)` |
| `*A preencher pelo animador.*` | `<em>A preencher pelo animador.</em>` |
| `` `termo` `` | `<code>termo</code>` |
| `$100€$` | **unchanged** — currency must survive as text. The sheet is offline and standalone, so KaTeX is not available; `$…$` is left literal rather than half-rendered. |

Scope is deliberately `**bold**`, `*italic*`, `` `code` ``. `[links](…)` are not needed by any current sheet value, and adding them would mean adding URL sanitisation to the Python stage for no present benefit.

`_html_value()` is replaced by the outline-aware serialiser from §7.6, so the `**` handling and the list handling are one code path (D7).

**Guardrail:** `scripts/check-content.mjs` asserts that no generated `NNGame.html` contains `**` outside a `<style>` or `<script>` block, and that `01Game.html` contains `<strong>Formato:</strong>`. A regression fails the build rather than shipping literal asterisks.

### 9.2 P6b — One palette, read from the site

New in `sheets.py`:

```python
def design_tokens(styles_path: pathlib.Path) -> str:
    """Extrai o primeiro bloco `:root { … }` de `src/styles.css`."""
```

It locates `:root {`, slices to the matching `}`, and returns the declarations verbatim. Failure is a hard error naming the file and what to do — the same convention as every other failure message in this project. The sheet's `<style>` is then:

1. the extracted `:root` block (one source of truth: `--green-800`, `--green-50`, `--paper`, `--paper-soft`, `--ink`, `--ink-muted`, `--line`, `--radius-md`, `--shadow-sm`, `--font-serif`, and the five area colours `--people` … `--partnerships`);
2. sheet-specific rules that **only consume those tokens** — no literal colours.

Rejected alternative: hand-copying the hex values into `sheets.py`. It is what the code does today and it is exactly how the two designs drifted apart.

### 9.3 P6c — Same motifs, not just the same colours

| Site element (`styles.css`) | Sheet counterpart |
|---|---|
| `.route-title` — `--font-serif`, weight 500, tight tracking | `<h1>` in the sheet |
| `.activity-area-label` — 0.72 rem, 850, uppercase, `--ink-muted` | area eyebrow above the title |
| `.activity-card` — 1 px `--line`, `--radius-md`, `--shadow-sm`, 0.35 rem left bar in the area colour | the sheet's outer block, with `border-inline-start: 0.35rem solid var(--area-color)` and `print-color-adjust: exact` so the bar survives printing |
| `.activity-card--people/--planet/…` | `--area-color` set from the game's own area, same five tokens |
| `.activity-meta` — `dt`/`dd` rows with `--line` separators | the sheet's field table |
| `@media print` → `@page { margin: 16mm 14mm }`, `--paper: #fff`, `--ink: #000` | the sheet's print block, same margins and same ink overrides |
| `.site-footer` wording | the sheet footer, same wording |

The sheet header becomes the game's own identity, matching the game page: area eyebrow, serif title, then a line with the game number and the ODS as chips tinted with the area colour. `color-scheme: light` is declared explicitly — the sheet is a print artefact and does not follow the site theme (the site's `@media print` already forces light, `styles.css:1906-1913`).

The accessibility affordances of the sheet stay as they are: `<th scope="row">` on every label, `<caption>` on the table, `lang="pt-PT"`, `break-inside: avoid` on rows.

### 9.4 What does not change

`vite.config.js:25-41` copies `source/games/NNGame.(md|html)` verbatim into `dist/source/games/`; the generator still writes both files atomically with `newline='\n'` (`sheets.py:309-315`). No plugin change is needed.

---

## 10. Verification

### 10.1 New assertions in `scripts/check-content.mjs` (Node side, independent)

| # | Assertion | Fails if |
|---|---|---|
| V1 | No nav link text matches `/^Capítulo\s+\d+$/u` | P2 regresses to bare numbers |
| V2 | Each chapter nav link text equals `chapterNavName(CHAPTERS[i].heading)` and is ≥ 8 characters | a name is hard-coded or truncated in the DOM |
| V3 | `.nav-hero` exists, is the first `[data-nav-group]`, and its count text contains `String(GAMES.length)` | the hero drifts from the real number of games |
| V4 | No `DDD–DDD` range appears inside `.progress-section` | P3 regresses |
| V5 | No generated `NNGame.html` contains a literal `**` outside `<style>`/`<script>` | P6a regresses |
| V6 | Every `NNGame.html` contains `--green-800:` and `--paper-soft:`, and `@page` with `16mm 14mm` | the sheet drifts from the site palette/print block |
| V7 | Every `NNGame.html` has ≥ 1 `<ol>` or `<ul>` in the `Instruções` cell | P4 regresses to flat numbering |
| V8 | Every `NNGame.md` `Instruções` cell contains no `\d+\.\s` run longer than 3 consecutive top-level markers (i.e. hierarchy markers exist) | P4 regresses |
| V9 | `05Game.md` is under 4 000 characters | the card-deck regression returns |
| V10 | `NNGame.md` `Duração e Participantes` cell contains exactly 2 `<br>` when the game has all three of format/participants/duration | P5 regresses |
| V11 | Two consecutive `python scripts/build_content.py` runs leave `git diff` empty | idempotency |

V8 is deliberately a *shape* assertion, not a snapshot: it forbids the specific defect (a long unbroken numbered run) without freezing editorial text that legitimately changes.

### 10.2 Vitest

| File | Addition |
|---|---|
| `tests/content-parser.test.js` | unchanged — no parser change in 003 |
| `tests/renderer-security.test.js` | update P3 (§6.3); add chapter-name assertions (full accessible name, `aria-current` preserved); add the `.nav-hero` DOM-shape assertion |
| `tests/interactions.test.js` | `[data-nav-search]` focuses `#document-search` and closes the drawer below `64rem` |
| `tests/contrast.test.js` | add hero foreground/background pairs to the palette table; invert the age assertion |
| `tests/progress.test.js` | unchanged (D3) |
| **new** `tests/sheets.test.js` | the outline model, serialised in Node against the committed artefacts: `01Game.md` step 2 is the reflection, the 13 character lines are `<li>` inside step 1, `03Game.md` restarts at 1 after `Parte 2`, `05Game.md` has 7 steps, `25Game.md` has two ordered blocks; `_format_duration` joins with `\n`; `inline_markdown` escapes before formatting |

The Python stage has no test runner in this project; the committed artefacts are its test surface, which is why V5-V10 assert against them.

### 10.3 `scripts/smoke.mjs`

- `:77-79` — five nav groups becomes six, `['explorar', 'inicio', 'referencias-rapidas', 'capitulos', 'jogos', 'final']`.
- New: the hero is present and its text mentions 30 jogos; the Capítulo 2 nav link's text is `Os Objetivos de Desenvolvimento Sustentável e o Escutismo`.
- `:97-98` — `aria-current` still lands on `capitulo-7` from `#/jogo/15`.

### 10.4 Definition of Done

- [ ] Sidebar shows a hero with "Explore o guia", derived counts and a working search shortcut; it is visually distinct from the link list.
- [ ] Every chapter link shows the source chapter name; no link reads "Capítulo N"; no name is clipped mid-word at 320 px width.
- [ ] No age range appears anywhere in the site; `ages` still present in `content.config.json` and the taxonomy artefact; `npm run progress:check` passes.
- [ ] `01Game.md` reproduces the brief's example 1: one numbered step, thirteen bullets, prose, then step 2.
- [ ] `03Game.md` reproduces the brief's example 2: `Parte 1` with nested steps, then `Parte 2` restarting at 1.
- [ ] `05Game.md` is under 4 000 characters and has 7 steps.
- [ ] `Duração e Participantes` is three lines in both `.md` and `.html`.
- [ ] No `**` is visible in any `.html` sheet; every sheet uses the site's palette tokens; printing one on A4 looks like the site.
- [ ] `python scripts/build_content.py` twice → empty `git diff`.
- [ ] `npm run check:content`, `npm test`, `npm run build`, `npm run smoke` all pass.
- [ ] Keyboard-only pass through the sidebar (drawer, hero button, chapter links, game list) with no focus trap or contrast regression.
- [ ] `README.md` mentions the search shortcut and the print sheets.
- [ ] The editor has answered §14 Q1 (nested game) and §14 Q2 (`Descobre +ODS` instructions).

### 10.5 Non-coder impact

None required. Every change is a code change; `run.cmd` behaves exactly as before. The one thing the editor will notice is a **large diff** in `source/games/*.md` and `source/games/*.html` — 60 committed generated files, because their content genuinely changes. That is expected and should be said out loud in the commit message, otherwise it looks like damage.

---

## 11. Sequencing

Each step is independently shippable and leaves `npm run validate` green.

| Step | Work | Files | Risk |
|---|---|---|---|
| 1 | **P3** ages | `renderer.js`, 2 test files, 1 comment | trivial |
| 2 | **P2** chapter names | `source-map.js`, `renderer.js`, `styles.css`, `index.html`, `check-content.mjs`, 2 test files | low — one regex, one layout rule |
| 3 | **P1** hero | `index.html`, `renderer.js`, `interactions.js`, `styles.css`, `smoke.mjs`, `contrast.test.js` | low — additive |
| 4 | **P5** + **P5b** line breaks | `sheets.py`, `clean.py`, `check-content.mjs` | low — but regenerates all 60 sheets |
| 5 | **P4a-d** model + boundary + levels | `ooxml.py`, `games.py`, `build_content.py` (report field), `check-content.mjs` | **high** — new data model; this is where the prototype in §7.5 becomes production code |
| 6 | **P4e-f** serialisers + **P6** design | `sheets.py`, `check-content.mjs`, `tests/sheets.test.js` | medium — depends on 5 |
| 7 | Docs | `README.md` | trivial |

Steps 1-3 touch only the site and can be reviewed by opening the browser. Step 4 onward regenerates the sheets; review that diff with `git diff --stat source/games` before reading any individual file.

---

## 12. Non-goals

No change to `parser.js` — the `file.md` model and its byte-coverage guarantees are untouched. No change to the `00GameSheetTemplate.docx` row set or order. No new colour in the palette. No dark theme for the print sheet. No KaTeX in the sheets. No attempt to reconstruct the annexes that §7.3 deliberately excludes (questions, resources, card decks) — they are real content that belongs in a future annex section, not inside `Instruções`; if the editor wants them published, that is a separate brief. No search-backend, no service worker, no framework. No Capítulo 8.

---

## 13. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| The §7.3 boundary rule misclassifies a game after the Word is edited | Instructions truncated or an annex leaks back in | Every boundary decision is derived from structural markup (`w:cols`, heading level, heading shape, field labels), never from a game title; V9 catches the worst historical regression; the per-game table in §7.5 is the reference for review |
| `numbering.xml` uses a format outside `{decimal, bullet, …}` | A list renders as bullets or numbers incorrectly | `Numbering.is_ordered` has an explicit allow-list and an `else: bullet` fallback; an unknown format is reported in `build/content-report.json` rather than guessed |
| Nested HTML inside a Markdown table cell renders badly in some viewer | The `.md` becomes hard to read | The `.md` remains valid GFM; the primary consumers are the HTML sheet and a text editor; if a viewer ever fails, the fallback is D6's rejected alternative (move `Instruções` out of the table), which only touches `sheets.py` |
| Extracting the `:root` block from `styles.css` with a regex breaks when the file is reformatted | All 60 sheets fail to generate | Hard error naming the file and the expectation; `check-content.mjs` V6 verifies the tokens actually landed in the output; a formatter that reorders `:root` is a one-line fix in one function |
| The hero's colours are not re-checked when the palette changes | Contrast regression in the sidebar | Hero pairs added to `tests/contrast.test.js`, which reads the tokens straight out of `styles.css` |
| «Descobre +ODS» gains instructions that the editor did not expect | Wrong content attributed to a game | D9 is gated on an explicit answer, surfaced in `content.config.json`, with a one-flag fallback (§7.7) |
| The 60-file sheet diff is mistaken for corruption | Loss of trust in the pipeline | Called out in the commit message and in §10.5; `git diff --stat source/games` reviewed before reading files |

---

## 14. Open questions for the editor

1. **«Descobre +ODS» (map game 29).** The Word nests this game's full block inside *Desenho Estragado*. Extract it as game 29's real instructions (D9, recommended), or leave game 29 falling back to its `Dinâmica` sentence and keep game 28's 11 steps as they are today?
2. **The annexes.** *Peixinho*'s 137 card paragraphs, *Corrida da Saúde*'s 15 questions, *A Certeza no Caos*'s 18 resources, *Reciclagem 2.0*'s 44 cards and *Jogo dos Salários*'s 6 salary values are real editorial content that today sits inside `Instruções`. §7.3 excludes them from `Instruções`. Should they be published as a separate "Apoio à dinâmica" block in the sheet (a new brief), or left unpublished?
3. **Chapter 7's sidebar label.** With P2 it becomes "Jogos e Workshops — Oferta Pedagógica", the source's own name. It is the longest of the seven. Keep the full name (recommended, consistent with the other six) or keep the shorter "Jogos e Workshops"?
4. **Print sheet scope.** Should the sheet also carry the *Progresso Pessoal* block for the four Secções, or stay a pure "how to run this game" document? This brief keeps it out.

---

*Measured against `source/gamesSource.docx` (sha256 recorded in `build/content-report.json`), `file.md` (31 493 bytes), `src/` at commit `d3405f8`, and the committed sheets in `source/games/`.*
