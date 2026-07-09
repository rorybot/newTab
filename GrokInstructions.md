# New Tab — product notes for Grok

Personal Brave/Chrome **new tab** extension. Not for public release — just for me.

## Tech stack

This is a **TypeScript** project. Prefer TypeScript for all extension logic (new tab UI, widgets, settings, messaging). Keep types strict; avoid adding new plain JavaScript sources unless there is a strong reason.

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
- Widget slots stubbed as panes (weather, spotify, hn, forum, claude, radar)
- Settings persist in **`chrome.storage.local`** (with localStorage mirror + migrate-from-sync)
- **Never commit secrets or private board URLs** — forum feed URL, API keys, etc. are user settings only

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
| Expected lifespan | Ring segments + optional death countdown |
| Show death countdown | Toggle |
| **Forum feed URL** | User-supplied; **do not hardcode or document a specific site in the repo**. Operator knows which URL to paste. |
| Background image URL | Optional real image behind scrim |

## Planned widgets (fill in details later)

### Weather

- Widget on the new tab showing local weather
- Details TBD (provider, location source, units, refresh)

### Spotify / Now Playing

- Widget showing what's currently playing on Spotify
- Details TBD (auth, API, privacy, controls)

### Mock TUI snippets (shared vibe)

Several panels share the same idea: **cute, compact mock TUI** slices on the new tab (monospaced / near-terminal chrome, dark sandy theme) — not full apps. Same family as the personal Hacker News reader TUI.

### Hacker News mock TUI snippet

- Compact TUI-style HN front page / story list vibe (like the personal HN reader).
- Details TBD (API vs mock data, open links, collapse comments, refresh).

### Forum feed mock TUI snippet

A small **mock terminal / TUI-style** activity / “new content” feed pane:

- **Source URL** comes only from settings (`forumUrl`) — never baked into source, README, or these instructions.
- Present recent-looking posts/threads as a compact monospaced panel (fits the dark sandy theme).
- **Not** a full forum clone — a snippet that *feels* like a board activity stream.

#### Media / embed rules (important)

Keep the widget lightweight and non-embed-heavy:

| Media | Behavior |
|-------|----------|
| **Twitter / X links** | Do **not** expand into cards/embeds. Plain links (or muted URL text) only. |
| **YouTube** | Do **not** render video embeds/players. Plain links only. |
| **Images** | Do **not** show inline in the post body. On **hover** over an image link / placeholder, show a small **tooltip-style preview** that appears near the cursor/link and goes away on mouse leave. |

Other rich embeds (iframes, oEmbed previews, etc.) are out of scope unless explicitly added later.

### Anthropic chat mock TUI snippet

A little **mock TUI chat session** panel powered by the **Anthropic API** (same cute TUI presentation family as HN + forum snippets):

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
- Documenting or hardcoding private community URLs in git

## Load in Brave

1. `brave://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this repo folder
4. Open a new tab

## Notes for future sessions

Put deeper weather/Spotify specs, API keys approach, layout tweaks, and feature backlog in this file as we go. Keep private hosts out of the repo.
