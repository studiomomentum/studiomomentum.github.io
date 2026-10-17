"""Atomic local persistence; no networking, Git operations, or publishing."""
import csv
import json
import os
import tempfile
from contextlib import contextmanager
from pathlib import Path

@contextmanager
def atomic_file(path, encoding="utf-8"):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(dir=path.parent, prefix=".momentum-")
    try:
        with os.fdopen(fd, "w", encoding=encoding, newline="") as stream:
            yield stream
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)

def write_json(path, value):
    with atomic_file(path) as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write("\n")

def write_csv(path, rows, fields):
    with atomic_file(path, "utf-8-sig") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

@contextmanager
def db_lock(root):
    import fcntl
    with (Path(root) / ".database.lock").open("a") as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(stream, fcntl.LOCK_UN)
