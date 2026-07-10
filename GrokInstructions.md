# New Tab — product notes for Grok

Personal Brave/Chrome **new tab** extension. Not for public release — just for me.

## Tech stack

This is a **TypeScript** project with a modular layout.

- Entry: `src/main.ts` → esbuild bundle `newtab.js`
- Features: `src/features/<name>/` (life, weather, room, …)
- Shared: `src/lib/`, `src/settings/`, `src/ui/`, `src/config/features.ts` (flags)
- Build: `npm run build` / `npm run typecheck` — do **not** hand-edit `newtab.js`
- Keep types strict; `@types/chrome` is available

## Inspiration

Crib the core vibe and UX of **Mortality - Death Clock - New Tab**:

- https://chromewebstore.google.com/detail/mortality-death-clock-new/eeedcpdcehnikgkhbobmkjcipjhlbmpn

That extension shows a precise, ticking age (and optional death/deadline countdown) so every new tab is a little memento mori. We want that same central idea.

## Current scope (v0)

- Replace the browser new tab page (`chrome_url_overrides.newtab`)
- Mortality-style precise age display (birth date/time in settings) + **life segment ring**
- Optional death countdown from expected lifespan
- Dark, warm sandy/leather-ish palette (keep this look; no product rebrand required)
- **Floating pane / “sexy tmux desktop” layout**: cards float on a desktop shell; monospaced titlebars and TUI chrome, but **not** ASCII-only — optional real **background images**, SVG ring, soft glass panes OK
- Widget panes: weather (live), stubs for spotify, hn, claude, radar; **room** module exists but **feature-flagged off** until login-aware scrape is designed
- Settings persist in **`chrome.storage.local`** (with localStorage mirror + migrate-from-sync)
- **Never commit secrets** — API keys, private room page URLs, cookies, etc. are local-only

## Layout / unifying idea

Think **multi-pane floating terminal desktop**, not a single centered hero + footer widgets:

- Status bar session strip across the top
- Each feature is a **pane/card** with titlebar (`[ name ]`, traffic-light dots)
- Life clock is the main pane (ring + ticking age); other features orbit as smaller panes
- Unifying glue = shared TUI chrome + floating arrangement, not one mega-widget
- Free to use photos/art behind the scrim; panes stay readable

## Settings (init + editable anytime)

Same settings dialog for first-run and later edits:

| Field | Notes |
|-------|--------|
| Birth date / time | Required for life ring |
| **Zip code** | Drives weather pane (US ZIP preferred; free Open-Meteo + zippopotam) |
| Expected lifespan | Ring segments + optional death countdown |
| Show death countdown | Toggle |
| **Room JSON URL** | Only when `FEATURES.room` is on. One-shot snapshot JSON URL — not a live stream. Hidden while flag is off. |
| Background image URL | Optional real image behind scrim |

## Planned widgets (fill in details later)

### Weather (live TUI)

- Compact TUI pane driven by **zip code** in settings (same dialog as birthday)
- **Open-Meteo** forecast (no API key) + zippopotam / geocoding for lat-lon
- Hero: sky glyph + large temp + place; chips for humidity, wind, UV, sunrise/sunset
- **Next 12 hours**: temp, wind, and UV — each with colored values and a bar chart directly under that metric (no separate t/w sparkline block)
- Refresh ~15 min; cache ~10 min; host permissions for Open-Meteo / zippopotam

### Spotify / Now Playing

- Widget showing what's currently playing on Spotify
- Details TBD (auth, API, privacy, controls)

### Mock TUI snippets (shared vibe)

Several panels share the same idea: **cute, compact mock TUI** slices on the new tab (monospaced / near-terminal chrome, dark sandy theme) — not full apps. Same family as the personal Hacker News reader TUI.

### Hacker News mock TUI snippet

- Compact TUI-style HN front page / story list vibe (like the personal HN reader).
- Details TBD (API vs mock data, open links, collapse comments, refresh).

### Room / recent shouts (one-shot JSON snapshot) — **OFF**

**Status:** `FEATURES.room = false` in `src/config/features.ts`. Code lives under `src/features/room/`; UI is `[data-feature="room"]` and stays hidden. Revisit when scrape can **log in** (session / Playwright storage).

**Not a live chatroom feed.** Goal: **read what was said recently** — one frozen snapshot.

1. **Backend (once):** scrape (after login) → write JSON. Not a continuous feed.
2. **Extension:** `fetch` that JSON URL and render. **↻** reloads the file only.
3. No scrape inside the extension. `backend/` is a local experiment; production needs server architecture (see README).

**Blocker:** private room pages require authentication before scrape is useful.

#### JSON shape (v1)

```json
{
  "version": 1,
  "updatedAt": "ISO-8601",
  "source": "optional label",
  "messages": [
    { "id": "shout-row-123", "user": "Name", "time": "14:01", "text": "…", "images": [] }
  ]
}
```

#### Media / embed rules

| Media | Behavior |
|-------|----------|
| **Twitter / X links** | Plain link text only (no cards). |
| **YouTube** | Plain links only (no embeds). |
| **Images** | No inline images. `[img]` placeholder; **hover** shows a small tooltip preview. |

#### Backend (`backend/`)

- `scrape_room.py` — **one-time** Playwright scrape of `shout-row-*` → write `out/room-feed.json` (and print summary). Not a daemon / not continuous.
- `serve_feed.py` — **local-only** long-running mini HTTP server so the extension can `fetch` the file; not production.
- Production still needs server-side architecture: scheduled scrape + serve JSON (Compose + Caddy/nginx is enough; Dokploy/Coolify if you want a multi-app manager). See root README note.
- Do not commit `config.env`, `auth.json`, or scraped output

### Anthropic chat mock TUI snippet

A little **mock TUI chat session** panel powered by the **Anthropic API** (same cute TUI presentation family as HN snippets):

- Compact terminal-style chat UI on the new tab: message history, prompt input, streaming reply if practical.
- Host a small local conversation session with Claude via Anthropic’s API (not a full chat product — a snippet for quick thoughts from the new tab).
- API key / model / system prompt: store privately (settings + `chrome.storage`, never commit secrets). Details TBD (Messages API, which model default, max tokens, cost guardrails).
- Keep the chrome minimal and on-theme; no bloated “chat app” layout.

### Local flight radar

A small **planes-around-me** panel for the local area:

- Show nearby aircraft (callsign/flight, altitude, speed, heading, distance — whatever the free feed easily provides).
- Data source: a **free** public ADS-B / flight-tracking feed (e.g. adsb.fi, adsbexchange-style open endpoints, OpenSky, or similar — pick whatever is still free and workable from an extension; no paid FlightRadar24 key required for v0).
- Scope is **local**: lat/lon (or home area from settings/geolocation) + radius, not a full worldwide map product.
- Presentation: compact list and/or simple mini-map/radar-ish view that fits the dark sandy theme (TUI-flavored is fine if it matches the other snippets).
- Refresh on an interval; be polite to free APIs (rate limits, caching). Host CORS / extension host permissions TBD when implementing.

## Non-goals for now

- Chrome Web Store packaging / polished marketing
- Multi-user onboarding
- Pixel-perfect clone of Mortality — inspiration, not a fork

## Load in Brave

1. `brave://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this repo folder
4. Open a new tab

## Notes for future sessions

Put deeper weather/Spotify specs, API keys approach, layout tweaks, and feature backlog in this file as we go. Keep secrets out of the repo.
