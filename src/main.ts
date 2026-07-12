/**
 * New Tab — floating pane dashboard (entry).
 *
 * Modules live under src/features/*, src/settings/*, src/ui/*, src/config/*.
 */

import { FEATURES, isFeatureEnabled } from "./config/features.js";
import { initLifePane } from "./features/life/life-pane.js";
import { initRoomPane } from "./features/room/room-pane.js";
import { initSpotifyPane } from "./features/spotify/spotify-pane.js";
import { initWeatherPane } from "./features/weather/weather-pane.js";
import { initEtymologyPane } from "./features/etymology/etymology-pane.js";
import { initHnPane } from "./features/hn/hn-pane.js";
import { initAnglishPane } from "./features/anglish/anglish-pane.js";
import { applyFeatureVisibility } from "./lib/dom.js";
import { getSettings, loadSettings } from "./settings/store.js";
import { applyBackground } from "./ui/background.js";
import { getRoomEls } from "./ui/refs.js";
import { initSettingsDialog, openSettings } from "./ui/settings-dialog.js";

function syncVisibilityClass(): void {
  document.body.classList.toggle("nt-hidden", document.hidden);
}

async function bootstrap(): Promise<void> {
  applyFeatureVisibility(FEATURES);
  syncVisibilityClass();
  document.addEventListener("visibilitychange", syncVisibilityClass);

  await loadSettings();
  applyBackground();
  initSettingsDialog();
  initLifePane();

  if (isFeatureEnabled("weather")) {
    initWeatherPane();
  }

  if (isFeatureEnabled("spotify")) {
    initSpotifyPane();
  }

  if (isFeatureEnabled("hn")) {
    initHnPane();
  }

  if (isFeatureEnabled("room")) {
    const roomEls = getRoomEls();
    if (roomEls) {
      initRoomPane(roomEls);
    } else {
      console.warn("[newtab] FEATURES.room on but room DOM missing");
    }
  } else {
    console.info(
      "[newtab] room feature flagged off (login/scrape TBD) — enable in src/config/features.ts",
    );
  }

  if (isFeatureEnabled("etymology")) {
    initEtymologyPane();
  } else {
    console.info(
      "[newtab] etymology feature flagged off — enable in src/config/features.ts",
    );
  }

  if (isFeatureEnabled("anglish")) {
    initAnglishPane();
  } else {
    console.info(
      "[newtab] anglish feature flagged off — enable in src/config/features.ts",
    );
  }

  if (!getSettings().birthDate) {
    setTimeout(openSettings, 350);
  }
}

void bootstrap().catch((err: unknown) => {
  console.error("[newtab] bootstrap failed", err);
});
