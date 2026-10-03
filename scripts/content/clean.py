"""Normalização de texto extraído de Word.

Todos os defeitos aqui tratados foram observados nos documentos reais e são
reproduzíveis. A regra geral: quando não há regra explícita, o texto é
reportado como `unclassified` em vez de ser descartado em silêncio. Perder
conteúdo editorial sem dar conta é o pior modo de falha possível.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

# Siglas que o Word imprimiu em versalete (small caps) e que não devem ser
# reescritas para "Ods" ou "Cne".
ACRONYMS = frozenset({
    'ODS', 'CNE', 'OMME', 'ONU', 'ONGD', 'GEE', 'KPI', 'LED', 'PE', 'BP',
    'DGS', 'UE', 'PPV', 'MEE', 'ODS1', 'CO2', 'CM', 'PP',
})

# Palavras em minúsculas que precedem uma sigla numa sigla composta.
_KEEP_UPPER = frozenset(ACRONYMS)

# Hifens verdadeiros que não podem ser unidos. A chave é o token com hifen,
# em minúsculas — comparada com `left + '-' + right`, nunca com a forma unida.
KEEP_HYPHEN_TOKENS = frozenset({
    'eco-labels', 'não-formais', 'não-formal', 'não-governamental',
    "tim's", "time's", 'auto-estimativa', 'físico-químico',
})

_RUN_TOGETHER = {
    'concebidapara': 'concebida para',
}

_PAGE_NUMBER_RE = re.compile(r'^\d{1,3}$')
_NOTA_RE = re.compile(r'^NOTA\b', re.IGNORECASE)
_NOTA_ONLY_RE = re.compile(r'^NOTA:\s*(.*)$', re.IGNORECASE | re.DOTALL)


@dataclass(frozen=True)
class Normalisation:
    text: str
    changed: bool
    notes: tuple[str, ...] = ()


# --------------------------------------------------------------- utilities

def strip_accents(value: str) -> str:
    decomposed = unicodedata.normalize('NFD', value)
    return ''.join(ch for ch in decomposed if not unicodedata.combining(ch))


def slugify(value: str) -> str:
    """ Igual ao `slugify` de src/content/source-map.js, sem dependências. """
    lowered = strip_accents(str(value)).lower()
    cleaned = re.sub(r'[^a-z0-9]+', '-', lowered)
    return cleaned.strip('-')


def is_slug_key(value: str) -> bool:
    return bool(value) and re.fullmatch(r'[a-z0-9]+(-[a-z0-9]+)*', value) is not None


# ------------------------------------------------------------------- title

def _is_word_initial(index: int, text: str) -> bool:
    return index == 0 or not text[index - 1].isalpha()


def recover_title_case(value: str) -> str:
    """Recupera maiúsculas de um título impresso em versalete.

    O Word gravou a forma maiúscula/pequena no próprio texto (`DRAmATizAçÃO`,
    `NEgOciAR nA ONU`), não como propriedade `w:smallCaps`. A regra é minúscula
    exceto no início de palavra; as siglas da lista `ACRONYMS` ficam intactas.
    """
    if not value:
        return value

    out = list(value)
    for index, char in enumerate(value):
        if not char.isalpha():
            continue
        upper = char.upper()
        if upper in _KEEP_UPPER:
            out[index] = upper
            continue
        out[index] = upper if _is_word_initial(index, value) else char.lower()

    result = ''.join(out)
    # "JOGO DOS SALÁRIOS" -> jogo upper-inicial intacto; "3 Coisas" preserva dígitos.
    return result


def join_wrapped_title(first: str, second: str) -> str:
    """Junta um título partido em dois parágrafos (`PEixinhO` + `dAs DEsiguAldAdEs`)."""
    left = first.rstrip()
    right = second.strip()
    if not left:
        return right
    if not right:
        return left
    separator = '' if left.endswith('-') else ' '
    if separator == '':
        left = left[:-1]
    return f'{left}{separator}{right}'


# ------------------------------------------------------------- hyphenation

def join_hyphenation(value: str) -> tuple[str, list[str]]:
    """Une hifenações intra-palavra (`con-teúdos` -> `conteúdos`)."""
    notes: list[str] = []

    def replace(match: re.Match[str]) -> str:
        left, right = match.group(1), match.group(2)
        if not left or not right:
            return match.group(0)
        # Hifenação editorial só ocorre entre duas minúsculas.
        if not (left[-1].islower() and right[0].islower()):
            return match.group(0)
        token = f'{left}-{right}'.lower()
        # Hifens verdadeiros (`Eco-labels`, `não-formais`) são preservados.
        if token in KEEP_HYPHEN_TOKENS:
            return match.group(0)
        notes.append(f'uni hifenização: {match.group(0)} -> {left}{right}')
        return f'{left}{right}'

    result = re.sub(r'([A-Za-zÀ-ÿ]+)-([a-zà-ÿ]+)', replace, value)
    return result, notes


def split_run_together(value: str) -> tuple[str, list[str]]:
    """Separa palavras coladas pelo Word, usando apenas um dicionário explícito."""
    notes: list[str] = []
    for joined, replacement in _RUN_TOGETHER.items():
        if joined in value:
            value = value.replace(joined, replacement)
            notes.append(f'separou "{joined}" -> "{replacement}"')
    return value, notes


# ------------------------------------------------------------------ bullets

def split_bullets(value: str) -> list[str]:
    """Separa descritores multi-linha (`• Saúde\\n• Atividade física`)."""
    if not value:
        return []
    parts = re.split(r'^[•·\-•]\s*', value, flags=re.MULTILINE)
    return [part.strip() for part in parts if part.strip()]


def is_page_number(value: str) -> bool:
    return bool(_PAGE_NUMBER_RE.match(value.strip()))


def is_note(value: str) -> bool:
    return bool(_NOTA_RE.match(value.strip()))


def strip_note(value: str) -> str:
    match = _NOTA_ONLY_RE.match(value.strip())
    return match.group(1).strip() if match else value.strip()


# --------------------------------------------------------------- whitespace

_MULTI_SPACE_RE = re.compile(r'[ \t ]{2,}')
_MULTI_NEWLINE_RE = re.compile(r'\n{3,}')


def tidy_whitespace(value: str) -> str:
    collapsed = _MULTI_SPACE_RE.sub(' ', value.replace('\r\n', '\n').replace('\r', '\n'))
    collapsed = _MULTI_NEWLINE_RE.sub('\n\n', collapsed)
    return collapsed.strip()


# -------------------------------------------------------------------- entry

def normalise(
    value: str,
    *,
    title: bool = False,
    allow_notes: bool = True,
) -> Normalisation:
    """Aplica a cadeia completa de normalização a um fragmento."""
    notes: list[str] = []
    result = value

    if title:
        recovered = recover_title_case(result)
        if recovered != result:
            notes.append('recuperou maiúsculas de versalete')
        result = recovered

    result, hyphen_notes = join_hyphenation(result)
    notes.extend(hyphen_notes)

    result, join_notes = split_run_together(result)
    notes.extend(join_notes)

    tidied = tidy_whitespace(result)
    if tidied != result:
        result = tidied

    if not allow_notes:
        notes = []

    return Normalisation(text=result, changed=result != value, notes=tuple(notes))