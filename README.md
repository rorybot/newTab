# New Tab

Personal Brave/Chrome extension that replaces the new tab page with a floating, tmux-ish pane dashboard: life ring + age clock, weather TUI, a **one-shot room snapshot** (recent shouts from JSON), plus stub panes for Spotify, HN, Claude chat, and local flight radar.

**TypeScript** source under `src/` (modular features); build entry is `src/main.ts` → `newtab.js`.

## Room snapshot (not a live feed) — **feature flagged OFF**

The room module exists in code (`src/features/room/`) and `backend/`, but **`FEATURES.room` is `false`** in `src/config/features.ts` until scrape **login/session** is designed. The pane and settings field are hidden.

When re-enabled: one-shot snapshot of **recent shouts** only — not a live chat feed. Backend scrapes once → JSON; extension `fetch`es that file; ↻ reloads the file only.

```ts
// src/config/features.ts
export const FEATURES = { room: true, /* … */ };
```

Also needs login-aware scrape (cookies / Playwright `storage_state`) before it’s useful for a private room.

### Note for me — server architecture later

Shipping this properly means **you still need something on a server** that can:

1. **Run the scrape on a schedule** (or on demand) → write/update the snapshot JSON  
2. **Answer HTTP GETs** for that JSON (what the extension already does via `fetch`)  
3. **CORS** allowing the extension origin (or host the JSON under a setup the extension is allowed to hit)

`backend/serve_feed.py` is a **dev convenience only** (terminal stays open because it’s a server). Do **not** treat it as production.

**Recommendation:** don’t invent a big microservices platform for one snapshot endpoint. Match how your other apps run:

| Piece | Sensible approach |
|-------|-------------------|
| Scrape job | One-shot container / script on **cron** (or Compose + `ofelia` / `supercronic`) |
| Serve JSON | **Static file** behind **Caddy** or **nginx** in Docker (volume mounts `room-feed.json`) — same idea as a mini HTTP container you already use |
| Glue | **Docker Compose** on the VPS |

That is enough: job writes the file → reverse proxy serves the file → extension GETs the URL.

If you later have **many** small personal services and want a manager UI (deploy/logs/domains) instead of hand-rolling Compose forever, pick **one** self-hosted Docker platform and put this next to your other apps:

- **[Dokploy](https://dokploy.com/)** or **[Coolify](https://coolify.io/)** — good default “run lots of little Docker apps on my VPS” managers  
- **[Traefik](https://traefik.io/)** + Compose — if you only need reverse proxy + labels, not a full PaaS UI  

**Avoid for this:** Kubernetes / full service meshes. Overkill for “scrape once, serve JSON.”

When you extract `backend/` to the server, either drop `serve_feed.py` and serve via Caddy/nginx, or wrap the same tiny server in Docker **only if** you already containerize that way — the important contract is still: **GET → snapshot JSON**, not a live chat API.

## Develop

```bash
npm install
npm run build      # compile src/newtab.ts → newtab.js
npm run typecheck  # tsc --noEmit
npm run watch      # rebuild on change
```

## Load unpacked (Brave)

1. `npm run build` (after any TS change)
2. Open `brave://extensions`
3. Turn on **Developer mode**
4. Click **Load unpacked** and select this folder
5. Open a new tab (reload the extension after rebuilds)

First launch opens settings so you can set birth date, zip, etc.

## Structure

| Path | Purpose |
|------|---------|
| `src/main.ts` | Extension entry / bootstrap |
| `src/config/features.ts` | Feature flags (`room` currently off) |
| `src/features/life/` | Life ring + age clock |
| `src/features/weather/` | Weather TUI |
| `src/features/room/` | Room snapshot (flagged off; login scrape TBD) |
| `src/settings/` | Settings types + chrome.storage store |
| `src/ui/` | DOM refs, settings dialog, background |
| `src/lib/` | Shared helpers (dom, format, age) |
| `newtab.js` | Built bundle (do not hand-edit) |
| `newtab.html` / `newtab.css` | Shell; `[data-feature]` for flags |
| `examples/` | Demo room JSON |
| `backend/` | One-shot Python scrape + local serve (not wired while flagged off) |
| `manifest.json` | MV3 |
| `GrokInstructions.md` | Product notes |

## License

MIT
