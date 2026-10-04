#!/usr/bin/env python3
"""Pipeline editorial do Kit Agrupamento Sustentável.

Gera as fichas de jogo (`source/games/{n}Game.md` e `.html`), o mapa de jogos
(`content/games-map.json`) e o relatório de construção.

Uso:
    python scripts/build_content.py              # constrói tudo
    python scripts/build_content.py --check      # verifica sem escrever
    python scripts/build_content.py --report-only # só mostra o relatório
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys
import unicodedata

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from content import config as config_module  # noqa: E402
from content import games as games_module  # noqa: E402
from content import report as report_module  # noqa: E402
from content import sheets as sheets_module  # noqa: E402


def normalise_key(value: str) -> str:
    """Chave de comparação: minúsculas, sem acentos, só letras e dígitos."""
    decomposed = unicodedata.normalize('NFD', str(value))
    without = ''.join(c for c in decomposed if not unicodedata.combining(c))
    return ''.join(c for c in without.lower() if c.isalnum())

GAME_MAP_COMMENT = (
    "Gerado por scripts/build_content.py. Pode editar à vontade: o número de "
    "cada jogo é permanente, por isso mudar o Word não renumera as fichas."
)


def _match_existing(previous: dict[str, dict], game: games_module.Game) -> dict | None:
    """Procura a ficha que já existia para este jogo, pelo título normalizado."""
    return previous.get(normalise_key(game.title))


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace(
        '+00:00', 'Z'
    )


def _load_existing_map(path: pathlib.Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except json.JSONDecodeError:
        return {}


def build_game_map(existing: dict, game_list: list[games_module.Game]) -> dict:
    """Mantém a numeração estável.

    Uma vez atribuído, o número de um jogo não muda, mesmo que os jogos sejam
    reordenados no Word mais tarde: a identidade vem do mapa, não da posição.
    """
    previous: dict[str, dict] = {}
    for entry in existing.get('games', []):
        if isinstance(entry, dict) and entry.get('slug'):
            # A chave é o título normalizado, não o slug: o slug pode mudar
            # quando um defeito de leitura é corrigido, o título não.
            previous[normalise_key(entry['title'] or entry['slug'])] = entry

    used = {int(entry['number']) for entry in previous.values() if 'number' in entry}
    first = 1
    last = 30
    next_free = max(used) + 1 if used else first

    assigned: list[dict] = []
    for game in game_list:
        existing = _match_existing(previous, game)
        if existing:
            number = int(existing['number'])
        else:
            number = next_free
            while number in used:
                number += 1
            used.add(number)
            next_free = number + 1
        game.number = number
        assigned.append(
            {
                'number': number,
                'slug': game.slug,
                'title': game.title,
                'area': game.area,
                'ods': game.ods,
                'format': game.game_format,
                'duration': game.duration,
                'participants': game.participants,
                'sheet': f'{number:02d}Game.md',
                'print': f'{number:02d}Game.html',
            }
        )

    assigned.sort(key=lambda item: item['number'])
    # Sem timestamp: o mapa tem de ser byte-idêntico entre execuções com as
    # mesmas entradas, para que `git diff` fique limpo e a construção seja
    # idempotente. A data de construção vive em build/content-report.json.
    return {
        '$comment': GAME_MAP_COMMENT,
        'count': len(assigned),
        'games': assigned,
    }


def _stale_outputs(directory: pathlib.Path, expected: set[str]) -> list[str]:
    """Ficheiros gerados que já não correspondem a nenhum jogo."""
    stale: list[str] = []
    if not directory.exists():
        return stale
    for path in sorted(directory.glob('*Game.*')):
        if path.name == '00GameSheetTemplate.docx':
            continue
        if path.name not in expected:
            stale.append(path.name)
    return stale


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true',
                        help='verifica a configuração e as fontes sem escrever nada')
    parser.add_argument('--report-only', action='store_true',
                        help='mostra o relatório da última construção e sai')
    parser.add_argument('--config', type=pathlib.Path, default=None,
                        help='caminho alternativo para content.config.json')
    args = parser.parse_args(argv)

    try:
        cfg = config_module.Config.load(args.config)
    except config_module.ConfigError as exc:
        print(f'\nERRO de configuração: {exc}\n', file=sys.stderr)
        return 2

    if args.report_only:
        if cfg.paths.report.exists():
            print(cfg.paths.report.read_text(encoding='utf-8'))
            return 0
        print('Ainda não foi gerado nenhum relatório.', file=sys.stderr)
        return 1

    report = report_module.Report(generatedAt=_now())
    paths = cfg.paths

    # ------------------------------------------------------------- fontes
    sources: list[dict] = []
    for entry in cfg.sources:
        source_path = cfg.resolve(entry['file'])
        if not source_path.exists():
            report.errors.append(
                f"Fonte em falta: {entry['file']}. "
                'Coloque o documento Word nessa pasta.'
            )
            continue
        sources.append({'id': entry['id'], 'path': source_path})

    if report.errors:
        _emit(report, cfg)
        return 1

    from content import ooxml  # importado aqui para manter o topo leve

    for item in sources:
        with ooxml.Document(item['path']) as document:
            report.sources.append(
                report_module.SourceInfo(
                    file=str(item['path'].relative_to(paths.repo)).replace('\\', '/'),
                    sha256=document.sha256,
                    paragraphs=len(document.body_blocks()),
                )
            )

    # -------------------------------------------------------------- jogos
    if not paths.fallback.exists():
        report.errors.append(
            f'Fonte editorial em falta: {paths.fallback.name}. '
            'Restaure-o com: python scripts/restore_file_md.py'
        )
        _emit(report, cfg)
        return 1

    try:
        game_list = games_module.read_games_from_file_md(paths.fallback)
    except ValueError as exc:
        report.errors.append(str(exc))
        _emit(report, cfg)
        return 1

    nested_rule = cfg.games.get('nestedGameRule', 'extract')
    if nested_rule not in ('extract', 'ignore'):
        report.errors.append(
            f'games.nestedGameRule tem o valor "{nested_rule}"; use "extract" ou "ignore".'
        )
        _emit(report, cfg)
        return 1

    if not paths.games_source.exists():
        report.warnings.append(
            f'{paths.games_source.name} não encontrado: as fichas ficam sem os '
            'passos detalhados das instruções.'
        )
        docx_games: list[dict] = []
        item_by_position: dict = {}
    else:
        # `read_games_from_docx` devolve as entradas e o mapa de parágrafos, que
        # `align_games` precisa para ler o nível e o tipo de cada lista.
        docx_games, item_by_position = games_module.read_games_from_docx(
            paths.games_source, extract_nested=(nested_rule == 'extract')
        )
        game_list, unmatched = games_module.align_games(
            game_list, docx_games, item_by_position
        )
        for entry in unmatched:
            report.unmatchedDocx.append(entry['rawTitle'])

    # --------------------------------------------------------- numeração
    existing_map = _load_existing_map(paths.games_map)
    game_map = build_game_map(existing_map, game_list)

    by_area: dict[str, int] = {}
    for game in game_list:
        by_area[game.area] = by_area.get(game.area, 0) + 1

    report.games = {
        'expected': cfg.games.get('expectedCount', 30),
        'found': len(game_list),
        'sheets': len(game_list),
        'docxEntries': len(docx_games),
        'withDetailedSteps': sum(1 for game in game_list if game.detailed_steps),
        'byArea': by_area,
    }

    if len(game_list) != cfg.games.get('expectedCount', 30):
        report.warnings.append(
            f"Encontrei {len(game_list)} jogos mas o guia anuncia "
            f"{cfg.games.get('expectedCount', 30)}. "
            'O ficheiro editorial ou o Word podem estar incompletos.'
        )

    for game in game_list:
        for name in game.missing_fields:
            report.missing.append(
                report_module.Missing(
                    game=game.title, field=name, sheet=f'{game.sheet_name}.md'
                )
            )

    # -------------------------------------------------------------- molde
    if args.check:
        _emit(report, cfg)
        return 0 if report.ok else 1

    if not paths.template.exists():
        report.errors.append(
            f'Molde em falta: {paths.template.name}. '
            'É o ficheiro que define as linhas da ficha.'
        )
        _emit(report, cfg)
        return 1

    paths.build_dir.mkdir(parents=True, exist_ok=True)

    schema = sheets_module.read_template(paths.template)
    report.template = {'labels': list(schema.labels)}

    # O esquema do molde é copiado para `build/` para que o verificador Node
    # possa conferir as fichas sem precisar de ler um .docx. Continua a ser
    # gerado a partir do molde, nunca escrito à mão.
    sheets_module.write_atomic(
        paths.build_dir / 'template-schema.json',
        json.dumps(
            {'$generated': 'Gerado por scripts/build_content.py a partir do molde.',
             'source': str(paths.template.relative_to(paths.repo)).replace('\\', '/'),
             'labels': list(schema.labels)},
            ensure_ascii=False,
            indent=2,
        ) + '\n',
    )
    report.placeholders = [
        report_module.Placeholder(
            sheet=f'{game.sheet_name}.md', field='Progresso / Sistema de Especialidades'
        )
        for game in game_list
    ]

    # ------------------------------------------------------------ escrita
    paths.games_output.mkdir(parents=True, exist_ok=True)
    expected_files: set[str] = set()

    for game in game_list:
        markdown_name = f'{game.sheet_name}.md'
        html_name = f'{game.sheet_name}.html'
        expected_files.update({markdown_name, html_name})
        sheets_module.write_atomic(
            paths.games_output / markdown_name,
            sheets_module.render_markdown(game, schema),
        )
        sheets_module.write_atomic(
            paths.games_output / html_name,
            sheets_module.render_html(game, schema),
        )
        report.sheets.append(markdown_name)

    for stale in _stale_outputs(paths.games_output, expected_files):
        target = paths.games_output / stale
        target.unlink()
        report.warnings.append(f'Ficheiro removido por estar desatualizado: {stale}')

    sheets_module.write_atomic(
        paths.games_map, json.dumps(game_map, ensure_ascii=False, indent=2) + '\n'
    )

    _emit(report, cfg)
    return 0 if report.ok else 1


def _emit(report: report_module.Report, cfg: config_module.Config) -> None:
    report.write(cfg.paths.report)
    for line in report.summary_lines():
        print(line)
    if not report.ok:
        print('Relatório completo em build/content-report.json', file=sys.stderr)


if __name__ == '__main__':
    sys.exit(main())