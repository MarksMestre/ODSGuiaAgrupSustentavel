"""Leitura de OOXML a partir do XML bruto do Word.

Porquê não `python-docx`?
-----------------------
Os títulos de capítulo (`Capítulo 1: …` … `Capítulo 8: …`) vivem dentro de
caixas de texto (`w:txbxContent`) encaixadas em `mc:AlternateContent`.
`python-docx` não desce a essa estrutura, pelo que uma extração ingénua perde
silenciosamente todos os títulos de capítulo. Verificado: em `source1.docx` há
192 caixas de texto e `document.paragraphs` não devolve nenhum título.

Ao descer, lê-se apenas `mc:Choice` e descarta-se `mc:Fallback`: o Fallback
duplica o conteúdo para leitores antigos, o que faria cada texto aparecer duas
vezes.
"""

from __future__ import annotations

import hashlib
import pathlib
import re
import zipfile
from dataclasses import dataclass, field
from typing import Iterator
from xml.etree import ElementTree as ET

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006'
DRAWING_WRAPPERS = frozenset({
    'drawing', 'pict', 'anchor', 'inline', 'graphic', 'txbx', 'wsp', 'sp',
    'AlternateContent', 'Choice', 'Fallback',
})


def _tag(namespace: str, name: str) -> str:
    return f'{{{namespace}}}{name}'


def _local(element: ET.Element) -> str:
    return element.tag.split('}')[-1] if '}' in element.tag else element.tag


@dataclass
class Block:
    """Um bloco de corpo na ordem de leitura."""

    kind: str  # 'paragraph' | 'table'
    style: str | None = None
    heading_level: int | None = None
    text: str = ''
    rows: list[list[str]] = field(default_factory=list)
    in_textbox: bool = False

    @property
    def is_heading(self) -> bool:
        return self.heading_level is not None


def _paragraph_text(paragraph: ET.Element) -> str:
    """Texto *próprio* de um parágrafo.

    Não desce para dentro de desenhos, picts ou caixas de texto: o texto de uma
    caixa de texto ancorada neste parágrafo é conteúdo diferente, e incluí-lo
    aqui polui o texto do parágpio (foi assim que "10 Passos para planeear..."
    apareceu como "242410 Passos...").
    """
    parts: list[str] = []

    def walk(node: ET.Element) -> None:
        for child in node:
            name = _local(child)
            if name == 't':
                parts.append(child.text or '')
            elif name == 'tab':
                parts.append('\t')
            elif name in ('br', 'cr'):
                parts.append('\n')
            elif name == 'noBreakHyphen':
                parts.append('-')
            elif name in DRAWING_WRAPPERS:
                continue  # conteúdo de caixa de texto: tratado à parte
            else:
                walk(child)

    walk(paragraph)
    return ''.join(parts)


def _textboxes(paragraph: ET.Element) -> list[ET.Element]:
    """Caixas de texto ancoradas num parágrafo, ignorando `mc:Fallback`.

    O Word duplica o conteúdo em `mc:Choice` e `mc:Fallback`; sem este filtro
    cada título de capítulo apareceria duas vezes.
    """
    found: list[ET.Element] = []

    def walk(node: ET.Element, in_fallback: bool) -> None:
        for child in node:
            name = _local(child)
            if name == 'Fallback':
                walk(child, True)
                continue
            if name == 'txbxContent':
                if not in_fallback:
                    found.append(child)
                continue
            walk(child, in_fallback)

    walk(paragraph, False)
    return found


_HEADING_RE = re.compile(r'^Heading\s*(\d+)$', re.IGNORECASE)


def _paragraph_style(paragraph: ET.Element) -> str | None:
    props = paragraph.find(_tag(W, 'pPr'))
    if props is None:
        return None
    style = props.find(_tag(W, 'pStyle'))
    if style is None:
        return None
    return style.get(_tag(W, 'val'))


def _heading_level(style: str | None) -> int | None:
    if not style:
        return None
    match = _HEADING_RE.match(style.replace('Heading', 'Heading ').strip())
    if match:
        return int(match.group(1))
    if style.lower().startswith('heading'):
        digits = re.search(r'(\d+)', style)
        if digits:
            return int(digits.group(1))
    return None


def _table_rows(table: ET.Element) -> list[list[str]]:
    """Linhas de uma tabela, desduplicando células combinadas na horizontal.

    O Word repete o texto de uma célula combinada em todas as colunas que ela
    ocupa (`w:gridSpan`). Sem isto, a tabela económica do Jogo dos Salários
    devolveria "Casa pequena" três vezes e perderíamos a contagem de linhas
    lógicas.
    """
    rows: list[list[str]] = []
    for tr in table.findall(_tag(W, 'tr')):
        cells: list[str] = []
        for tc in tr.findall(_tag(W, 'tc')):
            text = '\n'.join(
                _paragraph_text(p).strip() for p in tc.findall(_tag(W, 'p'))
            ).strip()
            span_element = tc.find(_tag(W, 'tcPr') + '/' + _tag(W, 'gridSpan'))
            span = 1
            if span_element is not None:
                try:
                    span = int(span_element.get(_tag(W, 'val'), '1'))
                except (TypeError, ValueError):
                    span = 1
            cells.append(text)
            for _ in range(span - 1):
                cells.append(None)  # type: ignore[arg-type]
        # colapsa células combinadas: mantém a primeira, descarta as repetições
        deduped: list[str] = []
        for cell in cells:
            if cell is None:
                continue
            if deduped and deduped[-1] == cell:
                continue
            deduped.append(cell)
        rows.append(deduped)
    return rows


def _blocks_of(container: ET.Element, in_textbox: bool = False) -> Iterator[Block]:
    for child in container:
        if child.tag == _tag(W, 'p'):
            style = _paragraph_style(child)
            yield Block(
                kind='paragraph',
                style=style,
                heading_level=_heading_level(style),
                text=_paragraph_text(child).strip(),
                in_textbox=in_textbox,
            )
        elif child.tag == _tag(W, 'tbl'):
            yield Block(kind='table', rows=_table_rows(child), in_textbox=in_textbox)


class Document:
    """Um documento Word aberto para extração."""

    def __init__(self, path: pathlib.Path) -> None:
        self.path = pathlib.Path(path)
        if not self.path.exists():
            raise FileNotFoundError(f'Documento Word em falta: {self.path}')
        self._zip = zipfile.ZipFile(self.path)
        try:
            self._xml = self._zip.read('word/document.xml')
        except KeyError as exc:  # pragma: no cover - ficheiro corrompido
            raise ValueError(f'{self.path.name} não parece um .docx válido.') from exc
        self._root = ET.fromstring(self._xml)

    # ------------------------------------------------------------------ api

    @property
    def root(self) -> ET.Element:
        """Elemento raiz `w:document` do XML."""
        return self._root

    @property
    def sha256(self) -> str:
        return hashlib.sha256(self.path.read_bytes()).hexdigest()

    def body_blocks(self) -> list[Block]:
        """Blocos do corpo na ordem de leitura, sem caixas de texto."""
        body = self._root.find(_tag(W, 'body'))
        if body is None:
            return []
        return list(_blocks_of(body))

    def textbox_blocks(self) -> list[Block]:
        """Conteúdo das caixas de texto ancoradas no corpo, em ordem de documento.

        Os títulos de capítulo (`Capítulo 1: …` … `Capítulo 8: …`) vivem aqui e
        não aparecem em `body_blocks`. O Fallback é sempre ignorado, para não
        duplicar cada texto.
        """
        body = self._root.find(_tag(W, 'body'))
        if body is None:
            return []
        blocks: list[Block] = []
        for paragraph in body.iter(_tag(W, 'p')):
            for box in _textboxes(paragraph):
                blocks.extend(_blocks_of(box, in_textbox=True))
        return blocks

    def all_blocks(self) -> list[Block]:
        """Corpo seguido das caixas de texto."""
        return [*self.body_blocks(), *self.textbox_blocks()]

    def tables(self) -> list[Block]:
        return [block for block in self.body_blocks() if block.kind == 'table']

    def close(self) -> None:
        self._zip.close()

    def __enter__(self) -> 'Document':
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()