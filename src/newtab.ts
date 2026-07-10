/**
 * New Tab — floating pane dashboard
 * Settings persist via chrome.storage.local (with sync + localStorage fallbacks).
 */

const STORAGE_KEY = "newTabSettings";

interface Settings {
  birthDate: string;
  birthTime: string;
  lifespan: number;
  showDeath: boolean;
  /** US ZIP / postal — drives weather pane */
  zipCode: string;
  bgImage: string;
}

const DEFAULTS: Settings = {
  birthDate: "",
  birthTime: "00:00:00",
  lifespan: 80,
  showDeath: false,
  zipCode: "",
  bgImage: "",
};

const WEATHER_REFRESH_MS = 15 * 60 * 1000;
const WEATHER_CACHE_MS = 10 * 60 * 1000;

const RING_R = 82;
const RING_CX = 100;
const RING_CY = 100;

function requireEl<T extends Element>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required element #${id}`);
  return el as unknown as T;
}

const els = {
  clock: requireEl<HTMLTimeElement>("clock"),
  ageDisplay: requireEl<HTMLElement>("age-display"),
  ageLabel: requireEl<HTMLElement>("age-label"),
  deathCountdown: requireEl<HTMLElement>("death-countdown"),
  lifeSegments: requireEl<HTMLElement>("life-segments"),
  lifeBadge: requireEl<HTMLElement>("life-badge"),
  lifePane: requireEl<HTMLElement>("life-pane"),
  ringProgress: requireEl<SVGCircleElement>("ring-progress"),
  ringRemaining: requireEl<SVGCircleElement>("ring-remaining"),
  ringTicks: requireEl<SVGGElement>("ring-ticks"),
  bgLayer: requireEl<HTMLElement>("bg-layer"),
  settingsToggle: requireEl<HTMLButtonElement>("settings-toggle"),
  settingsDialog: requireEl<HTMLDialogElement>("settings-dialog"),
  settingsForm: requireEl<HTMLFormElement>("settings-form"),
  settingsCancel: requireEl<HTMLButtonElement>("settings-cancel"),
  birthDate: requireEl<HTMLInputElement>("birth-date"),
  birthTime: requireEl<HTMLInputElement>("birth-time"),
  lifespan: requireEl<HTMLInputElement>("lifespan"),
  showDeath: requireEl<HTMLInputElement>("show-death"),
  bgImage: requireEl<HTMLInputElement>("bg-image"),
  zipCode: requireEl<HTMLInputElement>("zip-code"),
  weatherBadge: requireEl<HTMLElement>("weather-badge"),
  weatherSetup: requireEl<HTMLElement>("weather-setup"),
  weatherLive: requireEl<HTMLElement>("weather-live"),
  wxTemp: requireEl<HTMLElement>("wx-temp"),
  wxPlace: requireEl<HTMLElement>("wx-place"),
  wxHumidity: requireEl<HTMLElement>("wx-humidity"),
  wxWind: requireEl<HTMLElement>("wx-wind"),
  wxSunrise: requireEl<HTMLElement>("wx-sunrise"),
  wxSunset: requireEl<HTMLElement>("wx-sunset"),
  wxHours: requireEl<HTMLElement>("wx-hours"),
  wxTemps: requireEl<HTMLElement>("wx-temps"),
  wxWinds: requireEl<HTMLElement>("wx-winds"),
  wxUvs: requireEl<HTMLElement>("wx-uvs"),
  wxBars: requireEl<HTMLElement>("wx-bars"),
  wxWindBars: requireEl<HTMLElement>("wx-wind-bars"),
  wxUvBars: requireEl<HTMLElement>("wx-uv-bars"),
  wxSky: requireEl<HTMLElement>("wx-sky"),
  wxWindIco: requireEl<HTMLElement>("wx-wind-ico"),
  wxHumBar: requireEl<HTMLElement>("wx-hum-bar"),
  wxUv: requireEl<HTMLElement>("wx-uv"),
  wxError: requireEl<HTMLElement>("wx-error"),
};

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
  sunrise?: string[];
  sunset?: string[];
  uv_index_max?: number[];
}

interface OpenMeteoForecast {
  current?: OpenMeteoCurrent;
  hourly?: OpenMeteoHourly;
  daily?: OpenMeteoDaily;
}

interface WeatherPayload {
  label: string;
  forecast: OpenMeteoForecast;
}

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
  data: WeatherPayload;
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

let settings: Settings = { ...DEFAULTS };
let ticksDrawnFor: number | null = null;
let weatherCache: WeatherCacheEntry | null = null;
let weatherFetchInFlight = false;
let lastWeatherZip = "";

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function formatClock(date: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${days[date.getDay()]} ${months[date.getMonth()]} ${date.getDate()} · ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function parseBirthDateTime(birthDate: string, birthTime: string): Date | null {
  if (!birthDate) return null;
  const time = birthTime && birthTime.length >= 5 ? birthTime : "00:00:00";
  const normalized = time.length === 5 ? `${time}:00` : time;
  const d = new Date(`${birthDate}T${normalized}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Precise age in years with high fractional resolution (Mortality-style). */
function ageInYears(birth: Date, now = new Date()): number {
  const ms = now.getTime() - birth.getTime();
  if (ms < 0) return 0;
  const yearMs = 365.2425 * 24 * 60 * 60 * 1000;
  return ms / yearMs;
}

function formatAge(years: number): string {
  return years.toFixed(9);
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "0 days";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days.toLocaleString()}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
}

function expectedDeathDate(birth: Date, lifespanYears: number): Date {
  const yearMs = 365.2425 * 24 * 60 * 60 * 1000;
  return new Date(birth.getTime() + lifespanYears * yearMs);
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
async function loadSettings(): Promise<void> {
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
}

/** Persist to chrome.storage.local + localStorage mirror so settings stick. */
async function saveSettings(next: Partial<Settings>): Promise<void> {
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

  applyBackground();
}

function applyBackground(): void {
  const url = (settings.bgImage || "").trim();
  if (url) {
    els.bgLayer.classList.add("has-image");
    document.body.classList.add("has-bg-image");
    const safe = url.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    els.bgLayer.style.backgroundImage = `url("${safe}")`;
  } else {
    els.bgLayer.classList.remove("has-image");
    document.body.classList.remove("has-bg-image");
    els.bgLayer.style.backgroundImage = "";
  }
}

function updateClock(): void {
  const now = new Date();
  els.clock.textContent = formatClock(now);
  els.clock.dateTime = now.toISOString();
}

/** Draw tick marks around the life ring. */
function ensureRingTicks(lifespanYears: number): void {
  const n = Math.max(1, Math.min(150, Math.round(lifespanYears)));
  if (ticksDrawnFor === n) return;
  ticksDrawnFor = n;

  const frag = document.createDocumentFragment();
  const outer = RING_R + 6;
  const innerYear = RING_R + 1;
  const innerDecade = RING_R - 2;

  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    const isDecade = i % 10 === 0;
    const inner = isDecade ? innerDecade : innerYear;
    const x1 = RING_CX + Math.cos(angle) * outer;
    const y1 = RING_CY + Math.sin(angle) * outer;
    const x2 = RING_CX + Math.cos(angle) * inner;
    const y2 = RING_CY + Math.sin(angle) * inner;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(x1));
    line.setAttribute("y1", String(y1));
    line.setAttribute("x2", String(x2));
    line.setAttribute("y2", String(y2));
    if (isDecade) line.classList.add("decade");
    frag.appendChild(line);
  }

  els.ringTicks.replaceChildren(frag);
}

function updateRing(livedFraction: number): void {
  const lived = Math.max(0, Math.min(1, livedFraction)) * 100;
  const remain = 100 - lived;
  els.ringProgress.style.strokeDasharray = `${lived} ${100 - lived}`;
  els.ringRemaining.style.strokeDasharray = `0 ${lived} ${remain} 0`;
}

function updateAge(): void {
  const birth = parseBirthDateTime(settings.birthDate, settings.birthTime);
  const lifespan = Number(settings.lifespan) || 80;
  ensureRingTicks(lifespan);

  if (!birth) {
    els.lifePane.classList.add("needs-setup");
    els.ageDisplay.textContent = "set birth date";
    els.ageLabel.textContent = "⚙ settings to start";
    els.deathCountdown.hidden = true;
    els.lifeSegments.textContent = "life ring idle · no birthday yet";
    els.lifeBadge.textContent = "setup";
    updateRing(0);
    return;
  }

  els.lifePane.classList.remove("needs-setup");
  const now = new Date();
  const years = ageInYears(birth, now);
  const fraction = years / lifespan;

  els.ageDisplay.textContent = formatAge(years);
  els.ageLabel.textContent = "years old";
  els.lifeBadge.textContent = `${Math.min(100, fraction * 100).toFixed(1)}%`;

  updateRing(fraction);

  const wholeYears = Math.floor(years);
  const decade = Math.floor(years / 10) * 10;
  const yearInDecade = wholeYears - decade;
  els.lifeSegments.textContent =
    `segment ${wholeYears + 1}/${lifespan} · decade ${decade}–${decade + 9} · +${yearInDecade}y in block · ` +
    `${Math.max(0, lifespan - years).toFixed(2)}y est. left`;

  if (settings.showDeath) {
    const death = expectedDeathDate(birth, lifespan);
    const remaining = death.getTime() - now.getTime();
    if (remaining > 0) {
      els.deathCountdown.textContent = `~${formatDuration(remaining)} left @ ${lifespan}y`;
    } else {
      els.deathCountdown.textContent = "outlived the estimate · keep going";
    }
    els.deathCountdown.hidden = false;
  } else {
    els.deathCountdown.hidden = true;
  }
}


// ── Weather (Open-Meteo + zip → lat/lon) ─────────────────────────────

function normalizeZip(raw: string | null | undefined): string {
  return String(raw || "").trim();
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

async function fetchOpenMeteo(lat: number, lon: number): Promise<OpenMeteoForecast> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "wind_speed_10m",
      "wind_direction_10m",
      "weather_code",
    ].join(","),
    hourly: [
      "temperature_2m",
      "wind_speed_10m",
      "wind_direction_10m",
      "uv_index",
    ].join(","),
    daily: ["sunrise", "sunset", "uv_index_max"].join(","),
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    timezone: "auto",
    forecast_days: "2",
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`forecast failed (${res.status})`);
  return (await res.json()) as OpenMeteoForecast;
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

function renderWeather(payload: WeatherPayload): void {
  const { label, forecast } = payload;
  const cur = forecast.current ?? {};
  const hours = sliceNext12Hours(forecast.hourly ?? {});

  els.weatherSetup.hidden = true;
  els.weatherLive.hidden = false;
  els.wxError.hidden = true;

  const temp = cur.temperature_2m;
  const tempN = temp != null ? Number(temp) : NaN;
  els.wxTemp.textContent = !Number.isNaN(tempN) ? `${Math.round(tempN)}°F` : "—";
  els.wxTemp.style.color = !Number.isNaN(tempN) ? tempColor(tempN) : "";
  els.wxTemp.style.textShadow = !Number.isNaN(tempN)
    ? `0 0 18px ${tempColor(tempN)}66`
    : "";
  els.wxPlace.textContent = label || "";

  els.wxSky.textContent = skyGlyph(cur.weather_code);
  els.wxSky.title = `weather code ${cur.weather_code ?? "—"}`;

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

  els.weatherBadge.textContent = "live";
  els.weatherBadge.classList.remove("dim");
}

async function refreshWeather(opts: { force?: boolean } = {}): Promise<void> {
  const force = opts.force ?? false;
  const zip = normalizeZip(settings.zipCode);
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
    renderWeather(weatherCache.data);
    return;
  }

  if (weatherFetchInFlight) return;
  weatherFetchInFlight = true;
  els.weatherBadge.textContent = "…";
  els.weatherBadge.classList.add("dim");

  try {
    const geo = await geocodeZip(zip);
    const forecast = await fetchOpenMeteo(geo.lat, geo.lon);
    const data: WeatherPayload = { label: geo.label, forecast };
    weatherCache = { zip, at: Date.now(), data };
    lastWeatherZip = zip;
    renderWeather(data);
  } catch (err) {
    console.warn("weather refresh failed", err);
    const msg = err instanceof Error ? err.message : "weather unavailable";
    if (weatherCache?.zip === zip) {
      renderWeather(weatherCache.data);
      els.wxError.hidden = false;
      els.wxError.textContent = `stale · ${msg}`;
    } else {
      showWeatherError(msg);
    }
  } finally {
    weatherFetchInFlight = false;
  }
}

function tick(): void {
  updateClock();
  updateAge();
}

function fillForm(): void {
  els.birthDate.value = settings.birthDate || "";
  const t = settings.birthTime || "00:00:00";
  els.birthTime.value = t.length >= 8 ? t.slice(0, 8) : t.slice(0, 5);
  els.lifespan.value = String(settings.lifespan ?? 80);
  els.showDeath.checked = Boolean(settings.showDeath);
  els.zipCode.value = settings.zipCode || "";
  els.bgImage.value = settings.bgImage || "";
}

function openSettings(): void {
  fillForm();
  els.settingsDialog.showModal();
}

function closeSettings(): void {
  if (els.settingsDialog.open) els.settingsDialog.close();
}

els.settingsToggle.addEventListener("click", openSettings);
els.settingsCancel.addEventListener("click", (e) => {
  e.preventDefault();
  closeSettings();
});

els.settingsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prevZip = normalizeZip(settings.zipCode);
  await saveSettings({
    birthDate: els.birthDate.value,
    birthTime: els.birthTime.value || "00:00:00",
    lifespan: Number(els.lifespan.value) || 80,
    showDeath: els.showDeath.checked,
    zipCode: normalizeZip(els.zipCode.value),
    bgImage: (els.bgImage.value || "").trim(),
  });
  closeSettings();
  tick();
  const nextZip = normalizeZip(settings.zipCode);
  await refreshWeather({ force: nextZip !== prevZip || nextZip !== lastWeatherZip });
});

// Bootstrap
await loadSettings();
applyBackground();
tick();
await refreshWeather();
setInterval(tick, 50);
setInterval(() => {
  void refreshWeather();
}, WEATHER_REFRESH_MS);

if (!settings.birthDate) {
  setTimeout(openSettings, 350);
}

export {};
