import { isFeatureEnabled } from "../config/features.js";
import {
  fillRoomSettingsField,
  getLastRoomUrl,
  readRoomSettingsField,
  refreshRoom,
} from "../features/room/room-pane.js";
import {
  getLastWeatherZip,
  normalizeZip,
  refreshWeather,
} from "../features/weather/weather-pane.js";
import { getSettings, saveSettings } from "../settings/store.js";
import { applyBackground } from "./background.js";
import { els } from "./refs.js";
import { tickLife } from "../features/life/life-pane.js";

function fillForm(): void {
  const settings = getSettings();
  els.birthDate.value = settings.birthDate || "";
  const t = settings.birthTime || "00:00:00";
  els.birthTime.value = t.length >= 8 ? t.slice(0, 8) : t.slice(0, 5);
  els.lifespan.value = String(settings.lifespan ?? 80);
  els.showDeath.checked = Boolean(settings.showDeath);
  els.zipCode.value = settings.zipCode || "";
  els.bgImage.value = settings.bgImage || "";
  if (isFeatureEnabled("room")) {
    fillRoomSettingsField();
  }
}

function openSettings(): void {
  fillForm();
  els.settingsDialog.showModal();
}

function closeSettings(): void {
  if (els.settingsDialog.open) els.settingsDialog.close();
}

export function initSettingsDialog(): void {
  els.settingsToggle.addEventListener("click", openSettings);
  els.settingsCancel.addEventListener("click", (e) => {
    e.preventDefault();
    closeSettings();
  });

  els.settingsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const prev = getSettings();
    const prevZip = normalizeZip(prev.zipCode);
    const prevRoom = (prev.roomJsonUrl || "").trim();

    await saveSettings({
      birthDate: els.birthDate.value,
      birthTime: els.birthTime.value || "00:00:00",
      lifespan: Number(els.lifespan.value) || 80,
      showDeath: els.showDeath.checked,
      zipCode: normalizeZip(els.zipCode.value),
      roomJsonUrl: isFeatureEnabled("room")
        ? readRoomSettingsField()
        : prev.roomJsonUrl,
      bgImage: (els.bgImage.value || "").trim(),
    });
    applyBackground();
    closeSettings();
    tickLife();

    const next = getSettings();
    const nextZip = normalizeZip(next.zipCode);
    await refreshWeather({
      force: nextZip !== prevZip || nextZip !== getLastWeatherZip(),
    });

    if (isFeatureEnabled("room")) {
      const nextRoom = (next.roomJsonUrl || "").trim();
      await refreshRoom({
        force: nextRoom !== prevRoom || nextRoom !== getLastRoomUrl(),
      });
    }
  });
}

export { openSettings };
