#!/usr/bin/env python3
"""
One-time scrape of recent shout-row messages → write (and print summary of) JSON.

This is NOT a live chatroom feed or a long-running poller. Run it once: open the
page, grab what's currently / recently said, save a snapshot file. The new-tab
extension only displays that snapshot; re-run this script when you want fresher data.

Usage:
  # 1) Install deps once
  pip install -r requirements.txt
  playwright install chromium

  # 2) Set the page URL (env or --url)
  set ROOM_PAGE_URL=https://your-forum.example/chat   # Windows
  export ROOM_PAGE_URL=https://your-forum.example/chat  # Unix

  # 3) Optional login cookies (if the chat needs a session)
  playwright codegen --save-storage=auth.json
  set PLAYWRIGHT_STORAGE=auth.json

  # 4) One-shot scrape
  python scrape_room.py
  python scrape_room.py --url https://... --out out/room-feed.json

  # 5) Optional: serve the snapshot for the extension
  python serve_feed.py
  # Settings → Room snapshot JSON URL = http://127.0.0.1:8765/room-feed.json

JSON shape (version 1):
  {
    "version": 1,
    "updatedAt": "ISO-8601",
    "source": "hostname",
    "messages": [
      { "id": "shout-row-123", "user": "Name", "time": "14:01", "text": "...", "images": [] }
    ]
  }
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("Missing beautifulsoup4. Run: pip install -r requirements.txt", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent
DEFAULT_OUT = ROOT / "out" / "room-feed.json"


def load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def clean_text(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip()


def extract_from_html(html: str, page_url: str) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    rows = soup.select('[id^="shout-row-"], tr.shout-row, .shout-row')
    messages: list[dict[str, Any]] = []
    seen: set[str] = set()

    for row in rows:
        rid = (row.get("id") or "").strip()
        user_el = row.select_one('[itemprop="name"], span[itemprop="name"]')
        user = clean_text(user_el.get_text(" ", strip=True) if user_el else "") or "unknown"

        time_el = row.select_one(".shout-date, span.shout-date, td.shout-date, time")
        time_s = clean_text(time_el.get_text(" ", strip=True) if time_el else "")
        if len(time_s) > 40:
            time_s = time_s[:40]

        # Clone-ish: strip author/date chrome, collect body + images
        work = BeautifulSoup(str(row), "html.parser")
        node = work.find(True)
        if node is None:
            continue
        for sel in (
            '[itemprop="name"]',
            "span[itemprop='name']",
            ".shout-date",
            "time",
            ".shout-avatar",
            ".avatar",
        ):
            for n in node.select(sel):
                n.decompose()

        images: list[str] = []
        for img in node.select("img"):
            src = img.get("src") or img.get("data-src") or img.get("data-full-url") or ""
            if src and not str(src).startswith("data:image/svg"):
                images.append(str(src))
            img.replace_with("[img]")

        text = clean_text(node.get_text(" ", strip=True))
        if user and text == user and not images:
            continue
        if not text and not images:
            continue
        if not text and images:
            text = "[img]"

        mid = rid or f"{user}-{time_s}-{text[:24]}"
        if mid in seen:
            continue
        seen.add(mid)

        messages.append(
            {
                "id": mid,
                "user": user,
                "time": time_s,
                "text": text,
                "images": images,
            }
        )

    host = ""
    try:
        host = urlparse(page_url).hostname or ""
    except Exception:
        host = ""

    return {
        "version": 1,
        "updatedAt": now_iso(),
        "source": host or "scrape",
        "messages": messages[-200:],
    }


def fetch_html_playwright(url: str, storage: str | None, wait_ms: int) -> str:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print(
            "Playwright not installed. Run:\n"
            "  pip install -r requirements.txt\n"
            "  playwright install chromium",
            file=sys.stderr,
        )
        sys.exit(1)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context_kwargs: dict[str, Any] = {
            "viewport": {"width": 1400, "height": 900},
        }
        if storage and Path(storage).is_file():
            context_kwargs["storage_state"] = storage
        context = browser.new_context(**context_kwargs)
        page = context.new_page()
        page.goto(url, wait_until="domcontentloaded", timeout=60_000)
        # Wait for shout rows (AJAX chat)
        try:
            page.wait_for_selector('[id^="shout-row-"]', timeout=max(wait_ms, 5_000))
        except Exception:
            # Still snapshot whatever is there
            page.wait_for_timeout(min(wait_ms, 8_000))
        # A little settle time for late rows
        page.wait_for_timeout(1_200)
        html = page.content()
        context.close()
        browser.close()
        return html


def fetch_html_requests(url: str) -> str:
    import requests

    res = requests.get(
        url,
        timeout=30,
        headers={
            "User-Agent": "newtab-room-scraper/0.1 (+local)",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    res.raise_for_status()
    return res.text


def main() -> int:
    load_dotenv(ROOT / "config.env")
    load_dotenv(ROOT / ".env")

    parser = argparse.ArgumentParser(
        description="One-time scrape of recent shouts → room-feed JSON snapshot (not a live feed)",
    )
    parser.add_argument(
        "--url",
        default=os.environ.get("ROOM_PAGE_URL", "").strip(),
        help="Chatroom page URL (or set ROOM_PAGE_URL)",
    )
    parser.add_argument(
        "--out",
        default=os.environ.get("ROOM_OUT", str(DEFAULT_OUT)),
        help="Output JSON path (default: out/room-feed.json)",
    )
    parser.add_argument(
        "--storage",
        default=os.environ.get("PLAYWRIGHT_STORAGE", "").strip() or None,
        help="Playwright storage_state JSON for cookies/login",
    )
    parser.add_argument(
        "--wait-ms",
        type=int,
        default=int(os.environ.get("ROOM_WAIT_MS", "15000")),
        help="Max ms to wait for shout-row nodes (playwright)",
    )
    parser.add_argument(
        "--static",
        action="store_true",
        help="Use plain HTTP GET (no JS) instead of Playwright",
    )
    args = parser.parse_args()

    if not args.url:
        print(
            "No page URL. Pass --url or set ROOM_PAGE_URL (see config.example.env).",
            file=sys.stderr,
        )
        return 2

    print(f"One-shot scrape: {args.url}", file=sys.stderr)
    if args.static:
        html = fetch_html_requests(args.url)
    else:
        html = fetch_html_playwright(args.url, args.storage, args.wait_ms)

    feed = extract_from_html(html, args.url)
    out_path = Path(args.out)
    if not out_path.is_absolute():
        out_path = ROOT / out_path
    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(feed, indent=2, ensure_ascii=False) + "\n"
    out_path.write_text(payload, encoding="utf-8")

    n = len(feed["messages"])
    print(f"Snapshot: {n} recent messages → {out_path}", file=sys.stderr)
    # Also print JSON to stdout so you can pipe / inspect without opening the file
    sys.stdout.write(payload)
    if n == 0:
        print(
            "Warning: 0 messages. If the chat is JS-rendered, drop --static. "
            "If login is required, use --storage auth.json from playwright codegen.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
