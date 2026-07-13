import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULTS, STORAGE_KEY } from "../src/settings/types";
import { makeChrome } from "./setup";

describe("settings store", () => {
  beforeEach(() => vi.resetModules());

  it("loads defaults and notifies subscribers", async () => {
    const store = await import("../src/settings/store");
    const listener = vi.fn();
    store.subscribeSettings(listener);
    await expect(store.loadSettings()).resolves.toEqual(DEFAULTS);
    expect(listener).toHaveBeenCalledWith(DEFAULTS);
  });

  it("loads local extension settings over fallbacks", async () => {
    vi.stubGlobal("chrome", makeChrome({ [STORAGE_KEY]: { homeLabel: "Local Home" } }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ homeLabel: "Fallback Home" }));
    const store = await import("../src/settings/store");
    expect((await store.loadSettings()).homeLabel).toBe("Local Home");
  });

  it("loads localStorage without extension APIs", async () => {
    vi.stubGlobal("chrome", undefined);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ bgImage: "x" }));
    const store = await import("../src/settings/store");
    expect((await store.loadSettings()).bgImage).toBe("x");
  });

  it("merges and persists partial updates", async () => {
    const store = await import("../src/settings/store");
    const saved = await store.saveSettings({ lifespan: 91 });
    expect(saved.lifespan).toBe(91);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").lifespan).toBe(91);
    expect(chrome.storage.local.set).toHaveBeenCalled();
  });
});
