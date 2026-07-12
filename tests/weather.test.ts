import { describe, expect, it, vi } from "vitest";

vi.mock("../src/ui/refs", () => ({ els: {} }));
vi.mock("../src/settings/store", () => ({ getSettings: () => ({ zipCode: "" }) }));

describe("weather input normalization", () => {
  it("trims configured postal codes and handles missing values", async () => {
    const { normalizeZip } = await import("../src/features/weather/weather-pane");
    expect(normalizeZip("  sw1a 1aa ")).toBe("sw1a 1aa");
    expect(normalizeZip(null)).toBe("");
  });
});
