"""Relatório de construção: o que foi gerado, o que falta e o que mudou."""

from __future__ import annotations

import json
import pathlib
from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class SourceInfo:
    file: str
    sha256: str
    paragraphs: int


@dataclass
class Missing:
    game: str
    field: str
    sheet: str


@dataclass
class Placeholder:
    sheet: str
    field: str


@dataclass
class Report:
    generatedAt: str
    sources: list[SourceInfo] = field(default_factory=list)
    template: dict[str, Any] = field(default_factory=dict)
    games: dict[str, Any] = field(default_factory=dict)
    sheets: list[str] = field(default_factory=list)
    missing: list[Missing] = field(default_factory=list)
    placeholders: list[Placeholder] = field(default_factory=list)
    unmatchedDocx: list[str] = field(default_factory=list)
    unclassified: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False, indent=2) + '\n'

    def write(self, path: pathlib.Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(self.to_json(), encoding='utf-8', newline='\n')

    # ------------------------------------------------------------- console

    def summary_lines(self) -> list[str]:
        lines = [
            '',
            'Relatório de construção',
            '======================',
            f"  fontes lidas      : {len(self.sources)}",
            f"  jogos encontrados : {self.games.get('found', '?')}"
            f" (esperado {self.games.get('expected', '?')})",
            f"  fichas geradas    : {len(self.sheets)}",
        ]
        by_area = self.games.get('byArea') or {}
        if by_area:
            lines.append('  jogos por área    :')
            for area, count in by_area.items():
                lines.append(f'      {area:<24} {count}')
        if self.template:
            lines.append(
                f"  rótulos no molde  : {len(self.template.get('labels', []))}"
            )
        if self.missing:
            lines.append(f"  campos em falta   : {len(self.missing)}")
            for item in self.missing:
                lines.append(f"      {item.sheet}: {item.field}")
        if self.placeholders:
            lines.append(f"  campos por preencher: {len(self.placeholders)}")
            if len(self.placeholders) <= 3:
                for item in self.placeholders:
                    lines.append(f"      {item.sheet}: {item.field}")
            else:
                lines.append(f"      (todos os {len(self.placeholders)} jogos)")
        if self.unmatchedDocx:
            lines.append(f"  jogos do Word sem par: {len(self.unmatchedDocx)}")
            for title in self.unmatchedDocx:
                lines.append(f'      {title}')
        if self.unclassified:
            lines.append(f"  conteúdo por classificar: {len(self.unclassified)}")
            for item in self.unclassified[:10]:
                lines.append(f'      {item}')
        if self.warnings:
            lines.append(f"  avisos            : {len(self.warnings)}")
            for item in self.warnings:
                lines.append(f'      {item}')
        if self.errors:
            lines.append(f"  ERROS             : {len(self.errors)}")
            for item in self.errors:
                lines.append(f'      {item}')
        lines.append('')
        lines.append('  Tudo certo.' if self.ok else '  Falhou — ver os erros acima.')
        lines.append('')
        return lines