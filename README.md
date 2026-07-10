# New Tab

Personal Brave/Chrome extension that replaces the new tab page with a floating, tmux-ish pane dashboard: life ring + age clock, weather TUI, plus stub panes for Spotify, HN, forum feed, Claude chat, and local flight radar.

**TypeScript** source under `src/`; build emits `newtab.js` for the extension.

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
| `src/newtab.ts` | Extension logic (TypeScript) |
| `newtab.js` | Built output (loaded by the page) |
| `newtab.html` / `newtab.css` | New tab UI shell |
| `manifest.json` | MV3 manifest, `chrome_url_overrides.newtab` |
| `package.json` / `tsconfig.json` | Tooling |
| `GrokInstructions.md` | Product notes / backlog |
| `icons/` | Extension icons |

## License

MIT
