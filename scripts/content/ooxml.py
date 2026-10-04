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
    # Numeração de lista, quando o parágrafo é um item. `level` é o `w:ilvl` e
    # `number_format` vem de `word/numbering.xml` — é o que distingue uma lista
    # numerada de uma de marcas.
    list_level: int | None = None
    list_id: str | None = None
    number_format: str | None = None

    @property
    def is_heading(self) -> bool:
        return self.heading_level is not None

    @property
    def is_list_item(self) -> bool:
        return self.list_level is not None


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


def _list_info(paragraph: ET.Element) -> tuple[str | None, int | None]:
    """`(numId, ilvl)` de um parágrafo, ou `(None, None)` se não for item.

    O Word guarda a numeração automática em `w:pPr/w:numPr`. Sem isto, uma
    lista de sete passos e um anexo de sete parágrafos são indistinguíveis — foi
    exatamente o que achatou as instruções nas fichas.
    """
    props = paragraph.find(_tag(W, 'pPr'))
    if props is None:
        return None, None
    numbering = props.find(_tag(W, 'numPr'))
    if numbering is None:
        return None, None
    num_id_element = numbering.find(_tag(W, 'numId'))
    if num_id_element is None:
        return None, None
    num_id = num_id_element.get(_tag(W, 'val'))
    if not num_id:
        return None, None
    level_element = numbering.find(_tag(W, 'ilvl'))
    try:
        level = int(level_element.get(_tag(W, 'val'), '0')) if level_element is not None else 0
    except (TypeError, ValueError):
        level = 0
    return num_id, level


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


def _section_columns(section: ET.Element | None) -> int:
    """Número de colunas de uma secção (`w:sectPr/w:cols/@w:num`).

    Vale 1 quando não é multi-coluna. Importa porque os baralhos de cartas e
    as listas de apoio do Capítulo 7 estão compostos em várias colunas: é o que
    distingue uma annexo imprimível de uma instrução para o animador.
    """
    if section is None:
        return 1
    columns = section.find(_tag(W, 'cols'))
    if columns is None:
        return 1
    try:
        return max(1, int(columns.get(_tag(W, 'num'), '1')))
    except (TypeError, ValueError):
        return 1


@dataclass
class BodyItem:
    """Um bloco do corpo, com a secção a que pertence.

    A secção importa porque cada jogo do Word é uma secção própria, e as colunas
    dizem-nos onde acaba a instrução e começa o material de apoio.
    """

    block: Block
    section: int
    columns: int

    def __getattr__(self, name: str):  # pragma: no cover - conveniência
        return getattr(self.block, name)


def _blocks_of(
    container: ET.Element,
    in_textbox: bool = False,
    numbering: Numbering | None = None,
) -> Iterator[Block]:
    for child in container:
        if child.tag == _tag(W, 'p'):
            style = _paragraph_style(child)
            num_id, level = _list_info(child)
            yield Block(
                kind='paragraph',
                style=style,
                heading_level=_heading_level(style),
                text=_paragraph_text(child).strip(),
                in_textbox=in_textbox,
                list_level=level,
                list_id=num_id,
                number_format=(
                    numbering.format_of(num_id, level) if numbering and num_id else None
                ),
            )
        elif child.tag == _tag(W, 'tbl'):
            yield Block(kind='table', rows=_table_rows(child), in_textbox=in_textbox)


def _body_items(body: ET.Element, numbering: Numbering | None) -> Iterator[BodyItem]:
    """Percorre `w:body` em ordem, associando cada bloco à sua secção.

    Em OOXML a `w:sectPr` fecha a secção a que pertence: está dentro do `pPr`
    do **último** parágrafo da secção (a última de todas vive no fim do corpo).
    Por isso a coluna só é conhecida no fim da secção, e é preciso guardar o
    número para a poder atribuir a quem veio antes.
    """
    section = 0
    columns = 1
    pending: list[tuple[Block, int]] = []

    for child in body:
        if child.tag == _tag(W, 'p'):
            style = _paragraph_style(child)
            num_id, level = _list_info(child)
            block = Block(
                kind='paragraph',
                style=style,
                heading_level=_heading_level(style),
                text=_paragraph_text(child).strip(),
                list_level=level,
                list_id=num_id,
                number_format=(
                    numbering.format_of(num_id, level) if numbering and num_id else None
                ),
            )
        elif child.tag == _tag(W, 'tbl'):
            block = Block(kind='table', rows=_table_rows(child))
        else:
            continue

        pending.append((block, section))

        # Um parágrafo com `w:sectPr` no `pPr` encerra a secção atual — e as suas
        # propriedades descrevem **essa** secção, a que o parágrafo pertence, não
        # a seguinte. Atribuir as colunas à secção seguinte deslocava o baralho
        # de cartas do jogo 5 uma secção abaixo, e a deteção do anexo falhava.
        if block.kind == 'paragraph':
            props = child.find(_tag(W, 'pPr'))
            section_properties = props.find(_tag(W, 'sectPr')) if props is not None else None
            if section_properties is not None:
                columns = _section_columns(section_properties)
                for pending_block, pending_section in pending:
                    yield BodyItem(pending_block, pending_section, columns)
                pending = []
                section += 1

    # A última secção é a que fecha o corpo, sem `sectPr` no parágrafo.
    tail = body.find(_tag(W, 'sectPr'))
    for pending_block, pending_section in pending:
        yield BodyItem(pending_block, pending_section, _section_columns(tail))


class Numbering:
    """As definições de lista do documento (`word/numbering.xml`).

    O Word não escreve o tipo de lista no parágrafo: escreve uma referência
    (`w:numId`, `w:ilvl`) e a definição vive no `numbering.xml`. Sem resolver a
    referência, `decimal` e `bullet` são indistinguíveis — e é essa resolução
    que permite dizer que uma linha é um passo numerado e a outra uma marca.
    """

    def __init__(self, root: ET.Element | None) -> None:
        # `(numId, ilvl)` -> `numFmt`. Chave única por definição de lista, que é
        # o que a ficha precisa: `decimal` e `bullet` são os únicos formatos em
        # jogo e ambos se traduzem em `<ol>` e `<ul>`.
        self._formats: dict[tuple[str, int], str] = {}
        if root is None:
            return

        instances: dict[str, str] = {}
        for instance in root.findall(_tag(W, 'num')):
            abstract = instance.find(_tag(W, 'abstractNumId'))
            if abstract is None:
                continue
            num_id = instance.get(_tag(W, 'numId'))
            abstract_id = abstract.get(_tag(W, 'val'))
            if num_id and abstract_id:
                instances[num_id] = abstract_id

        for abstract in root.findall(_tag(W, 'abstractNum')):
            abstract_id = abstract.get(_tag(W, 'abstractNumId'))
            if not abstract_id:
                continue
            for level in abstract.findall(_tag(W, 'lvl')):
                # `w:ilvl` é um atributo de `w:lvl`, ao contrário de `w:numPr`,
                # onde é um elemento filho. Confundir os dois fazia com que todos
                # os níveis lessem como zero.
                try:
                    ilvl = int(level.get(_tag(W, 'ilvl'), '0'))
                except (TypeError, ValueError):
                    ilvl = 0
                num_format = level.find(_tag(W, 'numFmt'))
                name = num_format.get(_tag(W, 'val')) if num_format is not None else None
                if not name:
                    continue
                for num_id, mapped in instances.items():
                    if mapped == abstract_id:
                        self._formats[(num_id, ilvl)] = name

    @property
    def formats(self) -> dict[tuple[str, int], str]:
        return self._formats

    def format_of(self, num_id: str | None, level: int | None) -> str | None:
        if not num_id or level is None:
            return None
        return self._formats.get((num_id, level))


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
        self._numbering = self._read_numbering()

    def _read_numbering(self) -> Numbering:
        """Lê `word/numbering.xml`.

        A ausência não é um erro: há documentos legítimos sem listas, e aí não há
        hierarquia para recuperar. Uma lista com `numId` mas sem definição é que
        seria um problema, e essa fica registada em `Numbering.unknown`.
        """
        try:
            data = self._zip.read('word/numbering.xml')
        except KeyError:
            return Numbering(None)
        try:
            return Numbering(ET.fromstring(data))
        except ET.ParseError as exc:  # pragma: no cover - ficheiro corrompido
            raise ValueError(
                f'{self.path.name}: word/numbering.xml não é XML válido. '
                'Abra e guarde o documento no Word antes de voltar a gerar as fichas.'
            ) from exc

    @property
    def numbering(self) -> Numbering:
        """As definições de lista, para resolver `w:numId` em `w:numFmt`."""
        return self._numbering

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
        return list(_blocks_of(body, numbering=self.numbering))

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

    def body_items(self) -> list[BodyItem]:
        """Todo o corpo, na ordem de leitura, com secção e colunas de cada bloco.

        É o que o Capítulo 7 precisa: as instruções de um jogo terminam onde
        começa o baralho de cartas, e isso só é visível pelas colunas.
        """
        body = self._root.find(_tag(W, 'body'))
        if body is None:
            raise ValueError(f'{self.path.name}: documento sem corpo (w:body).')
        return list(_body_items(body, self._numbering))

    def tables(self) -> list[Block]:
        return [block for block in self.body_blocks() if block.kind == 'table']

    def close(self) -> None:
        self._zip.close()

    def __enter__(self) -> 'Document':
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()