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
from .games import Game

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

    `Formato` não tem linha própria no molde, pelo que entra comolead-in em
    negrito dentro de "Duração e Participantes" — a informação é preservada sem
    inventar uma linha nova.
    """
    parts: list[str] = []
    if game.game_format:
        parts.append(f"**Formato:** {game.game_format}")
    if game.participants:
        parts.append(f"**Participantes:** {game.participants}")
    if game.duration:
        parts.append(f"**Duração:** {game.duration}")
    return ' '.join(parts) if parts else MISSING_VALUE


def _format_instructions(game: Game) -> str:
    if game.detailed_steps:
        lines = [f'{index}. {step}' for index, step in enumerate(game.detailed_steps, 1)]
        return '\n'.join(lines)
    return game.dynamics or MISSING_VALUE


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

    As instruções são listas numeradas; dentro de uma célula de tabela não são
    válidas, por isso viram linhas separadas por `<br>`.
    """
    text = value.replace('|', r'\|')
    text = re.sub(r'\s*\n\s*', '<br>', text.strip())
    return text


def render_html(game: Game, schema: TemplateSchema) -> str:
    """Versão autónoma para impressão (ver `_html_document`)."""
    return _html_document(game, schema)


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

def _html_document(game: Game, schema: TemplateSchema) -> str:
    rows = '\n'.join(
        '      <tr><th scope="row">{}</th><td>{}</td></tr>'.format(
            html.escape(label),
            _html_value(_cell_value(game, label, PROGRESS_PLACEHOLDER)),
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

    return f"""<!doctype html>
<html lang="pt-PT">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{html.escape(game.title)} — Ficha de Jogo</title>
    <style>
      :root {{ color-scheme: light; }}
      body {{
        font-family: system-ui, "Segoe UI", Tahoma, Arial, sans-serif;
        color: #16211c;
        background: #fff;
        margin: 0 auto;
        max-width: 46rem;
        padding: 1.5rem;
        line-height: 1.5;
      }}
      h1 {{ font-size: 1.5rem; margin: 0 0 .25rem; }}
      .meta {{ color: #4a5b52; font-size: .9rem; margin: 0 0 1.25rem; }}
      table {{ border-collapse: collapse; width: 100%; margin-bottom: 1rem; }}
      caption {{ text-align: left; font-weight: 700; padding-bottom: .35rem; }}
      th, td {{ border: 1px solid #c3cec8; padding: .5rem .6rem; text-align: left; vertical-align: top; }}
      th {{ width: 34%; background: #f2f6f4; font-weight: 600; }}
      td ol {{ margin: 0; padding-left: 1.2rem; }}
      td p {{ margin: 0 0 .4rem; }}
      footer {{ margin-top: 1.5rem; font-size: .8rem; color: #4a5b52; border-top: 1px solid #c3cec8; padding-top: .6rem; }}
      @media print {{
        body {{ padding: 0; font-size: 11pt; }}
        h1 {{ font-size: 15pt; }}
        table {{ break-inside: avoid; }}
        tr {{ break-inside: avoid; }}
      }}
    </style>
  </head>
  <body>
    <h1>{html.escape(game.title)}</h1>
    <p class="meta">{html.escape(game.area)} · Jogo {game.number} · ODS: {html.escape(ods)}</p>
    <table>
      <caption>Ficha do jogo</caption>
      <tbody>
{rows}
      </tbody>
    </table>
{tables}
    <footer>
      Kit Agrupamento Sustentável · Corpo Nacional de Escutas · Compromisso 2030.<br />
      Ficha gerada a partir do conteúdo editorial. Não substitui o Capítulo 7 do guia.
    </footer>
  </body>
</html>
"""


def _html_value(value: str) -> str:
    """Converte o valor da célula em HTML seguro."""
    if value == MISSING_VALUE:
        return '<p>—</p>'

    escaped = html.escape(value)
    if re.match(r'^\s*\d+\.\s', value):
        items = re.findall(r'^\s*\d+\.\s*(.+)$', value, flags=re.MULTILINE)
        if items:
            lis = ''.join(f'<li>{html.escape(item)}</li>' for item in items)
            return f'<ol>{lis}</ol>'
    return '<p>' + escaped.replace('\n', '<br />') + '</p>'


# ------------------------------------------------------------------ escrita

def write_atomic(path: pathlib.Path, content: str) -> None:
    """Escreve de forma atómica, para uma interrupção não deixar ficheiro a meio."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    # newline='\n' para o conteúdo ser igual em Windows e Linux.
    temporary.write_text(content, encoding='utf-8', newline='\n')
    temporary.replace(path)