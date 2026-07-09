# New Tab

Personal Brave/Chrome extension that replaces the new tab page with a floating, tmux-ish pane dashboard: life ring + age clock, plus stub panes for weather, Spotify, HN, forum feed, Claude chat, and local flight radar.

## Load unpacked (Brave)

1. Open `brave://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked** and select this folder
4. Open a new tab

First launch opens settings so you can set your birth date.

## Structure

| File | Purpose |
|------|---------|
| `manifest.json` | MV3 manifest, `chrome_url_overrides.newtab` |
| `newtab.html` / `.css` / `.js` | New tab UI and mortality clock |
| `GrokInstructions.md` | Product notes / backlog for future work |
| `icons/` | Extension icons |

## License

MIT
