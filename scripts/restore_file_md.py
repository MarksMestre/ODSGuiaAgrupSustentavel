"""Restore the curated editorial source from git history.

The DOCX files cannot reproduce this document mechanically: the original was a
hand-curated rewrite (authored tables, re-drawn ASCII diagrams, condensed
prose). This script restores it and records its provenance.
"""

import hashlib
import pathlib
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parents[1]
TARGET = REPO / 'file.md'
BLOB = '8a367bbc6a6d6175c5d25ecca941d139035a847a'


def main() -> int:
    raw = subprocess.run(
        ['git', 'cat-file', '-p', BLOB],
        capture_output=True,
        cwd=REPO,
        check=True,
    ).stdout

    # Git stores the blob with LF; `.gitattributes` pins `file.md` to CRLF, so the
    # working tree copy must be converted or the byte/char counts drift by one
    # per line and the parity tests fail.
    text = raw.decode('utf-8').replace('\r\n', '\n').replace('\n', '\r\n')
    payload = text.encode('utf-8')

    TARGET.write_bytes(payload)
    print('restored %s' % TARGET.relative_to(REPO))
    print('  bytes      : %d' % len(payload))
    print('  characters : %d' % len(text))
    print('  lines      : %d' % text.count('\n'))
    print('  sha256     : %s' % hashlib.sha256(payload).hexdigest())
    return 0


if __name__ == '__main__':
    sys.exit(main())