"""Preenche content.progress.json com um mapeamento inicial demonstrativo.

Este mapeamento é uma PROPOSTA de leitura pedagógica, não uma verdade oficial:
foi feito a partir dos objetivos e das descrições dos trilhos na folha do CNE.
Serve para mostrar o mecanismo a funcionar e para dar ponto de partida a quem
o vai rever. Um dirigente deve revê-lo antes de usar.

Uso:  python scripts/seed_progress.py [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

REPO = pathlib.Path(__file__).resolve().parents[1]

# (número do jogo) -> {área do trilho: [nomes de trilho legíveis]}
# Os nomes são convertidos em chaves com o mesmo `slugify` da taxonomia.
SEED: dict[int, dict[str, list[str]]] = {
    # ---------------------------------------------------------- Pessoas
    1: {  # Dramatização de Realidades
        'Afetivo': ['Equilíbrio emocional', 'Autoestima'],
        'Social': ['Exercer ativamente cidadania'],
    },
    2: {  # Jogo Justo (Futebol Desigual)
        'Físico': ['Desempenho'],
        'Social': ['Exercer ativamente cidadania'],
        'Caráter': ['Coerência'],
    },
    3: {  # O Caminho para a Terra da Igualdade
        'Intelectual': ['Criatividade e expressão'],
        'Social': ['Exercer ativamente cidadania'],
        'Caráter': ['Autonomia'],
    },
    4: {  # Muda os Teus Óculos
        'Afetivo': ['Equilíbrio emocional'],
        'Social': ['Interação e cooperação'],
    },
    5: {  # Peixinho das Desigualdades
        'Social': ['Interação e cooperação', 'Solidariedade e tolerância'],
        'Espiritual': ['Descoberta'],
    },
    6: {  # Corrida da Saúde
        'Físico': ['Desempenho', 'Bem-estar físico'],
    },
    # ----------------------------------------------------------- Planeta
    7: {  # A Certeza no Caos
        'Intelectual': ['Resolução de problemas'],
        'Caráter': ['Responsabilidade'],
    },
    8: {  # Água: Bem de Todos, para Todos!
        'Caráter': ['Responsabilidade', 'Coerência'],
        'Social': ['Exercer ativamente cidadania'],
    },
    9: {  # Alterações Climáticas
        'Intelectual': ['Resolução de problemas'],
        'Espiritual': ['Serviço'],
    },
    10: {  # Hotéis para Insetos
        'Físico': ['Desempenho'],
        'Espiritual': ['Serviço'],
        'Intelectual': ['Criatividade e expressão'],
    },
    11: {  # Reciclagem 2.0
        'Caráter': ['Responsabilidade'],
        'Intelectual': ['Criatividade e expressão'],
    },
    12: {  # Qual o Tamanho da Tua Pegada?
        'Intelectual': ['Resolução de problemas', 'Procura de conhecimento'],
        'Caráter': ['Autonomia'],
    },
    # ------------------------------------------------------ Prosperidade
    13: {  # Quantos Queres dos Direitos
        'Intelectual': ['Resolução de problemas'],
        'Social': ['Exercer ativamente cidadania'],
    },
    14: {  # E se Eu Não Fosse à Escola?
        'Intelectual': ['Criatividade e expressão'],
        'Caráter': ['Autonomia'],
    },
    15: {  # Jogo dos Salários
        'Caráter': ['Responsabilidade'],
        'Social': ['Exercer ativamente cidadania', 'Solidariedade e tolerância'],
        'Afetivo': ['Equilíbrio emocional'],
    },
    16: {  # O Mundo Sem Todos os Empregos
        'Afetivo': ['Equilíbrio emocional'],
        'Social': ['Solidariedade e tolerância'],
    },
    17: {  # O Orçamento nas Tuas Mãos
        'Caráter': ['Autonomia', 'Responsabilidade'],
        'Social': ['Exercer ativamente cidadania'],
    },
    18: {  # A Rota do Vestuário
        'Caráter': ['Responsabilidade'],
        'Intelectual': ['Resolução de problemas'],
    },
    # --------------------------------------------------------------- Paz
    19: {  # Time's Up dos Valores
        'Espiritual': ['Aprofundamento'],
        'Caráter': ['Coerência'],
    },
    20: {  # 3 Coisas na Bagagem
        'Espiritual': ['Descoberta'],
        'Afetivo': ['Relacionamento e sensibilidade'],
    },
    21: {  # O Novo Planeta
        'Espiritual': ['Aprofundamento'],
        'Intelectual': ['Criatividade e expressão'],
    },
    22: {  # Qual a Tua Posição?
        'Caráter': ['Coerência', 'Autonomia'],
        'Social': ['Exercer ativamente cidadania'],
    },
    23: {  # Olha a Notícia!
        'Intelectual': ['Procura de conhecimento'],
        'Caráter': ['Responsabilidade'],
    },
    24: {  # Representar é Humano
        'Afetivo': ['Relacionamento e sensibilidade'],
        'Social': ['Interação e cooperação'],
    },
    # -------------------------------------------------------- Parcerias
    25: {  # Jogo do Quim dos ODS
        'Intelectual': ['Procura de conhecimento'],
        'Social': ['Interação e cooperação'],
    },
    26: {  # Jogo da Memória Cooperativo
        'Social': ['Interação e cooperação'],
        'Caráter': ['Coerência'],
    },
    27: {  # O Pacote de Açúcar
        'Caráter': ['Responsabilidade'],
        'Intelectual': ['Resolução de problemas'],
    },
    28: {  # Desenho Estragado dos ODS
        'Intelectual': ['Criatividade e expressão'],
        'Social': ['Interação e cooperação'],
    },
    29: {  # Descobre +
        'Intelectual': ['Procura de conhecimento'],
        'Espiritual': ['Descoberta'],
    },
    30: {  # Negociar na ONU
        'Social': ['Exercer ativamente cidadania', 'Interação e cooperação'],
        'Caráter': ['Responsabilidade'],
        'Afetivo': ['Relacionamento e sensibilidade'],
    },
}


def slugify(value: str) -> str:
    import unicodedata
    import re

    decomposed = unicodedata.normalize('NFD', value)
    without = ''.join(c for c in decomposed if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', '-', without.lower()).strip('-')


def build() -> dict:
    artefact = json.loads(
        (REPO / 'build' / 'progress-taxonomy.json').read_text(encoding='utf-8')
    )
    sections = artefact['sections']

    # Índice por nome de trilho, por Secção. A folha tem deriva de acentos
    # (`Equilibrio emocional` em 1Sec/2Sec/3Sec, `Equilíbrio emocional` em
    # 4Sec), por isso a comparação também é feita por chave normalizada.
    lookup: dict[str, dict[str, str]] = {}
    for tab, section in sections.items():
        names: dict[str, str] = {}
        for area in section['areas']:
            for trilho in area['trilhos']:
                names[trilho['name']] = trilho['key']
                names[slugify(trilho['name'])] = trilho['key']
        lookup[tab] = names

    result: dict[str, dict[str, dict[str, list[str]]]] = {}
    unknown: list[str] = []

    for game_number, areas in SEED.items():
        for tab, names in lookup.items():
            keys: list[str] = []
            for area, trilhos in areas.items():
                for name in trilhos:
                    key = names.get(name) or names.get(slugify(name))
                    if key is None:
                        unknown.append(f'{tab}: {name!r} não existe na folha')
                        continue
                    if key not in keys:
                        keys.append(key)
            if keys:
                result.setdefault(tab, {})[str(game_number)] = {'trilhos': keys}

    if unknown:
        for item in unknown:
            print(f'  aviso: {item}', file=sys.stderr)

    return {
        '$comment': (
            'Progresso Pessoal por jogo. Preenchido à mão por um dirigente: a '
            'folha do CNE só diz quais são os trilhos, não quais se aplicam a '
            'cada jogo. Este mapeamento é uma PROPOSTA inicial feita a partir '
            'das descrições dos trilhos e deve ser revisto antes de usado. '
            'Use `npm run progress:keys` para ver todos os valores válidos.'
        ),
        'version': 1,
        'sections': result,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true', help='não escreve o ficheiro')
    args = parser.parse_args()

    mapping = build()
    target = REPO / 'content.progress.json'
    payload = json.dumps(mapping, ensure_ascii=False, indent=2) + '\n'

    total = sum(
        len(entry.get('trilhos', []))
        for games in mapping['sections'].values()
        for entry in games.values()
    )
    print(f'{len(mapping["sections"])} Secções, {total} Declarações de trilho.')
    if args.dry_run:
        print('Dry run: nada foi escrito.')
        return 0

    target.write_text(payload, encoding='utf-8', newline='\n')
    print(f'Escrito {target.relative_to(REPO)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())