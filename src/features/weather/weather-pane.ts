import { pad } from "../../lib/format.js";
import { getSettings } from "../../settings/store.js";
import { els } from "../../ui/refs.js";

const WEATHER_REFRESH_MS = 15 * 60 * 1000;
const WEATHER_CACHE_MS = 10 * 60 * 1000;

interface GeoResult {
  lat: number;
  lon: number;
  label: string;
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

/** Fixed extra cities shown beside home (from zip). */
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
  zip: string;
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

interface ZippopotamPlace {
  latitude: string;
  longitude: string;
  "place name": string;
  "state abbreviation": string;
}

interface ZippopotamResponse {
  places?: ZippopotamPlace[];
}

interface OpenMeteoGeoHit {
  name?: string;
  admin1?: string;
  country_code?: string;
  latitude: number;
  longitude: number;
}

interface OpenMeteoGeoResponse {
  results?: OpenMeteoGeoHit[];
}

let weatherCache: WeatherCacheEntry | null = null;
let weatherFetchInFlight = false;
let lastWeatherZip = "";
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

export function normalizeZip(raw: string | null | undefined): string {
  return String(raw || "").trim();
}

export function getLastWeatherZip(): string {
  return lastWeatherZip;
}

function shortPlaceLabel(full: string): string {
  const t = full.trim();
  if (!t) return "home";
  // "Castle Rock, CO 80104" → "Castle Rock"
  const beforeComma = t.split(",")[0]?.trim();
  return beforeComma || t;
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
  clockTimer = setInterval(tickClocks, 1000);
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

async function geocodeZip(zip: string): Promise<GeoResult> {
  const cleaned = normalizeZip(zip);
  const usZip = /^(\d{5})(?:-\d{4})?$/.exec(cleaned);
  if (usZip?.[1]) {
    const res = await fetch(`https://api.zippopotam.us/us/${usZip[1]}`);
    if (!res.ok) throw new Error(`zip lookup failed (${res.status})`);
    const data = (await res.json()) as ZippopotamResponse;
    const place = data.places?.[0];
    if (!place) throw new Error("zip not found");
    return {
      lat: Number(place.latitude),
      lon: Number(place.longitude),
      label: `${place["place name"]}, ${place["state abbreviation"]} ${usZip[1]}`,
    };
  }

  const q = encodeURIComponent(cleaned);
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=1&language=en&format=json`,
  );
  if (!res.ok) throw new Error(`geocode failed (${res.status})`);
  const data = (await res.json()) as OpenMeteoGeoResponse;
  const hit = data.results?.[0];
  if (!hit) throw new Error("location not found");
  const parts = [hit.name, hit.admin1, hit.country_code].filter(Boolean);
  return {
    lat: hit.latitude,
    lon: hit.longitude,
    label: parts.join(", "),
  };
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

function sliceNext12Hours(hourly: OpenMeteoHourly): HourSlice[] {
  const times = hourly.time ?? [];
  const temps = hourly.temperature_2m ?? [];
  const winds = hourly.wind_speed_10m ?? [];
  const windDirs = hourly.wind_direction_10m ?? [];
  const uvs = hourly.uv_index ?? [];

  const now = Date.now();
  let start = 0;
  for (let i = 0; i < times.length; i++) {
    const iso = times[i];
    if (!iso) continue;
    const t = new Date(iso).getTime();
    if (!Number.isNaN(t) && t >= now - 30 * 60 * 1000) {
      start = i;
      break;
    }
    start = i;
  }

  const end = Math.min(times.length, start + 12);
  const hours: HourSlice[] = [];
  for (let i = start; i < end; i++) {
    const time = times[i];
    if (!time) continue;
    hours.push({
      time,
      temp: temps[i],
      wind: winds[i],
      windDir: windDirs[i],
      uv: uvs[i],
    });
  }
  return hours;
}

function renderWeatherBundle(entry: WeatherCacheEntry): void {
  const { home, extras } = entry;
  const forecast = home.forecast;
  const cur = forecast.current ?? {};
  const hours = sliceNext12Hours(forecast.hourly ?? {});

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

export async function refreshWeather(opts: { force?: boolean } = {}): Promise<void> {
  const force = opts.force ?? false;
  const zip = normalizeZip(getSettings().zipCode);
  if (!zip) {
    showWeatherSetup("set zip code in settings");
    lastWeatherZip = "";
    return;
  }

  const cacheHit =
    !force &&
    weatherCache &&
    weatherCache.zip === zip &&
    Date.now() - weatherCache.at < WEATHER_CACHE_MS;

  if (cacheHit && weatherCache) {
    renderWeatherBundle(weatherCache);
    return;
  }

  if (weatherFetchInFlight) return;
  weatherFetchInFlight = true;
  els.weatherBadge.textContent = "…";
  els.weatherBadge.classList.add("dim");

  try {
    const geo = await geocodeZip(zip);
    const [forecast, london, knoxville] = await Promise.all([
      fetchOpenMeteo(geo.lat, geo.lon, { full: true }),
      fetchExtraCity(EXTRA_CITIES[0]!),
      fetchExtraCity(EXTRA_CITIES[1]!),
    ]);

    const homeTz =
      forecast.timezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      "America/Denver";

    const home: WeatherPayload = {
      label: geo.label,
      shortLabel: shortPlaceLabel(geo.label),
      timezone: homeTz,
      forecast,
    };

    const entry: WeatherCacheEntry = {
      zip,
      at: Date.now(),
      home,
      extras: { london, knoxville },
    };
    weatherCache = entry;
    lastWeatherZip = zip;
    renderWeatherBundle(entry);
  } catch (err) {
    console.warn("weather refresh failed", err);
    const msg = err instanceof Error ? err.message : "weather unavailable";
    if (weatherCache?.zip === zip) {
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
