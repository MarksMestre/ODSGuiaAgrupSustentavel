"""Gera as fichas de jogo em Markdown e a versão HTML para impressão.

Os rótulos vêm do molde `00GameSheetTemplate.docx`, lido em tempo de execução.
Nada é escrito à mão: se alguém acrescentar uma linha ao molde no Word, as
fichas passam a ter essa linha sem qualquer alteração de código.
"""

from __future__ import annotations

import html
import pathlib
import re
from dataclasses import dataclass

from . import clean
from .games import Game, Step

# Rótulo do molde (normalizado) -> campo interno de `Game` que o preenche.
# A ordem é significativa: os rótulos mais específicos vêm primeiro, para que
# `Objetivos de Desenvolvimento Sustentável` não seja capturado por `Objetivos`.
_LABEL_SOURCES = (
    ('objetivos-de-desenvolvimento-sustentavel', 'ods'),
    ('objetivos-de-desenvolvimentoods', 'ods'),
    ('ods', 'ods'),
    ('duracao-e-participantes', 'duration_participants'),
    ('sistema-de-especialidades', 'progress'),
    ('nome-do-jogo', 'title'),
    ('material', 'materials'),
    ('instrucoes', 'instructions'),
    ('progresso', 'progress'),
    ('objetivos', 'objectives'),
)

PROGRESS_PLACEHOLDER = '*A preencher pelo animador.*'
MISSING_VALUE = '—'


@dataclass(frozen=True)
class TemplateSchema:
    """Os rótulos do molde, por ordem."""

    labels: tuple[str, ...]

    @property
    def normalised(self) -> tuple[str, ...]:
        return tuple(clean.slugify(label) for label in self.labels)


def read_template(path: pathlib.Path) -> TemplateSchema:
    """Lê os rótulos da primeira coluna da tabela do molde."""
    from . import ooxml  # import local evita ciclo

    with ooxml.Document(path) as document:
        tables = document.tables()
        if not tables:
            raise ValueError(
                f'{path.name}: não encontrei nenhuma tabela. '
                'O molde tem de ter uma tabela com os rótulos na primeira coluna.'
            )
        labels: list[str] = []
        for row in tables[0].rows:
            if not row:
                continue
            # Uma célula pode conter várias linhas (`Progresso\nSistema de
            # Especialidades`); o rótulo é a frase inteira, não a primeira.
            label = ' '.join(
                part.strip() for part in row[0].splitlines() if part.strip()
            ).strip()
            if label:
                labels.append(label)
        if not labels:
            raise ValueError(f'{path.name}: a tabela do molde está vazia.')
        return TemplateSchema(labels=tuple(labels))


# ------------------------------------------------------------- field values

def resolve_field(label: str) -> str | None:
    """Traduz um rótulo do molde no campo interno que o preenche.

    A comparação ignora acentos, maiúsculas e pontuação, e o `slugify` do
    projeto não preserva `ç` nem acentos, pelo que o rótulo dos ODS normaliza
    para `objetivos-de-desenvolvimentoods`. Os rótulos mais específicos são
    testados primeiro para que `Objetivos` não roube o campo do rótulo longo.
    """
    key = clean.slugify(label)
    for suffix, field_name in _LABEL_SOURCES:
        if key == suffix or key.endswith(suffix):
            return field_name
    return None


def _cell_value(game: Game, label: str, placeholder: str) -> str:
    """Valor de uma célula da ficha, com `—` no que falta."""
    field_name = resolve_field(label)
    if field_name is None:
        # Rótulo novo no molde: fica visível para o editor ver o que falta.
        return MISSING_VALUE
    if field_name == 'title':
        return game.title
    if field_name == 'ods':
        return _format_ods(game)
    if field_name == 'objectives':
        return game.dynamics or MISSING_VALUE
    if field_name == 'duration_participants':
        return _format_duration(game)
    if field_name == 'materials':
        return game.materials or MISSING_VALUE
    if field_name == 'instructions':
        return _format_instructions(game)
    if field_name == 'progress':
        return placeholder
    return MISSING_VALUE


def _format_ods(game: Game) -> str:
    if not game.ods:
        return MISSING_VALUE
    if len(game.ods) == 17:
        return 'Todos os ODS'
    names = ' '.join(f'({name})' for name in game.ods_names)
    return f"**ODS {', '.join(str(code) for code in game.ods)}** {names}".strip()


def _format_duration(game: Game) -> str:
    """O molde tem uma única linha para formato, participantes e duração.

    `Formato` não tem linha própria no molde, pelo que entra como lead-in em
    negrito dentro de "Duração e Participantes" — a informação é preservada sem
    inventar uma linha nova.

    As três entradas ficam em linhas separadas: é o que o animador procura quando
    tem a ficha na mão, e uma frase corrida de três campos difficultava de ler.
    """
    parts: list[str] = []
    if game.game_format:
        parts.append(f"**Formato:** {game.game_format}")
    if game.participants:
        parts.append(f"**Participantes:** {game.participants}")
    if game.duration:
        parts.append(f"**Duração:** {game.duration}")
    return '\n'.join(parts) if parts else MISSING_VALUE


def _format_instructions(game: Game) -> str:
    """As instruções em Markdown, com a hierarquia do Word.

    Os números são escritos à mão porque, dentro de uma célula de tabela uma lista
    Markdown não reinicia: um `<ol>` que aparece depois de outro continua a
    contagem. Escrever o número garante que a "Parte 2" recomeça em 1, e é a
    diferença entre o que o animador lê no Word e o que lia na ficha.
    """
    if not game.detailed_steps:
        return game.dynamics or MISSING_VALUE

    # Um único contador para todos os blocos: é ele que faz o passo 2 continuar
    # o 1 apesar da frase pelo meio, e a "Parte 2" recomeçar em 1.
    counter = _Counter()
    blocks = [
        _markdown_block(block, counter)
        for block in step_tree(game.detailed_steps)
    ]
    # `<br>` entre blocos, e não `\n`: dentro de uma célula de tabela cada
    # `\n` virar-se-ia `<br>` no meio das etiquetas de lista, e a marcação deixaria
    # de ser válida.
    return '<br>'.join(blocks)


class _Counter:
    """A numeração dos passos, partilhada por toda a ficha.

    Só um cabeçalho de etapa a reinicia. Uma frase de prosa pelo meio (`Local: …`,
    no jogo 1) não reinicia, porque o passo que se segue é a continuação da
    mesma lista — é a diferença entre o animador ler «2.» e ler «1.» outra vez.
    """

    __slots__ = ('_value',)

    def __init__(self) -> None:
        self._value = 0

    def next(self) -> int:
        self._value += 1
        return self._value

    def reset(self) -> None:
        self._value = 0


class _Node:
    """Um passo e as listas que dependem dele."""

    __slots__ = ('step', 'children')

    def __init__(self, step: Step) -> None:
        self.step = step
        self.children: list[list[_Node]] = []


def step_tree(steps: list[Step]) -> list[_Node | Step | list[_Node]]:
    """Agrupa os passos numa árvore, para as listas saírem aninhadas.

    Devolve uma lista de blocos de topo: um `Step` solto (um cabeçalho ou uma
    frase) ou uma lista de nós do mesmo tipo. Uma lista filha vive **dentro** do
    `<li>` que a precede — é o que a torna uma sub-lista, e não uma lista irmã
    que só por acaso aparece a seguir.
    """
    roots: list[_Node | Step | list[_Node]] = []
    # (nível, nó pai) da última lista aberta em cada profundidade.
    stack: list[tuple[int, _Node]] = []

    def add_to(parent: _Node | None, node: _Node) -> None:
        siblings = parent.children if parent is not None else roots
        if (
            siblings
            and isinstance(siblings[-1], list)
            and siblings[-1][0].step.kind == node.step.kind
        ):
            siblings[-1].append(node)
        else:
            siblings.append([node])

    for step in steps:
        if step.kind in ('heading', 'para'):
            # Uma frase entre dois passos — `Local: Aldeia…` no jogo 1 — é um
            # bloco de fora, mas **não** recomeça a numeração: o passo seguinte
            # continua o 2. É por isso que a contagem vive no serializador, e não
            # no agrupamento.
            stack = []
            roots.append(step)
            continue

        node = _Node(step)
        while stack and stack[-1][0] >= step.level:
            stack.pop()

        # O pai é o nó do nível imediatamente acima. Sem ele, o passo é de fora:
        # não se inventa hierarquia que o Word não tem.
        parent = stack[-1][1] if stack and stack[-1][0] == step.level - 1 else None
        if parent is None:
            stack = []
            add_to(None, node)
        else:
            add_to(parent, node)

        stack.append((step.level, node))

    return roots


def _markdown_block(block: _Node | Step | list[_Node], counter: _Counter) -> str:
    if isinstance(block, Step):
        if block.kind == 'heading':
            counter.reset()
            return f'<strong>{block.text}</strong>'
        return block.text
    return _markdown_list(block, counter)


def _markdown_list(nodes: list[_Node], counter: _Counter) -> str:
    """Escreve uma lista.

    A contagem é gerida por `_Counter`, que só reinicia num cabeçalho de etapa.
    É essa distinção que dá os dois comportamentos de que o animador precisa: um
    "Local: …" a meio da lista não reinicia a contagem (o passo seguinte continua
    o 2), mas uma "Parte 2" recomeça em 1.
    """
    tag = 'ol' if nodes[0].step.kind == 'ordered' else 'ul'
    items: list[str] = []
    for node in nodes:
        marker = ''
        if node.step.kind == 'ordered':
            marker = f'<strong>{counter.next()}.</strong> '
        nested = ''.join(_markdown_list(children, counter) for children in node.children)
        items.append(f'<li>{marker}{node.step.text}{nested}</li>')
    return f'<{tag}>{"".join(items)}</{tag}>'


def format_ods(game: Game) -> str:
    """ODS legível, para a ficha e para o mapa de jogos."""
    return _format_ods(game)


# --------------------------------------------------------------- markdown

def _markdown_table(labels: tuple[str, ...], values: tuple[str, ...]) -> list[str]:
    """Tabela de duas colunas com as chaves`|`, com quebras `\n` para multi-linha."""
    lines = ['| Campo | Valor |', '| --- | --- |']
    for label, value in zip(labels, values):
        lines.append(f'| {_escape_cell(label)} | {_escape_cell(value)} |')
    return lines


def _escape_cell(value: str) -> str:
    """Escapa o conteúdo de uma célula e converte quebras em `<br>`.

    A hierarquia das instruções já vem em `<ol>`/`<ul>` de `_format_instructions`,
    por isso esta função só tem de preservar a marcação que existe e não
    destruir as quebras de linha que o `Duração e Participantes` usa para separar
    formato, participantes e duração.
    """
    text = value.replace('|', r'\|')
    text = re.sub(r'\s*\n\s*', '<br>', text.strip())
    return text


# A área editorial vem em português; a classe CSS do sítio é em inglês
# (`.activity-card--planet`). O mapeamento é explícito para que uma das cinco
# não caia na cor de outra sem dar erro — o que aconteceria com uma
# correspondência por semelhança, porque «Pessoas» e «Parcerias» partilham a
# letra «P».
AREA_CLASSES = {
    'pessoas': 'people',
    'planeta': 'planet',
    'prosperidade': 'prosperity',
    'paz': 'peace',
    'parcerias': 'partnerships',
}


def area_slug(area: str) -> str:
    """A classe CSS da área, para a barra colorida da ficha.

    O mesmo mapeamento que o site usa nos cartões do Capítulo 7
    (`.activity-card--planet`), para que a ficha impressa e a página do jogo
    tenham a mesma cor de área. A comparação é feita sobre o texto sem acentos,
    para que «Área da Paz» e «Área da Prosperidade» não confundam oReader.
    """
    plain = clean.strip_accents(area).lower()
    # `Área das Pessoas` -> `pessoas`. A palavra é a última, depois de `da`/`das`.
    for word in reversed(plain.split()):
        if word in AREA_CLASSES:
            return AREA_CLASSES[word]
    return 'planet'


_ROOT_BLOCK_RE = re.compile(r':root\s*\{(?P<body>[^{}]*)\}', re.DOTALL)


def design_tokens(styles_path: pathlib.Path) -> str:
    """As custom properties de `:root`, lidas de `src/styles.css`.

    A ficha de impressão é um ficheiro autónomo e não pode carregar a folha do
    sítio (é copiada para `dist/` e aberta directamente), mas também não deve ter
    a sua própria paleta: seria uma segunda fonte de verdade, e foi assim que as
    duas se separaram. Lê-se o bloco `:root` do sítio e usa-se tal e qual.
    """
    if not styles_path.exists():
        raise ValueError(
            f'{styles_path.name} não existe. A ficha de impressão usa as cores do '
            'sítio; restaure src/styles.css ou aponte a configuração para ele.'
        )
    text = styles_path.read_text(encoding='utf-8')
    match = _ROOT_BLOCK_RE.search(text)
    if not match:
        raise ValueError(
            f'{styles_path.name}: não encontrei o bloco ":root {{ … }}" com as '
            'cores do tema. A ficha de impressão depende dele.'
        )
    declarations = '\n'.join(
        f'      {line.strip()}'
        for line in match.group('body').splitlines()
        if line.strip() and not line.strip().startswith('/*')
    )
    return f'      :root {{\n{declarations}\n      }}'


def render_html(
    game: Game,
    schema: TemplateSchema,
    styles_path: pathlib.Path | None = None,
) -> str:
    """Versão autónoma para impressão (ver `_html_document`)."""
    if styles_path is None:
        styles_path = pathlib.Path(__file__).resolve().parents[2] / 'src' / 'styles.css'
    return _html_document(game, schema, styles_path)


def render_markdown(game: Game, schema: TemplateSchema) -> str:
    values = tuple(
        _cell_value(game, label, PROGRESS_PLACEHOLDER)
        for label in schema.labels
    )
    heading = f'# {game.sheet_name}'
    subtitle = f'*{game.area} · jogo {game.number}*'
    body = '\n'.join(_markdown_table(schema.labels, values))

    parts = [
        heading,
        '',
        subtitle,
        '',
        f'**Título:** {game.title}',
        '',
        body,
        '',
    ]
    if game.tables:
        for table in game.tables:
            parts.extend(_render_table(table))
            parts.append('')
    return '\n'.join(parts).rstrip() + '\n'


def _render_table(rows: list[list[str]]) -> list[str]:
    if not rows:
        return []
    width = max(len(row) for row in rows)
    header = ['Categoria de Despesa', 'Custo', 'Pontos de Estatuto Social'][:width]
    lines = ['| ' + ' | '.join(header) + ' |',
             '| ' + ' | '.join('---' for _ in header) + ' |']
    for row in rows:
        cells = list(row) + [''] * (width - len(row))
        lines.append('| ' + ' | '.join(cell.replace('|', r'\|') for cell in cells) + ' |')
    return lines


# ------------------------------------------------------------------- html

def _html_document(
    game: Game, schema: TemplateSchema, styles_path: pathlib.Path
) -> str:
    area_class = f'sheet--{area_slug(game.area)}'
    rows = '\n'.join(
        '      <tr><th scope="row">{}</th><td>{}</td></tr>'.format(
            html.escape(label),
            _html_value(game, label),
        )
        for label in schema.labels
    )
    tables = '\n'.join(
        '    <table>\n      <caption>Tabela de apoio</caption>\n'
        + '\n'.join(
            '      <tr>' + ''.join(f'<td>{html.escape(cell)}</td>' for cell in row) + '</tr>'
            for row in table
        )
        + '\n    </table>'
        for table in game.tables
    )
    ods = ', '.join(str(code) for code in game.ods) or MISSING_VALUE

    # A paleta vem do sítio (`src/styles.css`), para que a ficha impressa e a
    # página do jogo não sejam duas coisas diferentes. Sem esta leitura, uma
    # alteração de cor no tema deixaria as 60 fichas para trás.
    tokens = design_tokens(styles_path)

    return f"""<!doctype html>
<html lang="pt-PT">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{html.escape(game.title)} — Ficha de Jogo</title>
    <style>
{tokens}
      :root {{ color-scheme: light; }}
      * {{ box-sizing: border-box; }}
      body {{
        font-family: var(--font-sans);
        color: var(--ink);
        background: var(--paper);
        margin: 0 auto;
        max-width: 46rem;
        padding: 1.5rem;
        line-height: 1.65;
      }}
      .sheet {{
        --area-color: var(--green-600);
        padding: clamp(1.1rem, 2.5vw, 1.6rem);
        border: 1px solid var(--line);
        border-inline-start: 0.35rem solid var(--area-color);
        border-radius: var(--radius-md);
        background: var(--paper-raised);
        box-shadow: var(--shadow-sm);
      }}
      .sheet--people {{ --area-color: var(--people); }}
      .sheet--planet {{ --area-color: var(--planet); }}
      .sheet--prosperity {{ --area-color: var(--prosperity); }}
      .sheet--peace {{ --area-color: var(--peace); }}
      .sheet--partnerships {{ --area-color: var(--partnerships); }}
      .area-label {{
        margin: 0 0 .2rem;
        color: var(--ink-muted);
        font-size: .72rem;
        font-weight: 850;
        letter-spacing: .08em;
        text-transform: uppercase;
      }}
      h1 {{
        margin: 0 0 .5rem;
        color: var(--green-900);
        font-family: var(--font-serif);
        font-size: 1.6rem;
        font-weight: 500;
        letter-spacing: -.02em;
        line-height: 1.15;
      }}
      .meta {{ color: var(--ink-muted); font-size: .9rem; margin: 0 0 1.25rem; }}
      table {{ border-collapse: collapse; width: 100%; margin-bottom: 1rem; }}
      caption {{ text-align: start; font-weight: 700; padding-bottom: .35rem; }}
      th, td {{
        border: 1px solid var(--line);
        padding: .5rem .6rem;
        text-align: start;
        vertical-align: top;
      }}
      th {{ width: 34%; background: var(--paper-soft); font-weight: 600; }}
      td p {{ margin: 0 0 .4rem; }}
      td p:last-child {{ margin-bottom: 0; }}
      td ol, td ul {{ margin: .2rem 0; padding-inline-start: 1.35rem; }}
      td ol {{ list-style: none; }}
      td > ol > li {{ margin-bottom: .3rem; }}
      .step-number {{ font-weight: 700; }}
      .step-heading {{
        margin: .8rem 0 .3rem;
        color: var(--green-900);
        font-size: 1rem;
      }}
      .step-heading:first-child {{ margin-top: 0; }}
      footer {{
        margin-top: 1.5rem;
        font-size: .8rem;
        color: var(--ink-muted);
        border-top: 1px solid var(--line);
        padding-top: .6rem;
      }}
      @media print {{
        @page {{ margin: 16mm 14mm; }}
        :root {{
          --paper: #fff;
          --paper-raised: #fff;
          --paper-soft: #fff;
          --ink: #000;
          --ink-muted: #333;
          --line: #aaa;
        }}
        body {{ padding: 0; font-size: 10.5pt; background: #fff; }}
        h1 {{ font-size: 15pt; }}
        .sheet {{ box-shadow: none; }}
        table, tr {{ break-inside: avoid; }}
        tr {{ break-inside: avoid; }}
        * {{ print-color-adjust: exact; -webkit-print-color-adjust: exact; }}
      }}
    </style>
  </head>
  <body>
    <div class="sheet {area_class}">
      <p class="area-label">{html.escape(game.area)}</p>
      <h1>{html.escape(game.title)}</h1>
      <p class="meta">Jogo {game.number} · ODS: {html.escape(ods)}</p>
      <table>
        <caption>Ficha do jogo</caption>
        <tbody>
{rows}
        </tbody>
      </table>
{tables}
    </div>
    <footer>
      Kit Agrupamento Sustentável · Corpo Nacional de Escutas · Compromisso 2030.<br />
      Ficha gerada a partir do conteúdo editorial. Não substitui o Capítulo 7 do guia.
    </footer>
  </body>
</html>
"""


def _html_value(game: Game, label: str) -> str:
    """Converte o valor de uma célula em HTML seguro.

    O `**` que o editor via à vista nas fichas vem de aqui: o Markdown das
    células nunca era interpretado, só escapado. Agora é renderizado — depois de
    escapar o texto, para que nenhum caractere editorial se possa tornar marcação.
    """
    field_name = resolve_field(label)
    if field_name == 'instructions':
        return _html_instructions(game)
    value = _cell_value(game, label, PROGRESS_PLACEHOLDER)
    if value == MISSING_VALUE:
        return '<p>—</p>'
    return '<p>' + _inline_markdown(html.escape(value)).replace('\n', '<br />') + '</p>'


def _html_instructions(game: Game) -> str:
    """As instruções em HTML, com a mesma hierarquia do Markdown.

    Vem do mesmo `detailed_steps`, por isso as duas versões da ficha não podem
    divergir — o `.md` e o `.html` são duas maneiras de escrever a mesma lista.
    """
    if not game.detailed_steps:
        value = game.dynamics or MISSING_VALUE
        if value == MISSING_VALUE:
            return '<p>—</p>'
        return '<p>' + _inline_markdown(html.escape(value)) + '</p>'

    counter = _Counter()
    return ''.join(
        _html_block(block, counter)
        for block in step_tree(game.detailed_steps)
    )


def _html_block(block: _Node | Step | list[_Node], counter: _Counter) -> str:
    if isinstance(block, Step):
        text = _inline_markdown(html.escape(block.text))
        if block.kind == 'heading':
            counter.reset()
            return f'<h4 class="step-heading">{text}</h4>'
        return f'<p>{text}</p>'
    return _html_list(block, counter)


def _html_list(nodes: list[_Node], counter: _Counter) -> str:
    """Uma lista em HTML, com o mesmo número que o Markdown escreve.

    O `<ol>` do HTML recomeça sozinho a cada bloco, por isso o número explícito
    é o que garante que os dois ficheiros mostram a mesma coisa ao animador.
    """
    tag = 'ol' if nodes[0].step.kind == 'ordered' else 'ul'
    items: list[str] = []
    for node in nodes:
        text = _inline_markdown(html.escape(node.step.text))
        if node.step.kind == 'ordered':
            text = f'<span class="step-number">{counter.next()}.</span> {text}'
        nested = ''.join(_html_list(children, counter) for children in node.children)
        items.append(f'<li>{text}{nested}</li>')
    return f'<{tag}>{"".join(items)}</{tag}>'


_BOLD_RE = re.compile(r'\*\*(.+?)\*\*', re.DOTALL)
_ITALIC_RE = re.compile(r'(?<!\*)\*([^*\n]+?)\*(?!\*)')
_CODE_RE = re.compile(r'`([^`\n]+?)`')


def _inline_markdown(text: str) -> str:
    """Negrito, itálico e código — depois de o texto já estar escapado.

    Só o que as fichas usam. `$100€$` fica como está: a ficha é autónoma e não
    pode carregar o KaTeX, e um valor monetário meio renderizado é pior do que
    um valor monetário legível. Os `$` escapados (`&#36;`) também não são
    tocado, para não partir o que o `html.escape` acabou de proteger.
    """
    result = _BOLD_RE.sub(r'<strong>\1</strong>', text)
    result = _ITALIC_RE.sub(r'<em>\1</em>', result)
    result = _CODE_RE.sub(r'<code>\1</code>', result)
    return result


# ------------------------------------------------------------------ escrita

def write_atomic(path: pathlib.Path, content: str) -> None:
    """Escreve de forma atómica, para uma interrupção não deixar ficheiro a meio."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    # newline='\n' para o conteúdo ser igual em Windows e Linux.
    temporary.write_text(content, encoding='utf-8', newline='\n')
    temporary.replace(path)