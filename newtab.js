const STORAGE_KEY = "newTabSettings";
const DEFAULTS = { birthDate: "", birthTime: "00:00:00", lifespan: 80, showDeath: false };
const RING_R = 82, RING_CX = 100, RING_CY = 100;
const els = {
  clock: document.getElementById("clock"),
  ageDisplay: document.getElementById("age-display"),
  ageLabel: document.getElementById("age-label"),
  deathCountdown: document.getElementById("death-countdown"),
  lifeSegments: document.getElementById("life-segments"),
  lifePane: document.getElementById("life-pane"),
  ringProgress: document.getElementById("ring-progress"),
  ringRemaining: document.getElementById("ring-remaining"),
  ringTicks: document.getElementById("ring-ticks"),
  settingsToggle: document.getElementById("settings-toggle"),
  settingsDialog: document.getElementById("settings-dialog"),
  settingsForm: document.getElementById("settings-form"),
  settingsCancel: document.getElementById("settings-cancel"),
  birthDate: document.getElementById("birth-date"),
  birthTime: document.getElementById("birth-time"),
  lifespan: document.getElementById("lifespan"),
  showDeath: document.getElementById("show-death"),
};
let settings = { ...DEFAULTS };
let ticksDrawnFor = null;
function pad(n, width = 2) { return String(n).padStart(width, "0"); }
function formatClock(date) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[date.getDay()]} ${months[date.getMonth()]} ${date.getDate()} · ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
function parseBirthDateTime(birthDate, birthTime) {
  if (!birthDate) return null;
  const time = birthTime && birthTime.length >= 5 ? birthTime : "00:00:00";
  const normalized = time.length === 5 ? `${time}:00` : time;
  const d = new Date(`${birthDate}T${normalized}`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function ageInYears(birth, now = new Date()) {
  const ms = now.getTime() - birth.getTime();
  if (ms < 0) return 0;
  return ms / (365.2425 * 24 * 60 * 60 * 1000);
}
function formatAge(years) { return years.toFixed(9); }
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
  return new Date(birth.getTime() + lifespanYears * 365.2425 * 24 * 60 * 60 * 1000);
}
function hasExtensionStorage() {
  return typeof chrome !== "undefined" && chrome?.storage?.local != null;
}
async function loadSettings() {
  let loaded = null;
  if (hasExtensionStorage()) {
    try {
      const localResult = await chrome.storage.local.get(STORAGE_KEY);
      if (localResult[STORAGE_KEY] && typeof localResult[STORAGE_KEY] === "object") loaded = localResult[STORAGE_KEY];
    } catch { /* continue */ }
  }
  if (!loaded) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { const parsed = JSON.parse(raw); if (parsed && typeof parsed === "object") loaded = parsed; }
    } catch { /* ignore */ }
  }
  settings = loaded ? { ...DEFAULTS, ...loaded } : { ...DEFAULTS };
}
async function saveSettings(next) {
  settings = { ...DEFAULTS, ...next };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* private mode */ }
  if (hasExtensionStorage()) {
    try { await chrome.storage.local.set({ [STORAGE_KEY]: settings }); }
    catch (err) { console.warn("chrome.storage.local.set failed", err); }
  }
}
function ensureRingTicks(lifespanYears) {
  const n = Math.max(1, Math.min(150, Math.round(lifespanYears)));
  if (ticksDrawnFor === n) return;
  ticksDrawnFor = n;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    const isDecade = i % 10 === 0;
    const inner = isDecade ? RING_R - 2 : RING_R + 1;
    const outer = RING_R + 6;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(RING_CX + Math.cos(angle) * outer));
    line.setAttribute("y1", String(RING_CY + Math.sin(angle) * outer));
    line.setAttribute("x2", String(RING_CX + Math.cos(angle) * inner));
    line.setAttribute("y2", String(RING_CY + Math.sin(angle) * inner));
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
function updateClock() {
  const now = new Date();
  els.clock.textContent = formatClock(now);
  els.clock.dateTime = now.toISOString();
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
    updateRing(0);
    return;
  }
  els.lifePane.classList.remove("needs-setup");
  const now = new Date();
  const years = ageInYears(birth, now);
  const fraction = years / lifespan;
  els.ageDisplay.textContent = formatAge(years);
  els.ageLabel.textContent = "years old";
  updateRing(fraction);
  const wholeYears = Math.floor(years);
  const decade = Math.floor(years / 10) * 10;
  els.lifeSegments.textContent =
    `segment ${wholeYears + 1}/${lifespan} · decade ${decade}–${decade + 9} · ${Math.max(0, lifespan - years).toFixed(2)}y est. left`;
  if (settings.showDeath) {
    const remaining = expectedDeathDate(birth, lifespan).getTime() - now.getTime();
    els.deathCountdown.textContent = remaining > 0
      ? `~${formatDuration(remaining)} left @ ${lifespan}y`
      : "outlived the estimate · keep going";
    els.deathCountdown.hidden = false;
  } else {
    els.deathCountdown.hidden = true;
  }
}
function tick() { updateClock(); updateAge(); }
function fillForm() {
  els.birthDate.value = settings.birthDate || "";
  els.birthTime.value = (settings.birthTime || "00:00:00").slice(0, 8);
  els.lifespan.value = String(settings.lifespan ?? 80);
  els.showDeath.checked = Boolean(settings.showDeath);
}
function openSettings() { fillForm(); els.settingsDialog.showModal(); }
function closeSettings() { if (els.settingsDialog.open) els.settingsDialog.close(); }
els.settingsToggle.addEventListener("click", openSettings);
els.settingsCancel.addEventListener("click", (e) => { e.preventDefault(); closeSettings(); });
els.settingsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await saveSettings({
    birthDate: els.birthDate.value,
    birthTime: els.birthTime.value || "00:00:00",
    lifespan: Number(els.lifespan.value) || 80,
    showDeath: els.showDeath.checked,
  });
  closeSettings();
  tick();
});
await loadSettings();
tick();
setInterval(tick, 50);
if (!settings.birthDate) setTimeout(openSettings, 300);
