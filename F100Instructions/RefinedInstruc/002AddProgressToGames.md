# 002 — Refined Specification: Personal Progress paths on Game Cards

**Status:** refined from [`F100Instructions/002AddProgressToGames.md`](../002AddProgressToGames.md)
**Objective:** show, on every game card and game page, which *Personal Progress* paths (`Secção → Área → Trilho`) that game touches, for all four Secções.
**Depends on:** [`001ExplainingProj.md`](./001ExplainingProj.md) — assumes `content/games-map.json`, the game sheets, route `#/jogo/{n}` and the Cap. 7 hub exist. Nothing in 001 is modified except where §7 says so.
**Supersedes:** nothing. **Refines:** the original brief.

---

## 0. Decision log

| ID | Decision | Rationale |
|----|----------|-----------|
| **D1** | The Google Sheet is fetched **at build time**, server-side, never from the browser. | The CSV endpoint sends **no `Access-Control-Allow-Origin` header** (verified). A client-side `fetch` is therefore impossible without adding a proxy — which would mean a server, and the project is deliberately static. Build-time fetching is the only viable option, not merely the preferred one. |
| **D2** | The fetched taxonomy **is committed** as a generated artefact, but is machine-written, provenance-stamped, and never hand-edited. Failure to fetch degrades to the committed copy. | This is the honest reading of "I don't want to store data locally": you don't want a *hand-maintained* copy that drifts. A generated snapshot keeps CI, offline builds and `npm run build` working while still tracking the live sheet on every refresh. See §5 for the exact contract. |
| **D3** | The **game ↔ trilho mapping is human-authored**, in `content.progress.json`. It cannot be derived. | The sheet contains the *taxonomy* (which trilhos exist) and the *pedagogical descriptors*. It contains **no** statement of which game relates to which trilho. That is an editorial judgement. See §2. |
| **D4** | Failure is **tiered**: an unreachable sheet is a *warning*; an invalid mapping file is an *error*. | Matches technical detail 3 ("must not stop the project") for external causes, while still failing loudly on defects that are ours. |

---

## 1. Non-negotiables

1. **Stack unchanged.** Node/Vite, vanilla ES modules, no framework, no TypeScript. The fetcher is a small Node ESM script under `scripts/`, consistent with the existing `scripts/check-content.mjs`.
2. **No proxy, no backend, no server.** GitHub Pages static hosting stays.
3. **The site must build and run with zero progress data.** The Progress block is strictly additive; its absence must never break layout, routing, search, print, or `check:content`.
4. **The sheet is the single source of truth for the taxonomy.** Secção, Área and Trilho names, order and descriptors are never retyped into source code or into components.
5. **Colour is never the only carrier of meaning.** Each Secção has a typical colour, used as an accent alongside the Secção's own name and branch name.
6. **Portuguese (pt-PT), escutista register.** `Secção`, `Trilho`, `Área`, `Progresso Pessoal`, `Lobitos`, `Exploradores`, `Pioneiros`, `Caminheiros`.
7. **Accessibility is a requirement.** WCAG 2.1 AA for a new colour-coded, disclosure-heavy UI.

---

## 2. The core finding: two different kinds of data

This distinction drives the whole design and must not be blurred.

| | Taxonomy | Mapping |
|---|---|---|
| **What** | Which `Secção → Área → Trilho` exist, their order, and their descriptors (`Atitudes/Palavras-chave`, `Será que?`, `O que observar?`) | Which of those trilhos a **given game** touches |
| **Source** | Google Sheet, fetched live | **A human leader.** Not derivable from any available source |
| **Changes** | When CNE revises the Progress framework | When a leader judges a game's contribution |
| **Storage** | `build/progress-taxonomy.json`, generated (§5) | `content.progress.json`, hand-written (§4) |

The original brief asks the pipeline to "generate the connection between games and Personal Progress". It can only **generate the taxonomy** and **validate the connection**. Fabricating the connection would put invented pedagogical claims into a scouting document — unacceptable. `content.progress.json` starts empty and is filled in progressively; an empty mapping is a valid, shippable state.

---

## 3. Source of truth (measured against the live sheet)

Verified by fetching all four tabs.

### 3.1 Access

- Sheet ID `1RHOm4LJZ0mtMH6yp_9ou5DnDK4uqn7MMJBQXRiBvWrg` — **public, no authentication**.
- Tabs: `1Sec`, `2Sec`, `3Sec`, `4Sec`.
- Endpoint used:

  ```
  https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&sheet={TAB}
  ```

  `gviz` + `sheet=<name>` is used deliberately instead of `export?format=csv&gid=…`: it addresses tabs by **name**, so an inserted or reordered tab does not break the build. `gid` is an opaque internal id.

### 3.2 Structure

Columns: `Áreas`, `Trilhos`, `Atitudes/Palavras-chave`, `Será que?`, `O que observar?`.

Per Secção: **6 Áreas × 3 Trilhos = 18 Trilhos**. Across 4 Secções: **72 combinations**. All four tabs are pairwise distinct by SHA-256.

| Secção | Branch | Ages | Typical colour | Trilhos |
|---|---|---|---|---|
| `1Sec` | Lobitos | 6–10 | `RGBA(253, 212, 0, 1)` → `#FDD400` | 18 |
| `2Sec` | Exploradores | 10–14 | `RGBA(63, 165, 53, 1)` → `#3FA535` | 18 |
| `3Sec` | Pioneiros | 14–18 | `RGBA(0, 160, 230, 1)` → `#00A0E6` | 18 |
| `4Sec` | Caminheiros | 18–22 | `RGBA(239, 16, 19, 1)` → `#EF1013` | 18 |

Áreas and Trilhos, identical in name across all four Secções:

| Área | Trilhos |
|---|---|
| Físico | Desempenho · Autoconhecimento · Bem-estar físico |
| Afetivo | Relacionamento e sensibilidade · Equilíbrio emocional · Autoestima |
| Caráter | Autonomia · Responsabilidade · Coerência |
| Espiritual | Descoberta · Aprofundamento · Serviço |
| Intelectual | Procura de conhecimento · Resolução de problemas · Criatividade e expressão |
| Social | Exercer ativamente cidadania · Solidariedade e tolerância · Interação e cooperação |

Descriptors **do** differ per Secção (age-appropriate `Será que?` / `O que observar?`), which is what makes the Secção dimension meaningful even though names repeat.

### 3.3 Four traps in the live data

Every one of these breaks a naive parser. All were reproduced against the live sheet.

| # | Trap | Evidence | Required defence |
|---|------|----------|-------------------|
| **T1** | **Unknown `sheet=` silently returns the first tab with HTTP 200.** | `sheet=99Sec` returned 9 882 bytes, SHA-256 `e5569358…`, **byte-identical to `1Sec`**. | HTTP status is worthless as a check. Validate *shape* and *distinctness* (§5.3). A renamed tab must fail loudly, not silently ship wrong data. |
| **T2** | **Column offsets differ per tab.** | `Áreas`/`Trilhos` are columns **3/4** in `1Sec`, `3Sec`, `4Sec` but **5/6** in `2Sec`. | Locate columns by **header name**, scanning the first rows. Never hardcode indices. |
| **T3** | **Accent drift in a Trilho name.** | `Equilibrio emocional` (no accent) in `1Sec`, `2Sec`, `3Sec`; `Equilíbrio emocional` in `4Sec`. | Identity must be an **accent-insensitive slug**, so both resolve to `trilho-afetivo-equilibrio-emocional`. Otherwise the site grows a phantom 19th trilho. |
| **T4** | **A `NOTA:` row lands in the `Áreas` column.** | `1Sec` row 20 and `3Sec` row 20: `NOTA: Aquando da leitura desde Caderno de Pista, deve ser subentendida a respetiva nomenclatura marítima ou aérea.` | Filter rows whose Área cell matches `^NOTA\b`. It is a footnote, not a 7th Área. |

### 3.4 Reference documents (context, not build inputs)

All five are publicly readable without login — confirmed by fetching each `/view` page:

| Document | Confirmed title |
|---|---|
| [Caderno de Pista — I Secção](https://drive.google.com/file/d/129ouD67XuatPjxL6gdPBVrNkHUVX_3LS/view) | `Caderno de Pista do Lobito` |
| [Caderno de Pista — II Secção](https://drive.google.com/file/d/1fMmcDEX1T3NxNyYmwOKr52Bm7LaHaDcT/view) | `Caderno de Pista do Explorador` |
| [Caderno de Pista — III Secção](https://drive.google.com/file/d/1cQnvbZdMB3ef8o-C9DTlgp87xAl8ZJmn/view) | `Caderno de Pista do Pioneiro` |
| [Caderno de Pista — IV Secção](https://drive.google.com/file/d/1XeQoyoAPpEQCglDbUEbckLqamIwYNqsj/view) | `Caderno de Pista do Caminheiro` |
| [Manual do Dirigente — Progresso Pessoal](https://drive.google.com/file/d/1UU3kkOOKtCqPt7x-rLrcmKrXumwN0mWV/view) | `CNE - Manual Dirigente - Progresso Pessoal` |

These are **human reference only**. Do not scrape or parse them in the pipeline. Each Secção heading in the UI should link to its Caderno so a leader can read the full descriptors; the URLs live in `content.config.json` (`progress.sections[].referenceUrl`), never inline in a component.

---

## 4. The mapping file: `content.progress.json`

Hand-maintained, lives at the repository root next to `content.config.json`, editable by a leader with no tooling. It is the **only** file a non-coder touches for this feature.

```json
{
  "$comment": "Progresso Pessoal por jogo. 'game' = número em content/games-map.json. 'trilhos' = chaves estáveis geradas a partir de build/progress-taxonomy.json.",
  "version": 1,
  "sections": {
    "1Sec": {
      "1": { "trilhos": ["fisico-desempenho", "social-solidariedade-e-tolerancia"] },
      "2": { "trilhos": [] }
    },
    "4Sec": {
      "8": { "trilhos": ["intelectual-resolucao-de-problemas", "social-exercer-ativamente-cidadania"] }
    }
  }
}
```

### 4.1 Rules

- Top level is the **Secção tab name** (`1Sec`…`4Sec`); the game number is the key. Omitting a Secção entirely means "no opinion yet", not "none apply".
- `trilhos` is a **flat list of trilho keys**. The UI groups them into Áreas. Keys are `<area-slug>-<trilho-slug>`, accent- and case-insensitive, generated by the taxonomy builder (§5.2) and discoverable via `npm run progress:keys`.
- The **same game may have a different trilho set per Secção** — the brief's example shows exactly this, and it is pedagogically correct: `Dramatização de Realidades` touches *Equilíbrio emocional* for Lobitos and *Resolução de problemas* for Pioneiros.
- An empty array is valid and means "reviewed, nothing to declare".
- Optional `note` per game per Secção for a short leader-facing remark (e.g. `"note": "Exige material que nem sempre está disponível na sede."`). Max 140 characters; plain text only.
- Do **not** add descriptors, Áreas or Trilho names here. If a name is missing, refresh the taxonomy (§5).

### 4.2 Validation (`npm run progress:check`)

| Condition | Severity |
|---|---|
| `game` not present in `content/games-map.json` | **error** |
| `trilho` key not in the taxonomy | **error** — lists the unknown keys and the nearest valid keys |
| Trilho belongs to a different Secção than the block it sits in | **error** (each Secção exposes all 18, so this catches copy/paste across tabs) |
| Game has no entry for some Secção | **info** — reported, never fatal |
| Taxonomy artefact absent | **warning** — mapping is validated for shape only |
| Unknown top-level key in `sections` | **error** — catches a typo'd `3SEC` |

Errors block `npm run progress:build` but **never** `npm run build` (§6.3).

---

## 5. The taxonomy fetcher

`scripts/progress/fetch-progress.mjs`, plus `scripts/progress/build-progress.mjs` (join + validate + write artefact). Node ESM, `node ≥ 22.12`, **no new dependencies** — `fetch` is global and the CSV is parsed by a small RFC 4180 reader in `scripts/progress/csv.mjs` (quoted fields, embedded newlines, `""` escapes).

### 5.1 Fetch contract

- 4 requests, one per tab, `GET` with `redirect: 'follow'`.
- **Timeout 15 s per tab**, via `AbortSignal.timeout(15000)`. No retry loop longer than 2 attempts, 1 s apart. A hung build is worse than a degraded one.
- On non-2xx **or** a `text/html` content type (the revoked-access case returns HTTP 404 with a Google HTML page), treat the tab as unavailable.
- Optional bearer-token / API-key support via `PROGRESS_SHEET_TOKEN` env var, for the day the sheet stops being public. Absent token ⇒ anonymous access.

### 5.2 Normalisation → stable keys

1. Locate the header row (first row containing both `reas` and `rilhos`), then resolve `areaCol` / `trilhoCol` / descriptor columns **by name** → defeats T2.
2. Drop rows whose Área matches `^NOTA\b` → defeats T4.
3. Forward-fill the Área (the sheet leaves it blank on continuation rows).
4. Reject unknown Áreas against the 6 expected values and warn rather than error, so a future 7th Área surfaces instead of vanishing.
5. Build keys with the existing `slugify()` from `src/content/source-map.js`, extended to be accent- and case-insensitive, then re-`slugify` the result → defeats T3.
6. Split multi-line descriptor cells (`• …`) into ordered arrays of trimmed bullets; drop empties.

### 5.3 Anti-silent-corruption checks (defeat T1)

Run on every fetch, before writing anything:

1. Each tab yields **18** trilhos across **6** Áreas, 3 per Área.
2. The four tabs are **pairwise distinct** by SHA-256 of the normalised payload. If two match, one tab silently shadowed another → **error**.
3. Each tab's payload SHA-256 is compared against `expectedSha256` in `content.config.json`. On mismatch: **warning** listing old and new hash — expected whenever CNE edits the sheet — and the recorded hash is updated in the artefact, never auto-written back into config.
4. Recorded baseline at the time of writing:

   | Tab | SHA-256 of normalised CSV |
   |---|---|
   | `1Sec` | `e556935807e8fb049ff92b3da4b6ca5d4834ba61ac7cf4813e349359bdbc3ddc` |
   | `2Sec` | `d81f7dfe67617c623eafe0aa7c29f4b47830062a4931309de102fc67da850918` |
   | `3Sec` | `6fbc365b28dee1fb9f08f2f518d2f47e6734aa2c8d217bb83aadae9b63206cbd` |
   | `4Sec` | `4707857b2305bf6652be9485fb54f1c67b8fc876b261d2d9ca9d0469c016f0a1` |

### 5.4 Artefact: `build/progress-taxonomy.json`

Committed to git. Generated header, never hand-edited:

```json
{
  "$generated": "DO NOT EDIT — produced by npm run progress:refresh",
  "source": {
    "spreadsheetId": "1RHOm4LJZ0mtMH6yp_9ou5DnDK4uqn7MMJBQXRiBvWrg",
    "url": "https://docs.google.com/spreadsheets/d/…/edit",
    "fetchedAt": "2026-10-03T09:12:44.201Z",
    "endpoint": "gviz/tq?tqx=out:csv&sheet={tab}",
    "sha256": { "1Sec": "e5569358…", "2Sec": "d81f7dfe…", "3Sec": "6fbc365b…", "4Sec": "4707857b…" }
  },
  "sections": {
    "1Sec": {
      "label": "I Secção", "branch": "Lobitos", "ages": "6–10",
      "color": "#FDD400", "referenceUrl": "https://drive.google.com/file/d/129ouD67XuatPjxL6gdPBVrNkHUVX_3LS/view",
      "areas": [
        { "key": "fisico", "name": "Físico", "trilhos": [
          { "key": "fisico-desempenho", "name": "Desempenho",
            "attitudes": ["Saúde", "Atividade física"],
            "questions": ["Gosta de correr, saltar, dançar…"],
            "observations": ["Desembaraça-se bem fisicamente…"] }
        ]}
      ]
    }
  }
}
```

Section label, branch, ages, colour and `referenceUrl` come from `content.config.json` (editorial constants, per the brief) — **not** from the sheet, which does not contain them.

### 5.5 Degradation ladder

| Situation | Behaviour |
|---|---|
| All 4 tabs fetched and valid | Write artefact, `fetchedAt` updated, exit 0 |
| Some tabs fail | **Warning.** Write artefact from the tabs that succeeded, merging the rest from the existing artefact. Missing tab ⇒ `null` for that Secção. Exit 0 |
| All tabs fail, artefact exists | **Warning.** Artefact left byte-identical, `fetchedAt` unchanged. Exit 0 |
| All tabs fail, no artefact | **Error**, but non-fatal to the site (§6.3). Exit 1 with a clear Portuguese message |
| Shape or distinctness check fails | **Error.** Artefact untouched. Exit 1 |

In no case is the existing artefact deleted or truncated.

---

## 6. Build integration

### 6.1 Scripts (`package.json`)

```json
{
  "progress:refresh": "node scripts/progress/build-progress.mjs --refresh",
  "progress:build":   "node scripts/progress/build-progress.mjs",
  "progress:check":   "node scripts/progress/build-progress.mjs --check",
  "progress:keys":    "node scripts/progress/build-progress.mjs --keys"
}
```

`--check` validates offline against the committed artefact and performs **no** network call, so it is safe in CI. `--keys` prints every valid trilho key grouped by Secção, for whoever fills in `content.progress.json`.

### 6.2 Ordering and independence

```
001 content build  ──►  progress:build  ──►  check:content  ──►  test  ──►  build
      (required)          (optional)          (required)       (req)    (req)
```

- `progress:build` **never** runs inside `npm run build` or `prebuild`. It is a deliberate, separate step.
- 001's `content:build` does not import, read or depend on any progress artefact.
- If `build/progress-taxonomy.json` is missing, `npm run build` still succeeds and ships a site with no Progress block.

### 6.3 Failure policy (technical detail 3)

| Failure | Site build | Progress feature |
|---|---|---|
| Sheet unreachable / renamed / private | ✅ succeeds | Degraded to committed artefact; console warning |
| Mapping file has unknown trilho key | ✅ succeeds | `progress:check` errors; UI omits unknown entries and logs them |
| Mapping file absent | ✅ succeeds | Block hidden entirely |
| Artefact absent | ✅ succeeds | Block hidden entirely |
| Artefact malformed | ✅ succeeds | Block hidden; `console.warn` |

**Invariant: no progress-related failure can fail `npm run build`.** Enforced by test (§8.2).

### 6.4 Runtime module: `src/content/progress.js`

Small, pure, dependency-free:

```js
export function loadProgress(taxonomy, selections, { gamesMap })
export function progressForGame(progress, gameNumber)   // → null when absent
export function groupBySection(trilhos)                  // → [{ section, areas: [{ area, trilhos }] }]
export function validateProgress({ taxonomy, selections, gamesMap })
```

- Imports the taxonomy and `content.progress.json` via Vite (`?raw` / `import`), consistent with how `main.js` loads `file.md`.
- `loadProgress` returns `null` on any malformed input — never throws.
- All strings pass through the existing `renderInlineText()` / DOMPurify path; descriptor text is content, therefore untrusted.
- `validateProgress` returns a structured report reused by `progress:check` **and** the tests, so the checker and the runtime cannot disagree.

---

## 7. UI: how it renders

### 7.1 Game card (Cap. 7 hub)

Existing card shows title, area badge, ODS chips, format, duration, participants. Add a compact **Progresso Pessoal** summary:

- One line per Secção, prefixed by a **colour chip** (see §7.3) with the Secção name and branch: `I Secção · Lobitos — 2 trilhos`.
- Trilho names shown as small chips; collapsed beyond 3 with `+N` and a `aria-expanded` toggle revealing the rest. Never truncate silently.
- If the game has no mapping: **omit the block entirely.** Do not print "N/A" or an empty section.
- Whole block is a link to `#/jogo/{n}#progresso`.

### 7.2 Game page (`#/jogo/{n}`)

The brief's exact hierarchy, rendered as a disclosure per Secção:

```
Progresso Pessoal
├─ ▌I Secção · Lobitos · 6–10            [collapsed by default]
│    Físico
│       • Desempenho
│    Social
│       • Solidariedade e tolerância
├─ ▌II Secção · Exploradores · 10–14
│    …
└─ ▌IV Secção · Caminheiros · 18–22
```

Each trilho is expandable to reveal the descriptors straight from the sheet:

- `Atitudes / Palavras-chave`
- `Será que?`
- `O que observar?`

Plus a link to that Secção's **Caderno de Pista**. This is the payoff of fetching descriptors rather than just names: a leader can judge applicability without leaving the site.

Each Secção disclosure is a `<details>`-equivalent with `aria-expanded` + `aria-controls`, reachable by keyboard, first Secção expanded when any mapping exists.

### 7.3 Colour use and contrast

Typical Secção colours are `#FDD400`, `#3FA535`, `#00A0E6`, `#EF1013`.

- **Never** use them as a text background with white text: `#FDD400` with white fails badly, and `#3FA535` fails AA at normal weight.
- Use each colour as a **4 px left rule + chip border + small filled dot**, with the Secção name always in default text colour beside it.
- For any filled chip, pick the label colour by measured contrast, not by guesswork: dark ink on `#FDD400`, white on the other three. Implement as a CSS custom property per Secção, e.g. `--progress-1-accent` / `--progress-1-ink`, and verify both themes.
- The same variables supply the dark theme, where the accent is lightened to hold ≥ 3:1 against the background.
- Add a **Progresso** filter on the Cap. 7 hub: *com Progresso Pessoal declarado* / *sem mapeamento*, plus per-Secção filters reusing the existing `activityMatchesFilters()` machinery and `#filter-status` announcements from 001.

### 7.4 Print

`@media print` expands **all** Secções, shows descriptors, drops filter controls, and keeps the colour rules — a leader should be able to print a game and its progress paths as an A4 sheet.

---

## 8. Verification

### 8.1 New assertions in `scripts/check-content.mjs`

1. If the taxonomy artefact exists: 4 Secções, 6 Áreas each, 18 Trilhos each, 72 trilhos total.
2. Every trilho key is unique and every key's prefix matches its Área key.
3. Every game referenced in `content.progress.json` exists in `content/games-map.json`.
4. Every referenced trilho key exists in the taxonomy for that Secção.
5. No `A_secção` colour is used as a text background anywhere in the CSS.
6. With the artefact **deleted**, the build still succeeds and the DOM contains no `progresso` block (regression test for §6.3).
7. **Provenance is fresh:** warn when `source.fetchedAt` is older than 90 days.

### 8.2 New Vitest file: `tests/progress.test.js`

- Taxonomy loader: 18/6/3 shape; `NOTA:` rows filtered (T4); header-name column resolution works for a `2Sec`-style offset (T2); `Equilibrio` vs `Equilíbrio` collapse to one key (T3).
- **Silent-fallback guard (T1):** given two tabs with identical payload hashes, `validateProgress`/the builder must report an error.
- Mapping validation: unknown game ⇒ error; unknown trilho ⇒ error with nearest-match suggestions; cross-Secção trilho ⇒ error; missing Secção ⇒ info only.
- **Degradation:** every artefact-absent / malformed / empty case renders without throwing and produces no progress DOM.
- Renderer: hierarchy output is `Secção → Área → Trilho`; all four Secções distinguishable without colour (text + `data-section` attribute present).
- Security: descriptor text containing `<script>` or `javascript:` is stripped via the existing DOMPurify/`sanitizeUrl` path.
- Filters: the Progresso filter narrows correctly and announces via `#filter-status`.

### 8.3 Definition of Done

- [ ] `npm run progress:refresh` populates `build/progress-taxonomy.json` with 4/6/18/72 and provenance.
- [ ] `npm run progress:keys` lists all valid trilho keys per Secção.
- [ ] `npm run progress:check` passes on a valid `content.progress.json` and fails helpfully on a bad one.
- [ ] Game cards show the compact Secção summary; game pages show the full `Secção → Área → Trilho` hierarchy with descriptors.
- [ ] All four Secções distinguishable in both themes without relying on colour alone; contrast verified.
- [ ] Deep link `#/jogo/{n}#progresso` opens the block expanded and focused.
- [ ] **With the network disabled, `npm run build` succeeds** and the site ships the committed taxonomy.
- [ ] **With `build/progress-taxonomy.json` deleted, `npm run build` succeeds** and no progress block renders, with no console errors.
- [ ] A renamed `2Sec` tab produces a **loud failure**, not silently duplicated data (T1 verified by test, not by inspection).
- [ ] `npm test`, `npm run check:content`, `npm run build` all pass.
- [ ] `docs/EDITORIAL.md` (from 001) gains a plain-Portuguese section: how to fill in `content.progress.json`, with the `progress:keys` output pasted in as the list of valid values.

### 8.4 Non-coder workflow addition

```powershell
npm run progress:refresh   # "fui buscar as folhas do CNE"
npm run progress:keys      # "que valores posso usar?"
# edit content.progress.json in any text editor
npm run progress:check     # "está certo?"
```

`scripts\run.cmd` from 001 gains a fourth step, **non-fatal**, so a leader without internet is never blocked. A Portuguese one-liner explains `content.progress.json`; its `$comment` field doubles as in-file documentation.

### 8.5 Non-goals

No runtime browser fetch (impossible without a proxy — D1). No scraping the Caderno de Pista PDFs. No inference of mappings from game text. No progress *tracking*, sign-off or persistence of a child's progress — this is reference information for leaders, not an assessment tool. No changes to 001's parser, renderer, interactions or styles beyond additive rules. No new npm dependencies. No OAuth, service account or Sheets API key unless the sheet stops being public.

---

## 9. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Tab renamed (e.g. `2Sec` → `2 Secção`) | Silent wrong data — **the dangerous one** | T1 defences: shape + pairwise-distinctness checks; hard error; test coverage |
| Sheet made private | Total loss of the taxonomy | D2 committed artefact; §5.5 ladder; `PROGRESS_SHEET_TOKEN` escape hatch |
| Network flake in CI | Flaky builds | `--check` never touches the network; fetch only in the explicit `progress:refresh` |
| Taxonomy drifts from `content.progress.json` | Unknown trilho keys | §4.2 validation, errors with nearest-match suggestions |
| Accent drift introduces phantom trilhos | Duplicate, unlinkable entries | Accent-insensitive slug keys (T3) |
| Someone "helpfully" hand-edits the artefact | Silent divergence, undetectable | `$generated` header, `check-content.mjs` hash/freshness assertions, review discipline |
| Mappings treated as authoritative assessment | Pedagogical harm | UI language is advisory ("trilhos que este jogo podeContributor para"); §8.5 excludes tracking |
| Colour-only section identity | WCAG failure | §7.3 — colour as accent only, name always present, contrast verified in both themes |
| Feature becomes a hard build dependency | Violates detail 3 | §6.2 ordering; §8.2 degradation tests |