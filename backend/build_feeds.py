#!/usr/bin/env python3
"""
One-shot feed builder — writes snapshot JSON the extension fetches.

Each pane that is "feed-backed" gets a build_<name>_entries() function here;
the output lands in out/feeds/<name>.json plus a config.json manifest.
Run it by hand or on cron; serve_feed.py (or Caddy/nginx in production)
serves the files with CORS. See OPTIMIZATION_PLAN.md at the repo root.

  python build_feeds.py
  # → out/feeds/config.json, etymology.json, anglish.json
  # extension fetches http://127.0.0.1:8765/feeds/<name>.json

Feed contract (all feeds):  { "version": 1, "updatedAt": ISO-8601, "entries": [...] }

Sources:
  etymology — yosevu/etymonline (github), a 46k-entry dump of etymonline.com
              ({word, pos, etymology, years}); filtered + reshaped here.
  anglish   — live scrape of the Anglish Moot "English Wordbook" A–Z subpages
              (anglish.fandom.com, MediaWiki API) merged with the
              Hurlebatte-Wordbook-derived map embedded in
              bark-fa/Anglish-Translator (github).

Raw downloads are cached in out/cache/ (re-fetched after CACHE_MAX_AGE_H);
delete that folder to force a full re-scrape.
"""

from __future__ import annotations

import json
import random
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent
FEEDS_DIR = ROOT / "out" / "feeds"
CACHE_DIR = ROOT / "out" / "cache"

FEED_VERSION = 1
CACHE_MAX_AGE_H = 7 * 24

ETYMONLINE_URL = "https://raw.githubusercontent.com/yosevu/etymonline/master/index.json"
HURLEBATTE_MAP_URL = "https://raw.githubusercontent.com/bark-fa/Anglish-Translator/master/wordbook.js"
MOOT_API = "https://anglish.fandom.com/api.php"

ETYMOLOGY_MAX_ENTRIES = 10000
ETYMOLOGY_MIN_LEN = 120       # too short = no story to tell
ETYMOLOGY_MAX_LEN = 700       # truncated past this to fit the pane

ANGLISH_WORDBOOK_PREFIX = "English Wordbook/"
ANGLISH_MAX_ENTRIES = 12000


def _cached_fetch(name: str, url: str, params: dict | None = None) -> str:
    """GET url (with query params), caching the body in out/cache/<name>."""
    path = CACHE_DIR / name
    if path.is_file() and (time.time() - path.stat().st_mtime) < CACHE_MAX_AGE_H * 3600:
        return path.read_text(encoding="utf-8")
    res = requests.get(url, params=params, timeout=60,
                       headers={"User-Agent": "newTab-feed-builder (personal project)"})
    res.raise_for_status()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(res.text, encoding="utf-8")
    print(f"fetched {url} -> cache/{name} ({len(res.text)} bytes)")
    return res.text


_ETYM_FORM_STOPWORDS = {
    "word", "words", "term", "terms", "name", "names",
    "form", "forms", "phrase", "sense", "senses",
}


def _etym_form(text: str, lang: str) -> str:
    """First word/root named right after a language label, e.g. 'Old Norse vindauga'.
    Skips generic phrasing like "an Old English word for X was Y" where the token
    right after the language name is a filler noun, not the actual form."""
    m = re.search(re.escape(lang) + r"\s+\*?([\w][\w'-]*)", text)
    if not m or m.group(1).lower() in _ETYM_FORM_STOPWORDS:
        return ""
    return m.group(1)


def _etym_pie(text: str) -> str:
    m = re.search(r"PIE root \*([\w-]+)", text)
    if m:
        return f"*{m.group(1)}"
    m = re.search(r"Proto-Germanic \*([\w-]+)", text)
    if m:
        return f"*{m.group(1)} (Proto-Gmc.)"
    return ""


def _etym_composition(text: str) -> str:
    """Detects etymonline's "root1 'gloss1' ... + root2 'gloss2'" compound phrasing."""
    m = re.search(
        r"""([\w'-]+)\s+"([^"]{1,80})"[^"]{0,160}?\+\s+([\w'-]+)\s+"([^"]{1,80})\"""",
        text,
    )
    if not m:
        return ""
    root1, gloss1, root2, gloss2 = (g.strip().rstrip(",") for g in m.groups())
    return f"{root1} '{gloss1}' + {root2} '{gloss2}'"


def build_etymology_entries() -> list[dict]:
    """Root-of-the-day entries, built from the yosevu/etymonline dump (46k words
    scraped from etymonline.com), covering words of every origin (Latin and
    French borrowings included, not just Germanic ones). Reshaped by picking
    the OE form, ON form, compound roots, and PIE root out of the prose where
    the word's story happens to include them (regexes modeled on etymonline's
    own phrasing, see _etym_* helpers above) — those fields are simply blank
    for words without a Germanic/PIE angle; the note (raw etymology) always
    carries the real story regardless of origin."""
    raw = _cached_fetch("etymonline.json", ETYMONLINE_URL)
    words = json.loads(raw)

    entries: list[dict] = []
    seen: set[str] = set()
    for w in words:
        word = (w.get("word") or "").strip()
        etymology = (w.get("etymology") or "").strip()
        if not word or not etymology:
            continue
        key = word.lower()
        if key in seen:
            continue
        if not (ETYMOLOGY_MIN_LEN <= len(etymology) <= ETYMOLOGY_MAX_LEN):
            continue

        years = w.get("years") or []
        note = etymology if len(etymology) <= 320 else etymology[:317].rsplit(" ", 1)[0] + "…"
        entries.append(
            {
                "word": word,
                "senses": w.get("pos") or "",
                "earliest": f"c. {years[0]}" if years else "",
                "oe": _etym_form(etymology, "Old English"),
                "on": _etym_form(etymology, "Old Norse"),
                "composition": _etym_composition(etymology),
                "pie": _etym_pie(etymology),
                "note": note,
            }
        )
        seen.add(key)

    # The dump is in rough alphabetical order; capping at MAX_ENTRIES without
    # shuffling first would keep only A-through-something and silently drop
    # every later letter (e.g. "window" gone entirely). Sample instead so the
    # kept set spans the whole alphabet.
    if len(entries) > ETYMOLOGY_MAX_ENTRIES:
        entries = random.sample(entries, ETYMOLOGY_MAX_ENTRIES)

    return entries


def _wikitext_clean(text: str) -> str:
    """Strips Moot wikitable markup down to plain text (templates, links, bold/italic)."""
    text = re.sub(r"\{\{Over\|([^|}]*)\|[^}]*\}\}", r"\1", text)  # {{Over|word|hover}} -> word
    text = re.sub(r"\{\{[^{}]*\}\}", "", text)
    text = re.sub(r"\[https?://\S+\s+([^\]]+)\]", r"\1", text)  # [url text] -> text
    text = re.sub(r"\[https?://\S+\]", "", text)
    text = re.sub(r"\[\[([^\]|]+)\|([^\]]+)\]\]", r"\2", text)  # [[link|text]] -> text
    text = re.sub(r"\[\[([^\]]+)\]\]", r"\1", text)
    text = text.replace("<nowiki>", "").replace("</nowiki>", "")
    text = re.sub(r"<br\s*/?>", "; ", text)
    text = text.replace("'''", "").replace("''", "")
    text = re.sub(r"[‹›]", "", text)  # ‹ › citation brackets
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _split_top_level(s: str, sep: str = ",") -> list[str]:
    """Comma-splits a cell's alternatives while respecting (parenthetical) asides."""
    parts, depth, cur = [], 0, ""
    for ch in s:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth = max(0, depth - 1)
        if ch == sep and depth == 0:
            parts.append(cur.strip())
            cur = ""
        else:
            cur += ch
    if cur.strip():
        parts.append(cur.strip())
    return [p for p in parts if p]


def _parse_wordbook_rows(wikitext: str) -> list[tuple[str, str, str, str]]:
    """Parses a Moot "English Wordbook/<letter>" page into (word, pos, attested,
    unattested) rows. Table shape: rowspan header, then one row per word/sense
    with 4 cells; letter-divider rows (colspan) are skipped."""
    rows: list[tuple[str, str, str, str]] = []
    for block in re.split(r"(?m)^\|-\s*$", wikitext):
        if "colspan" in block:
            continue
        cells: list[str] = []
        cur: str | None = None
        for line in block.split("\n"):
            if line.startswith("|") and not line.startswith("|}"):
                content = line[1:]
                if "|" in content:
                    attr, rest = content.split("|", 1)
                    if "=" in attr:
                        content = rest
                if cur is not None:
                    cells.append(cur)
                cur = content
            elif line.startswith("!"):
                continue
            elif cur is not None:
                cur += " " + line
        if cur is not None:
            cells.append(cur)
        cleaned = [c for c in (_wikitext_clean(c) for c in cells) if c]
        if len(cleaned) == 4:
            rows.append((cleaned[0], cleaned[1], cleaned[2], cleaned[3]))
    return rows


def _wordbook_page_titles() -> list[str]:
    raw = _cached_fetch(
        "anglish_wordbook_pages.json",
        MOOT_API,
        {
            "action": "query",
            "list": "allpages",
            "apprefix": "English Wordbook/",
            "aplimit": "100",
            "format": "json",
        },
    )
    data = json.loads(raw)
    return [p["title"] for p in data.get("query", {}).get("allpages", [])]


def _wordbook_page_wikitext(title: str) -> str:
    cache_name = "anglish_page_" + re.sub(r"[^A-Za-z0-9]+", "_", title) + ".json"
    raw = _cached_fetch(
        cache_name,
        MOOT_API,
        {"action": "parse", "page": title, "prop": "wikitext", "format": "json"},
    )
    data = json.loads(raw)
    return data.get("parse", {}).get("wikitext", {}).get("*", "")


def _hurlebatte_pairs() -> dict[str, str]:
    """The bark-fa/Anglish-Translator wordbook.js is a flat JS object literal
    (not JSON), so pairs are pulled out with a quoted-key/value regex."""
    raw = _cached_fetch("hurlebatte_wordbook.js", HURLEBATTE_MAP_URL)
    pairs: dict[str, str] = {}
    for m in re.finditer(r'"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"', raw):
        modern, anglish = m.group(1).strip(), m.group(2).strip()
        if modern and anglish:
            pairs[modern] = anglish
    return pairs


def build_anglish_entries() -> list[dict]:
    """Modern-English -> Anglish (Germanic alternative) pairs.

    Primary source: the Anglish Moot's "English Wordbook" (anglish.fandom.com),
    scraped A-Z via the MediaWiki API and parsed out of its wikitable markup
    (word | part of speech | attested alternatives | unattested/coined ones).
    Merged with the Hurlebatte-derived word map embedded in the
    bark-fa/Anglish-Translator project, which fills in words the Moot pages
    don't separately cover.
    """
    entries: dict[str, dict] = {}

    try:
        titles = _wordbook_page_titles()
    except requests.RequestException as err:
        print(f"anglish: fetching page list failed ({err}); skipping Moot scrape", file=sys.stderr)
        titles = []

    for title in titles:
        if len(entries) >= ANGLISH_MAX_ENTRIES:
            break
        try:
            wikitext = _wordbook_page_wikitext(title)
        except requests.RequestException as err:
            print(f"anglish: fetching {title} failed ({err}); skipping page", file=sys.stderr)
            continue
        for word, pos, attested, unattested in _parse_wordbook_rows(wikitext):
            key = word.lower()
            if key in entries:
                continue
            coined = attested in ("", "-")
            primary_source = unattested if coined else attested
            alts = _split_top_level(primary_source)
            if not alts:
                continue
            other_source = attested if coined else unattested
            other_alts = alts[1:] + (
                _split_top_level(other_source) if other_source not in ("", "-") else []
            )
            note_bits = [pos] if pos else []
            if coined:
                note_bits.append("coined")
            if other_alts:
                note_bits.append("also: " + ", ".join(other_alts[:4]))
            entries[key] = {
                "modern": re.sub(r"\s*\([^)]*\)\s*$", "", word).strip(),
                "anglish": alts[0],
                "note": " · ".join(note_bits),
            }

    try:
        hurlebatte = _hurlebatte_pairs()
    except requests.RequestException as err:
        print(f"anglish: fetching Hurlebatte wordbook failed ({err})", file=sys.stderr)
        hurlebatte = {}

    for modern, anglish in hurlebatte.items():
        if len(entries) >= ANGLISH_MAX_ENTRIES:
            break
        key = modern.lower()
        if key not in entries:
            entries[key] = {"modern": modern, "anglish": anglish, "note": "Hurlebatte Wordbook"}

    return list(entries.values())


def build_hn_entries() -> list[dict]:
    """Front-page stories via the Algolia HN API. Empty on network failure
    (the feed is then skipped so a previous good snapshot isn't clobbered)."""
    import urllib.request

    url = "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30"
    try:
        with urllib.request.urlopen(url, timeout=10) as res:
            data = json.load(res)
    except OSError as err:
        print(f"hn: fetch failed ({err}); skipping", file=sys.stderr)
        return []

    entries = []
    for hit in data.get("hits", []):
        try:
            story_id = int(hit["objectID"])
        except (KeyError, TypeError, ValueError):
            continue
        entries.append(
            {
                "id": story_id,
                "title": hit.get("title") or "(untitled)",
                "url": hit.get("url")
                or f"https://news.ycombinator.com/item?id={story_id}",
                "score": hit.get("points") or 0,
                "comments": hit.get("num_comments") or 0,
                "time": hit.get("created_at_i") or 0,
                "by": hit.get("author") or "",
            }
        )
    return entries


def _envelope(entries: list[dict]) -> dict:
    return {
        "version": FEED_VERSION,
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "entries": entries,
    }


def _write(path: Path, payload: dict) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {path.relative_to(ROOT)} ({len(payload.get('entries', payload.get('feeds', [])))} items)")


def main() -> int:
    FEEDS_DIR.mkdir(parents=True, exist_ok=True)

    feeds = {
        "etymology": build_etymology_entries(),
        "anglish": build_anglish_entries(),
        "hn": build_hn_entries(),
        # later: "weather", "room" join here — see OPTIMIZATION_PLAN.md
    }

    # Empty result = source unreachable; keep whatever snapshot is on disk.
    feeds = {name: entries for name, entries in feeds.items() if entries}

    for name, entries in feeds.items():
        _write(FEEDS_DIR / f"{name}.json", _envelope(entries))

    refresh_minutes = {"hn": 15}

    # Manifest the extension will eventually fetch first to discover feeds
    # (Phase 3); written now so the contract is settled early.
    config = {
        "version": FEED_VERSION,
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "feeds": {
            name: {
                "path": f"feeds/{name}.json",
                "refreshMinutes": refresh_minutes.get(name, 60),
            }
            for name in feeds
        },
    }
    _write(FEEDS_DIR / "config.json", config)
    return 0


if __name__ == "__main__":
    sys.exit(main())
