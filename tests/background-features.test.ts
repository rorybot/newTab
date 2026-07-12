import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = { bgImage: "" };
const bgLayer = document.createElement("div");
vi.mock("../src/settings/store", () => ({ getSettings: () => settings }));
vi.mock("../src/ui/refs", () => ({ els: { bgLayer } }));

describe("background and features", () => {
  beforeEach(() => {
    settings.bgImage = "";
    bgLayer.className = "";
    bgLayer.style.backgroundImage = "";
  });

  it("applies and clears a safely quoted background URL", async () => {
    const { applyBackground } = await import("../src/ui/background");
    settings.bgImage = 'https://x.test/a"b.jpg';
    applyBackground();
    expect(bgLayer.classList.contains("has-image")).toBe(true);
    expect(document.body.classList.contains("has-bg-image")).toBe(true);
    settings.bgImage = "";
    applyBackground();
    expect(bgLayer.style.backgroundImage).toBe("");
  });

  it("reports compile-time feature flags", async () => {
    const { isFeatureEnabled } = await import("../src/config/features");
    expect(isFeatureEnabled("hn")).toBe(true);
    expect(isFeatureEnabled("room")).toBe(false);
  });
});
