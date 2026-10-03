"""Carrega e valida `content.config.json`.

Todos os valores mágicos do pipeline vivem na configuração, para que um editor
sem conhecimentos de programação nunca tenha de abrir um ficheiro `.py`.
"""

from __future__ import annotations

import json
import pathlib
from dataclasses import dataclass
from typing import Any

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
CONFIG_FILE = REPO_ROOT / 'content.config.json'


class ConfigError(RuntimeError):
    """Configuração em falta ou inválida."""


def _require(mapping: dict[str, Any], key: str, where: str) -> Any:
    if key not in mapping:
        raise ConfigError(f'{where}: falta a chave obrigatória "{key}".')
    return mapping[key]


@dataclass(frozen=True)
class Paths:
    repo: pathlib.Path
    build_dir: pathlib.Path
    report: pathlib.Path
    games_output: pathlib.Path
    games_map: pathlib.Path
    template: pathlib.Path
    games_source: pathlib.Path
    fallback: pathlib.Path
    progress_artefact: pathlib.Path
    progress_mapping: pathlib.Path


class Config:
    """Acesso tipado e validado à configuração."""

    def __init__(self, raw: dict[str, Any], path: pathlib.Path) -> None:
        self._raw = raw
        self._path = path

        # As secções são lidas antes da validação, porque `_validate` já as usa.
        self._editorial = _require(raw, 'editorial', 'content.config.json')
        self._games = _require(raw, 'games', 'content.config.json')
        self._build = _require(raw, 'build', 'content.config.json')
        self._report = _require(raw, 'report', 'content.config.json')
        self._progress = raw.get('progress', {})

        sources = _require(self._editorial, 'sources', 'editorial')
        if not isinstance(sources, list) or not sources:
            raise ConfigError('editorial.sources tem de ser uma lista não vazia.')

        self.paths = Paths(
            repo=REPO_ROOT,
            build_dir=REPO_ROOT / self._build.get('dir', 'build'),
            report=REPO_ROOT / self._report['file'],
            games_output=REPO_ROOT / self._games['outputDir'],
            games_map=REPO_ROOT / self._games['mapFile'],
            template=REPO_ROOT / self._games['template'],
            games_source=REPO_ROOT / self.source_entry('games')['file'],
            fallback=REPO_ROOT / self._editorial.get('fallbackFile', 'file.md'),
            progress_artefact=REPO_ROOT / self._progress.get('artefact', 'build/progress-taxonomy.json'),
            progress_mapping=REPO_ROOT / self._progress.get('mapping', 'content.progress.json'),
        )
        self._validate()

    # ------------------------------------------------------------------ load

    @classmethod
    def load(cls, path: pathlib.Path | None = None) -> 'Config':
        target = path or CONFIG_FILE
        if not target.exists():
            raise ConfigError(
                f'Não encontrei {target.name}. Ele tem de estar na raiz do projeto.'
            )
        try:
            raw = json.loads(target.read_text(encoding='utf-8'))
        except json.JSONDecodeError as exc:
            raise ConfigError(f'{target.name} não é JSON válido: {exc}') from exc
        return cls(raw, target)

    # ------------------------------------------------------------- validate

    def _validate(self) -> None:
        games = self._games
        for key in ('template', 'outputDir', 'mapFile', 'firstNumber', 'lastNumber'):
            _require(games, key, 'games')

        if not isinstance(games['firstNumber'], int) or not isinstance(games['lastNumber'], int):
            raise ConfigError('games.firstNumber e games.lastNumber têm de ser números inteiros.')
        if games['firstNumber'] < 1 or games['lastNumber'] < games['firstNumber']:
            raise ConfigError('games.firstNumber tem de ser >= 1 e <= lastNumber.')

        for key in ('spreadsheetId', 'tabs', 'sections'):
            if self._progress and key not in self._progress:
                raise ConfigError(f'progress: falta a chave obrigatória "{key}".')

        tabs = self._progress.get('tabs', [])
        section_tabs = [s.get('tab') for s in self._progress.get('sections', [])]
        if sorted(tabs) != sorted(section_tabs):
            raise ConfigError(
                'progress.tabs e progress.sections[].tab têm de conter exatamente '
                f'os mesmos valores. tabs={tabs} sections={section_tabs}'
            )

    # -------------------------------------------------------------- getters

    @property
    def raw(self) -> dict[str, Any]:
        return self._raw

    @property
    def progress(self) -> dict[str, Any]:
        return self._progress

    def source_entry(self, source_id: str) -> dict[str, Any]:
        for entry in self._editorial['sources']:
            if entry.get('id') == source_id:
                return entry
        raise ConfigError(f'editorial.sources não tem nenhuma entrada com id="{source_id}".')

    @property
    def sources(self) -> list[dict[str, Any]]:
        return list(self._editorial['sources'])

    @property
    def games(self) -> dict[str, Any]:
        return self._games

    @property
    def areas(self) -> list[str]:
        return list(self._games.get('areas', []))

    @property
    def areas_per_group(self) -> int:
        return int(self._games.get('areasPerGroup', 6))

    def resolve(self, relative: str) -> pathlib.Path:
        return self.paths.repo / relative