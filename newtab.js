/**
 * New Tab — floating pane dashboard
 * Settings persist via chrome.storage.local (with sync + localStorage fallbacks).
 */

const STORAGE_KEY = "newTabSettings";

const DEFAULTS = {
  birthDate: "",
  birthTime: "00:00:00",
  lifespan: 80,
  showDeath: false,
  /** US ZIP / postal — drives weather pane */
  zipCode: "",
  /** User-supplied board/feed URL — never hardcode a site in the repo */
  forumUrl: "",
  bgImage: "",
};

const WEATHER_REFRESH_MS = 15 * 60 * 1000;
const WEATHER_CACHE_MS = 10 * 60 * 1000;

const RING_R = 82;
const RING_CX = 100;
const RING_CY = 100;

const els = {
  clock: document.getElementById("clock"),
  ageDisplay: document.getElementById("age-display"),
  ageLabel: document.getElementById("age-label"),
  deathCountdown: document.getElementById("death-countdown"),
  lifeSegments: document.getElementById("life-segments"),
  lifeBadge: document.getElementById("life-badge"),
  lifePane: document.getElementById("life-pane"),
  ringProgress: document.getElementById("ring-progress"),
  ringRemaining: document.getElementById("ring-remaining"),
  ringTicks: document.getElementById("ring-ticks"),
  bgLayer: document.getElementById("bg-layer"),
  settingsToggle: document.getElementById("settings-toggle"),
  settingsDialog: document.getElementById("settings-dialog"),
  settingsForm: document.getElementById("settings-form"),
  settingsCancel: document.getElementById("settings-cancel"),
  birthDate: document.getElementById("birth-date"),
  birthTime: document.getElementById("birth-time"),
  lifespan: document.getElementById("lifespan"),
  showDeath: document.getElementById("show-death"),
  forumUrl: document.getElementById("forum-url"),
  bgImage: document.getElementById("bg-image"),
  zipCode: document.getElementById("zip-code"),
  forumBadge: document.getElementById("forum-badge"),
  forumStatus: document.getElementById("forum-status"),
  weatherBadge: document.getElementById("weather-badge"),
  weatherSetup: document.getElementById("weather-setup"),
  weatherLive: document.getElementById("weather-live"),
  wxTemp: document.getElementById("wx-temp"),
  wxPlace: document.getElementById("wx-place"),
  wxHumidity: document.getElementById("wx-humidity"),
  wxWind: document.getElementById("wx-wind"),
  wxSunrise: document.getElementById("wx-sunrise"),
  wxSunset: document.getElementById("wx-sunset"),
  wxHours: document.getElementById("wx-hours"),
  wxTemps: document.getElementById("wx-temps"),
  wxWinds: document.getElementById("wx-winds"),
  wxUvs: document.getElementById("wx-uvs"),
  wxBars: document.getElementById("wx-bars"),
  wxWindBars: document.getElementById("wx-wind-bars"),
  wxUvBars: document.getElementById("wx-uv-bars"),
  wxSky: document.getElementById("wx-sky"),
  wxWindIco: document.getElementById("wx-wind-ico"),
  wxHumBar: document.getElementById("wx-hum-bar"),
  wxUv: document.getElementById("wx-uv"),
  wxError: document.getElementById("wx-error"),
};

/** @type {typeof DEFAULTS} */
let settings = { ...DEFAULTS };
let ticksDrawnFor = null;

/** @type {{ zip: string, at: number, data: object } | null} */
let weatherCache = null;
let weatherFetchInFlight = false;
let lastWeatherZip = "";

function pad(n, width = 2) {
  return String(n).padStart(width, "0");
}

function formatClock(date) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${days[date.getDay()]} ${months[date.getMonth()]} ${date.getDate()} · ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function parseBirthDateTime(birthDate, birthTime) {
  if (!birthDate) return null;
  const time = birthTime && birthTime.length >= 5 ? birthTime : "00:00:00";
  const normalized = time.length === 5 ? `${time}:00` : time;
  const d = new Date(`${birthDate}T${normalized}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Precise age in years with high fractional resolution (Mortality-style). */
function ageInYears(birth, now = new Date()) {
  const ms = now.getTime() - birth.getTime();
  if (ms < 0) return 0;
  const yearMs = 365.2425 * 24 * 60 * 60 * 1000;
  return ms / yearMs;
}

function formatAge(years) {
  return years.toFixed(9);
}

function formatDuration(ms) {
  if (ms <= 0) return "0 days";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days.toLocaleString()}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
}

function expectedDeathDate(birth, lifespanYears) {
  const yearMs = 365.2425 * 24 * 60 * 60 * 1000;
  return new Date(birth.getTime() + lifespanYears * yearMs);
}

function hasExtensionStorage() {
  return typeof chrome !== "undefined" && chrome?.storage?.local != null;
}

/**
 * Load settings. Prefer local (reliable for extensions), then sync (migrate),
 * then localStorage (file:// / fallback).
 */
async function loadSettings() {
  let loaded = null;

  if (hasExtensionStorage()) {
    try {
      const localResult = await chrome.storage.local.get(STORAGE_KEY);
      if (localResult[STORAGE_KEY] && typeof localResult[STORAGE_KEY] === "object") {
        loaded = localResult[STORAGE_KEY];
      }
    } catch {
      /* continue */
    }

    // Migrate from older sync-key storage if local is empty
    if (!loaded && chrome.storage.sync) {
      try {
        const syncResult = await chrome.storage.sync.get(STORAGE_KEY);
        if (syncResult[STORAGE_KEY] && typeof syncResult[STORAGE_KEY] === "object") {
          loaded = syncResult[STORAGE_KEY];
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
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") loaded = parsed;
      }
    } catch {
      /* ignore */
    }
  }

  if (loaded) {
    settings = { ...DEFAULTS, ...loaded };
  } else {
    settings = { ...DEFAULTS };
  }
}

/**
 * Persist to chrome.storage.local + localStorage mirror so settings stick.
 */
async function saveSettings(next) {
  settings = { ...DEFAULTS, ...next };

  // Always mirror to localStorage as a durable backup
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

function applyBackground() {
  const url = (settings.bgImage || "").trim();
  if (url) {
    els.bgLayer.classList.add("has-image");
    document.body.classList.add("has-bg-image");
    // Escape quotes for CSS url()
    const safe = url.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    els.bgLayer.style.backgroundImage = `url("${safe}")`;
  } else {
    els.bgLayer.classList.remove("has-image");
    document.body.classList.remove("has-bg-image");
    els.bgLayer.style.backgroundImage = "";
  }
}

function updateClock() {
  const now = new Date();
  els.clock.textContent = formatClock(now);
  els.clock.dateTime = now.toISOString();
}

/**
 * Draw tick marks around the life ring.
 * One tick per year of expected lifespan; thicker every decade.
 */
function ensureRingTicks(lifespanYears) {
  const n = Math.max(1, Math.min(150, Math.round(lifespanYears)));
  if (ticksDrawnFor === n) return;
  ticksDrawnFor = n;

  const frag = document.createDocumentFragment();
  const outer = RING_R + 6;
  const innerYear = RING_R + 1;
  const innerDecade = RING_R - 2;

  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    // SVG is rotated -90deg via CSS, so angle 0 = top after rotation...
    // We draw in unrotated coords: 0 = right, so for visual top-start we use same pathLength model.
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

/**
 * pathLength=100 rings: stroke-dasharray "lived gap"
 */
function updateRing(livedFraction) {
  const lived = Math.max(0, Math.min(1, livedFraction)) * 100;
  const remain = 100 - lived;
  // Progress arc from start (top, due to -90deg rotate)
  els.ringProgress.style.strokeDasharray = `${lived} ${100 - lived}`;
  // Remaining drawn after lived portion
  els.ringRemaining.style.strokeDasharray = `0 ${lived} ${remain} 0`;
}

function updateAge() {
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
  els.lifeBadge.textContent = `${Math.min(100, (fraction * 100)).toFixed(1)}%`;

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

/** Reflect forum URL config in the pane (never log or hardcode the host). */
function updateForumPane() {
  const url = (settings.forumUrl || "").trim();
  if (!url) {
    els.forumBadge.textContent = "setup";
    els.forumBadge.classList.add("dim");
    els.forumStatus.textContent = "set forum URL in settings";
    return;
  }
  els.forumBadge.textContent = "ready";
  els.forumBadge.classList.remove("dim");
  // Show host only (not full path) so the pane isn't a giant secret URL
  try {
    const host = new URL(url).host;
    els.forumStatus.textContent = `configured · ${host}`;
  } catch {
    els.forumStatus.textContent = "configured · (invalid URL?)";
  }
}

// ── Weather (Open-Meteo + zip → lat/lon) ─────────────────────────────

function normalizeZip(raw) {
  return String(raw || "").trim();
}

function windArrow(deg) {
  if (deg == null || Number.isNaN(Number(deg))) return "";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const i = Math.round(((Number(deg) % 360) + 360) % 360 / 45) % 8;
  return dirs[i];
}

/** Compass as little ASCII arrows (direction wind is FROM, NWS-style). */
function windGlyph(deg) {
  if (deg == null || Number.isNaN(Number(deg))) return "≈";
  const glyphs = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
  const i = Math.round(((Number(deg) % 360) + 360) % 360 / 45) % 8;
  return glyphs[i];
}

/** Open-Meteo WMO weather code → tiny ASCII sky glyph. */
function skyGlyph(code) {
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

/**
 * Map °F to a warm→cool palette for graphs/text.
 * cold blue → cyan → green → gold → orange → hot red
 */
function tempColor(f) {
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

/** Wind mph → cool teal/cyan scale */
function windColor(mph) {
  const w = Number(mph);
  if (Number.isNaN(w)) return "var(--text-muted)";
  if (w < 5) return "#6a8f88";
  if (w < 10) return "#5a9e96";
  if (w < 15) return "#4aafb0";
  if (w < 25) return "#3a9ec4";
  return "#5a7ec4";
}

/** UV index WHO-ish palette */
function uvColor(uv) {
  const u = Number(uv);
  if (Number.isNaN(u)) return "var(--text-muted)";
  if (u < 3) return "#4aaf6a";
  if (u < 6) return "#c4b050";
  if (u < 8) return "#d4895a";
  if (u < 11) return "#c45a5a";
  return "#9a5ac4";
}

/** 0–100 humidity as block meter e.g. ▓▓▓▓▓░░░░░ */
function asciiMeter(pct, width = 8) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const filled = Math.round((p / 100) * width);
  return "▓".repeat(filled) + "░".repeat(width - filled);
}

function fillColoredCells(container, values, colorFn, className = "") {
  if (!container) return;
  const frag = document.createDocumentFragment();
  for (const v of values) {
    const span = document.createElement("span");
    if (className) span.className = className;
    const num = typeof v === "object" ? v.n : v;
    const text = typeof v === "object" ? v.text : v;
    span.textContent = text;
    if (colorFn && num != null && !Number.isNaN(Number(num))) {
      span.style.color = colorFn(num);
    }
    frag.appendChild(span);
  }
  container.replaceChildren(frag);
}

/**
 * Colored bars under a metric row.
 * Use explicit px heights (not %) so bars aren't flat when parent height is ambiguous.
 * @param {HTMLElement | null} container
 * @param {unknown[]} values
 * @param {(n: number) => string} colorFn
 * @param {{ minFloor?: number, maxCeil?: number, chartPx?: number }} [opts]
 */
function renderMetricBars(container, values, colorFn, opts = {}) {
  if (!container) return;
  const chartPx = opts.chartPx ?? 40;
  const nums = values.map((t) => Number(t)).filter((n) => !Number.isNaN(n));
  let min = nums.length ? Math.min(...nums) : 0;
  let max = nums.length ? Math.max(...nums) : 1;
  if (opts.minFloor != null) min = Math.min(min, opts.minFloor);
  if (opts.maxCeil != null) max = Math.max(max, opts.maxCeil);
  // avoid zero span
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

function formatHourLabel(isoLocal) {
  // open-meteo returns "2026-07-09T15:00" in local timezone when timezone=auto
  const m = /T(\d{2})/.exec(isoLocal);
  if (!m) return "—";
  const h = Number(m[1]);
  const suffix = h >= 12 ? "p" : "a";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${suffix}`;
}

function formatSunTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const m = /T(\d{2}):(\d{2})/.exec(iso);
    return m ? `${m[1]}:${m[2]}` : "—";
  }
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fillCells(container, values, className = "") {
  const frag = document.createDocumentFragment();
  for (const v of values) {
    const span = document.createElement("span");
    if (className) span.className = className;
    span.textContent = v;
    frag.appendChild(span);
  }
  container.replaceChildren(frag);
}

function showWeatherSetup(message) {
  els.weatherSetup.hidden = false;
  els.weatherLive.hidden = true;
  els.weatherBadge.textContent = "setup";
  els.weatherBadge.classList.add("dim");
  if (message) {
    els.weatherSetup.innerHTML = `<p class="muted">${message}</p><p class="muted">temp · humidity · wind · sun · 12h</p>`;
  }
}

function showWeatherError(msg) {
  els.weatherSetup.hidden = true;
  els.weatherLive.hidden = false;
  els.wxError.hidden = false;
  els.wxError.textContent = msg;
  els.weatherBadge.textContent = "err";
  els.weatherBadge.classList.add("dim");
}

/**
 * Resolve zip/postal to lat/lon.
 * Prefer zippopotam for US 5-digit; fall back to Open-Meteo geocoding.
 * @returns {Promise<{ lat: number, lon: number, label: string }>}
 */
async function geocodeZip(zip) {
  const cleaned = normalizeZip(zip);
  const usZip = /^(\d{5})(?:-\d{4})?$/.exec(cleaned);

  if (usZip) {
    const res = await fetch(`https://api.zippopotam.us/us/${usZip[1]}`);
    if (!res.ok) throw new Error(`zip lookup failed (${res.status})`);
    const data = await res.json();
    const place = data.places?.[0];
    if (!place) throw new Error("zip not found");
    return {
      lat: Number(place.latitude),
      lon: Number(place.longitude),
      label: `${place["place name"]}, ${place["state abbreviation"]} ${usZip[1]}`,
    };
  }

  // Non-US / free-form postal: Open-Meteo geocoding search
  const q = encodeURIComponent(cleaned);
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=1&language=en&format=json`,
  );
  if (!res.ok) throw new Error(`geocode failed (${res.status})`);
  const data = await res.json();
  const hit = data.results?.[0];
  if (!hit) throw new Error("location not found");
  const parts = [hit.name, hit.admin1, hit.country_code].filter(Boolean);
  return {
    lat: hit.latitude,
    lon: hit.longitude,
    label: parts.join(", "),
  };
}

/**
 * Fetch current + 12h hourly + sun from Open-Meteo (F / mph, no API key).
 */
async function fetchOpenMeteo(lat, lon) {
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
  return res.json();
}

function sliceNext12Hours(hourly) {
  const times = hourly.time || [];
  const temps = hourly.temperature_2m || [];
  const winds = hourly.wind_speed_10m || [];
  const windDirs = hourly.wind_direction_10m || [];
  const uvs = hourly.uv_index || [];

  // Find index at or just after "now" in local series
  const now = Date.now();
  let start = 0;
  for (let i = 0; i < times.length; i++) {
    const t = new Date(times[i]).getTime();
    if (!Number.isNaN(t) && t >= now - 30 * 60 * 1000) {
      start = i;
      break;
    }
    start = i;
  }

  const end = Math.min(times.length, start + 12);
  const hours = [];
  for (let i = start; i < end; i++) {
    hours.push({
      time: times[i],
      temp: temps[i],
      wind: winds[i],
      windDir: windDirs[i],
      uv: uvs[i],
    });
  }
  return hours;
}

function renderWeather(payload) {
  const { label, forecast } = payload;
  const cur = forecast.current || {};
  const hours = sliceNext12Hours(forecast.hourly || {});

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

  // Current UV: first hour in window, else daily max
  const uvNow =
    hours[0]?.uv != null
      ? Number(hours[0].uv)
      : forecast.daily?.uv_index_max?.[0] != null
        ? Number(forecast.daily.uv_index_max[0])
        : NaN;
  if (els.wxUv) {
    els.wxUv.textContent = !Number.isNaN(uvNow) ? uvNow.toFixed(1) : "—";
    els.wxUv.style.color = !Number.isNaN(uvNow) ? uvColor(uvNow) : "";
  }

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

async function refreshWeather({ force = false } = {}) {
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

  if (cacheHit) {
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
    const data = { label: geo.label, forecast };
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

function tick() {
  updateClock();
  updateAge();
  updateForumPane();
}

function fillForm() {
  els.birthDate.value = settings.birthDate || "";
  const t = settings.birthTime || "00:00:00";
  // <input type="time"> accepts HH:MM or HH:MM:SS
  els.birthTime.value = t.length >= 8 ? t.slice(0, 8) : t.slice(0, 5);
  els.lifespan.value = String(settings.lifespan ?? 80);
  els.showDeath.checked = Boolean(settings.showDeath);
  els.zipCode.value = settings.zipCode || "";
  els.forumUrl.value = settings.forumUrl || "";
  els.bgImage.value = settings.bgImage || "";
}

function openSettings() {
  fillForm();
  els.settingsDialog.showModal();
}

function closeSettings() {
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
    forumUrl: (els.forumUrl.value || "").trim(),
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
  refreshWeather();
}, WEATHER_REFRESH_MS);

// First-run: open settings until birth date is set (zip editable same place)
if (!settings.birthDate) {
  setTimeout(openSettings, 350);
}
