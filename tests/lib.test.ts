import { describe, expect, it, vi } from "vitest";
import { ageInYears, expectedDeathDate, parseBirthDateTime } from "../src/lib/age";
import { formatAge, formatClock, formatDuration, pad } from "../src/lib/format";
import { applyFeatureVisibility, optionalEl, requireEl } from "../src/lib/dom";
import { loadFeed } from "../src/lib/feeds";

describe("age utilities", () => {
  it("parses dates with default, minute, and second precision", () => {
    expect(parseBirthDateTime("", "12:00")).toBeNull();
    expect(parseBirthDateTime("not-a-date", "")).toBeNull();
    expect(parseBirthDateTime("2000-01-02", "")).toEqual(new Date("2000-01-02T00:00:00"));
    expect(parseBirthDateTime("2000-01-02", "03:04")).toEqual(new Date("2000-01-02T03:04:00"));
  });

  it("calculates fractional age, clamps future births, and computes death date", () => {
    const birth = new Date(0);
    const year = 365.2425 * 86_400_000;
    expect(ageInYears(birth, new Date(year * 2))).toBeCloseTo(2);
    expect(ageInYears(new Date(100), new Date(0))).toBe(0);
    expect(expectedDeathDate(birth, 2).getTime()).toBeCloseTo(year * 2, -1);
  });
});

describe("format utilities", () => {
  it("pads and formats stable values", () => {
    expect(pad(4)).toBe("04");
    expect(pad(4, 3)).toBe("004");
    expect(formatAge(12.3456789012)).toBe("12.345678901");
    expect(formatDuration(0)).toBe("0 days");
    expect(formatDuration(90_061_000)).toBe("1d 01h 01m 01s");
  });

  it("formats the local clock", () => {
    const date = new Date(2026, 6, 11, 9, 8, 7);
    expect(formatClock(date)).toContain("Sat Jul 11");
    expect(formatClock(date)).toContain("09:08:07");
  });
});

describe("DOM utilities", () => {
  it("requires, optionally finds, and toggles feature nodes", () => {
    document.body.innerHTML = '<div id="yes" data-feature="on"></div><div id="overlay" data-feature="on" hidden></div><div data-feature="off"></div>';
    expect(requireEl("yes")).toBe(document.getElementById("yes"));
    expect(optionalEl("missing")).toBeNull();
    expect(() => requireEl("missing")).toThrow("Missing required element #missing");
    applyFeatureVisibility({ on: true, off: false });
    expect(requireEl<HTMLElement>("yes").hidden).toBe(false);
    expect(requireEl<HTMLElement>("overlay").hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('[data-feature="off"]')?.hidden).toBe(true);
  });
});

describe("feed loader", () => {
  it("returns a valid nonempty envelope", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ version: 1, updatedAt: "now", entries: [1] })));
    await expect(loadFeed<number>("hn")).resolves.toMatchObject({ entries: [1] });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/hn.json"), expect.objectContaining({ cache: "no-store" }));
  });

  it.each([
    new Response("", { status: 500 }),
    new Response(JSON.stringify({ entries: [] })),
  ])("returns null for unusable responses", async (response) => {
    vi.mocked(fetch).mockResolvedValue(response);
    await expect(loadFeed("x")).resolves.toBeNull();
  });

  it("absorbs network failures", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    await expect(loadFeed("x")).resolves.toBeNull();
  });
});
