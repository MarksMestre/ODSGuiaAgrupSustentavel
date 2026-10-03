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
    detailed_steps: list[str] = field(default_factory=list)
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

# Etiquetas repetidas no corpo do Word. `_is_field_start` só precisa de detetar
# que um campo começou (para parar o título); `_instruction_steps` precisa de
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


def read_games_from_docx(path: pathlib.Path) -> list[dict]:
    """Lê os jogos do Word: título cru, área e os passos das instruções.

    Um jogo começa em cada `Heading 1`. As áreas vêm das caixas de texto ancoradas
    nos parágrafos, o que evita ter as áreas codificadas no código.
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

        entries: list[dict] = []
        area: str | None = None
        current: dict | None = None
        title_parts: list[str] = []
        steps: list[tuple[bool, str]] = []
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
                in_instructions = text.lower().startswith('instru')
                steps.append((is_list, text))
                continue

            # As instruções são o corpo do jogo; o resto (número de página no fim,
            # resíduo do cabeçalho) é filtrado depois.
            steps.append((is_list or in_instructions, text))

        flush()

    return [
        {
            'rawTitle': entry['rawTitle'],
            'area': entry['area'],
            # `steps` é uma lista de (é_lista, texto).
            'steps': entry['steps'],
            'fields': entry['fields'],
        }
        for entry in entries
        if entry['rawTitle']
    ]


# Etiquetas dos campos do Word, pela ordem em que aparecem num jogo. Os passos
# só começam depois da última delas; o que vier antes é metadado repetido.
_FIELD_LABELS_IN_ORDER = _METADATA_LABELS


def _instruction_steps(raw_steps: list[tuple[bool, str]]) -> list[str]:
    """Devolve só os passos de execução, já limpos.

    Antes das etiquetas o Word repete metadados que já estão no `file.md`
    (ODS, objetivos, formato, participantes, duração, material); o que interessa
    é o que vem a seguir. Descarta também números de página soltos e linhas
    repetidas.
    """
    values = [clean.tidy_whitespace(text) for _, text in raw_steps]

    start = 0
    for index, value in enumerate(values):
        for label in _FIELD_LABELS_IN_ORDER:
            if value.lower().startswith(label.lower()):
                start = index + 1

    steps: list[str] = []
    seen: set[str] = set()
    for value in values[start:]:
        if not value or clean.is_page_number(value):
            continue
        # `Instruções:` isolado, ou a etiqueta seguida de texto no mesmo
        # parágrafo — neste caso o texto útil é o que vem depois da etiqueta.
        for prefix in ('Instruções para formato presencial:',
                       'Instruções para formato virtual:',
                       'Instruções:'):
            if value.lower().startswith(prefix.lower()):
                value = value[len(prefix):].strip()
                break
        if not value or clean.is_page_number(value) or value in seen:
            continue
        seen.add(value)
        steps.append(value)

    return steps


# ------------------------------------------------------------- alignment

def align_games(
    editorial: list[Game], docx_games: list[dict]
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
        game.detailed_steps = _instruction_steps(entry['steps'])
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
            pending[0].detailed_steps = _instruction_steps(spare[0]['steps'])
            unused.remove(spare[0])

    unmatched = [entry for entry in unused if entry['steps']]
    return editorial, unmatched