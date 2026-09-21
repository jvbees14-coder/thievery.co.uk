# ---------------------------------------------------------------------------
# Parquet in, JSON lines out.
#
#   python -m venv .venv && .venv/Scripts/pip install pyarrow
#   .venv/Scripts/python scripts/parquet-to-jsonl.py incoming/*.parquet
#   npm run decks:import -- incoming/
#
# Question sets are published as Parquet more often than not, and Parquet is a
# compressed columnar format with Thrift metadata — not something to be read
# by a reader written in an afternoon, and not something to add a dependency
# to the server for either. `ws` and `@aws-sdk/client-s3` are the whole of what
# this site installs, and the way to keep that true is for the awkward step to
# happen at a desk rather than at boot.
#
# So this is deliberately not part of the app. It is a converter run by hand,
# in a throwaway virtual environment, whose output is JSON lines —which
# `scripts/decks-import.js` already reads, and which can be looked at with a
# text editor before anything is written into `server/decks/`.
#
# It flattens nothing and renames nothing. Whatever columns the file has come
# out as the keys of each record, nested values and all, because the importer
# is the thing that knows what a question looks like and this only knows how
# to open the box.
# ---------------------------------------------------------------------------

import json
import sys
from pathlib import Path

try:
    import pyarrow.parquet as pq
except ImportError:
    sys.exit("pyarrow is not installed. Make a venv and pip install pyarrow — see the top of this file.")


def convert(src: Path) -> Path:
    table = pq.read_table(src)
    out = src.with_suffix(".jsonl")
    written = 0
    # One row per line, written as UTF-8 with the characters left alone: these
    # sets are full of degree signs and accented names, and a file of escapes
    # is a file nobody can read back.
    with out.open("w", encoding="utf-8", newline="\n") as fh:
        for batch in table.to_batches():
            for row in batch.to_pylist():
                fh.write(json.dumps(row, ensure_ascii=False))
                fh.write("\n")
                written += 1
    print(f"  ok    {src.name} -> {out.name} ({written:,} rows, columns: {', '.join(table.schema.names)})")
    return out


def main(argv):
    if not argv:
        sys.exit("Usage: python scripts/parquet-to-jsonl.py <file.parquet> [...]")
    paths = []
    for arg in argv:
        p = Path(arg)
        paths.extend(sorted(p.glob("*.parquet")) if p.is_dir() else [p])
    if not paths:
        sys.exit("No .parquet files there.")
    for p in paths:
        convert(p)
    print()
    print("  ok    Now: npm run decks:import -- " + str(paths[0].parent))


if __name__ == "__main__":
    main(sys.argv[1:])
