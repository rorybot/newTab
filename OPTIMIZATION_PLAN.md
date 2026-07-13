# Optimization Plan — backend feeds, config, and the HTMX question

Analysis of the codebase as of 2026-07 and a phased plan for moving data work out of the extension and into the backend. The core idea (already sketched in README + GrokInstructions for the room feature) generalizes to everything: **backend builds snapshot JSON on a schedule → extension fetches and renders it**.

## Where the extension currently does too much

| Pane | Client-side work today | Cost |
|------|------------------------|------|
| weather (`885 lines`) | Backend feed provides home lat/lon + forecast directly; client only falls back to its own 3× Open-Meteo fetches if the feed is unreachable | Largest module; API shaping logic lives partly in the client still (fallback path) |
| spotify | OAuth token refresh + ~8s polling | Fine where it is — OAuth uses `chrome.identity`, must stay in the extension |
| etymology / anglish | Hardcoded 3-entry demo arrays bundled into `newtab.js` | No real data source; growing the dataset bloats the bundle |
| room (off) | Blocked on login-aware scrape — backend-only by design | Already follows the target pattern |
| life ring | Pure local math | Fine where it is |
| hn / claude / radar (planned) | Not started | Should be built backend-first from day one |

## Target architecture: feeds + config

```
backend (cron or on-demand)                    extension (every new tab)
─────────────────────────────                  ─────────────────────────
build_feeds.py                                 src/lib/feeds.ts
  ├─ build_etymology_entries()                   loadFeed("etymology") ─┐
  ├─ build_anglish_entries()                     loadFeed("anglish")   ─┤ fetch + 3s timeout
  ├─ (later) build_weather()                     …                     ─┤ fallback to bundled
  └─ (later) scrape_room login flow              config.json (future)  ─┘ demo data on failure
        ↓ writes
backend/out/feeds/*.json  ←── serve_feed.py / Caddy / nginx serves with CORS
```

- **One contract:** every feed is `{ version, updatedAt, entries: [...] }`. The extension never talks to third-party APIs for feed-backed panes; it GETs pre-shaped JSON.
- **`config.json` manifest:** the builder also writes a config listing available feeds + suggested refresh intervals. Once several panes are feed-backed, the extension fetches this once per load to discover what's live instead of hardcoding feed names ("send a config here instead" — this is that).
- **Graceful degradation:** backend down → panes fall back to bundled demo data silently. A new tab must never block on the network.
- **Deployment target is the local Docker home server** (not a VPS): cron job container writes files, Caddy/nginx container serves them over the LAN. `serve_feed.py` is the on-this-machine dev stand-in and already serves any file under `out/` — no server changes needed for new feeds.

## The HTMX question — recommendation: no

Considered honestly, HTMX is the wrong shape for this project:

1. **A new tab page must render instantly and offline.** HTMX means the server renders your HTML fragments; every pane would depend on a round-trip to a server that (today) doesn't even run permanently. Backend down = blank dashboard, dozens of times a day.
2. **MV3 CSP friction.** `script-src 'self'` allows bundling htmx itself, but its inline-attribute evaluation features (event filters, `js:` expressions) rely on eval-like execution that extension CSP blocks. You'd be using a subset, carefully.
3. **Spotify can't move.** OAuth via `chrome.identity.launchWebAuthFlow` and token storage are inherently extension-side. You'd run a hybrid anyway.
4. **The expensive part isn't rendering — it's data acquisition.** The bundle renders locally in milliseconds regardless of its size on disk. What HTMX would buy ("less client JS, server owns the logic") is achieved by the feeds pattern: panes become dumb renderers of pre-shaped JSON, and the backend owns fetching/scraping/shaping. Same benefit, no availability regression.

If server-rendered fragments ever become genuinely appealing (e.g. a complex HN comment tree), render that one fragment server-side into the feed JSON as an HTML string and inject it — no framework needed.

## Phases

### Phase 0 — plumbing (scaffolded now)
- `backend/build_feeds.py`: one-shot builder with per-feature functions; writes `out/feeds/{config,etymology,anglish}.json` (demo data server-side for now).
- `src/lib/feeds.ts`: generic `loadFeed()` — fetch with timeout, silent fallback.
- `src/config/backend.ts`: feed base URL constant (localhost dev default).
- Etymology + anglish panes try the feed first, fall back to bundled demo entries.

### Phase 1 — real data sources (backend-only work)
- Etymology: etymonline scrape (or a curated dataset) in `build_etymology_entries()`; grow to a proper "root of the day" pool. Respect robots/rate limits; cache raw pages.
- Anglish: seed from the Anglish Wordbook dataset; curate.
- HN pane: build it feed-first — backend hits Algolia HN API, writes `hn.json`; extension just renders. No client API calls from day one.

### Phase 2 — weather goes server-side (biggest client win) — done
- Backend fetches Open-Meteo for a fixed home lat/lon + extra cities, writes `weather.json` shaped exactly for the pane (chips, 12-hour bars, extra-city temps pre-computed).
- Home location lives *only* in `backend/config.env` as `WEATHER_LAT`/`WEATHER_LON` — no geolocation, no zip, no client-side location setting of any kind. The extension has no independent notion of "home"; it uses whatever lat/lon the feed reports. This cuts the extension from ~3 API calls per refresh to 1 local GET, and most of weather-pane.ts's shaping logic lives in Python.
- **No matching needed** (superseded the earlier geolocation-based design): since there's no second, independent location source on the client, there's nothing to reconcile against the feed's coordinates. If the feed is unreachable, the pane falls back to a direct client fetch using the last coordinates a feed successfully provided (cached in `localStorage`) — a fresh install that's never reached the backend just shows a "waiting on backend" message instead of prompting for input.

### Phase 3 — room + config adoption
- Solve the room login scrape (Playwright `storage_state`, per GrokInstructions) — output joins the same feeds dir.
- Extension starts consuming `config.json` to discover feeds + refresh intervals instead of hardcoded names.
- Promote the feed base URL from constant to a settings field (like `roomJsonUrl` today, which it replaces).

### Phase 4 — deploy (local Docker box)
Target is the local home server running Docker — not a VPS. Two containers via Compose:
- **feed builder**: cron/supercronic (or `ofelia`) running `build_feeds.py` on a schedule, writing to a shared volume.
- **static server**: Caddy or nginx serving that volume's `feeds/` dir with `Access-Control-Allow-Origin: *` (fine on a LAN; the extension origin is the only realistic client).

Extension-side changes to point at it:
- `manifest.json` `host_permissions` currently only allows `localhost`/`127.0.0.1` — add the Docker host (e.g. `http://<lan-host-or-ip>/*`), or give the box a stable hostname/IP first.
- Update `FEED_BASE_URL` in `src/config/backend.ts` (or promote it to a settings field at this point, per Phase 3).
- LAN = plain HTTP is acceptable; no TLS/cert dance needed unless you want one.

### Explicitly staying client-side
- Life ring/age clock (pure local), Spotify (OAuth), settings, all rendering.

## Smaller code-level cleanups (independent of the above)
- `weather-pane.ts` (885 lines) should split: `api.ts` (fetch/shape), `render.ts`, `pane.ts` — mirroring how spotify is already factored. Do this *as part of* Phase 2 rather than before it, so the split lands along the client/server seam.
- Demo entry arrays move out of the TS bundle once feeds are live (Phase 1) — keep only 1–2 fallback entries.
