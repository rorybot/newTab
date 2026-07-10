// src/config/features.ts
var FEATURES = {
  /** Life ring + age clock (core). */
  life: true,
  /** Weather TUI via Open-Meteo. */
  weather: true,
  /**
   * Room snapshot JSON (recent shouts).
   * Disabled: needs login-aware scrape on the backend first.
   */
  room: false
};
function isFeatureEnabled(name) {
  return FEATURES[name] === true;
}

// src/lib/age.ts
var YEAR_MS = 365.2425 * 24 * 60 * 60 * 1e3;
function parseBirthDateTime(birthDate, birthTime) {
  if (!birthDate) return null;
  const time = birthTime && birthTime.length >= 5 ? birthTime : "00:00:00";
  const normalized = time.length === 5 ? `${time}:00` : time;
  const d = /* @__PURE__ */ new Date(`${birthDate}T${normalized}`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function ageInYears(birth, now = /* @__PURE__ */ new Date()) {
  const ms = now.getTime() - birth.getTime();
  if (ms < 0) return 0;
  return ms / YEAR_MS;
}
function expectedDeathDate(birth, lifespanYears) {
  return new Date(birth.getTime() + lifespanYears * YEAR_MS);
}

// src/lib/format.ts
function pad(n, width = 2) {
  return String(n).padStart(width, "0");
}
function formatClock(date) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ];
  return `${days[date.getDay()]} ${months[date.getMonth()]} ${date.getDate()} \xB7 ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
function formatDuration(ms) {
  if (ms <= 0) return "0 days";
  const totalSeconds = Math.floor(ms / 1e3);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor(totalSeconds % 86400 / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  return `${days.toLocaleString()}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
}
function formatAge(years) {
  return years.toFixed(9);
}

// src/settings/types.ts
var DEFAULTS = {
  birthDate: "",
  birthTime: "00:00:00",
  lifespan: 80,
  showDeath: false,
  zipCode: "",
  roomJsonUrl: "",
  bgImage: ""
};
var STORAGE_KEY = "newTabSettings";

// src/settings/store.ts
var settings = { ...DEFAULTS };
var onChange = null;
function getSettings() {
  return settings;
}
function notify() {
  onChange?.(settings);
}
function hasExtensionStorage() {
  return typeof chrome !== "undefined" && chrome?.storage?.local != null;
}
function isSettingsPartial(value) {
  return typeof value === "object" && value !== null;
}
async function loadSettings() {
  let loaded = null;
  if (hasExtensionStorage()) {
    try {
      const localResult = await chrome.storage.local.get(STORAGE_KEY);
      const raw = localResult[STORAGE_KEY];
      if (isSettingsPartial(raw)) loaded = raw;
    } catch {
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
          }
        }
      } catch {
      }
    }
  }
  if (!loaded) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isSettingsPartial(parsed)) loaded = parsed;
      }
    } catch {
    }
  }
  settings = loaded ? { ...DEFAULTS, ...loaded } : { ...DEFAULTS };
  notify();
  return settings;
}
async function saveSettings(next) {
  settings = { ...DEFAULTS, ...next };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
  }
  if (hasExtensionStorage()) {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: settings });
    } catch (err) {
      console.warn("chrome.storage.local.set failed", err);
    }
  }
  notify();
  return settings;
}

// src/lib/dom.ts
function requireEl(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required element #${id}`);
  return el;
}
function applyFeatureVisibility(flags) {
  document.querySelectorAll("[data-feature]").forEach((el) => {
    const name = el.dataset.feature;
    if (!name) return;
    const on = flags[name] === true;
    el.hidden = !on;
    el.classList.toggle("feature-off", !on);
  });
}

// src/ui/refs.ts
var els = {
  clock: requireEl("clock"),
  ageDisplay: requireEl("age-display"),
  ageLabel: requireEl("age-label"),
  deathCountdown: requireEl("death-countdown"),
  lifeSegments: requireEl("life-segments"),
  lifeBadge: requireEl("life-badge"),
  lifePane: requireEl("life-pane"),
  ringProgress: requireEl("ring-progress"),
  ringRemaining: requireEl("ring-remaining"),
  ringTicks: requireEl("ring-ticks"),
  bgLayer: requireEl("bg-layer"),
  settingsToggle: requireEl("settings-toggle"),
  settingsDialog: requireEl("settings-dialog"),
  settingsForm: requireEl("settings-form"),
  settingsCancel: requireEl("settings-cancel"),
  birthDate: requireEl("birth-date"),
  birthTime: requireEl("birth-time"),
  lifespan: requireEl("lifespan"),
  showDeath: requireEl("show-death"),
  bgImage: requireEl("bg-image"),
  zipCode: requireEl("zip-code"),
  weatherBadge: requireEl("weather-badge"),
  weatherSetup: requireEl("weather-setup"),
  weatherLive: requireEl("weather-live"),
  wxTemp: requireEl("wx-temp"),
  wxPlace: requireEl("wx-place"),
  wxHumidity: requireEl("wx-humidity"),
  wxWind: requireEl("wx-wind"),
  wxSunrise: requireEl("wx-sunrise"),
  wxSunset: requireEl("wx-sunset"),
  wxHours: requireEl("wx-hours"),
  wxTemps: requireEl("wx-temps"),
  wxWinds: requireEl("wx-winds"),
  wxUvs: requireEl("wx-uvs"),
  wxBars: requireEl("wx-bars"),
  wxWindBars: requireEl("wx-wind-bars"),
  wxUvBars: requireEl("wx-uv-bars"),
  wxSky: requireEl("wx-sky"),
  wxWindIco: requireEl("wx-wind-ico"),
  wxHumBar: requireEl("wx-hum-bar"),
  wxUv: requireEl("wx-uv"),
  wxError: requireEl("wx-error")
};
function getRoomEls() {
  const ids = [
    "room-json-url",
    "room-badge",
    "room-status",
    "room-log",
    "room-refresh",
    "img-tooltip",
    "img-tooltip-src"
  ];
  for (const id of ids) {
    if (!document.getElementById(id)) return null;
  }
  return {
    roomJsonUrl: requireEl("room-json-url"),
    roomBadge: requireEl("room-badge"),
    roomStatus: requireEl("room-status"),
    roomLog: requireEl("room-log"),
    roomRefresh: requireEl("room-refresh"),
    imgTooltip: requireEl("img-tooltip"),
    imgTooltipSrc: requireEl("img-tooltip-src")
  };
}

// src/features/life/life-pane.ts
var RING_R = 82;
var RING_CX = 100;
var RING_CY = 100;
var ticksDrawnFor = null;
function updateClock() {
  const now = /* @__PURE__ */ new Date();
  els.clock.textContent = formatClock(now);
  els.clock.dateTime = now.toISOString();
}
function ensureRingTicks(lifespanYears) {
  const n = Math.max(1, Math.min(150, Math.round(lifespanYears)));
  if (ticksDrawnFor === n) return;
  ticksDrawnFor = n;
  const frag = document.createDocumentFragment();
  const outer = RING_R + 6;
  const innerYear = RING_R + 1;
  const innerDecade = RING_R - 2;
  for (let i = 0; i < n; i++) {
    const angle = i / n * Math.PI * 2;
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
function updateRing(livedFraction) {
  const lived = Math.max(0, Math.min(1, livedFraction)) * 100;
  const remain = 100 - lived;
  els.ringProgress.style.strokeDasharray = `${lived} ${100 - lived}`;
  els.ringRemaining.style.strokeDasharray = `0 ${lived} ${remain} 0`;
}
function updateAge() {
  const settings2 = getSettings();
  const birth = parseBirthDateTime(settings2.birthDate, settings2.birthTime);
  const lifespan = Number(settings2.lifespan) || 80;
  ensureRingTicks(lifespan);
  if (!birth) {
    els.lifePane.classList.add("needs-setup");
    els.ageDisplay.textContent = "set birth date";
    els.ageLabel.textContent = "\u2699 settings to start";
    els.deathCountdown.hidden = true;
    els.lifeSegments.textContent = "life ring idle \xB7 no birthday yet";
    els.lifeBadge.textContent = "setup";
    updateRing(0);
    return;
  }
  els.lifePane.classList.remove("needs-setup");
  const now = /* @__PURE__ */ new Date();
  const years = ageInYears(birth, now);
  const fraction = years / lifespan;
  els.ageDisplay.textContent = formatAge(years);
  els.ageLabel.textContent = "years old";
  els.lifeBadge.textContent = `${Math.min(100, fraction * 100).toFixed(1)}%`;
  updateRing(fraction);
  const wholeYears = Math.floor(years);
  const decade = Math.floor(years / 10) * 10;
  const yearInDecade = wholeYears - decade;
  els.lifeSegments.textContent = `segment ${wholeYears + 1}/${lifespan} \xB7 decade ${decade}\u2013${decade + 9} \xB7 +${yearInDecade}y in block \xB7 ${Math.max(0, lifespan - years).toFixed(2)}y est. left`;
  if (settings2.showDeath) {
    const death = expectedDeathDate(birth, lifespan);
    const remaining = death.getTime() - now.getTime();
    if (remaining > 0) {
      els.deathCountdown.textContent = `~${formatDuration(remaining)} left @ ${lifespan}y`;
    } else {
      els.deathCountdown.textContent = "outlived the estimate \xB7 keep going";
    }
    els.deathCountdown.hidden = false;
  } else {
    els.deathCountdown.hidden = true;
  }
}
function tickLife() {
  updateClock();
  updateAge();
}
function initLifePane() {
  tickLife();
  setInterval(tickLife, 50);
}

// src/features/room/room-pane.ts
var ROOM_DEMO_PATH = "examples/room-feed.example.json";
var URL_IN_TEXT_RE = /(https?:\/\/[^\s<>"']+)/gi;
var roomEls = null;
var roomFetchInFlight = false;
var lastRoomUrl = "";
function setRoomStatus(text) {
  if (!roomEls) return;
  roomEls.roomStatus.textContent = text;
}
function demoRoomFeedUrl() {
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(ROOM_DEMO_PATH);
  }
  return ROOM_DEMO_PATH;
}
function resolveRoomFeedUrl() {
  const configured = (getSettings().roomJsonUrl || "").trim();
  if (configured) {
    return { url: configured, label: configured, isDemo: false };
  }
  const demo = demoRoomFeedUrl();
  return { url: demo, label: "bundled example snapshot", isDemo: true };
}
function hideImgTooltip() {
  if (!roomEls) return;
  roomEls.imgTooltip.hidden = true;
  roomEls.imgTooltipSrc.removeAttribute("src");
}
function showImgTooltip(src, clientX, clientY) {
  if (!roomEls) return;
  roomEls.imgTooltipSrc.src = src;
  roomEls.imgTooltip.hidden = false;
  const gap = 12;
  const tw = 280;
  const th = 220;
  let left = clientX + gap;
  let top = clientY + gap;
  if (left + tw > window.innerWidth) left = clientX - tw - gap;
  if (top + th > window.innerHeight) top = clientY - th - gap;
  roomEls.imgTooltip.style.left = `${Math.max(4, left)}px`;
  roomEls.imgTooltip.style.top = `${Math.max(4, top)}px`;
}
function renderRoomText(container, text, images) {
  container.replaceChildren();
  const parts = text.split(/(\[img\])/i);
  let imgIdx = 0;
  for (const part of parts) {
    if (/^\[img\]$/i.test(part)) {
      const src = images[imgIdx++];
      const span = document.createElement("span");
      span.className = "room-img-ref";
      span.textContent = "[img]";
      if (src) {
        span.dataset.src = src;
        span.title = "hover preview";
        span.addEventListener("mouseenter", (ev) => {
          showImgTooltip(src, ev.clientX, ev.clientY);
        });
        span.addEventListener("mousemove", (ev) => {
          if (roomEls && !roomEls.imgTooltip.hidden) {
            showImgTooltip(src, ev.clientX, ev.clientY);
          }
        });
        span.addEventListener("mouseleave", hideImgTooltip);
      }
      container.appendChild(span);
      container.appendChild(document.createTextNode(" "));
      continue;
    }
    let last = 0;
    const re = new RegExp(URL_IN_TEXT_RE.source, "gi");
    let m;
    while ((m = re.exec(part)) !== null) {
      if (m.index > last) {
        container.appendChild(document.createTextNode(part.slice(last, m.index)));
      }
      const href = m[1] || m[0] || "";
      const a = document.createElement("a");
      a.className = "room-link";
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = href;
      container.appendChild(a);
      last = m.index + m[0].length;
    }
    if (last < part.length) {
      container.appendChild(document.createTextNode(part.slice(last)));
    }
  }
  while (imgIdx < images.length) {
    const src = images[imgIdx++];
    if (!src) continue;
    container.appendChild(document.createTextNode(" "));
    const span = document.createElement("span");
    span.className = "room-img-ref";
    span.textContent = "[img]";
    span.dataset.src = src;
    span.title = "hover preview";
    span.addEventListener(
      "mouseenter",
      (ev) => showImgTooltip(src, ev.clientX, ev.clientY)
    );
    span.addEventListener("mousemove", (ev) => {
      if (roomEls && !roomEls.imgTooltip.hidden) {
        showImgTooltip(src, ev.clientX, ev.clientY);
      }
    });
    span.addEventListener("mouseleave", hideImgTooltip);
    container.appendChild(span);
  }
}
function normalizeRoomFeed(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("snapshot is not a JSON object");
  }
  const obj = raw;
  const list = Array.isArray(obj.messages) ? obj.messages : [];
  const messages = [];
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    if (!row || typeof row !== "object") continue;
    const m = row;
    const user = String(m.user ?? m.author ?? m.name ?? "unknown").trim() || "unknown";
    const time = String(m.time ?? m.date ?? m.timestamp ?? "").trim();
    let text = String(m.text ?? m.body ?? m.message ?? "").trim();
    const images = Array.isArray(m.images) ? m.images.map((x) => String(x)).filter(Boolean) : [];
    if (!text && images.length === 0) continue;
    if (!text && images.length) text = "[img]";
    const id = String(m.id ?? `${user}-${time}-${i}`);
    messages.push({ id, user, time, text, images });
  }
  return {
    version: typeof obj.version === "number" ? obj.version : 1,
    updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : void 0,
    source: typeof obj.source === "string" ? obj.source : void 0,
    messages
  };
}
function renderRoomFeed(feed, meta) {
  if (!roomEls) return;
  roomEls.roomLog.replaceChildren();
  setRoomStatus(meta);
  if (!feed.messages.length) {
    const empty = document.createElement("p");
    empty.className = "room-empty";
    empty.textContent = "no messages in snapshot";
    roomEls.roomLog.appendChild(empty);
    return;
  }
  const stickToBottom = roomEls.roomLog.scrollHeight - roomEls.roomLog.scrollTop - roomEls.roomLog.clientHeight < 40;
  for (const msg of feed.messages) {
    const row = document.createElement("article");
    row.className = "room-msg";
    row.dataset.id = msg.id;
    const head = document.createElement("div");
    head.className = "room-msg-head";
    const user = document.createElement("span");
    user.className = "room-user";
    user.textContent = msg.user;
    head.appendChild(user);
    if (msg.time) {
      const time = document.createElement("span");
      time.className = "room-time";
      time.textContent = msg.time;
      head.appendChild(time);
    }
    row.appendChild(head);
    const body = document.createElement("div");
    body.className = "room-text";
    renderRoomText(body, msg.text, msg.images || []);
    row.appendChild(body);
    roomEls.roomLog.appendChild(row);
  }
  if (stickToBottom || roomEls.roomLog.dataset.initial !== "0") {
    roomEls.roomLog.scrollTop = roomEls.roomLog.scrollHeight;
    roomEls.roomLog.dataset.initial = "0";
  }
}
function formatRoomUpdated(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}
async function refreshRoom(opts = {}) {
  if (!roomEls) return;
  const { url, label, isDemo } = resolveRoomFeedUrl();
  if (!opts.force && url === lastRoomUrl && roomEls.roomLog.childElementCount > 0) {
    return;
  }
  if (roomFetchInFlight) return;
  roomFetchInFlight = true;
  roomEls.roomBadge.textContent = "\u2026";
  roomEls.roomBadge.classList.add("dim");
  setRoomStatus(
    isDemo ? "demo snapshot \xB7 loading\u2026" : `loading snapshot \xB7 ${label}\u2026`
  );
  try {
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json" }
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText || ""}`.trim());
    }
    const raw = await res.json();
    const feed = normalizeRoomFeed(raw);
    lastRoomUrl = url;
    const when = formatRoomUpdated(feed.updatedAt);
    const hostLabel = (() => {
      if (isDemo) return "example";
      try {
        return new URL(url).host;
      } catch {
        return "snapshot";
      }
    })();
    roomEls.roomBadge.textContent = String(feed.messages.length);
    roomEls.roomBadge.classList.remove("dim");
    const meta = [
      hostLabel,
      `${feed.messages.length} msgs`,
      when,
      feed.source ? feed.source.slice(0, 40) : "",
      isDemo ? "demo" : "snapshot",
      "\u21BB"
    ].filter(Boolean).join(" \xB7 ");
    renderRoomFeed(feed, meta);
  } catch (err) {
    console.warn("room snapshot failed", err);
    const msg = err instanceof Error ? err.message : String(err);
    roomEls.roomBadge.textContent = "err";
    roomEls.roomBadge.classList.add("dim");
    roomEls.roomLog.replaceChildren();
    roomEls.roomLog.dataset.initial = "1";
    const p = document.createElement("p");
    p.className = "room-empty";
    p.textContent = isDemo ? `demo load failed \xB7 ${msg}` : `could not load snapshot \xB7 ${msg} \xB7 run scrape + serve, or check URL`;
    roomEls.roomLog.appendChild(p);
    setRoomStatus(isDemo ? `demo \xB7 error` : `error \xB7 ${label}`);
  } finally {
    roomFetchInFlight = false;
  }
}
function getLastRoomUrl() {
  return lastRoomUrl;
}
function fillRoomSettingsField() {
  if (!roomEls) return;
  roomEls.roomJsonUrl.value = getSettings().roomJsonUrl || "";
}
function readRoomSettingsField() {
  if (!roomEls) return "";
  return (roomEls.roomJsonUrl.value || "").trim();
}
function initRoomPane(els2) {
  roomEls = els2;
  roomEls.roomRefresh.addEventListener("click", () => {
    void refreshRoom({ force: true });
  });
  void refreshRoom();
}

// src/features/weather/weather-pane.ts
var WEATHER_REFRESH_MS = 15 * 60 * 1e3;
var WEATHER_CACHE_MS = 10 * 60 * 1e3;
var weatherCache = null;
var weatherFetchInFlight = false;
var lastWeatherZip = "";
function normalizeZip(raw) {
  return String(raw || "").trim();
}
function getLastWeatherZip() {
  return lastWeatherZip;
}
function windArrow(deg) {
  if (deg == null || Number.isNaN(Number(deg))) return "";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const i = Math.round((Number(deg) % 360 + 360) % 360 / 45) % 8;
  return dirs[i] ?? "";
}
function windGlyph(deg) {
  if (deg == null || Number.isNaN(Number(deg))) return "\u2248";
  const glyphs = ["\u2191", "\u2197", "\u2192", "\u2198", "\u2193", "\u2199", "\u2190", "\u2196"];
  const i = Math.round((Number(deg) % 360 + 360) % 360 / 45) % 8;
  return glyphs[i] ?? "\u2248";
}
function skyGlyph(code) {
  const c = Number(code);
  if (Number.isNaN(c)) return "\xB7";
  if (c === 0) return "\u2600";
  if (c <= 2) return "\u2601";
  if (c === 3) return "\u2592";
  if (c === 45 || c === 48) return "\u2261";
  if (c >= 51 && c <= 67) return "\u2602";
  if (c >= 71 && c <= 77) return "\u2744";
  if (c >= 80 && c <= 82) return "\u2614";
  if (c >= 95) return "\u26A1";
  return "\xB7";
}
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
function windColor(mph) {
  const w = Number(mph);
  if (Number.isNaN(w)) return "var(--text-muted)";
  if (w < 5) return "#6a8f88";
  if (w < 10) return "#5a9e96";
  if (w < 15) return "#4aafb0";
  if (w < 25) return "#3a9ec4";
  return "#5a7ec4";
}
function uvColor(uv) {
  const u = Number(uv);
  if (Number.isNaN(u)) return "var(--text-muted)";
  if (u < 3) return "#4aaf6a";
  if (u < 6) return "#c4b050";
  if (u < 8) return "#d4895a";
  if (u < 11) return "#c45a5a";
  return "#9a5ac4";
}
function asciiMeter(pct, width = 8) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const filled = Math.round(p / 100 * width);
  return "\u2593".repeat(filled) + "\u2591".repeat(width - filled);
}
function fillColoredCells(container, values, colorFn, className = "") {
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
function renderMetricBars(container, values, colorFn, opts = {}) {
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
      const h = Math.max(4, Math.round(4 + (n - min) / span * (chartPx - 4)));
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
  const m = /T(\d{2})/.exec(isoLocal);
  if (!m?.[1]) return "\u2014";
  const h = Number(m[1]);
  const suffix = h >= 12 ? "p" : "a";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${suffix}`;
}
function formatSunTime(iso) {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const m = /T(\d{2}):(\d{2})/.exec(iso);
    return m ? `${m[1]}:${m[2]}` : "\u2014";
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
    els.weatherSetup.replaceChildren();
    const p1 = document.createElement("p");
    p1.className = "muted";
    p1.textContent = message;
    const p2 = document.createElement("p");
    p2.className = "muted";
    p2.textContent = "temp \xB7 humidity \xB7 wind \xB7 sun \xB7 12h";
    els.weatherSetup.append(p1, p2);
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
async function geocodeZip(zip) {
  const cleaned = normalizeZip(zip);
  const usZip = /^(\d{5})(?:-\d{4})?$/.exec(cleaned);
  if (usZip?.[1]) {
    const res2 = await fetch(`https://api.zippopotam.us/us/${usZip[1]}`);
    if (!res2.ok) throw new Error(`zip lookup failed (${res2.status})`);
    const data2 = await res2.json();
    const place = data2.places?.[0];
    if (!place) throw new Error("zip not found");
    return {
      lat: Number(place.latitude),
      lon: Number(place.longitude),
      label: `${place["place name"]}, ${place["state abbreviation"]} ${usZip[1]}`
    };
  }
  const q = encodeURIComponent(cleaned);
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=1&language=en&format=json`
  );
  if (!res.ok) throw new Error(`geocode failed (${res.status})`);
  const data = await res.json();
  const hit = data.results?.[0];
  if (!hit) throw new Error("location not found");
  const parts = [hit.name, hit.admin1, hit.country_code].filter(Boolean);
  return {
    lat: hit.latitude,
    lon: hit.longitude,
    label: parts.join(", ")
  };
}
async function fetchOpenMeteo(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "wind_speed_10m",
      "wind_direction_10m",
      "weather_code"
    ].join(","),
    hourly: [
      "temperature_2m",
      "wind_speed_10m",
      "wind_direction_10m",
      "uv_index"
    ].join(","),
    daily: ["sunrise", "sunset", "uv_index_max"].join(","),
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    timezone: "auto",
    forecast_days: "2"
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`forecast failed (${res.status})`);
  return await res.json();
}
function sliceNext12Hours(hourly) {
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
    if (!Number.isNaN(t) && t >= now - 30 * 60 * 1e3) {
      start = i;
      break;
    }
    start = i;
  }
  const end = Math.min(times.length, start + 12);
  const hours = [];
  for (let i = start; i < end; i++) {
    const time = times[i];
    if (!time) continue;
    hours.push({
      time,
      temp: temps[i],
      wind: winds[i],
      windDir: windDirs[i],
      uv: uvs[i]
    });
  }
  return hours;
}
function renderWeather(payload) {
  const { label, forecast } = payload;
  const cur = forecast.current ?? {};
  const hours = sliceNext12Hours(forecast.hourly ?? {});
  els.weatherSetup.hidden = true;
  els.weatherLive.hidden = false;
  els.wxError.hidden = true;
  const temp = cur.temperature_2m;
  const tempN = temp != null ? Number(temp) : NaN;
  els.wxTemp.textContent = !Number.isNaN(tempN) ? `${Math.round(tempN)}\xB0F` : "\u2014";
  els.wxTemp.style.color = !Number.isNaN(tempN) ? tempColor(tempN) : "";
  els.wxTemp.style.textShadow = !Number.isNaN(tempN) ? `0 0 18px ${tempColor(tempN)}66` : "";
  els.wxPlace.textContent = label || "";
  els.wxSky.textContent = skyGlyph(cur.weather_code);
  els.wxSky.title = `weather code ${cur.weather_code ?? "\u2014"}`;
  const hum = cur.relative_humidity_2m;
  els.wxHumidity.textContent = hum != null ? String(Math.round(hum)) : "\u2014";
  els.wxHumBar.textContent = hum != null ? asciiMeter(hum) : "";
  const wSpeed = cur.wind_speed_10m;
  const wDir = windArrow(cur.wind_direction_10m);
  const wGlyph = windGlyph(cur.wind_direction_10m);
  els.wxWindIco.textContent = wGlyph;
  els.wxWind.textContent = wSpeed != null ? `${Math.round(Number(wSpeed))} mph${wDir ? ` ${wDir}` : ""}` : "\u2014";
  if (wSpeed != null) els.wxWind.style.color = windColor(wSpeed);
  const firstUv = hours[0]?.uv;
  const dailyUv = forecast.daily?.uv_index_max?.[0];
  const uvNow = firstUv != null ? Number(firstUv) : dailyUv != null ? Number(dailyUv) : NaN;
  els.wxUv.textContent = !Number.isNaN(uvNow) ? uvNow.toFixed(1) : "\u2014";
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
    "wx-hr"
  );
  fillColoredCells(
    els.wxTemps,
    hours.map((h) => ({
      n: h.temp,
      text: h.temp != null ? String(Math.round(Number(h.temp))) : "\u2014"
    })),
    tempColor
  );
  renderMetricBars(els.wxBars, temps, tempColor, { chartPx: 42 });
  fillColoredCells(
    els.wxWinds,
    hours.map((h) => ({
      n: h.wind,
      text: h.wind != null ? String(Math.round(Number(h.wind))) : "\u2014"
    })),
    windColor
  );
  renderMetricBars(els.wxWindBars, winds, windColor, {
    minFloor: 0,
    chartPx: 32
  });
  fillColoredCells(
    els.wxUvs,
    hours.map((h) => ({
      n: h.uv,
      text: h.uv != null && !Number.isNaN(Number(h.uv)) ? Number(h.uv).toFixed(Number(h.uv) >= 10 ? 0 : 1) : "\u2014"
    })),
    uvColor
  );
  renderMetricBars(els.wxUvBars, uvs, uvColor, {
    minFloor: 0,
    maxCeil: 11,
    chartPx: 32
  });
  els.weatherBadge.textContent = "live";
  els.weatherBadge.classList.remove("dim");
}
async function refreshWeather(opts = {}) {
  const force = opts.force ?? false;
  const zip = normalizeZip(getSettings().zipCode);
  if (!zip) {
    showWeatherSetup("set zip code in settings");
    lastWeatherZip = "";
    return;
  }
  const cacheHit = !force && weatherCache && weatherCache.zip === zip && Date.now() - weatherCache.at < WEATHER_CACHE_MS;
  if (cacheHit && weatherCache) {
    renderWeather(weatherCache.data);
    return;
  }
  if (weatherFetchInFlight) return;
  weatherFetchInFlight = true;
  els.weatherBadge.textContent = "\u2026";
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
      els.wxError.textContent = `stale \xB7 ${msg}`;
    } else {
      showWeatherError(msg);
    }
  } finally {
    weatherFetchInFlight = false;
  }
}
function initWeatherPane() {
  void refreshWeather();
  setInterval(() => {
    void refreshWeather();
  }, WEATHER_REFRESH_MS);
}

// src/ui/background.ts
function applyBackground() {
  const url = (getSettings().bgImage || "").trim();
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

// src/ui/settings-dialog.ts
function fillForm() {
  const settings2 = getSettings();
  els.birthDate.value = settings2.birthDate || "";
  const t = settings2.birthTime || "00:00:00";
  els.birthTime.value = t.length >= 8 ? t.slice(0, 8) : t.slice(0, 5);
  els.lifespan.value = String(settings2.lifespan ?? 80);
  els.showDeath.checked = Boolean(settings2.showDeath);
  els.zipCode.value = settings2.zipCode || "";
  els.bgImage.value = settings2.bgImage || "";
  if (isFeatureEnabled("room")) {
    fillRoomSettingsField();
  }
}
function openSettings() {
  fillForm();
  els.settingsDialog.showModal();
}
function closeSettings() {
  if (els.settingsDialog.open) els.settingsDialog.close();
}
function initSettingsDialog() {
  els.settingsToggle.addEventListener("click", openSettings);
  els.settingsCancel.addEventListener("click", (e) => {
    e.preventDefault();
    closeSettings();
  });
  els.settingsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const prev = getSettings();
    const prevZip = normalizeZip(prev.zipCode);
    const prevRoom = (prev.roomJsonUrl || "").trim();
    await saveSettings({
      birthDate: els.birthDate.value,
      birthTime: els.birthTime.value || "00:00:00",
      lifespan: Number(els.lifespan.value) || 80,
      showDeath: els.showDeath.checked,
      zipCode: normalizeZip(els.zipCode.value),
      roomJsonUrl: isFeatureEnabled("room") ? readRoomSettingsField() : prev.roomJsonUrl,
      bgImage: (els.bgImage.value || "").trim()
    });
    applyBackground();
    closeSettings();
    tickLife();
    const next = getSettings();
    const nextZip = normalizeZip(next.zipCode);
    await refreshWeather({
      force: nextZip !== prevZip || nextZip !== getLastWeatherZip()
    });
    if (isFeatureEnabled("room")) {
      const nextRoom = (next.roomJsonUrl || "").trim();
      await refreshRoom({
        force: nextRoom !== prevRoom || nextRoom !== getLastRoomUrl()
      });
    }
  });
}

// src/main.ts
async function bootstrap() {
  applyFeatureVisibility(FEATURES);
  await loadSettings();
  applyBackground();
  initSettingsDialog();
  initLifePane();
  if (isFeatureEnabled("weather")) {
    initWeatherPane();
  }
  if (isFeatureEnabled("room")) {
    const roomEls2 = getRoomEls();
    if (roomEls2) {
      initRoomPane(roomEls2);
    } else {
      console.warn("[newtab] FEATURES.room on but room DOM missing");
    }
  } else {
    console.info(
      "[newtab] room feature flagged off (login/scrape TBD) \u2014 enable in src/config/features.ts"
    );
  }
  if (!getSettings().birthDate) {
    setTimeout(openSettings, 350);
  }
}
void bootstrap().catch((err) => {
  console.error("[newtab] bootstrap failed", err);
});
