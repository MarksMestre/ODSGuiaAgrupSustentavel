"""Extrai os jogos do Capítulo 7.

Duas fontes, com responsabilidades distintas:

* `file.md` — fonte editorial (ver README). Tem os **30** jogos completos, com
  títulos já corrigidos e campos consistentes. É daqui que saem número, título,
  área, ODS, formato, participantes, duração, materiais e a dinâmica curada.
* `source/gamesSource.docx` — o Word original. Tem **29** jogos (falta o
  `Descobre +ODS`) e traz o texto das instruções passo a passo, muito mais
  desenvolvido do que a dinâmica curada. Serve para enriquecer a ficha.

Os títulos do Word têm as maiúsculas do versalete gravadas no próprio texto
(`DRAmATizAçÃO`) e alguns estão partidos em dois parágrafos. Em vez de tentar
adivinhar a capitalização portuguesa — o que produziria `Jogo Dos Salários` e
`Negociar Na Onu` —, os jogos são associados por área e por semelhança de
título, e o título canónico vem sempre do `file.md`.
"""

from __future__ import annotations

import difflib
import pathlib
import re
import unicodedata
from dataclasses import dataclass, field

from . import clean, ooxml

# --------------------------------------------------------------- file.md

AREA_RE = re.compile(r'Área d(?:as|e|a|o)\s+(Pessoas|Planeta|Prosperidade|Paz|Parcerias)')
AREA_NAMES = {
    'Pessoas': 'Área das Pessoas',
    'Planeta': 'Área do Planeta',
    'Prosperidade': 'Área da Prosperidade',
    'Paz': 'Área da Paz',
    'Parcerias': 'Área das Parcerias',
}

# `5. Descobre +ODS Associados:` — o título acaba em `+ODS` e a etiqueta
# seguinte é ` Associados:`, por isso o separador tem de ser opcional.
# O cabeçalho de uma atividade é `N. Título` colado de seguida à etiqueta de ODS
# (`Dramatização de RealidadesODS Associado:`). O título é delimitado pela
# etiqueta, por isso qualquer caractere menos que é legítimo — inclusive `?`,
# `!` e o `+ODS` do jogo «Descobre +ODS».
# O cabeçalho de uma atividade é `N. Título` seguido da etiqueta de ODS, colados
# (`Dramatização de RealidadesODS Associado:`).
#
# O ponto de corte é a **última** ocorrência da palavra `ODS` antes de
# `Associado`. Isso é necessário porque o jogo «Descobre +ODS» tem `ODS` no
# próprio título: com um corte preguiçoso, o `+ODS` seria engolido e o título
# ficaria «Descobre».
ACTIVITY_HEADER_RE = re.compile(
    r'(?P<number>\d{1,2})\.\s(?P<title>[^\n]{2,120}?)'
    r'(?P<odsLabel>ODS Associado|ODS Associados| Associados):'
)


def split_header(match: re.Match[str]) -> tuple[str, str]:
    """Separa o título e a etiqueta de ODS.

    A etiqueta inclui a palavra `ODS`, e vários títulos também terminam em
    `ODS` (`Jogo do Quim dos ODS`, `Descobre +ODS`). Como o `title` do regex é
    preguiçoso, ele para na **primeira** posição em que a etiqueta compõe — e
    para títulos terminados em `ODS` isso é exatamente o fim do nome, porque a
    etiqueta seguinte está colada. Por isso não há nada a remover aqui: cortar
    um `ODS` final apagaria parte legítima do título.
    """
    return match.group('title').strip(), f"{match.group('odsLabel')}:"

FIELD_LABELS = ('Formato:', 'Participantes:', 'Duração:', 'Materiais:', 'Dinâmica:')
ECONOMICS_HEADER = 'Categoria de DespesaCustoPontos de Estatuto Social'
ALL_ODS = tuple(range(1, 18))


@dataclass(frozen=True)
class Step:
    """Um passo das instruções, com o nível onde o Word o colocou.

    `kind` é `'heading'` para uma subdivisão (uma "Parte"), `'ordered'` ou
    `'bullet'` para um item de lista, e `'para'` para texto corrente. `level` é a
    profundidade dentro da base do bloco: 0 é o nível de fora.

    Guardar o nível e não o número final é o que permite reiniciar a contagem
    numa "Parte 2" em vez de continuar a contagem da "Parte 1" — que era o que
    acontecia e produzia uma lista corrida de 1 a 16.
    """

    kind: str
    text: str
    level: int = 0


@dataclass
class Game:
    """Um jogo pronto a ser transformado em ficha."""

    number: int
    title: str
    area: str
    ods_raw: str = ''
    ods: list[int] = field(default_factory=list)
    ods_names: list[str] = field(default_factory=list)
    game_format: str = ''
    participants: str = ''
    duration: str = ''
    materials: str = ''
    dynamics: str = ''
    detailed_steps: list[Step] = field(default_factory=list)
    tables: list[list[list[str]]] = field(default_factory=list)
    missing_fields: list[str] = field(default_factory=list)

    @property
    def slug(self) -> str:
        return clean.slugify(self.title)

    @property
    def sheet_name(self) -> str:
        return f'{self.number:02d}Game'

    def field(self, name: str) -> str:
        return getattr(self, name) or ''


# --------------------------------------------------------------- helpers

def flatten_for_match(value: str) -> str:
    """Reduz um título a uma forma comparável, sem acentos nem pontuação."""
    decomposed = unicodedata.normalize('NFD', value)
    without = ''.join(c for c in decomposed if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', '', without.lower())


def tidy_title(title: str) -> str:
    """Normaliza espaços numa ponta de linha.

    Não remove `ODS`: vários títulos terminam legitimamente em `ODS` ou `+ODS`
    («Jogo do Quim dos ODS», «Descobre +ODS») e esse `ODS` é parte do nome. A
    forma canónica do jogo 29 é «Descobre +ODS»; a folha do Word escreve-o sem
    o sinal, o que é uma variante de escrita da fonte, não o título.
    """
    cleaned = re.sub(r'\s+', ' ', title).strip()
    # `Descobre +` isolado é o mesmo jogo que `Descobre +ODS`: normaliza-se para
    # a forma canónica, mantendo a comparação com a folha possível.
    if cleaned.rstrip().endswith('+'):
        cleaned = cleaned.rstrip() + 'ODS'
    return cleaned


def parse_ods(raw: str) -> tuple[list[int], list[str]]:
    """Extrai códigos e nomes de ODS de `ODS 10, 11 e 13` ou `Todos`."""
    text = raw.strip()
    if not text:
        return [], []
    if 'todos' in text.lower():
        return list(ALL_ODS), []

    codes: list[int] = []
    for match in re.finditer(r'ODS\s*(\d{1,2})', text, re.IGNORECASE):
        code = int(match.group(1))
        if 1 <= code <= 17 and code not in codes:
            codes.append(code)
    names = [name.strip() for name in re.findall(r'\(([^()]{3,80})\)', text)]
    return codes, names


def _split_at(text: str, labels: tuple[str, ...]) -> dict[str, str]:
    """Divide um corpo de atividade nos campos, usando as etiquetas como limites."""
    found = sorted(
        ((label, text.find(label)) for label in labels if text.find(label) != -1),
        key=lambda item: item[1],
    )
    fields: dict[str, str] = {}
    for index, (label, start) in enumerate(found):
        value_start = start + len(label)
        value_end = found[index + 1][1] if index + 1 < len(found) else len(text)
        fields[label] = text[value_start:value_end].strip()
    return fields


def _extract_economics(text: str) -> tuple[str, list[list[str]]]:
    """Separa a tabela económica (Jogo dos Salários) do corpo da atividade.

    No `file.md` a tabela está achatada numa linha só: o cabeçalho e as linhas
    ficam colados uns aos outros sem separador. A última linha (`Atividades de
    Lazer / Cultura$50€$ cada4 cada`) tem uma forma anómala herdada da origem e
    é preservada tal e qual.
    """
    header = text.find(ECONOMICS_HEADER)
    if header == -1:
        return text, []

    start = header + len(ECONOMICS_HEADER)
    dynamics = text.find('Dinâmica:', start)
    if dynamics == -1:
        dynamics = len(text)

    flat = text[start:dynamics]
    rows: list[list[str]] = []
    # As linhas estão coladas: `categoria$preço$pontos`. Nem a categoria nem o
    # preço contêm `$`, por isso o limite são os próprios cifrões. Os pontos são
    # um número, ou a forma anómala ` cada4 cada` da última linha, que é
    # preservada exatamente como está na origem.
    # ` cada4 cada` não começa por dígito, por isso a alternativa sem âncora
    # é necessária para a última linha, cuja forma anómala é preservada.
    points_pattern = r'(\s*(?:\d+\s*)?cada\s*\d+\s*cada|\s*\d+)'
    for parts in re.finditer(rf'([^$]+)\$([^$]+)\${points_pattern}', flat):
        category, cost, points = parts.group(1), parts.group(2), parts.group(3)
        if category.strip():
            rows.append([category, f'${cost}$', points])

    return text[:header] + text[dynamics:], rows


# --------------------------------------------------------- file.md reader

def read_games_from_file_md(path: pathlib.Path) -> list[Game]:
    """Lê as atividades do Capítulo 7 a partir do `file.md`."""
    text = path.read_text(encoding='utf-8')

    # `Capítulo 8` aparece também no índice geral; o corpo é a última ocorrência.
    chapter8 = text.rfind('Capítulo 8: Espaço Influencers')
    if chapter8 == -1:
        raise ValueError(
            'file.md: não encontrei "Capítulo 8: Espaço Influencers". '
            'O ficheiro editorial pode estar corrompido.'
        )

    # A área que abre o capítulo é a que é imediatamente seguida de "1. ".
    body_start = next(
        (
            m.start()
            for m in AREA_RE.finditer(text, 0, chapter8)
            if re.match(r'Área das \w+\s*1\.', text[m.start():m.start() + 40])
        ),
        None,
    )
    if body_start is None:
        raise ValueError('file.md: não encontrei o início do catálogo de jogos.')

    chapter = text[body_start:chapter8]
    area_positions = [
        (m.start(), AREA_NAMES[m.group(1)]) for m in AREA_RE.finditer(chapter)
    ]

    games: list[Game] = []
    order = 0

    for index, (position, area) in enumerate(area_positions):
        end = area_positions[index + 1][0] if index + 1 < len(area_positions) else len(chapter)
        segment = chapter[position:end]
        headers = list(ACTIVITY_HEADER_RE.finditer(segment))

        for header_index, header in enumerate(headers):
            block_end = headers[header_index + 1].start() if header_index + 1 < len(headers) else len(segment)
            order += 1

            body, economics = _extract_economics(segment[header.start():block_end])
            fields = _split_at(body, FIELD_LABELS)
            ods_text = body.split('Formato:')[0]
            codes, names = parse_ods(ods_text)

            raw_title, _ods_label = split_header(header)
            game = Game(
                number=order,
                title=tidy_title(raw_title),
                area=area,
                ods_raw=ods_text.strip(),
                ods=codes,
                ods_names=names,
                game_format=fields.get('Formato:', ''),
                participants=fields.get('Participantes:', ''),
                duration=fields.get('Duração:', ''),
                materials=fields.get('Materiais:', ''),
                dynamics=fields.get('Dinâmica:', ''),
            )
            if economics:
                game.tables.append(economics)
            for label, name in (
                ('Formato:', 'game_format'),
                ('Participantes:', 'participants'),
                ('Duração:', 'duration'),
                ('Materiais:', 'materials'),
                ('Dinâmica:', 'dynamics'),
            ):
                if not getattr(game, name):
                    game.missing_fields.append(label)
            games.append(game)

    return games


# ----------------------------------------------------------- docx reader

# O Word imprime `ÁREA dAs pEssOAs` ou `ÁREA dO plAnETA`, conforme o género.
_AREA_IN_BOX_RE = re.compile(
    r'^ÁREA\s+D[OA]S?\s+(PESSOAS|PLANETA|PROSPERIDADE|PAZ|PARCERIAS)$',
    re.IGNORECASE,
)

# Rótulos que iniciam um campo, incluindo as variantes de Instruções.
# `ODS:` aparece logo a seguir ao título e por isso tem de marcar o fim do
# título, senão o título absorve o valor dos ODS.
_FIELD_PREFIXES = (
    'Objetivos de Desenvolvimento Sustentável:',
    'Progresso',
    'Objetivos:',
    'Formato:',
    'Número de participantes:',
    'Duração:',
    'Material:',
    'Materiais:',
    'Instruções:',
    'Instruções para formato',
    'ODS:',
)

_LIST_STYLES = ('listparagraph', 'listbullet', 'listnumber')

# Onde começa o bloco de instruções. O Word usa três variantes e o jogo 27 traz
# a frase colada à etiqueta, pelo que a etiqueta é removida e o resto do
# parágrafo entra como prosa.
_INSTRUCTIONS_RE = re.compile(
    r'^instru(?:ç|c)(?:ões|oes)\b(?:\s+para\s+formato\s+\w+)?\s*:?\s*',
    re.IGNORECASE,
)

# Um cabeçalho que termina em dois-pontos é um rótulo de anexo (`Perguntas:`,
# `Recursos:`, `Cartões:`, `Cartões de salário:`), não uma etapa. As etapas
# (`Parte 2: Desenho do mapa. (40')`) têm texto depois dos dois-pontos.
_ANNEX_LABEL_RE = re.compile(r'^[^:]{0,60}:\s*$')

# Uma etapa das instruções. `Parte 2: …`, `2ª Parte – A Viagem`, `Abrigos para
# borboleta` e as variantes `Instruções para formato …:` continuam o bloco.
_STAGE_RE = re.compile(r'^(?:instru|.*\bparte\b)', re.IGNORECASE)

# Os campos que, repetidos em sequência, marcam o início de um jogo novo. O
# jogo 29 («Descobre +ODS») está aninhado dentro do 28 no Word, sem ser um
# `Heading 1`: é um parágrafo numerado com o bloco completo de campos. Sem esta
# regra, as instruções dos dois jogos entravam misturadas na ficha do 28.
_NESTED_GAME_FIELDS = (
    'objetivos:',
    'formato:',
    'número de participantes:',
    'duração:',
)

# Etiquetas repetidas no corpo do Word. `_is_field_start` só precisa de detetar
# que um campo começou (para parar o título); a leitura das instruções precisa de
# saber até onde o bloco de metadados vai, e por isso tem a lista completa.
_METADATA_LABELS = (
    'Objetivos de Desenvolvimento Sustentável:',
    'Progresso',
    'ODS:',
    'Objetivos:',
    'Formato:',
    'Número de participantes:',
    'Duração:',
    'Material:',
    'Materiais:',
    'Instruções:',
)


def _is_field_start(text: str) -> bool:
    lowered = text.lower()
    return any(lowered.startswith(prefix.lower()) for prefix in _FIELD_PREFIXES)


def read_games_from_docx(
    path: pathlib.Path, *, extract_nested: bool = True
) -> tuple[list[dict], dict[int, ooxml.BodyItem]]:
    """Lê os jogos do Word: título cru, área e as instruções com hierarquia.

    Um jogo começa em cada `Heading 1`. As áreas vêm das caixas de texto ancoradas
    nos parágrafos, o que evita ter as áreas codificadas no código.

    O jogo 29 («Descobre +ODS») não tem `Heading 1` próprio: o Word aninha-o
    dentro do 28, e por isso só há 29 entradas para 30 jogos. Com
    `extract_nested`, esse bloco é reconhecido e devolvido como jogo separado,
    para que cada um receba os seus próprios passos.

    Devolve também o mapa posição-do-corpo → bloco, que `align_games` usa para
    ler o nível e o tipo de lista de cada passo.
    """
    with ooxml.Document(path) as document:
        # O corpo é o filho direto `w:body` do documento; iterar o `.body` do
        # python-docx seria equivalente, mas aqui só interessa o XML.
        body = document.root.find(ooxml._tag(ooxml.W, 'body'))
        if body is None:
            raise ValueError(f'{path.name}: documento sem corpo (w:body).')

        # índice do parágrafo -> textos das caixas de texto ancoradas
        anchored: dict[int, list[str]] = {}
        # índice do parágrafo -> o parágrafo é um item de lista?
        list_flags: dict[int, bool] = {}
        # Só os parágrafos que são filhos diretos do corpo. Os parágrafos dentro
        # de caixas de texto são netos (via `w:drawing`/`w:pict`) e não devem ser
        # visitados como se fossem parágrafos de corpo.
        paragraphs = [child for child in body if child.tag == ooxml._tag(ooxml.W, 'p')]
        for position, paragraph in enumerate(paragraphs):
            texts = [
                ooxml._paragraph_text(box).strip()
                for box in ooxml._textboxes(paragraph)
            ]
            texts = [t for t in texts if t]
            if texts:
                anchored[position] = texts
            style = ooxml._paragraph_style(paragraph)
            list_flags[position] = (style or '').replace(' ', '').lower() in _LIST_STYLES

        # Os mesmos parágrafos, mas com secção, colunas e numeração de lista. É
        # daqui que sai a hierarquia das instruções.
        item_by_position: dict[int, ooxml.BodyItem] = {}
        item_position = 0
        for item in document.body_items():
            if item.kind != 'paragraph':
                continue
            item_by_position[item_position] = item
            item_position += 1

        entries: list[dict] = []
        area: str | None = None
        current: dict | None = None
        title_parts: list[str] = []
        # (posição no corpo, texto). A posição dá acesso ao `BodyItem`, e é
        # através dele que se sabe o nível e o tipo de lista de cada passo.
        steps: list[tuple[int, str]] = []
        in_instructions = False
        seen_field = False

        def flush() -> None:
            nonlocal current, title_parts, steps, in_instructions, seen_field
            if current is not None:
                current['rawTitle'] = ' '.join(title_parts).strip()
                current['steps'] = steps
                entries.append(current)
            current = None
            title_parts = []
            steps = []
            in_instructions = False
            seen_field = False

        for position, paragraph in enumerate(paragraphs):
            for text in anchored.get(position, []):
                match = _AREA_IN_BOX_RE.match(text)
                if match:
                    area = AREA_NAMES[match.group(1).capitalize()]

            level = ooxml._heading_level(ooxml._paragraph_style(paragraph))
            text = ooxml._paragraph_text(paragraph).strip()

            if level == 1:
                flush()
                current = {'area': area, 'fields': {}, 'steps': []}
                if text:
                    title_parts.append(text)
                continue

            if current is None or not text:
                continue

            is_list = list_flags.get(position, False)
            field_start = _is_field_start(text)

            # Título partido em vários parágrafos: `PEixinhO` + `dAs DEsiguAldAdEs`.
            # Só continua o título se ainda não começou nenhum campo, o parágrafo
            # não for de lista, não for uma etiqueta e for curto.
            if not seen_field and not is_list and not field_start and len(text) <= 60:
                title_parts.append(text)
                continue

            if field_start:
                seen_field = True
                in_instructions = _INSTRUCTIONS_RE.match(text) is not None
                steps.append((position, text))
                continue

            # As instruções são o corpo do jogo; o resto (número de página no fim,
            # resíduo do cabeçalho) é filtrado depois.
            steps.append((position, text))

        flush()

    if extract_nested:
        entries = split_nested_games(entries, item_by_position)

    found = [
        {
            'rawTitle': entry['rawTitle'],
            'area': entry['area'],
            # `steps` é uma lista de (posição no corpo, texto).
            'steps': entry['steps'],
            'fields': entry['fields'],
        }
        for entry in entries
        if entry['rawTitle']
    ]
    # O mapa de parágrafos volta com as entradas porque `align_games` precisa dele
    # para transformar posições em níveis de lista.
    return found, item_by_position


def split_nested_games(
    entries: list[dict], item_by_position: dict[int, ooxml.BodyItem]
) -> list[dict]:
    """Separa um jogo que o Word aninha dentro de outro.

    O «Descobre +ODS» aparece dentro do «Desenho Estragado» como um parágrafo
    numerado seguido de um bloco completo de campos (`Ods:`, `Objetivos:`,
    `Formato:`, `Número de participantes:`, `Duração:`, `Material:`) e das suas
    próprias `Instruções:`. Não é um `Heading 1`, por isso a leitura linear não o
    via como jogo.

    Sem esta separação o jogo 28 ficava com os passos dos dois e o 29 sem
    passos detalhados. O título do jogo aninhado é o parágrafo imediatamente
    anterior ao bloco de campos.
    """
    result: list[dict] = []
    for entry in entries:
        steps: list[tuple[int, str]] = entry['steps']
        split_at = _nested_game_start(steps, item_by_position)
        if split_at is None:
            result.append(entry)
            continue

        title_index, field_start = split_at
        # O título entra no jogo aninhado, não no de fora: é o nome do jogo 29.
        result.append({**entry, 'steps': steps[:title_index]})
        nested_title = steps[title_index][1]
        result.append({
            'area': entry['area'],
            'fields': {},
            'steps': steps[field_start:],
            'rawTitle': nested_title.strip(),
        })
    return result


def _nested_game_start(
    steps: list[tuple[int, str]], item_by_position: dict[int, ooxml.BodyItem]
) -> tuple[int | None, int] | None:
    """Onde começa um jogo aninhado, ou `None` se não houver nenhum.

    Reconhece a assinatura do Word: uma sequência de campos que volta a aparecer
    depois de as instruções já terem começado.procura-se a segunda ocorrência de
    `Objetivos:` e confirma-se que os campos seguintes são os de sempre.
    """
    objectives_indexes = [
        index
        for index, (_, text) in enumerate(steps)
        if text.lower().startswith('objetivos:')
    ]
    if len(objectives_indexes) < 2:
        return None

    for index in objectives_indexes[1:]:
        window = [text.lower() for _, text in steps[index:index + 4]]
        if not all(
            any(value.startswith(field) for value in window)
            for field in _NESTED_GAME_FIELDS
        ):
            continue
        # O título vem antes de `Objetivos:`, mas não imediatamente: há o
        # `Ods:` pelo meio. Procura-se para trás o primeiro parágrafo que não seja
        # uma etiqueta nem um número de página.
        title_index = index - 1
        while title_index >= 0:
            candidate = steps[title_index][1]
            if not _is_field_start(candidate) and not clean.is_page_number(candidate):
                break
            title_index -= 1
        if title_index < 0:
            continue

        item = item_by_position.get(steps[title_index][0])
        if item is None or not item.is_list_item:
            continue
        return title_index, index
    return None


# Etiquetas dos campos do Word, pela ordem em que aparecem num jogo. Os passos
# só começam depois da última delas; o que vier antes é metadado repetido.
_FIELD_LABELS_IN_ORDER = _METADATA_LABELS


def instruction_steps(
    raw_steps: list[tuple[int, str]],
    item_by_position: dict[int, ooxml.BodyItem],
) -> list[Step]:
    """Devolve os passos de execução com a hierarquia do Word.

    Antes das etiquetas o Word repete metadados que já estão no `file.md` (ODS,
    objetivos, formato, participantes, duração, material); o que interessa é o
    bloco que segue a última `Instruções:`.

    O nível de cada item vem do `w:ilvl`, e o tipo de lista do `w:numFmt`
    resolvido no `numbering.xml`. O nível é normalizado para a base do bloco —
    o nível do **primeiro** item, e não o menor — porque o `Heading 1` do próprio
    jogo também é um item numerado: um `ilvl 0` que aparece mais tarde é uma
    lista nova (a "Parte 2"), não um pai.

    O bloco termina no primeiro anexo. Cada regra de paragem é estrutural — a
    mudança para uma secção multi-coluna, um `Heading 2`, um `Heading 3` em
    forma de rótulo, ou um `Heading 3` cujos itens são mais profundos — e nunca
    depende do nome do jogo, para continuar válida depois de uma edição no Word.
    """
    values = [clean.tidy_whitespace(text) for _, text in raw_steps]

    start = 0
    for index, value in enumerate(values):
        for label in _FIELD_LABELS_IN_ORDER:
            if value.lower().startswith(label.lower()):
                start = index + 1

    # A frase pode vir colada à própria etiqueta (`Instruções: Antes de se
    # iniciar o jogo…`, nos jogos 11 e 27) — e nesse caso está na linha que
    # acabou de marcar o início do bloco, não na seguinte.
    run_in = ''
    if start:
        match = _INSTRUCTIONS_RE.match(values[start - 1])
        if match:
            run_in = values[start - 1][match.end():].strip()

    steps = _outline(values[start:], item_by_position, raw_steps[start:])

    # `run_in` é a frase que vinha colada à etiqueta. Fica no topo porque o
    # animador tem de a ler antes do primeiro passo.
    if run_in:
        steps.insert(0, Step('para', run_in))

    return steps


def _outline(
    values: list[str],
    item_by_position: dict[int, ooxml.BodyItem],
    positioned: list[tuple[int, str]],
) -> list[Step]:
    """Constrói os passos a partir dos parágrafos, e para no primeiro anexo."""
    items = [
        item_by_position.get(position) for position, _ in positioned
    ]

    # O nível base é o do primeiro item de lista: a partir dele é que "mais
    # profundo" se mede.
    base_level = next(
        (item.list_level for item in items if item is not None and item.is_list_item),
        None,
    )

    steps: list[Step] = []
    start_section = items[0].section if items and items[0] else None

    for index, value in enumerate(values):
        if not value or clean.is_page_number(value):
            continue
        item = items[index] if index < len(items) else None

        # E1 — material de apoio. Os baralhos e listas de apoio estão compostos
        # em várias colunas; as instruções, em uma.
        if (
            item is not None
            and start_section is not None
            and item.columns > 1
            and item.section != start_section
        ):
            break

        # Um parágrafo que é ao mesmo tempo cabeçalho e item de lista é uma etapa
        # numerada — `Abrigos para borboletas` no jogo 10 é "1." no Word, com os
        # materiais de construção por baixo. Se fosse tratado como cabeçalho,
        # as suas sub-listas (mais profundas) seriam lidas como anexo e o jogo
        # perdia as instruções todas.
        if item is not None and item.is_list_item:
            level = 0 if base_level is None else max(0, item.list_level - base_level)
            kind = 'ordered' if item.number_format == 'decimal' else 'bullet'
            _push_unique(steps, Step(kind, value, level))
            continue

        if item is not None and item.heading_level in (2, 3):
            # E2 — um `Heading 2` é sempre material de apoio.
            if item.heading_level == 2:
                break
            if not _STAGE_RE.match(value) and _ANNEX_LABEL_RE.match(value):
                break
            if not _STAGE_RE.match(value) and _heading_starts_annex(
                items, index, base_level
            ):
                break
            steps.append(Step('heading', value))
            continue

        # Texto corrente: `Local: Aldeia…`, `Versão Online: …`, as reflexões
        # finais. Não é um passo numerado, e é por isso que deixa de ser contado
        # como um.
        _push_unique(steps, Step('para', value))

    return steps


def _push_unique(steps: list[Step], step: Step) -> None:
    """Acrescenta um passo, ignorando-o se repetir o texto imediatamente anterior.

    Só o duplicado *consecutivo* se descarta: é o resíduo de cabeçalho de página
    que o Word deixa entre duas folhas. Um passo repetido mais adiante é
    conteúdo legítimo — o jogo 25 repete «Ganha a equipa que se lembrar de mais
    ODS que viu» no fim das duas variantes, e as duas são necessárias.
    """
    if steps and steps[-1].text == step.text:
        return
    steps.append(step)


def _heading_starts_annex(
    items: list[ooxml.BodyItem | None], index: int, base_level: int | None
) -> bool:
    """Um cabeçalho cujos primeiros itens são mais profundos é material de apoio.

    Cobre `Afirmações Para O Jogo`, o único anexo do Capítulo 7 cujo título não
    acaba em dois-pontos. As etapas reais (`Parte 2: …`) têm os itens no mesmo
    nível ou mais rasos, porque são uma etapa e não um anexo.
    """
    if base_level is None:
        return False
    for item in items[index + 1:]:
        if item is None or not item.is_list_item:
            # Uma linha de texto entre o cabeçalho e o primeiro item não diz
            # nada sobre a profundidade; procura-se o primeiro item a sério.
            continue
        return item.list_level > base_level
    return False


# ------------------------------------------------------------- alignment

def align_games(
    editorial: list[Game],
    docx_games: list[dict],
    item_by_position: dict[int, ooxml.BodyItem],
) -> tuple[list[Game], list[dict]]:
    """Associa cada jogo editorial ao seu homólogo no Word.

    Os títulos do Word têm as maiúsculas do versalete gravadas no texto
    (`DRAmATizAçÃO`) e vários estão truncados (`JOgO dOs SAlÁRiOs`), por isso a
    comparação exata falharia. Usa-se `difflib.get_close_matches` por área: para
    cada jogo editorial escolhe-se o título do Word mais semelhante ainda não
    usado.

    A área é uma condição obrigatória — nenhum jogo muda de área. Devolve os
    jogos atualizados com `detailed_steps` e a lista de entradas do Word sem
    par, que vão para o relatório como aviso.
    """
    unused = list(docx_games)

    def assign(area: str, game: Game) -> bool:
        """Associa `game` ao título do Word mais semelhante dentro de `area`."""
        pool = [entry for entry in unused if entry.get('area') == area]
        if not pool:
            return False
        keys = [flatten_for_match(entry['rawTitle']) for entry in pool]
        ranked = difflib.get_close_matches(
            flatten_for_match(game.title), keys, n=1, cutoff=0.5
        )
        if not ranked:
            return False
        entry = pool[keys.index(ranked[0])]
        game.detailed_steps = instruction_steps(entry['steps'], item_by_position)
        unused.remove(entry)
        return True

    for area in sorted({game.area for game in editorial}):
        for game in [g for g in editorial if g.area == area]:
            assign(area, game)

    # Alguns títulos do Word estão truncados a ponto de a semelhança ficar abaixo
    # do limiar (`jOgO jusTO` vs `Jogo Justo (Futebol Desigual)`, `NEgOciAR nA ONU`
    # vs `Negociar na ONU (Simulação de Assembleia Geral)`). Nesses casos, se a
    # área tiver exactamente um par disponível, o emparelhamento é óbvio.
    for area in sorted({game.area for game in editorial}):
        pending = [g for g in editorial if g.area == area and not g.detailed_steps]
        spare = [entry for entry in unused if entry.get('area') == area]
        if len(pending) == 1 and len(spare) == 1:
            pending[0].detailed_steps = instruction_steps(
                spare[0]['steps'], item_by_position
            )
            unused.remove(spare[0])

    unmatched = [entry for entry in unused if entry['steps']]
    return editorial, unmatched