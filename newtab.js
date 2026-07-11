// src/config/features.ts
var FEATURES = {
  /** Life ring + age clock (core). */
  life: true,
  /** Weather TUI via Open-Meteo. */
  weather: true,
  /** Spotify now-playing (needs client id/secret + user OAuth). */
  spotify: true,
  /**
   * Room snapshot JSON (recent shouts).
   * Disabled: needs login-aware scrape on the backend first.
   */
  room: false,
  /** Etymology / Root of the Day (mock TUI) */
  etymology: true,
  /** Anglish Germanic alternatives (mock TUI) */
  anglish: true
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
  bgImage: "",
  spotifyClientId: "",
  spotifyClientSecret: ""
};
var STORAGE_KEY = "newTabSettings";
var SPOTIFY_AUTH_KEY = "spotifyAuth";

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
  settings = { ...DEFAULTS, ...settings, ...next };
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
  wxSkyHome: requireEl("wx-sky-home"),
  wxTempHome: requireEl("wx-temp-home"),
  wxPlaceHome: requireEl("wx-place-home"),
  wxClockHome: requireEl("wx-clock-home"),
  wxSkyLondon: requireEl("wx-sky-london"),
  wxTempLondon: requireEl("wx-temp-london"),
  wxPlaceLondon: requireEl("wx-place-london"),
  wxClockLondon: requireEl("wx-clock-london"),
  wxSkyKnoxville: requireEl("wx-sky-knoxville"),
  wxTempKnoxville: requireEl("wx-temp-knoxville"),
  wxPlaceKnoxville: requireEl("wx-place-knoxville"),
  wxClockKnoxville: requireEl("wx-clock-knoxville"),
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
  wxDay5Temps: requireEl("wx-day5-temps"),
  wxDay5Winds: requireEl("wx-day5-winds"),
  wxSpfUv: requireEl("wx-spf-uv"),
  wxSpfNeedle: requireEl("wx-spf-needle"),
  wxSpfWarn: requireEl("wx-spf-warn"),
  wxWindIco: requireEl("wx-wind-ico"),
  wxHumBar: requireEl("wx-hum-bar"),
  wxUv: requireEl("wx-uv"),
  wxError: requireEl("wx-error"),
  // Spotify
  spotifyBadge: requireEl("spotify-badge"),
  spotifyRefresh: requireEl("spotify-refresh"),
  spotifySetup: requireEl("spotify-setup"),
  spotifyAuth: requireEl("spotify-auth"),
  spotifyConnect: requireEl("spotify-connect"),
  spotifyIdle: requireEl("spotify-idle"),
  spotifyLive: requireEl("spotify-live"),
  spotifyError: requireEl("spotify-error"),
  spotifyDisconnect: requireEl("spotify-disconnect"),
  spArt: requireEl("sp-art"),
  spTrack: requireEl("sp-track"),
  spArtist: requireEl("sp-artist"),
  spAlbum: requireEl("sp-album"),
  spProgressText: requireEl("sp-progress-text"),
  spBarFill: requireEl("sp-bar-fill"),
  spotifyClientId: requireEl("spotify-client-id"),
  spotifyClientSecret: requireEl("spotify-client-secret"),
  spotifyRedirectUri: requireEl("spotify-redirect-uri")
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
var AGE_MS = 250;
var SLOW_MS = 1e3;
var ticksDrawnFor = null;
var ageTimer = null;
var slowTimer = null;
var lastClockText = "";
var lastAgeText = "";
var lastAgeLabel = "";
var lastBadge = "";
var lastSegments = "";
var lastDeathText = "";
var lastDeathHidden = null;
var lastRingKey = "";
var lastNeedsSetup = null;
function setTextIfChanged(el, next, prev) {
  if (next === prev) return prev;
  el.textContent = next;
  return next;
}
function updateClock() {
  const now = /* @__PURE__ */ new Date();
  const text = formatClock(now);
  if (text === lastClockText) return;
  lastClockText = text;
  els.clock.textContent = text;
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
  const lived = Math.round(Math.max(0, Math.min(1, livedFraction)) * 1e3) / 10;
  const key = String(lived);
  if (key === lastRingKey) return;
  lastRingKey = key;
  const remain = 100 - lived;
  els.ringProgress.style.strokeDasharray = `${lived} ${100 - lived}`;
  els.ringRemaining.style.strokeDasharray = `0 ${lived} ${remain} 0`;
}
function updateAgeDigitsOnly() {
  const settings2 = getSettings();
  const birth = parseBirthDateTime(settings2.birthDate, settings2.birthTime);
  if (!birth) return;
  const years = ageInYears(birth);
  lastAgeText = setTextIfChanged(els.ageDisplay, formatAge(years), lastAgeText);
}
function updateAge(opts = {}) {
  const full = opts.full !== false;
  const settings2 = getSettings();
  const birth = parseBirthDateTime(settings2.birthDate, settings2.birthTime);
  const lifespan = Number(settings2.lifespan) || 80;
  if (full) {
    ensureRingTicks(lifespan);
  }
  if (!birth) {
    if (lastNeedsSetup !== true) {
      els.lifePane.classList.add("needs-setup");
      lastNeedsSetup = true;
    }
    lastAgeText = setTextIfChanged(els.ageDisplay, "set birth date", lastAgeText);
    lastAgeLabel = setTextIfChanged(els.ageLabel, "\u2699 settings to start", lastAgeLabel);
    if (lastDeathHidden !== true) {
      els.deathCountdown.hidden = true;
      lastDeathHidden = true;
    }
    lastSegments = setTextIfChanged(
      els.lifeSegments,
      "life ring idle \xB7 no birthday yet",
      lastSegments
    );
    lastBadge = setTextIfChanged(els.lifeBadge, "setup", lastBadge);
    if (full) updateRing(0);
    return;
  }
  if (lastNeedsSetup !== false) {
    els.lifePane.classList.remove("needs-setup");
    lastNeedsSetup = false;
  }
  const now = /* @__PURE__ */ new Date();
  const years = ageInYears(birth, now);
  const fraction = years / lifespan;
  lastAgeText = setTextIfChanged(els.ageDisplay, formatAge(years), lastAgeText);
  lastAgeLabel = setTextIfChanged(els.ageLabel, "years old", lastAgeLabel);
  if (!full) return;
  lastBadge = setTextIfChanged(
    els.lifeBadge,
    `${Math.min(100, fraction * 100).toFixed(1)}%`,
    lastBadge
  );
  updateRing(fraction);
  const wholeYears = Math.floor(years);
  const decade = Math.floor(years / 10) * 10;
  const yearInDecade = wholeYears - decade;
  lastSegments = setTextIfChanged(
    els.lifeSegments,
    `segment ${wholeYears + 1}/${lifespan} \xB7 decade ${decade}\u2013${decade + 9} \xB7 +${yearInDecade}y in block \xB7 ${Math.max(0, lifespan - years).toFixed(2)}y est. left`,
    lastSegments
  );
  if (settings2.showDeath) {
    const death = expectedDeathDate(birth, lifespan);
    const remaining = death.getTime() - now.getTime();
    const deathText = remaining > 0 ? `~${formatDuration(remaining)} left @ ${lifespan}y` : "outlived the estimate \xB7 keep going";
    lastDeathText = setTextIfChanged(els.deathCountdown, deathText, lastDeathText);
    if (lastDeathHidden !== false) {
      els.deathCountdown.hidden = false;
      lastDeathHidden = false;
    }
  } else if (lastDeathHidden !== true) {
    els.deathCountdown.hidden = true;
    lastDeathHidden = true;
  }
}
function tickLife() {
  updateClock();
  updateAge({ full: true });
}
function stopLifeTimers() {
  if (ageTimer != null) {
    clearInterval(ageTimer);
    ageTimer = null;
  }
  if (slowTimer != null) {
    clearInterval(slowTimer);
    slowTimer = null;
  }
}
function startLifeTimers() {
  stopLifeTimers();
  tickLife();
  ageTimer = setInterval(updateAgeDigitsOnly, AGE_MS);
  slowTimer = setInterval(() => {
    updateClock();
    updateAge({ full: true });
  }, SLOW_MS);
}
function initLifePane() {
  startLifeTimers();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopLifeTimers();
    } else {
      startLifeTimers();
    }
  });
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

// src/features/spotify/auth.ts
var TOKEN_URL = "https://accounts.spotify.com/api/token";
var AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
var SPOTIFY_SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state"
].join(" ");
var EXPIRY_SKEW_MS = 6e4;
function hasExtensionStorage2() {
  return typeof chrome !== "undefined" && chrome?.storage?.local != null;
}
function hasIdentityApi() {
  return typeof chrome !== "undefined" && chrome?.identity != null;
}
function getSpotifyRedirectUri() {
  if (!hasIdentityApi() || typeof chrome.identity.getRedirectURL !== "function") {
    return null;
  }
  try {
    return chrome.identity.getRedirectURL();
  } catch {
    return null;
  }
}
function hasSpotifyCredentials() {
  const s = getSettings();
  return Boolean(s.spotifyClientId?.trim() && s.spotifyClientSecret?.trim());
}
async function loadSpotifyAuth() {
  if (hasExtensionStorage2()) {
    try {
      const result = await chrome.storage.local.get(SPOTIFY_AUTH_KEY);
      const raw = result[SPOTIFY_AUTH_KEY];
      if (isSpotifyAuth(raw)) return raw;
    } catch {
    }
  }
  try {
    const raw = localStorage.getItem(SPOTIFY_AUTH_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isSpotifyAuth(parsed)) return parsed;
    }
  } catch {
  }
  return null;
}
async function saveSpotifyAuth(auth) {
  if (hasExtensionStorage2()) {
    try {
      await chrome.storage.local.set({ [SPOTIFY_AUTH_KEY]: auth });
    } catch (err) {
      console.warn("[spotify] save auth failed", err);
    }
  }
  try {
    localStorage.setItem(SPOTIFY_AUTH_KEY, JSON.stringify(auth));
  } catch {
  }
}
async function clearSpotifyAuth() {
  if (hasExtensionStorage2()) {
    try {
      await chrome.storage.local.remove(SPOTIFY_AUTH_KEY);
    } catch {
    }
  }
  try {
    localStorage.removeItem(SPOTIFY_AUTH_KEY);
  } catch {
  }
}
function isSpotifyAuth(value) {
  if (typeof value !== "object" || value === null) return false;
  const v = value;
  return typeof v.accessToken === "string" && typeof v.refreshToken === "string" && typeof v.expiresAt === "number";
}
function randomState(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}
function basicAuthHeader(clientId, clientSecret) {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}
async function exchangeToken(body, clientId, clientSecret) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(clientId, clientSecret)
    },
    body
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Token exchange failed (${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`
    );
  }
  return await res.json();
}
function authFromTokenResponse(data, prevRefresh) {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || prevRefresh || "",
    expiresAt: Date.now() + data.expires_in * 1e3,
    scope: data.scope
  };
}
async function connectSpotify() {
  if (!hasSpotifyCredentials()) {
    throw new Error("Add Spotify Client ID and Secret in settings first.");
  }
  if (!hasIdentityApi()) {
    throw new Error(
      "Spotify auth needs the extension (chrome.identity). Load unpacked in brave://extensions."
    );
  }
  const clientId = getSettings().spotifyClientId.trim();
  const clientSecret = getSettings().spotifyClientSecret.trim();
  const redirectUri = getSpotifyRedirectUri();
  if (!redirectUri) {
    throw new Error("Could not get chrome.identity redirect URL.");
  }
  const state = randomState();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES,
    state,
    show_dialog: "true"
  });
  const authUrl = `${AUTHORIZE_URL}?${params.toString()}`;
  console.log("[spotify] starting OAuth, redirectUri=", redirectUri);
  console.log("[spotify] authUrl=", authUrl);
  let responseUrl;
  try {
    responseUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: authUrl, interactive: true },
        (url) => {
          console.log("[spotify] launchWebAuthFlow callback url=", url, "lastError=", chrome.runtime.lastError);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(url);
        }
      );
    });
    console.log("[spotify] got responseUrl=", responseUrl);
  } catch (err2) {
    const msg = err2 instanceof Error ? err2.message : String(err2);
    if (/canceled|cancelled|user/i.test(msg)) {
      throw new Error("Auth cancelled.");
    }
    throw new Error(msg);
  }
  if (!responseUrl) {
    throw new Error("Auth returned no redirect URL (cancelled?).");
  }
  console.log("[spotify] responseUrl received, parsing code/state");
  const returned = new URL(responseUrl);
  const q = returned.searchParams.get("code") != null ? returned.searchParams : new URLSearchParams(returned.hash.replace(/^#/, ""));
  const err = q.get("error");
  if (err) {
    throw new Error(`Spotify auth error: ${err}`);
  }
  const code = q.get("code");
  const returnedState = q.get("state");
  if (!code) {
    throw new Error("No authorization code in redirect.");
  }
  if (returnedState !== state) {
    throw new Error("OAuth state mismatch \u2014 try connecting again.");
  }
  console.log("[spotify] code and state valid, exchanging for tokens");
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri
  });
  const data = await exchangeToken(tokenBody, clientId, clientSecret);
  console.log("[spotify] token exchange response keys:", Object.keys(data));
  if (!data.refresh_token) {
    throw new Error("No refresh token returned \u2014 check app settings / scopes.");
  }
  const auth = authFromTokenResponse(data);
  await saveSpotifyAuth(auth);
  return auth;
}
async function refreshSpotifyToken(auth) {
  if (!hasSpotifyCredentials()) {
    throw new Error("Missing Spotify credentials.");
  }
  if (!auth.refreshToken) {
    throw new Error("No refresh token \u2014 reconnect Spotify.");
  }
  const clientId = getSettings().spotifyClientId.trim();
  const clientSecret = getSettings().spotifyClientSecret.trim();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: auth.refreshToken
  });
  const data = await exchangeToken(body, clientId, clientSecret);
  const next = authFromTokenResponse(data, auth.refreshToken);
  await saveSpotifyAuth(next);
  return next;
}
async function getValidAccessToken() {
  let auth = await loadSpotifyAuth();
  if (!auth?.accessToken) return null;
  if (auth.expiresAt - EXPIRY_SKEW_MS > Date.now()) {
    return auth.accessToken;
  }
  try {
    auth = await refreshSpotifyToken(auth);
    return auth.accessToken;
  } catch (err) {
    console.warn("[spotify] refresh failed", err);
    await clearSpotifyAuth();
    return null;
  }
}
async function isSpotifyConnected() {
  const auth = await loadSpotifyAuth();
  return Boolean(auth?.accessToken && auth?.refreshToken);
}

// src/features/spotify/api.ts
var API = "https://api.spotify.com/v1";
var SpotifyApiError = class extends Error {
  status;
  constructor(status, message) {
    super(message);
    this.name = "SpotifyApiError";
    this.status = status;
  }
};
async function spotifyFetch(path, init) {
  const token = await getValidAccessToken();
  if (!token) {
    throw new SpotifyApiError(401, "Not connected to Spotify.");
  }
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...init?.headers || {},
      Authorization: `Bearer ${token}`
    }
  });
  return res;
}
async function fetchCurrentlyPlaying() {
  const res = await spotifyFetch("/me/player/currently-playing");
  if (res.status === 204) {
    return null;
  }
  if (res.status === 401) {
    throw new SpotifyApiError(401, "Session expired \u2014 reconnect Spotify.");
  }
  if (res.status === 403) {
    throw new SpotifyApiError(
      403,
      "Spotify denied access \u2014 check app mode / scopes."
    );
  }
  if (res.status === 429) {
    throw new SpotifyApiError(429, "Rate limited \u2014 try again shortly.");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new SpotifyApiError(
      res.status,
      `Spotify API ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}`
    );
  }
  const data = await res.json();
  const item = data.item;
  if (!item?.name) {
    return null;
  }
  if (data.currently_playing_type && data.currently_playing_type !== "track") {
    return null;
  }
  const images = item.album?.images ?? [];
  const art = images.find((i) => (i.width ?? 0) >= 64 && (i.width ?? 0) <= 300) || images[images.length - 1] || images[0];
  return {
    isPlaying: Boolean(data.is_playing),
    progressMs: Number(data.progress_ms) || 0,
    fetchedAt: Date.now(),
    track: {
      id: item.id || "",
      name: item.name || "Unknown",
      artists: (item.artists || []).map((a) => a.name || "").filter(Boolean).join(", ") || "Unknown",
      album: item.album?.name || "",
      albumArtUrl: art?.url || null,
      durationMs: Number(item.duration_ms) || 0,
      externalUrl: item.external_urls?.spotify || null
    }
  };
}

// src/features/spotify/spotify-pane.ts
var POLL_MS = 8e3;
var PROGRESS_TICK_MS = 1e3;
var pollTimer = null;
var progressTimer = null;
var lastPlaying = null;
var fetchInFlight = false;
var connected = false;
function setBadge(text, dim = true) {
  els.spotifyBadge.textContent = text;
  els.spotifyBadge.classList.toggle("dim", dim);
}
function showView(state) {
  els.spotifySetup.hidden = state !== "setup";
  els.spotifyAuth.hidden = state !== "auth";
  els.spotifyIdle.hidden = state !== "idle";
  els.spotifyLive.hidden = state !== "live";
}
function clearError() {
  els.spotifyError.hidden = true;
  els.spotifyError.textContent = "";
}
function showError(msg) {
  els.spotifyError.textContent = msg;
  els.spotifyError.hidden = false;
}
function formatMs(ms) {
  const total = Math.max(0, Math.floor(ms / 1e3));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${pad(s, 2)}`;
}
function estimatedProgress(cp) {
  if (!cp.isPlaying) return cp.progressMs;
  const elapsed = Date.now() - cp.fetchedAt;
  return Math.min(cp.progressMs + elapsed, cp.track.durationMs || Infinity);
}
function renderLive(cp) {
  const { track } = cp;
  els.spTrack.textContent = track.name;
  if (track.externalUrl) {
    els.spTrack.href = track.externalUrl;
    els.spTrack.classList.add("has-link");
  } else {
    els.spTrack.removeAttribute("href");
    els.spTrack.classList.remove("has-link");
  }
  els.spArtist.textContent = track.artists;
  els.spAlbum.textContent = track.album || "";
  els.spAlbum.hidden = !track.album;
  if (track.albumArtUrl) {
    els.spArt.src = track.albumArtUrl;
    els.spArt.hidden = false;
    els.spArt.alt = track.album ? `${track.album} cover` : "Album art";
  } else {
    els.spArt.removeAttribute("src");
    els.spArt.hidden = true;
  }
  updateProgressUi(cp);
  setBadge(cp.isPlaying ? "\u25B6" : "\u275A\u275A", false);
  showView("live");
  els.spotifyDisconnect.hidden = false;
  els.spotifyRefresh.hidden = false;
}
function updateProgressUi(cp) {
  const progress = estimatedProgress(cp);
  const duration = cp.track.durationMs || 0;
  els.spProgressText.textContent = duration > 0 ? `${formatMs(progress)} / ${formatMs(duration)}` : formatMs(progress);
  const pct = duration > 0 ? Math.min(100, progress / duration * 100) : 0;
  els.spBarFill.style.width = `${pct}%`;
}
function renderIdle() {
  lastPlaying = null;
  setBadge("idle", true);
  els.spTrack.textContent = "nothing playing";
  els.spTrack.removeAttribute("href");
  els.spTrack.classList.remove("has-link");
  els.spArtist.textContent = "open Spotify on any device";
  els.spAlbum.textContent = "";
  els.spAlbum.hidden = true;
  els.spArt.removeAttribute("src");
  els.spArt.hidden = true;
  els.spProgressText.textContent = "0:00 / 0:00";
  els.spBarFill.style.width = "0%";
  els.spotifyLive.hidden = false;
  els.spotifySetup.hidden = true;
  els.spotifyAuth.hidden = true;
  els.spotifyIdle.hidden = true;
  els.spotifyDisconnect.hidden = false;
  els.spotifyRefresh.hidden = false;
}
function renderSetup() {
  lastPlaying = null;
  setBadge("setup", true);
  showView("setup");
  els.spotifyDisconnect.hidden = true;
  els.spotifyRefresh.hidden = true;
  clearError();
}
function renderAuth() {
  lastPlaying = null;
  setBadge("auth", true);
  showView("auth");
  els.spotifyDisconnect.hidden = true;
  els.spotifyRefresh.hidden = true;
  clearError();
}
function stopProgressTick() {
  if (progressTimer != null) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}
function startProgressTick() {
  stopProgressTick();
  progressTimer = setInterval(() => {
    if (lastPlaying && !els.spotifyLive.hidden) {
      updateProgressUi(lastPlaying);
    }
  }, PROGRESS_TICK_MS);
}
async function refreshNowPlaying(opts) {
  if (fetchInFlight && !opts?.force) return;
  if (!connected) return;
  fetchInFlight = true;
  try {
    const cp = await fetchCurrentlyPlaying();
    clearError();
    if (!cp) {
      renderIdle();
      stopProgressTick();
      return;
    }
    lastPlaying = cp;
    renderLive(cp);
    startProgressTick();
  } catch (err) {
    if (err instanceof SpotifyApiError && err.status === 401) {
      connected = false;
      await clearSpotifyAuth();
      renderAuth();
      showError("Session expired \u2014 connect again.");
      stopProgressTick();
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    showError(msg);
    setBadge("err", true);
  } finally {
    fetchInFlight = false;
  }
}
async function syncConnectionState() {
  if (!hasSpotifyCredentials()) {
    connected = false;
    renderSetup();
    stopPoll();
    stopProgressTick();
    return;
  }
  connected = await isSpotifyConnected();
  if (!connected) {
    renderAuth();
    stopPoll();
    stopProgressTick();
    return;
  }
  startPoll();
  await refreshNowPlaying({ force: true });
}
function startPoll() {
  stopPoll();
  pollTimer = setInterval(() => {
    void refreshNowPlaying();
  }, POLL_MS);
}
function stopPoll() {
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
async function onConnectClick() {
  els.spotifyConnect.disabled = true;
  els.spotifyConnect.textContent = "Connecting\u2026";
  clearError();
  try {
    await connectSpotify();
    connected = true;
    setBadge("ok", false);
    startPoll();
    await refreshNowPlaying({ force: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showError(msg);
    setBadge("err", true);
    showView("auth");
  } finally {
    els.spotifyConnect.disabled = false;
    els.spotifyConnect.textContent = "Connect Spotify";
  }
}
async function onDisconnectClick() {
  await clearSpotifyAuth();
  connected = false;
  lastPlaying = null;
  stopPoll();
  stopProgressTick();
  clearError();
  if (hasSpotifyCredentials()) {
    renderAuth();
  } else {
    renderSetup();
  }
}
async function onSpotifySettingsChanged() {
  await syncConnectionState();
}
function getSpotifyRedirectUriForSettings() {
  return getSpotifyRedirectUri() || "(load as extension to see redirect URI)";
}
function initSpotifyPane() {
  els.spotifyConnect.addEventListener("click", () => {
    void onConnectClick();
  });
  els.spotifyDisconnect.addEventListener("click", () => {
    void onDisconnectClick();
  });
  els.spotifyRefresh.addEventListener("click", () => {
    void refreshNowPlaying({ force: true });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopPoll();
      stopProgressTick();
    } else if (connected) {
      startPoll();
      startProgressTick();
      void refreshNowPlaying({ force: true });
    }
  });
  void syncConnectionState();
}

// src/features/weather/weather-pane.ts
var WEATHER_REFRESH_MS = 15 * 60 * 1e3;
var WEATHER_CACHE_MS = 10 * 60 * 1e3;
var UV_YOU_SPF = 3;
var UV_BABY_PROTECT = 2;
var UV_HIGH = 6;
var UV_EXTREME = 8;
var UV_SCALE_MAX = 11;
var EXTRA_CITIES = [
  {
    id: "london",
    shortLabel: "London",
    lat: 51.5074,
    lon: -0.1278,
    timezone: "Europe/London"
  },
  {
    id: "knoxville",
    shortLabel: "Knoxville",
    lat: 35.9606,
    lon: -83.9207,
    timezone: "America/New_York"
  }
];
var weatherCache = null;
var weatherFetchInFlight = false;
var lastWeatherZip = "";
var clockTimer = null;
var weatherRefreshTimer = null;
var tzFormatterCache = /* @__PURE__ */ new Map();
function formatterForTz(timeZone) {
  let fmt = tzFormatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23"
    });
    tzFormatterCache.set(timeZone, fmt);
  }
  return fmt;
}
function normalizeZip(raw) {
  return String(raw || "").trim();
}
function getLastWeatherZip() {
  return lastWeatherZip;
}
function shortPlaceLabel(full) {
  const t = full.trim();
  if (!t) return "home";
  const beforeComma = t.split(",")[0]?.trim();
  return beforeComma || t;
}
function localHm(timeZone, now = /* @__PURE__ */ new Date()) {
  try {
    const parts = formatterForTz(timeZone).formatToParts(now);
    const num = (type) => Number(parts.find((p) => p.type === type)?.value ?? "0");
    return { h: num("hour"), m: num("minute"), s: num("second") };
  } catch {
    return { h: now.getHours(), m: now.getMinutes(), s: now.getSeconds() };
  }
}
function setClockHands(svg, timeZone) {
  if (!timeZone) return;
  svg.dataset.timezone = timeZone;
  const { h, m } = localHm(timeZone);
  const hourDeg = (h % 12 + m / 60) * 30;
  const minDeg = m * 6;
  const hourHand = svg.querySelector(".wx-clock-hour");
  const minHand = svg.querySelector(".wx-clock-min");
  if (hourHand) hourHand.setAttribute("transform", `rotate(${hourDeg} 16 16)`);
  if (minHand) minHand.setAttribute("transform", `rotate(${minDeg} 16 16)`);
  const title = svg.closest(".wx-city")?.querySelector(".wx-city-name")?.textContent || "";
  svg.setAttribute(
    "aria-label",
    `${title} local time ${pad(h % 12 || 12)}:${pad(m)}`.trim()
  );
}
function tickClocks() {
  document.querySelectorAll(".wx-clock[data-timezone]").forEach((svg) => {
    const tz = svg.dataset.timezone || "";
    if (tz) setClockHands(svg, tz);
  });
}
function stopClockTicker() {
  if (clockTimer != null) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
}
function startClockTicker() {
  tickClocks();
  if (clockTimer != null) return;
  clockTimer = setInterval(tickClocks, 1e3);
}
function paintHeroTemp(tempEl, temp) {
  const tempN = temp != null ? Number(temp) : NaN;
  tempEl.textContent = !Number.isNaN(tempN) ? `${Math.round(tempN)}\xB0F` : "\u2014";
  tempEl.style.color = !Number.isNaN(tempN) ? tempColor(tempN) : "";
  tempEl.style.textShadow = !Number.isNaN(tempN) ? `0 0 18px ${tempColor(tempN)}66` : "";
}
function paintHeroSky(skyEl, code, title) {
  skyEl.textContent = skyGlyph(code);
  skyEl.title = title;
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
function dayOfWeekLabel(isoDate) {
  const d = /* @__PURE__ */ new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "\u2014";
  return ["su", "mo", "tu", "we", "th", "fr", "sa"][d.getDay()] ?? "\u2014";
}
function renderDay5Temps(daily) {
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
    val.textContent = !Number.isNaN(hiN) ? `${Math.round(hiN)}\xB0` : "\u2014";
    if (!Number.isNaN(hiN)) {
      val.style.color = tempColor(hiN);
      val.style.textShadow = `0 0 10px ${tempColor(hiN)}55`;
    }
    item.append(dow, val);
    frag.appendChild(item);
  }
  els.wxDay5Temps.replaceChildren(frag);
}
function renderDay5Winds(daily) {
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
    val.textContent = !Number.isNaN(wN) ? `${Math.round(wN)}` : "\u2014";
    if (!Number.isNaN(wN)) {
      val.style.color = windColor(wN);
      val.style.textShadow = `0 0 10px ${windColor(wN)}55`;
    }
    item.append(dow, val);
    frag.appendChild(item);
  }
  els.wxDay5Winds.replaceChildren(frag);
}
function renderSpfGuide(uvNow) {
  const valid = !Number.isNaN(uvNow);
  const uv = valid ? Math.max(0, uvNow) : 0;
  els.wxSpfUv.textContent = valid ? uv.toFixed(1) : "\u2014";
  els.wxSpfUv.style.color = valid ? uvColor(uv) : "";
  const pct = Math.min(100, uv / UV_SCALE_MAX * 100);
  els.wxSpfNeedle.style.left = `${pct}%`;
  const needYou = valid && uv >= UV_YOU_SPF;
  const needBaby = valid && uv >= UV_BABY_PROTECT;
  const high = valid && uv >= UV_HIGH;
  const extreme = valid && uv >= UV_EXTREME;
  if (!valid || !needYou && !needBaby) {
    els.wxSpfWarn.hidden = true;
    els.wxSpfWarn.textContent = "";
    els.wxSpfWarn.classList.remove("hot");
    return;
  }
  els.wxSpfWarn.hidden = false;
  els.wxSpfWarn.classList.toggle("hot", high || extreme);
  if (extreme) {
    els.wxSpfWarn.textContent = "\u26A0 extreme UV \xB7 SPF now \xB7 baby shade / cover \u2014 stay out of peak sun";
  } else if (high) {
    els.wxSpfWarn.textContent = "\u26A0 high UV \xB7 SPF on you \xB7 baby: shade + SPF / long sleeves";
  } else if (needYou && needBaby) {
    els.wxSpfWarn.textContent = "SPF on \xB7 baby needs shade/SPF too";
  } else if (needBaby) {
    els.wxSpfWarn.textContent = "baby: protect (shade/SPF) \xB7 you still low";
  } else {
    els.wxSpfWarn.textContent = "SPF for you \xB7 baby still ok with care";
  }
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
async function fetchOpenMeteo(lat, lon, opts = {}) {
  const full = opts.full ?? true;
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: full ? [
      "temperature_2m",
      "relative_humidity_2m",
      "wind_speed_10m",
      "wind_direction_10m",
      "weather_code"
    ].join(",") : ["temperature_2m", "weather_code"].join(","),
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    timezone: "auto",
    forecast_days: full ? "5" : "1"
  });
  if (full) {
    params.set(
      "hourly",
      ["temperature_2m", "wind_speed_10m", "wind_direction_10m", "uv_index"].join(
        ","
      )
    );
    params.set(
      "daily",
      [
        "sunrise",
        "sunset",
        "uv_index_max",
        "temperature_2m_max",
        "wind_speed_10m_max"
      ].join(",")
    );
  }
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`forecast failed (${res.status})`);
  return await res.json();
}
async function fetchExtraCity(city) {
  const forecast = await fetchOpenMeteo(city.lat, city.lon, { full: false });
  const cur = forecast.current ?? {};
  return {
    label: city.shortLabel,
    shortLabel: city.shortLabel,
    timezone: forecast.timezone || city.timezone,
    temp: cur.temperature_2m,
    weatherCode: cur.weather_code
  };
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
function renderWeatherBundle(entry) {
  const { home, extras } = entry;
  const forecast = home.forecast;
  const cur = forecast.current ?? {};
  const hours = sliceNext12Hours(forecast.hourly ?? {});
  els.weatherSetup.hidden = true;
  els.weatherLive.hidden = false;
  els.wxError.hidden = true;
  paintHeroSky(
    els.wxSkyHome,
    cur.weather_code,
    `weather code ${cur.weather_code ?? "\u2014"}`
  );
  paintHeroTemp(els.wxTempHome, cur.temperature_2m);
  els.wxPlaceHome.textContent = home.label || home.shortLabel;
  setClockHands(els.wxClockHome, home.timezone);
  paintHeroSky(
    els.wxSkyLondon,
    extras.london.weatherCode,
    `London \xB7 weather code ${extras.london.weatherCode ?? "\u2014"}`
  );
  paintHeroTemp(els.wxTempLondon, extras.london.temp);
  els.wxPlaceLondon.textContent = extras.london.label;
  setClockHands(els.wxClockLondon, extras.london.timezone);
  paintHeroSky(
    els.wxSkyKnoxville,
    extras.knoxville.weatherCode,
    `Knoxville \xB7 weather code ${extras.knoxville.weatherCode ?? "\u2014"}`
  );
  paintHeroTemp(els.wxTempKnoxville, extras.knoxville.temp);
  els.wxPlaceKnoxville.textContent = extras.knoxville.label;
  setClockHands(els.wxClockKnoxville, extras.knoxville.timezone);
  startClockTicker();
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
  const daily = forecast.daily ?? {};
  renderDay5Temps(daily);
  renderDay5Winds(daily);
  renderSpfGuide(uvNow);
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
    renderWeatherBundle(weatherCache);
    return;
  }
  if (weatherFetchInFlight) return;
  weatherFetchInFlight = true;
  els.weatherBadge.textContent = "\u2026";
  els.weatherBadge.classList.add("dim");
  try {
    const geo = await geocodeZip(zip);
    const [forecast, london, knoxville] = await Promise.all([
      fetchOpenMeteo(geo.lat, geo.lon, { full: true }),
      fetchExtraCity(EXTRA_CITIES[0]),
      fetchExtraCity(EXTRA_CITIES[1])
    ]);
    const homeTz = forecast.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Denver";
    const home = {
      label: geo.label,
      shortLabel: shortPlaceLabel(geo.label),
      timezone: homeTz,
      forecast
    };
    const entry = {
      zip,
      at: Date.now(),
      home,
      extras: { london, knoxville }
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

// src/features/etymology/etymology-pane.ts
var ROOTS = [
  {
    word: "husband",
    senses: "n. & v.",
    earliest: "c. 1290",
    oe: "h\u016Bsb\u014Dnda 'house-master' (rare)",
    on: "h\xFAsb\xF3ndi 'house-master, husband' (h\xFAs + b\xF3ndi 'dweller, farmer')",
    composition: "h\xFAs 'house' + b\xF3ndi 'freeholder, farmer'",
    pie: "*b\u02B0uH- 'to be, dwell' + *d\u02B0eh\u2081- 'to put, place'",
    note: "The modern 'spouse' sense narrowed in Middle English; the verb 'to husband' (manage thriftily) is 16c."
  },
  {
    word: "window",
    senses: "n.",
    earliest: "c. 1225",
    oe: "(no direct cognate; window concept expressed with \u0113ag\xFEyrel 'eye-hole')",
    on: "vindauga 'wind-eye' (vindr + auga)",
    composition: "vindr 'wind' + auga 'eye' \u2014 a literal hole to let the wind in",
    pie: "*h\u2082weh\u2081- 'to blow' + *h\u2083ek\u02B7- 'to see'",
    note: "Replaced OE \u0113ag\xFEyrel; the 'eye' metaphor survives in many Germanic languages."
  },
  {
    word: "ghost",
    senses: "n.",
    earliest: "OE (Beowulf c. 725)",
    oe: "g\u0101st 'soul, spirit, breath'",
    on: "(cognate) andi 'spirit' (modern Scandinavian forms)",
    composition: "from PIE root for 'to blow, breathe' \u2014 the soul as breath",
    pie: "*g\u02B0eh\u2081- 'to gape, yawn' or *g\u02B0ews- 'to breathe' (disputed)",
    note: "The gh- spelling is a 16c. affectation; cognate with Ger. Geist and the -geist in Zeitgeist."
  }
];
var current = null;
function pickRandom() {
  return ROOTS[Math.floor(Math.random() * ROOTS.length)];
}
function render() {
  if (!current) current = pickRandom();
  const w = document.getElementById("etym-word");
  const senses = document.getElementById("etym-senses");
  const earliest = document.getElementById("etym-earliest");
  const oe = document.getElementById("etym-oe");
  const on = document.getElementById("etym-on");
  const comp = document.getElementById("etym-comp");
  const pie = document.getElementById("etym-pie");
  const n = document.getElementById("etym-note");
  const timeline = document.getElementById("etym-timeline");
  if (w) w.textContent = current.word;
  if (senses) senses.textContent = current.senses;
  if (earliest) earliest.textContent = current.earliest;
  if (oe) oe.textContent = current.oe;
  if (on) on.textContent = current.on;
  if (comp) comp.textContent = current.composition;
  if (pie) pie.textContent = current.pie;
  if (n) n.textContent = current.note;
  if (timeline) {
    timeline.innerHTML = `
      <span class="layer">ON</span>
      <span class="arrow">\u2192</span>
      <span class="layer">OE/ME</span>
      <span class="arrow">\u2192</span>
      <span class="layer">ModE</span>
      <span class="arrow">\u2192</span>
      <span class="layer pie">PIE</span>
    `;
  }
}
function initEtymologyPane() {
  render();
  const pane = document.getElementById("etymology-pane");
  if (pane) {
    pane.addEventListener("click", () => {
      current = pickRandom();
      render();
    });
  }
}

// src/features/anglish/anglish-pane.ts
var ENTRIES = [
  {
    modern: "television",
    anglish: "far-seer",
    note: "OE feorr + s\u0113on; calque of Greek tele- + vision"
  },
  {
    modern: "information",
    anglish: "in-form-ing",
    note: "or \u2018tidings\u2019 (still alive in \u2018good tidings\u2019)"
  },
  {
    modern: "education",
    anglish: "up-bringing",
    note: "or \u2018learning\u2019 \u2014 the Latin root educare = \u2018lead out\u2019"
  }
];
var current2 = null;
function pickRandom2() {
  return ENTRIES[Math.floor(Math.random() * ENTRIES.length)];
}
function render2() {
  if (!current2) current2 = pickRandom2();
  const m = document.getElementById("ang-word");
  const a = document.getElementById("ang-alt");
  const n = document.getElementById("ang-note");
  if (m) m.textContent = current2.modern;
  if (a) a.textContent = current2.anglish;
  if (n) n.textContent = current2.note;
}
function initAnglishPane() {
  render2();
  const pane = document.getElementById("anglish-pane");
  if (pane) {
    pane.addEventListener("click", () => {
      current2 = pickRandom2();
      render2();
    });
  }
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
  if (isFeatureEnabled("spotify")) {
    els.spotifyClientId.value = settings2.spotifyClientId || "";
    els.spotifyClientSecret.value = settings2.spotifyClientSecret || "";
    els.spotifyRedirectUri.textContent = getSpotifyRedirectUriForSettings();
  }
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
  if (isFeatureEnabled("spotify")) {
    els.spotifyRedirectUri.addEventListener("click", async () => {
      const text = els.spotifyRedirectUri.textContent || "";
      if (!text || text.startsWith("(")) return;
      try {
        await navigator.clipboard.writeText(text);
        const prev = els.spotifyRedirectUri.title;
        els.spotifyRedirectUri.title = "Copied!";
        setTimeout(() => {
          els.spotifyRedirectUri.title = prev || "Click to copy";
        }, 1200);
      } catch {
      }
    });
    els.spotifyRedirectUri.title = "Click to copy";
    els.spotifyRedirectUri.style.cursor = "pointer";
  }
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
      bgImage: (els.bgImage.value || "").trim(),
      spotifyClientId: isFeatureEnabled("spotify") ? (els.spotifyClientId.value || "").trim() : prev.spotifyClientId,
      spotifyClientSecret: isFeatureEnabled("spotify") ? (els.spotifyClientSecret.value || "").trim() : prev.spotifyClientSecret
    });
    applyBackground();
    closeSettings();
    tickLife();
    const next = getSettings();
    const nextZip = normalizeZip(next.zipCode);
    await refreshWeather({
      force: nextZip !== prevZip || nextZip !== getLastWeatherZip()
    });
    if (isFeatureEnabled("spotify")) {
      await onSpotifySettingsChanged();
    }
    if (isFeatureEnabled("room")) {
      const nextRoom = (next.roomJsonUrl || "").trim();
      await refreshRoom({
        force: nextRoom !== prevRoom || nextRoom !== getLastRoomUrl()
      });
    }
  });
}

// src/main.ts
function syncVisibilityClass() {
  document.body.classList.toggle("nt-hidden", document.hidden);
}
async function bootstrap() {
  applyFeatureVisibility(FEATURES);
  syncVisibilityClass();
  document.addEventListener("visibilitychange", syncVisibilityClass);
  await loadSettings();
  applyBackground();
  initSettingsDialog();
  initLifePane();
  if (isFeatureEnabled("weather")) {
    initWeatherPane();
  }
  if (isFeatureEnabled("spotify")) {
    initSpotifyPane();
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
  if (isFeatureEnabled("etymology")) {
    initEtymologyPane();
  } else {
    console.info(
      "[newtab] etymology feature flagged off \u2014 enable in src/config/features.ts"
    );
  }
  if (isFeatureEnabled("anglish")) {
    initAnglishPane();
  } else {
    console.info(
      "[newtab] anglish feature flagged off \u2014 enable in src/config/features.ts"
    );
  }
  if (!getSettings().birthDate) {
    setTimeout(openSettings, 350);
  }
}
void bootstrap().catch((err) => {
  console.error("[newtab] bootstrap failed", err);
});
