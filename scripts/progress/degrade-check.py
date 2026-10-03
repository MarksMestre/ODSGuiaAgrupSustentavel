"""Verifica que o build do site NÃO depende dos dados de progresso.

Move `build/progress-taxonomy.json` e `content.progress.json` para lado,
reconstrói o site e confirma que a construção tem sucesso e que o bloco de
Progresso Pessoal simplesmente não aparece.

    python scripts/progress/degrade-check.py
"""

import pathlib
import shutil
import subprocess
import sys
import tempfile

REPO = pathlib.Path(__file__).resolve().parents[2]


def run(*args):
    # No Windows o `npx` é um ficheiro .cmd e precisa de shell para ser
    # executado por `subprocess`.
    return subprocess.run(
        list(args),
        cwd=REPO,
        capture_output=True,
        text=True,
        timeout=600,
        shell=True,
        encoding='utf-8',
        errors='replace',
    )


def main() -> int:
    stash = pathlib.Path(tempfile.mkdtemp(prefix='degrade-'))
    moved = []
    failures = []

    targets = [
        REPO / 'build' / 'progress-taxonomy.json',
        REPO / 'content.progress.json',
    ]
    for target in targets:
        if target.exists():
            backup = stash / target.name
            shutil.move(str(target), str(backup))
            moved.append((target, backup))

    try:
        print('== sem taxonomia e sem mapeamento ==')
        build = run('npx', 'vite', 'build')
        ok_build = build.returncode == 0
        print('   vite build :', 'ok' if ok_build else 'FALHOU')
        if not ok_build:
            failures.append('vite build falhou sem o artefacto de progresso')
            print(build.stdout[-1500:])
            print(build.stderr[-1500:])

        print('== verificação de conteúdo ==')
        check = run('node', 'scripts/check-content.mjs')
        ok_check = check.returncode == 0
        print('   check      :', 'ok' if ok_check else 'FALHOU')
        if not ok_check:
            failures.append('a verificação de conteúdo falhou')
            print(check.stdout[-2000:])

        # O pacote não pode conter os dados que vêm dos artefactos: a taxonomia da
        # folha (nomes e descritores dos trilhos) e o mapeamento por jogo. Os
        # nomes de classe CSS, as frases da interface e os dados editoriais de
        # `content.config.json` (rótulo, faixa etária, cor de cada Secção) ficam
        # no código de qualquer modo — são constantes do projeto, não conteúdo
        # buscável.
        print('== conteúdo construído ==')
        bundle = next((path for path in (REPO / 'dist' / 'assets').glob('*.js')), None)
        if bundle is None:
            failures.append('não encontrei o pacote construído em dist/assets')
        else:
            text = bundle.read_text(encoding='utf-8', errors='replace')
            probes = [
                ('chave de trilho (taxonomia)', 'solidariedade-e-tolerancia'),
                ('nome de trilho (taxonomia)', 'Interação e cooperação'),
                ('descritor (taxonomia)', 'Reage bem ao esforço físico'),
                ('mapeamento jogo → trilhos', '"1Sec":{"1"'),
            ]
            found = []
            for label, probe in probes:
                present = probe in text
                print(f'   {label:<28} {"PRESENTE" if present else "ausente"}')
                if present:
                    found.append(label)
            if found:
                failures.append(f'o pacote ainda contém dados de progresso: {", ".join(found)}')

        print('== testes ==')
        tests = run('npx', 'vitest', 'run')
        ok_tests = tests.returncode == 0
        print('   vitest     :', 'ok' if ok_tests else 'FALHOU')
        if not ok_tests:
            failures.append('os testes falharam')
            print(tests.stdout[-2500:])
    finally:
        for target, backup in moved:
            shutil.move(str(backup), str(target))
        shutil.rmtree(stash, ignore_errors=True)

    print()
    if failures:
        print('FALHAS:')
        for item in failures:
            print('  -', item)
        return 1
    print('Degradação correta: o site constrói e funciona sem nenhum dado de progresso.')
    return 0


if __name__ == '__main__':
    sys.exit(main())