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
- Mortality-style precise age display (birth date/time in settings)
- Optional death countdown from expected lifespan
- Dark, warm sandy/leather-ish palette

## Load in Brave

1. `brave://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this repo folder
4. Open a new tab
