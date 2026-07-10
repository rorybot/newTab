import { DEFAULTS, STORAGE_KEY, type Settings } from "./types.js";

let settings: Settings = { ...DEFAULTS };
let onChange: ((s: Settings) => void) | null = null;

export function getSettings(): Settings {
  return settings;
}

export function subscribeSettings(fn: (s: Settings) => void): void {
  onChange = fn;
}

function notify(): void {
  onChange?.(settings);
}

function hasExtensionStorage(): boolean {
  return typeof chrome !== "undefined" && chrome?.storage?.local != null;
}

function isSettingsPartial(value: unknown): value is Partial<Settings> {
  return typeof value === "object" && value !== null;
}

/**
 * Load settings. Prefer local (reliable for extensions), then sync (migrate),
 * then localStorage (file:// / fallback).
 */
export async function loadSettings(): Promise<Settings> {
  let loaded: Partial<Settings> | null = null;

  if (hasExtensionStorage()) {
    try {
      const localResult = await chrome.storage.local.get(STORAGE_KEY);
      const raw = localResult[STORAGE_KEY];
      if (isSettingsPartial(raw)) loaded = raw;
    } catch {
      /* continue */
    }

    if (!loaded && chrome.storage.sync) {
      try {
        const syncResult = await chrome.storage.sync.get(STORAGE_KEY);
        const raw = syncResult[STORAGE_KEY];
        if (isSettingsPartial(raw)) {
          loaded = raw;
          try {
            await chrome.storage.local.set({ [STORAGE_KEY]: loaded });
          } catch {
            /* ignore migrate write fail */
          }
        }
      } catch {
        /* continue */
      }
    }
  }

  if (!loaded) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isSettingsPartial(parsed)) loaded = parsed;
      }
    } catch {
      /* ignore */
    }
  }

  settings = loaded ? { ...DEFAULTS, ...loaded } : { ...DEFAULTS };
  notify();
  return settings;
}

/** Persist to chrome.storage.local + localStorage mirror so settings stick. */
export async function saveSettings(next: Partial<Settings>): Promise<Settings> {
  settings = { ...DEFAULTS, ...next };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* private mode etc. */
  }

  if (hasExtensionStorage()) {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: settings });
    } catch (err) {
      console.warn("chrome.storage.local.set failed", err);
    }
  }

  notify();
  return settings;
}
