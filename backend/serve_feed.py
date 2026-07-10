#!/usr/bin/env python3
"""
Long-running LOCAL HTTP server that serves out/room-feed.json.

This is NOT a one-shot script — the process stays open so the browser
extension can GET the snapshot over http:// (extensions can't read raw
disk paths). Each request re-reads the file from disk.

  scrape_room.py  → one-shot: write JSON, print, exit
  serve_feed.py   → server: stay open, return that JSON on each GET

  python serve_feed.py
  # → http://127.0.0.1:8765/room-feed.json   (Ctrl+C to stop)

In production you'll host the same JSON on a real server; the extension
still just does fetch/GET. This file is only for local wiring.

CORS is open so the extension page can fetch it.
"""

from __future__ import annotations

import argparse
import mimetypes
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent
DEFAULT_DIR = ROOT / "out"
DEFAULT_FILE = "room-feed.json"


class Handler(BaseHTTPRequestHandler):
    # Set by main()
    serve_dir: Path = DEFAULT_DIR

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Accept, Content-Type")
        self.send_header("Cache-Control", "no-store")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = unquote(urlparse(self.path).path)
        if path in ("/", ""):
            path = f"/{DEFAULT_FILE}"

        # Map /room-feed.json → serve_dir/room-feed.json
        rel = path.lstrip("/").replace("\\", "/")
        if ".." in rel.split("/"):
            self.send_error(400, "bad path")
            return

        file_path = (self.serve_dir / rel).resolve()
        try:
            file_path.relative_to(self.serve_dir.resolve())
        except ValueError:
            self.send_error(403, "forbidden")
            return

        if not file_path.is_file():
            self.send_error(
                404,
                f"missing {file_path.name} — run scrape_room.py first",
            )
            return

        data = file_path.read_bytes()
        ctype = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        if file_path.suffix.lower() == ".json":
            ctype = "application/json; charset=utf-8"

        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Serve room snapshot JSON (file only — not a live chat feed)",
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument(
        "--dir",
        default=str(DEFAULT_DIR),
        help="Directory to serve (default: backend/out)",
    )
    args = parser.parse_args()

    serve_dir = Path(args.dir)
    if not serve_dir.is_absolute():
        serve_dir = ROOT / serve_dir
    serve_dir.mkdir(parents=True, exist_ok=True)
    Handler.serve_dir = serve_dir

    feed = serve_dir / DEFAULT_FILE
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(
        f"Serving {serve_dir}\n"
        f"  Room JSON URL → http://{args.host}:{args.port}/{DEFAULT_FILE}\n"
        f"  feed exists: {feed.is_file()}\n"
        f"Ctrl+C to stop.",
        file=sys.stderr,
    )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nbye", file=sys.stderr)
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
