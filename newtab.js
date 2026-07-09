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
  /** User-supplied board/feed URL — never hardcode a site in the repo */
  forumUrl: "",
  bgImage: "",
};

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
  forumBadge: document.getElementById("forum-badge"),
  forumStatus: document.getElementById("forum-status"),
};

/** @type {typeof DEFAULTS} */
let settings = { ...DEFAULTS };
let ticksDrawnFor = null;

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
  await saveSettings({
    birthDate: els.birthDate.value,
    birthTime: els.birthTime.value || "00:00:00",
    lifespan: Number(els.lifespan.value) || 80,
    showDeath: els.showDeath.checked,
    forumUrl: (els.forumUrl.value || "").trim(),
    bgImage: (els.bgImage.value || "").trim(),
  });
  closeSettings();
  tick();
});

// Bootstrap
await loadSettings();
applyBackground();
tick();
setInterval(tick, 50);

// First-run / incomplete setup: open settings (birth + forum URL live here)
if (!settings.birthDate) {
  setTimeout(openSettings, 350);
}
