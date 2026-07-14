import { loadFeed } from "../../lib/feeds.js";
import { pad } from "../../lib/format.js";
import { getSettings } from "../../settings/store.js";
import { els } from "../../ui/refs.js";

const WEATHER_REFRESH_MS = 15 * 60 * 1000;
const WEATHER_CACHE_MS = 10 * 60 * 1000;
/** Cache survives page loads so a new tab paints instantly instead of re-fetching. */
const WEATHER_CACHE_STORAGE_KEY = "newTabWeatherCache";

/** Home location comes entirely from the backend feed (WEATHER_LAT/WEATHER_LON
 * in backend/config.env) — no browser geolocation, no client-side setting. */
interface HomeCoords {
  lat: number;
  lon: number;
}

/** Shape written by backend/build_feeds.py's build_weather_entry(). */
interface WeatherFeedExtraCity {
  lat: number;
  lon: number;
  timezone?: string;
  current?: OpenMeteoCurrent;
}

interface WeatherFeedEntry {
  lat: number;
  lon: number;
  timezone?: string;
  forecast: OpenMeteoForecast;
  extras: {
    london: WeatherFeedExtraCity;
    knoxville: WeatherFeedExtraCity;
  };
}

interface OpenMeteoCurrent {
  temperature_2m?: number;
  relative_humidity_2m?: number;
  wind_speed_10m?: number;
  wind_direction_10m?: number;
  weather_code?: number;
}

interface OpenMeteoHourly {
  time?: string[];
  temperature_2m?: number[];
  wind_speed_10m?: number[];
  wind_direction_10m?: number[];
  uv_index?: number[];
}

interface OpenMeteoMinutely15 {
  time?: string[];
  temperature_2m?: number[];
  wind_speed_10m?: number[];
  wind_direction_10m?: number[];
  uv_index?: number[];
}

interface OpenMeteoDaily {
  time?: string[];
  sunrise?: string[];
  sunset?: string[];
  uv_index_max?: number[];
  temperature_2m_max?: number[];
  wind_speed_10m_max?: number[];
}

/** EPA/WHO-ish: you SPF ≥3, baby protection ≥2; high/extreme warnings higher. */
const UV_YOU_SPF = 3;
const UV_BABY_PROTECT = 2;
const UV_HIGH = 6;
const UV_EXTREME = 8;
const UV_SCALE_MAX = 11;

interface OpenMeteoForecast {
  current?: OpenMeteoCurrent;
  hourly?: OpenMeteoHourly;
  daily?: OpenMeteoDaily;
  timezone?: string;
  minutely_15?: OpenMeteoMinutely15;
}

interface WeatherPayload {
  label: string;
  shortLabel: string;
  timezone: string;
  forecast: OpenMeteoForecast;
}

interface ExtraCityCurrent {
  label: string;
  shortLabel: string;
  timezone: string;
  temp: number | undefined;
  weatherCode: number | undefined;
}

/** Fixed extra cities shown beside home. */
const EXTRA_CITIES = [
  {
    id: "london" as const,
    shortLabel: "London",
    lat: 51.5074,
    lon: -0.1278,
    timezone: "Europe/London",
  },
  {
    id: "knoxville" as const,
    shortLabel: "Knoxville",
    lat: 35.9606,
    lon: -83.9207,
    timezone: "America/New_York",
  },
];

interface HourSlice {
  time: string;
  temp: number | undefined;
  wind: number | undefined;
  windDir: number | undefined;
  uv: number | undefined;
}

interface WeatherCacheEntry {
  loc: string;
  lat: number;
  lon: number;
  at: number;
  home: WeatherPayload;
  extras: {
    london: ExtraCityCurrent;
    knoxville: ExtraCityCurrent;
  };
}

interface ColoredCell {
  n: number | undefined;
  text: string;
}

interface BarOpts {
  minFloor?: number;
  maxCeil?: number;
  chartPx?: number;
}

let weatherCache: WeatherCacheEntry | null = null;
let weatherFetchInFlight = false;

function hydrateWeatherCache(): void {
  if (weatherCache) return;
  try {
    const raw = localStorage.getItem(WEATHER_CACHE_STORAGE_KEY);
    if (!raw) return;
    const entry = JSON.parse(raw) as WeatherCacheEntry;
    if (entry?.loc && entry.home && entry.extras) weatherCache = entry;
  } catch {
    // corrupt cache — ignore; next successful fetch rewrites it
  }
}

function persistWeatherCache(entry: WeatherCacheEntry): void {
  try {
    localStorage.setItem(WEATHER_CACHE_STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // quota/private mode — in-memory cache still works for this tab
  }
}
let clockTimer: ReturnType<typeof setInterval> | null = null;
let weatherRefreshTimer: ReturnType<typeof setInterval> | null = null;

/** Reuse formatters — creating Intl.DateTimeFormat every second is wasteful. */
const tzFormatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterForTz(timeZone: string): Intl.DateTimeFormat {
  let fmt = tzFormatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    });
    tzFormatterCache.set(timeZone, fmt);
  }
  return fmt;
}

export function normalizeHomeLabel(raw: string | null | undefined): string {
  const t = String(raw || "").trim();
  return t || "home";
}

/** Cache key for a set of home coordinates — rounded to ~1km. */
function locKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

/** Local hours/minutes in a timezone for analog clock hands. */
function localHm(timeZone: string, now = new Date()): { h: number; m: number; s: number } {
  try {
    const parts = formatterForTz(timeZone).formatToParts(now);
    const num = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value ?? "0");
    return { h: num("hour"), m: num("minute"), s: num("second") };
  } catch {
    return { h: now.getHours(), m: now.getMinutes(), s: now.getSeconds() };
  }
}

function setClockHands(svg: SVGSVGElement, timeZone: string): void {
  if (!timeZone) return;
  svg.dataset.timezone = timeZone;
  const { h, m } = localHm(timeZone);
  // Minute hand only needs minute precision; second-hand sweep was pure cost.
  const hourDeg = ((h % 12) + m / 60) * 30;
  const minDeg = m * 6;
  // SVG transform (not CSS) so origin stays at face center when the icon scales
  const hourHand = svg.querySelector<SVGLineElement>(".wx-clock-hour");
  const minHand = svg.querySelector<SVGLineElement>(".wx-clock-min");
  if (hourHand) hourHand.setAttribute("transform", `rotate(${hourDeg} 16 16)`);
  if (minHand) minHand.setAttribute("transform", `rotate(${minDeg} 16 16)`);
  const title =
    svg.closest(".wx-city")?.querySelector(".wx-city-name")?.textContent || "";
  svg.setAttribute(
    "aria-label",
    `${title} local time ${pad(h % 12 || 12)}:${pad(m)}`.trim(),
  );
}

function tickClocks(): void {
  document.querySelectorAll<SVGSVGElement>(".wx-clock[data-timezone]").forEach((svg) => {
    const tz = svg.dataset.timezone || "";
    if (tz) setClockHands(svg, tz);
  });
}

function stopClockTicker(): void {
  if (clockTimer != null) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
}

function startClockTicker(): void {
  tickClocks();
  if (clockTimer != null) return;
  // Hands only have minute precision — per-second ticks were 30× the work
  // for zero visible change.
  clockTimer = setInterval(tickClocks, 30 * 1000);
}

/** Same as original single-city temp styling (°F + color). */
function paintHeroTemp(tempEl: HTMLElement, temp: number | undefined): void {
  const tempN = temp != null ? Number(temp) : NaN;
  tempEl.textContent = !Number.isNaN(tempN) ? `${Math.round(tempN)}°F` : "—";
  tempEl.style.color = !Number.isNaN(tempN) ? tempColor(tempN) : "";
  tempEl.style.textShadow = !Number.isNaN(tempN)
    ? `0 0 18px ${tempColor(tempN)}66`
    : "";
}

function paintHeroSky(
  skyEl: HTMLElement,
  code: number | undefined,
  title: string,
): void {
  skyEl.textContent = skyGlyph(code);
  skyEl.title = title;
}

function windArrow(deg: number | null | undefined): string {
  if (deg == null || Number.isNaN(Number(deg))) return "";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const i = Math.round((((Number(deg) % 360) + 360) % 360) / 45) % 8;
  return dirs[i] ?? "";
}

function windGlyph(deg: number | null | undefined): string {
  if (deg == null || Number.isNaN(Number(deg))) return "≈";
  const glyphs = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
  const i = Math.round((((Number(deg) % 360) + 360) % 360) / 45) % 8;
  return glyphs[i] ?? "≈";
}

function skyGlyph(code: number | null | undefined): string {
  const c = Number(code);
  if (Number.isNaN(c)) return "·";
  if (c === 0) return "☀";
  if (c <= 2) return "☁";
  if (c === 3) return "▒";
  if (c === 45 || c === 48) return "≡";
  if (c >= 51 && c <= 67) return "☂";
  if (c >= 71 && c <= 77) return "❄";
  if (c >= 80 && c <= 82) return "☔";
  if (c >= 95) return "⚡";
  return "·";
}

function tempColor(f: number): string {
  const t = Number(f);
  if (Number.isNaN(t)) return "var(--text-muted)";
  if (t <= 20) return "#6b8cae";
  if (t <= 32) return "#7aa2c4";
  if (t <= 45) return "#7ab8b0";
  if (t <= 55) return "#8fbf8a";
  if (t <= 65) return "#b8c97a";
  if (t <= 75) return "#c4a574";
  if (t <= 85) return "#d4895a";
  if (t <= 95) return "#c47a6a";
  return "#c45a5a";
}

function windColor(mph: number): string {
  const w = Number(mph);
  if (Number.isNaN(w)) return "var(--text-muted)";
  if (w < 5) return "#6a8f88";
  if (w < 10) return "#5a9e96";
  if (w < 15) return "#4aafb0";
  if (w < 25) return "#3a9ec4";
  return "#5a7ec4";
}

function uvColor(uv: number): string {
  const u = Number(uv);
  if (Number.isNaN(u)) return "var(--text-muted)";
  if (u < 3) return "#4aaf6a";
  if (u < 6) return "#c4b050";
  if (u < 8) return "#d4895a";
  if (u < 11) return "#c45a5a";
  return "#9a5ac4";
}

function asciiMeter(pct: number, width = 8): string {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const filled = Math.round((p / 100) * width);
  return "▓".repeat(filled) + "░".repeat(width - filled);
}

function fillColoredCells(
  container: HTMLElement | null,
  values: ColoredCell[],
  colorFn: (n: number) => string,
  className = "",
): void {
  if (!container) return;
  const frag = document.createDocumentFragment();
  for (const v of values) {
    const span = document.createElement("span");
    if (className) span.className = className;
    span.textContent = v.text;
    if (v.n != null && !Number.isNaN(Number(v.n))) {
      span.style.color = colorFn(Number(v.n));
    }
    frag.appendChild(span);
  }
  container.replaceChildren(frag);
}

function renderMetricBars(
  container: HTMLElement | null,
  values: unknown[],
  colorFn: (n: number) => string,
  opts: BarOpts = {},
): void {
  if (!container) return;
  const chartPx = opts.chartPx ?? 40;
  const nums = values.map((t) => Number(t)).filter((n) => !Number.isNaN(n));
  let min = nums.length ? Math.min(...nums) : 0;
  let max = nums.length ? Math.max(...nums) : 1;
  if (opts.minFloor != null) min = Math.min(min, opts.minFloor);
  if (opts.maxCeil != null) max = Math.max(max, opts.maxCeil);
  if (max - min < 0.5) {
    min -= 0.5;
    max += 0.5;
  }
  const span = max - min;
  const frag = document.createDocumentFragment();
  for (const t of values) {
    const n = Number(t);
    const cell = document.createElement("span");
    cell.className = "wx-bar";
    const bar = document.createElement("i");
    if (!Number.isNaN(n)) {
      const h = Math.max(4, Math.round(4 + ((n - min) / span) * (chartPx - 4)));
      bar.style.height = `${h}px`;
      bar.style.background = colorFn(n);
      bar.style.boxShadow = `0 0 7px ${colorFn(n)}66`;
    } else {
      bar.style.height = "3px";
      bar.style.opacity = "0.25";
    }
    cell.appendChild(bar);
    frag.appendChild(cell);
  }
  container.replaceChildren(frag);
}

function formatHourLabel(isoLocal: string): string {
  const m = /T(\d{2})/.exec(isoLocal);
  if (!m?.[1]) return "—";
  const h = Number(m[1]);
  const suffix = h >= 12 ? "p" : "a";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${suffix}`;
}

function formatSunTime(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const m = /T(\d{2}):(\d{2})/.exec(iso);
    return m ? `${m[1]}:${m[2]}` : "—";
  }
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fillCells(container: HTMLElement, values: string[], className = ""): void {
  const frag = document.createDocumentFragment();
  for (const v of values) {
    const span = document.createElement("span");
    if (className) span.className = className;
    span.textContent = v;
    frag.appendChild(span);
  }
  container.replaceChildren(frag);
}

function dayOfWeekLabel(isoDate: string): string {
  // isoDate is often "2026-07-10" (local date from Open-Meteo)
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return ["su", "mo", "tu", "we", "th", "fr", "sa"][d.getDay()] ?? "—";
}

function renderDay5Temps(daily: OpenMeteoDaily): void {
  const times = daily.time ?? [];
  const highs = daily.temperature_2m_max ?? [];
  const frag = document.createDocumentFragment();
  const n = Math.min(5, times.length, highs.length);
  for (let i = 0; i < n; i++) {
    const day = times[i] ?? "";
    const hi = highs[i];
    const item = document.createElement("div");
    item.className = "wx-day5-item";
    const dow = document.createElement("span");
    dow.className = "wx-day5-dow";
    dow.textContent = dayOfWeekLabel(day);
    const val = document.createElement("span");
    val.className = "wx-day5-val";
    const hiN = hi != null ? Number(hi) : NaN;
    val.textContent = !Number.isNaN(hiN) ? `${Math.round(hiN)}°` : "—";
    if (!Number.isNaN(hiN)) {
      val.style.color = tempColor(hiN);
      val.style.textShadow = `0 0 10px ${tempColor(hiN)}55`;
    }
    item.append(dow, val);
    frag.appendChild(item);
  }
  els.wxDay5Temps.replaceChildren(frag);
}

function renderDay5Winds(daily: OpenMeteoDaily): void {
  const times = daily.time ?? [];
  const winds = daily.wind_speed_10m_max ?? [];
  const frag = document.createDocumentFragment();
  const n = Math.min(5, times.length, winds.length);
  for (let i = 0; i < n; i++) {
    const day = times[i] ?? "";
    const w = winds[i];
    const item = document.createElement("div");
    item.className = "wx-day5-item";
    const dow = document.createElement("span");
    dow.className = "wx-day5-dow";
    dow.textContent = dayOfWeekLabel(day);
    const val = document.createElement("span");
    val.className = "wx-day5-val";
    const wN = w != null ? Number(w) : NaN;
    val.textContent = !Number.isNaN(wN) ? `${Math.round(wN)}` : "—";
    if (!Number.isNaN(wN)) {
      val.style.color = windColor(wN);
      val.style.textShadow = `0 0 10px ${windColor(wN)}55`;
    }
    item.append(dow, val);
    frag.appendChild(item);
  }
  els.wxDay5Winds.replaceChildren(frag);
}

/**
 * Cute UV scale: needle = current UV; ticks for you (SPF ≥3) and baby (≥2).
 * Warning when at/above those limits (stronger past high/extreme).
 */
function renderSpfGuide(uvNow: number): void {
  const valid = !Number.isNaN(uvNow);
  const uv = valid ? Math.max(0, uvNow) : 0;
  els.wxSpfUv.textContent = valid ? uv.toFixed(1) : "—";
  els.wxSpfUv.style.color = valid ? uvColor(uv) : "";

  const pct = Math.min(100, (uv / UV_SCALE_MAX) * 100);
  els.wxSpfNeedle.style.left = `${pct}%`;

  const needYou = valid && uv >= UV_YOU_SPF;
  const needBaby = valid && uv >= UV_BABY_PROTECT;
  const high = valid && uv >= UV_HIGH;
  const extreme = valid && uv >= UV_EXTREME;

  if (!valid || (!needYou && !needBaby)) {
    els.wxSpfWarn.hidden = true;
    els.wxSpfWarn.textContent = "";
    els.wxSpfWarn.classList.remove("hot");
    return;
  }

  els.wxSpfWarn.hidden = false;
  els.wxSpfWarn.classList.toggle("hot", high || extreme);

  if (extreme) {
    els.wxSpfWarn.textContent =
      "⚠ extreme UV · SPF now · baby shade / cover — stay out of peak sun";
  } else if (high) {
    els.wxSpfWarn.textContent =
      "⚠ high UV · SPF on you · baby: shade + SPF / long sleeves";
  } else if (needYou && needBaby) {
    els.wxSpfWarn.textContent = "SPF on · baby needs shade/SPF too";
  } else if (needBaby) {
    els.wxSpfWarn.textContent = "baby: protect (shade/SPF) · you still low";
  } else {
    els.wxSpfWarn.textContent = "SPF for you · baby still ok with care";
  }
}

function showWeatherSetup(message?: string): void {
  els.weatherSetup.hidden = false;
  els.weatherLive.hidden = true;
  els.weatherBadge.textContent = "setup";
  els.weatherBadge.classList.add("dim");
  if (message) {
    els.weatherSetup.replaceChildren();
    const p1 = document.createElement("p");
    p1.className = "muted";
    p1.textContent = message;
    const p2 = document.createElement("p");
    p2.className = "muted";
    p2.textContent = "temp · humidity · wind · sun · 12h";
    els.weatherSetup.append(p1, p2);
  }
}

function showWeatherError(msg: string): void {
  els.weatherSetup.hidden = true;
  els.weatherLive.hidden = false;
  els.wxError.hidden = false;
  els.wxError.textContent = msg;
  els.weatherBadge.textContent = "err";
  els.weatherBadge.classList.add("dim");
}

async function fetchOpenMeteo(
  lat: number,
  lon: number,
  opts: { full?: boolean } = {},
): Promise<OpenMeteoForecast> {
  const full = opts.full ?? true;
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: full
      ? [
          "temperature_2m",
          "relative_humidity_2m",
          "wind_speed_10m",
          "wind_direction_10m",
          "weather_code",
        ].join(",")
      : ["temperature_2m", "weather_code"].join(","),
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    timezone: "auto",
    forecast_days: full ? "5" : "1",
  });
  if (full) {
    params.set(
      "hourly",
      ["temperature_2m", "wind_speed_10m", "wind_direction_10m", "uv_index"].join(
        ",",
      ),
    );
    params.set(
      "minutely_15",
      ["temperature_2m", "wind_speed_10m", "wind_direction_10m", "uv_index"].join(
        ",",
      ),
    );

    params.set(
      "daily",
      [
        "sunrise",
        "sunset",
        "uv_index_max",
        "temperature_2m_max",
        "wind_speed_10m_max",
      ].join(","),
    );
  }
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`forecast failed (${res.status})`);
  return (await res.json()) as OpenMeteoForecast;
}

async function fetchExtraCity(
  city: (typeof EXTRA_CITIES)[number],
): Promise<ExtraCityCurrent> {
  const forecast = await fetchOpenMeteo(city.lat, city.lon, { full: false });
  const cur = forecast.current ?? {};
  return {
    label: city.shortLabel,
    shortLabel: city.shortLabel,
    timezone: forecast.timezone || city.timezone,
    temp: cur.temperature_2m,
    weatherCode: cur.weather_code,
  };
}

/** "YYYY-MM-DDTHH:mm" wall-clock string in `timeZone`, matching Open-Meteo's
 * `timezone=auto` response format (no seconds, no offset) so it can be
 * string-compared against `hourly.time` / `minutely_15.time` directly. */
function localIsoMinute(timeZone: string, date: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  } catch {
    return date.toISOString().slice(0, 16);
  }
}

/** Add minutes to a "YYYY-MM-DDTHH:mm" wall-clock string (calendar arithmetic
 * only — not a real timezone conversion, since both sides are the same local
 * calendar already). */
function addMinutesToIso(iso: string, minutes: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d, h, mi] = m;
  const t =
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)) +
    minutes * 60 * 1000;
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}`;
}

/** Local time-of-day windows (commute hours) that get 30-min-resolution slices
 * instead of hourly ones — total slice count stays 12, so these windows trade
 * time-horizon coverage for finer resolution. */
function isFineWindow(hour: number, minute: number): boolean {
  return (
    (hour === 7 && minute >= 30) ||
    hour === 8 ||
    (hour === 9 && minute < 30) ||
    (hour >= 16 && hour < 19) ||
    (hour === 19 && minute < 30)
  );
}

function sliceNext12Hours(
  hourly: OpenMeteoHourly,
  minutely15: OpenMeteoMinutely15 | undefined,
  timeZone: string,
): HourSlice[] {
  const hourlyTimes = hourly.time ?? [];
  const hourlyTemps = hourly.temperature_2m ?? [];
  const hourlyWinds = hourly.wind_speed_10m ?? [];
  const hourlyWindDirs = hourly.wind_direction_10m ?? [];
  const hourlyUvs = hourly.uv_index ?? [];

  const minutelyTimes = minutely15?.time ?? [];
  const minutelyTemps = minutely15?.temperature_2m ?? [];
  const minutelyWinds = minutely15?.wind_speed_10m ?? [];
  const minutelyWindDirs = minutely15?.wind_direction_10m ?? [];
  const minutelyUvs = minutely15?.uv_index ?? [];

  const slices: HourSlice[] = [];
  let cursor = localIsoMinute(timeZone, new Date());

  // Guard against a hang if minutely_15 data doesn't cover the fine windows
  // (Open-Meteo's minutely_15 horizon is shorter than the hourly one).
  for (let guard = 0; guard < 96 && slices.length < 12; guard++) {
    const hour = Number(cursor.slice(11, 13));
    const minute = Number(cursor.slice(14, 16));

    if (isFineWindow(hour, minute) && minutely15) {
      const index = minutelyTimes.findIndex((t) => t !== undefined && t >= cursor);
      const time = index !== -1 ? minutelyTimes[index] : undefined;
      if (time === undefined) break;
      slices.push({
        time,
        temp: minutelyTemps[index],
        wind: minutelyWinds[index],
        windDir: minutelyWindDirs[index],
        uv: minutelyUvs[index],
      });
      cursor = addMinutesToIso(time, 30);
    } else {
      const index = hourlyTimes.findIndex((t) => t !== undefined && t >= cursor);
      const time = index !== -1 ? hourlyTimes[index] : undefined;
      if (time === undefined) break;
      slices.push({
        time,
        temp: hourlyTemps[index],
        wind: hourlyWinds[index],
        windDir: hourlyWindDirs[index],
        uv: hourlyUvs[index],
      });
      cursor = addMinutesToIso(time, 60);
    }
  }

  return slices;
}

function renderWeatherBundle(entry: WeatherCacheEntry): void {
  const { home, extras } = entry;
  const forecast = home.forecast;
  const cur = forecast.current ?? {};
  const hours = sliceNext12Hours(forecast.hourly ?? {}, forecast.minutely_15, home.timezone);

  els.weatherSetup.hidden = true;
  els.weatherLive.hidden = false;
  els.wxError.hidden = true;

  // Same original hero block ×3: sky · temp+clock · place
  paintHeroSky(
    els.wxSkyHome,
    cur.weather_code,
    `weather code ${cur.weather_code ?? "—"}`,
  );
  paintHeroTemp(els.wxTempHome, cur.temperature_2m);
  els.wxPlaceHome.textContent = home.label || home.shortLabel;
  setClockHands(els.wxClockHome, home.timezone);

  paintHeroSky(
    els.wxSkyLondon,
    extras.london.weatherCode,
    `London · weather code ${extras.london.weatherCode ?? "—"}`,
  );
  paintHeroTemp(els.wxTempLondon, extras.london.temp);
  els.wxPlaceLondon.textContent = extras.london.label;
  setClockHands(els.wxClockLondon, extras.london.timezone);

  paintHeroSky(
    els.wxSkyKnoxville,
    extras.knoxville.weatherCode,
    `Knoxville · weather code ${extras.knoxville.weatherCode ?? "—"}`,
  );
  paintHeroTemp(els.wxTempKnoxville, extras.knoxville.temp);
  els.wxPlaceKnoxville.textContent = extras.knoxville.label;
  setClockHands(els.wxClockKnoxville, extras.knoxville.timezone);

  startClockTicker();

  const hum = cur.relative_humidity_2m;
  els.wxHumidity.textContent = hum != null ? String(Math.round(hum)) : "—";
  els.wxHumBar.textContent = hum != null ? asciiMeter(hum) : "";

  const wSpeed = cur.wind_speed_10m;
  const wDir = windArrow(cur.wind_direction_10m);
  const wGlyph = windGlyph(cur.wind_direction_10m);
  els.wxWindIco.textContent = wGlyph;
  els.wxWind.textContent =
    wSpeed != null
      ? `${Math.round(Number(wSpeed))} mph${wDir ? ` ${wDir}` : ""}`
      : "—";
  if (wSpeed != null) els.wxWind.style.color = windColor(wSpeed);

  const firstUv = hours[0]?.uv;
  const dailyUv = forecast.daily?.uv_index_max?.[0];
  const uvNow =
    firstUv != null
      ? Number(firstUv)
      : dailyUv != null
        ? Number(dailyUv)
        : NaN;
  els.wxUv.textContent = !Number.isNaN(uvNow) ? uvNow.toFixed(1) : "—";
  els.wxUv.style.color = !Number.isNaN(uvNow) ? uvColor(uvNow) : "";

  const sunrise = forecast.daily?.sunrise?.[0];
  const sunset = forecast.daily?.sunset?.[0];
  els.wxSunrise.textContent = formatSunTime(sunrise);
  els.wxSunset.textContent = formatSunTime(sunset);

  const temps = hours.map((h) => h.temp);
  const winds = hours.map((h) => h.wind);
  const uvs = hours.map((h) => h.uv);

  fillCells(
    els.wxHours,
    hours.map((h) => formatHourLabel(h.time)),
    "wx-hr",
  );
  fillColoredCells(
    els.wxTemps,
    hours.map((h) => ({
      n: h.temp,
      text: h.temp != null ? String(Math.round(Number(h.temp))) : "—",
    })),
    tempColor,
  );
  renderMetricBars(els.wxBars, temps, tempColor, { chartPx: 42 });

  fillColoredCells(
    els.wxWinds,
    hours.map((h) => ({
      n: h.wind,
      text: h.wind != null ? String(Math.round(Number(h.wind))) : "—",
    })),
    windColor,
  );
  renderMetricBars(els.wxWindBars, winds, windColor, {
    minFloor: 0,
    chartPx: 32,
  });

  fillColoredCells(
    els.wxUvs,
    hours.map((h) => ({
      n: h.uv,
      text:
        h.uv != null && !Number.isNaN(Number(h.uv))
          ? Number(h.uv).toFixed(Number(h.uv) >= 10 ? 0 : 1)
          : "—",
    })),
    uvColor,
  );
  renderMetricBars(els.wxUvBars, uvs, uvColor, {
    minFloor: 0,
    maxCeil: 11,
    chartPx: 32,
  });

  const daily = forecast.daily ?? {};
  renderDay5Temps(daily);
  renderDay5Winds(daily);
  renderSpfGuide(uvNow);

  els.weatherBadge.textContent = "live";
  els.weatherBadge.classList.remove("dim");
}

function extraFromFeed(
  city: (typeof EXTRA_CITIES)[number],
  feedCity: WeatherFeedExtraCity | undefined,
): ExtraCityCurrent {
  return {
    label: city.shortLabel,
    shortLabel: city.shortLabel,
    timezone: feedCity?.timezone || city.timezone,
    temp: feedCity?.current?.temperature_2m,
    weatherCode: feedCity?.current?.weather_code,
  };
}

/** Try the backend feed (backend/build_feeds.py's weather.json) first — its
 * WEATHER_LAT/WEATHER_LON *is* the home location; there's nothing to match
 * against locally anymore. Null on any miss so the caller falls back to a
 * direct fetch using the last-known coords — a new tab must never depend on
 * the backend being up. */
async function fetchWeatherFromFeed(): Promise<WeatherCacheEntry | null> {
  const feed = await loadFeed<WeatherFeedEntry>("weather");
  const item = feed?.entries[0];
  if (!item) return null;

  const homeTz =
    item.timezone ||
    item.forecast.timezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "America/Denver";
  const homeLabel = normalizeHomeLabel(getSettings().homeLabel);

  return {
    loc: locKey(item.lat, item.lon),
    lat: item.lat,
    lon: item.lon,
    at: Date.parse(feed.updatedAt) || Date.now(),
    home: { label: homeLabel, shortLabel: homeLabel, timezone: homeTz, forecast: item.forecast },
    extras: {
      london: extraFromFeed(EXTRA_CITIES[0]!, item.extras.london),
      knoxville: extraFromFeed(EXTRA_CITIES[1]!, item.extras.knoxville),
    },
  };
}

/** Fallback when the feed is unreachable: re-fetch directly using the last
 * coordinates a feed successfully gave us (cached across page loads). There's
 * no other source of "home" once geolocation is gone, so this only works
 * after at least one successful feed fetch. */
async function fetchWeatherDirect(pos: HomeCoords): Promise<WeatherCacheEntry> {
  const [forecast, london, knoxville] = await Promise.all([
    fetchOpenMeteo(pos.lat, pos.lon, { full: true }),
    fetchExtraCity(EXTRA_CITIES[0]!),
    fetchExtraCity(EXTRA_CITIES[1]!),
  ]);

  const homeTz =
    forecast.timezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "America/Denver";
  const homeLabel = normalizeHomeLabel(getSettings().homeLabel);

  return {
    loc: locKey(pos.lat, pos.lon),
    lat: pos.lat,
    lon: pos.lon,
    at: Date.now(),
    home: { label: homeLabel, shortLabel: homeLabel, timezone: homeTz, forecast },
    extras: { london, knoxville },
  };
}

export async function refreshWeather(opts: { force?: boolean } = {}): Promise<void> {
  const force = opts.force ?? false;

  hydrateWeatherCache();

  // Stale-while-revalidate: paint whatever we have immediately, then only
  // hit the network when the snapshot is actually stale (or forced).
  if (weatherCache) {
    renderWeatherBundle(weatherCache);
    const fresh = Date.now() - weatherCache.at < WEATHER_CACHE_MS;
    if (fresh && !force) return;
  }

  if (weatherFetchInFlight) return;
  weatherFetchInFlight = true;
  if (!weatherCache) {
    els.weatherBadge.textContent = "…";
    els.weatherBadge.classList.add("dim");
  }

  try {
    const entry =
      (await fetchWeatherFromFeed()) ??
      (weatherCache ? await fetchWeatherDirect({ lat: weatherCache.lat, lon: weatherCache.lon }) : null);

    if (!entry) {
      showWeatherSetup("waiting on backend weather feed (no location configured yet)");
      return;
    }

    weatherCache = entry;
    persistWeatherCache(entry);
    renderWeatherBundle(entry);
  } catch (err) {
    console.warn("weather refresh failed", err);
    const msg = err instanceof Error ? err.message : "weather unavailable";
    if (weatherCache) {
      renderWeatherBundle(weatherCache);
      els.wxError.hidden = false;
      els.wxError.textContent = `stale · ${msg}`;
    } else {
      showWeatherError(msg);
    }
  } finally {
    weatherFetchInFlight = false;
  }
}

export function initWeatherPane(): void {
  void refreshWeather();
  startClockTicker();
  weatherRefreshTimer = setInterval(() => {
    void refreshWeather();
  }, WEATHER_REFRESH_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopClockTicker();
      if (weatherRefreshTimer != null) {
        clearInterval(weatherRefreshTimer);
        weatherRefreshTimer = null;
      }
    } else {
      startClockTicker();
      if (weatherRefreshTimer == null) {
        weatherRefreshTimer = setInterval(() => {
          void refreshWeather();
        }, WEATHER_REFRESH_MS);
      }
      void refreshWeather();
    }
  });
}
