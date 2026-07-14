import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/ui/refs", () => ({ els: {} }));
vi.mock("../src/settings/store", () => ({ getSettings: () => ({ homeLabel: "" }) }));

const TZ = "America/New_York";

/** Hourly times for 2026-07-14, one entry per hour from `startHour` to 23:00, local to TZ. */
function hourlyFixture(startHour: number) {
  const time: string[] = [];
  const temperature_2m: number[] = [];
  for (let h = startHour; h <= 23; h++) {
    const hh = String(h).padStart(2, "0");
    time.push(`2026-07-14T${hh}:00`);
    temperature_2m.push(70 + h);
  }
  return { time, temperature_2m, wind_speed_10m: [], wind_direction_10m: [], uv_index: [] };
}

/** 15-min-step minutely_15 times from `startHour`:00 through `endHour`:00, local to TZ. */
function minutelyFixture(startHour: number, endHour: number) {
  const time: string[] = [];
  for (let h = startHour; h <= endHour; h++) {
    for (const m of [0, 15, 30, 45]) {
      if (h === endHour && m > 0) break;
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      time.push(`2026-07-14T${hh}:${mm}`);
    }
  }
  return { time, temperature_2m: [], wind_speed_10m: [], wind_direction_10m: [], uv_index: [] };
}

describe("weather home label normalization", () => {
  it("trims configured labels and falls back to 'home' when unset", async () => {
    const { normalizeHomeLabel } = await import("../src/features/weather/weather-pane");
    expect(normalizeHomeLabel("  Castle Rock ")).toBe("Castle Rock");
    expect(normalizeHomeLabel(null)).toBe("home");
    expect(normalizeHomeLabel("")).toBe("home");
  });
});

describe("sliceNext12Hours", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("falls back to hourly-only slices when minutely15 is undefined", async () => {
    const { sliceNext12Hours } = await import("../src/features/weather/weather-pane");
    // 2026-07-14T09:00Z == 05:00 local (EDT) — outside both fine windows.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T09:00:00Z"));

    const hours = sliceNext12Hours(hourlyFixture(5), undefined, TZ);

    expect(hours).toHaveLength(12);
    expect(hours.map((h) => h.time)).toEqual([
      "2026-07-14T05:00",
      "2026-07-14T06:00",
      "2026-07-14T07:00",
      "2026-07-14T08:00",
      "2026-07-14T09:00",
      "2026-07-14T10:00",
      "2026-07-14T11:00",
      "2026-07-14T12:00",
      "2026-07-14T13:00",
      "2026-07-14T14:00",
      "2026-07-14T15:00",
      "2026-07-14T16:00",
    ]);
  });

  it("uses 30-min slices during the local fine window, then falls back to hourly", async () => {
    const { sliceNext12Hours } = await import("../src/features/weather/weather-pane");
    // 2026-07-14T11:30Z == 07:30 local (EDT) — start of the morning fine window.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T11:30:00Z"));

    const hourly = hourlyFixture(5);
    const minutely = minutelyFixture(7, 11);
    const hours = sliceNext12Hours(hourly, minutely, TZ);

    expect(hours.map((h) => h.time)).toEqual([
      "2026-07-14T07:30",
      "2026-07-14T08:00",
      "2026-07-14T08:30",
      "2026-07-14T09:00",
      "2026-07-14T10:00",
      "2026-07-14T11:00",
      "2026-07-14T12:00",
      "2026-07-14T13:00",
      "2026-07-14T14:00",
      "2026-07-14T15:00",
      "2026-07-14T16:00",
      "2026-07-14T17:00",
    ]);
  });

  it("falls back to hourly for a fine window once minutely15 data runs out", async () => {
    const { sliceNext12Hours } = await import("../src/features/weather/weather-pane");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T11:30:00Z")); // 07:30 local

    const hourly = hourlyFixture(5);
    // Only one minutely15 entry — every slice after it must fall back to hourly
    // instead of the chart truncating early.
    const sparseMinutely = {
      time: ["2026-07-14T07:30"],
      temperature_2m: [],
      wind_speed_10m: [],
      wind_direction_10m: [],
      uv_index: [],
    };
    const hours = sliceNext12Hours(hourly, sparseMinutely, TZ);

    expect(hours).toHaveLength(12);
    expect(hours[0]?.time).toBe("2026-07-14T07:30");
    expect(hours.slice(1).map((h) => h.time)).toEqual([
      "2026-07-14T08:00",
      "2026-07-14T09:00",
      "2026-07-14T10:00",
      "2026-07-14T11:00",
      "2026-07-14T12:00",
      "2026-07-14T13:00",
      "2026-07-14T14:00",
      "2026-07-14T15:00",
      "2026-07-14T16:00",
      "2026-07-14T17:00",
      "2026-07-14T18:00",
    ]);
  });

  it("stops without hanging once both hourly and minutely15 data are exhausted", async () => {
    const { sliceNext12Hours } = await import("../src/features/weather/weather-pane");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T11:30:00Z")); // 07:30 local

    const shortHourly = { time: ["2026-07-14T05:00"], temperature_2m: [], wind_speed_10m: [], wind_direction_10m: [], uv_index: [] };
    const shortMinutely = {
      time: ["2026-07-14T07:30"],
      temperature_2m: [],
      wind_speed_10m: [],
      wind_direction_10m: [],
      uv_index: [],
    };
    const hours = sliceNext12Hours(shortHourly, shortMinutely, TZ);

    expect(hours).toEqual([expect.objectContaining({ time: "2026-07-14T07:30" })]);
  });
});
