#!/usr/bin/python3
"""Create a consistent SQLite snapshot without stopping the paste service."""
from pathlib import Path
import sqlite3
import sys

source, destination = map(Path, sys.argv[1:])
if source.resolve() == destination.resolve():
    raise SystemExit('Snapshot destination must differ from the live database')
destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
destination.touch(mode=0o600, exist_ok=True)
destination.chmod(0o600)
with sqlite3.connect(source.resolve().as_uri() + '?mode=ro', uri=True) as database:
    with sqlite3.connect(destination) as snapshot:
        database.backup(snapshot)
        if snapshot.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise SystemExit('Paste database snapshot failed its integrity check')
print('Paste SQLite snapshot passed integrity check.')
