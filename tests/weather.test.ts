import { describe, expect, it, vi } from "vitest";

vi.mock("../src/ui/refs", () => ({ els: {} }));
vi.mock("../src/settings/store", () => ({ getSettings: () => ({ homeLabel: "" }) }));

describe("weather home label normalization", () => {
  it("trims configured labels and falls back to 'home' when unset", async () => {
    const { normalizeHomeLabel } = await import("../src/features/weather/weather-pane");
    expect(normalizeHomeLabel("  Castle Rock ")).toBe("Castle Rock");
    expect(normalizeHomeLabel(null)).toBe("home");
    expect(normalizeHomeLabel("")).toBe("home");
  });
});
