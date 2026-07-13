# Backend feeds (local)

## Weather feed

`build_feeds.py` writes `out/feeds/weather.json` (home forecast + London/Knoxville) when `WEATHER_LAT`/`WEATHER_LON` are set in `config.env` — see `config.example.env`. Run it on a schedule (cron/supercronic) alongside `serve_feed.py`; the extension's weather pane has no location source of its own (no geolocation, no zip) — it uses whatever `lat`/`lon` this feed reports as home. If the feed is unreachable, it falls back to a direct client-side fetch using the last coordinates a feed successfully gave it; on a fresh install that's never reached the backend, the pane just shows a "waiting on backend" message.

```bash
cd backend
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp config.example.env config.env   # Windows: copy config.example.env config.env
# edit config.env: set WEATHER_LAT / WEATHER_LON

python build_feeds.py     # writes out/feeds/weather.json (+ etymology/anglish/hn)
python serve_feed.py      # → http://127.0.0.1:8765/feeds/weather.json
```

# Room snapshot backend (local)

> **Extension flag:** `FEATURES.room` is currently **off** in `src/config/features.ts` until login-aware scraping is designed. This folder is kept for experiments; the new-tab pane will not load the JSON until the flag is flipped.

**One-time scrape** of recent shout-row messages → write a JSON file the new-tab extension can read (when enabled).

This is **not** a live chatroom feed or a long-running poller. You run the script once (or on a cron later on your server); it opens the page, grabs what’s currently visible / recently said, prints a summary, and saves JSON. The extension only displays that snapshot.

Later: move this off the frontend repo onto your server; keep pointing **Room JSON URL** at wherever the JSON is served.

## Flow

```
scrape_room.py  →  out/room-feed.json  →  (optional) serve_feed.py  →  extension fetch
     ↑ one shot              frozen snapshot              re-read file only
```

- Re-running `scrape_room.py` replaces the snapshot with a newer one.
- Extension **↻** does **not** re-scrape the chat site; it only re-fetches the JSON URL.

## JSON shape

```json
{
  "version": 1,
  "updatedAt": "2026-07-10T14:32:08Z",
  "source": "hostname",
  "messages": [
    {
      "id": "shout-row-12345",
      "user": "Alice",
      "time": "14:01",
      "text": "hello — links stay plain; images as [img]",
      "images": ["https://example.com/pic.png"]
    }
  ]
}
```

- **Twitter/X & YouTube**: plain URL text in `text` (no embeds).
- **Images**: URLs in `images[]`; optional `[img]` token in `text`.

## Setup

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# Unix
# source .venv/bin/activate

pip install -r requirements.txt
playwright install chromium
```

```bash
copy config.example.env config.env   # Windows
# cp config.example.env config.env   # Unix
```

Set `ROOM_PAGE_URL` to the **chatroom page** (rows with `id="shout-row-…"`).

### Logged-in pages

```bash
playwright codegen --save-storage=auth.json
# log in, then close the browser
```

In `config.env`:

```
PLAYWRIGHT_STORAGE=auth.json
```

Do not commit `auth.json` or `config.env`.

## One-time scrape

```bash
python scrape_room.py
# or
python scrape_room.py --url "https://…" --out out/room-feed.json
```

Prints how many messages were found and writes `out/room-feed.json`. Exit non-zero if zero messages.

## Optional: serve the snapshot for the extension

### Do I need `serve_feed.py`?

| What you want | What to run |
|---------------|-------------|
| Just scrape and look at the result | `python scrape_room.py` only — it **writes the file and exits**. JSON is also printed to stdout. |
| Point the **extension** at that file over HTTP | Keep `serve_feed.py` running (it is a **web server**, so the terminal stays open) |
| Production later | Real server: scheduled scrape job + Caddy/nginx (or your usual Docker mini-HTTP) serving the file; extension still just `fetch`es. See root **README → Note for me — server architecture later**. |

`serve_feed.py` does **not** scrape and does **not** “call once and exit.”  
Its only job: while running, answer `GET /room-feed.json` with whatever `scrape_room.py` last wrote to disk (plus CORS so the extension page is allowed to read it).

The browser extension **cannot** open `C:\...\out\room-feed.json` as a path — it needs an `http://…` URL. That’s why local testing uses a long-lived mini server. Ctrl+C stops it.

```bash
# Terminal A (stays open until you Ctrl+C)
python serve_feed.py

# Terminal B (optional: re-scrape anytime; server will serve the new file on next GET)
python scrape_room.py
```

Settings → **Room JSON URL**:

```
http://127.0.0.1:8765/room-feed.json
```

### Demo without scraping

Leave **Room JSON URL** empty — the extension uses `examples/room-feed.example.json` (bundled; no server).

## Notes

- Playwright (default): page JS fills the shout table.
- `--static`: plain HTTP GET only (no JS) — rarely enough for modern chat UIs.
- Extension host permissions currently cover `localhost` / `127.0.0.1` only.
