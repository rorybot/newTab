/**
 * Radar pane — planes around a home point, TUI list + mini scope.
 *
 * Origin: explicit lat/lon from settings, else geocoded from the weather zip
 * (result cached in localStorage so a new tab doesn't re-geocode). Aircraft
 * come from free ADS-B point queries (see api.ts); refresh is once a minute
 * to stay polite, paused while the tab is hidden.
 */

import { requireEl } from "../../lib/dom.js";
import { getSettings } from "../../settings/store.js";
import { geocodeZip, normalizeZip } from "../weather/weather-pane.js";
import {
  arrowFor,
  compassFor,
  fetchNearbyAircraft,
  fmtAlt,
  fmtDist,
  fmtSpeed,
  globeUrl,
  trendChar,
  type Aircraft,
} from "./api.js";

const REFRESH_MS = 60 * 1000;
const LIST_LIMIT = 8;
/** Position reports older than this render as faded blips. */
const STALE_POS_S = 30;
const GEO_CACHE_KEY = "newTabRadarGeo";

interface Origin {
  lat: number;
  lon: number;
  label: string;
}

interface GeoCache {
  zip: string;
  lat: number;
  lon: number;
  label: string;
}

let aircraft: Aircraft[] = [];
let origin: Origin | null = null;
let radiusNm = 25;
let loading = false;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let lastLoadedAt = 0;

const el = {
  badge: () => requireEl<HTMLElement>("radar-badge"),
  refresh: () => requireEl<HTMLButtonElement>("radar-refresh"),
  setup: () => requireEl<HTMLElement>("radar-setup"),
  live: () => requireEl<HTMLElement>("radar-live"),
  blips: () => requireEl<HTMLElement>("radar-blips"),
  originLabel: () => requireEl<HTMLElement>("radar-origin"),
  range: () => requireEl<HTMLElement>("radar-range"),
  count: () => requireEl<HTMLElement>("radar-count"),
  table: () => requireEl<HTMLElement>("radar-table"),
  status: () => requireEl<HTMLElement>("radar-status"),
};

function setBadge(text: string, dim = true): void {
  el.badge().textContent = text;
  el.badge().classList.toggle("dim", dim);
}

function setStatus(msg: string | null): void {
  const status = el.status();
  status.hidden = !msg;
  status.textContent = msg ?? "";
}

function parseCoord(raw: string, min: number, max: number): number | null {
  const n = Number(raw.trim());
  return raw.trim() && Number.isFinite(n) && n >= min && n <= max ? n : null;
}

async function resolveOrigin(): Promise<Origin | null> {
  const settings = getSettings();
  const lat = parseCoord(settings.radarLat, -90, 90);
  const lon = parseCoord(settings.radarLon, -180, 180);
  if (lat != null && lon != null) {
    return { lat, lon, label: `${lat.toFixed(3)}, ${lon.toFixed(3)}` };
  }

  const zip = normalizeZip(settings.zipCode);
  if (!zip) return null;

  try {
    const raw = localStorage.getItem(GEO_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as GeoCache;
      if (cached.zip === zip && Number.isFinite(cached.lat) && Number.isFinite(cached.lon)) {
        return { lat: cached.lat, lon: cached.lon, label: cached.label };
      }
    }
  } catch {
    /* re-geocode */
  }

  const geo = await geocodeZip(zip);
  const cache: GeoCache = { zip, lat: geo.lat, lon: geo.lon, label: geo.label };
  try {
    localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* geocode still succeeded */
  }
  return { lat: geo.lat, lon: geo.lon, label: geo.label };
}

function acLabel(ac: Aircraft): string {
  return ac.flight || ac.reg || ac.hex || "?";
}

function acTooltip(ac: Aircraft): string {
  const parts = [
    acLabel(ac),
    ac.type || null,
    ac.onGround ? "on ground" : ac.altFt != null ? `${ac.altFt.toLocaleString()} ft` : null,
    ac.gsKt != null ? `${Math.round(ac.gsKt)} kt` : null,
    `${fmtDist(ac.distNm)} nm ${compassFor(ac.bearing)}`,
  ];
  return parts.filter(Boolean).join(" · ");
}

function renderScope(): void {
  const blips = el.blips();
  blips.innerHTML = "";
  for (const ac of aircraft) {
    // Bearing/distance → offset from scope center; 48% keeps the edge inside the ring.
    const r = Math.min(1, ac.distNm / radiusNm) * 48;
    const rad = (ac.bearing * Math.PI) / 180;
    const blip = document.createElement("span");
    blip.className = "radar-blip";
    if (ac.seenPosS > STALE_POS_S) blip.classList.add("is-stale");
    blip.dataset.hex = ac.hex;
    blip.style.left = `${50 + r * Math.sin(rad)}%`;
    blip.style.top = `${50 - r * Math.cos(rad)}%`;
    blip.title = acTooltip(ac);
    blips.appendChild(blip);
  }
}

function renderTable(): void {
  const table = el.table();
  table.innerHTML = "";

  if (!aircraft.length) {
    const empty = document.createElement("p");
    empty.className = "radar-empty muted";
    empty.textContent = loading ? "scanning…" : "sky is quiet";
    table.appendChild(empty);
    return;
  }

  const head = document.createElement("div");
  head.className = "radar-row radar-head";
  head.setAttribute("role", "row");
  for (const label of ["call", "alt", "kt", "nm"]) {
    const cell = document.createElement("span");
    cell.className = `radar-cell radar-col-${label}`;
    cell.setAttribute("role", "columnheader");
    cell.textContent = label;
    head.appendChild(cell);
  }
  table.appendChild(head);

  for (const ac of aircraft.slice(0, LIST_LIMIT)) {
    const row = document.createElement("div");
    row.className = "radar-row radar-item";
    row.dataset.hex = ac.hex;
    row.setAttribute("role", "row");
    row.title = acTooltip(ac);

    const call = document.createElement("span");
    call.className = "radar-cell radar-col-call";
    call.textContent = acLabel(ac);

    const alt = document.createElement("span");
    alt.className = "radar-cell radar-col-alt";
    alt.textContent = `${fmtAlt(ac)}${trendChar(ac)}`;

    const spd = document.createElement("span");
    spd.className = "radar-cell radar-col-kt";
    spd.textContent = fmtSpeed(ac);

    const dist = document.createElement("span");
    dist.className = "radar-cell radar-col-nm";
    dist.textContent = `${fmtDist(ac.distNm)}${arrowFor(ac.track)}`;

    row.append(call, alt, spd, dist);
    row.addEventListener("click", () => window.open(globeUrl(ac), "_blank", "noopener"));
    row.addEventListener("mouseenter", () => highlightBlip(ac.hex, true));
    row.addEventListener("mouseleave", () => highlightBlip(ac.hex, false));
    table.appendChild(row);
  }
}

function highlightBlip(hex: string, on: boolean): void {
  el.blips()
    .querySelector<HTMLElement>(`[data-hex="${hex}"]`)
    ?.classList.toggle("is-hot", on);
}

function renderMeta(): void {
  if (!origin) return;
  el.originLabel().textContent = origin.label;
  el.originLabel().title = `${origin.lat.toFixed(4)}, ${origin.lon.toFixed(4)}`;
  el.range().textContent = `±${radiusNm} nm`;
  el.count().textContent = `${aircraft.length} aircraft`;
}

function render(): void {
  renderMeta();
  renderScope();
  renderTable();
}

export async function refreshRadar(opts: { force?: boolean } = {}): Promise<void> {
  if (loading) return;
  if (!opts.force && Date.now() - lastLoadedAt < REFRESH_MS / 2) return;
  loading = true;
  setStatus(null);

  try {
    radiusNm = Math.min(250, Math.max(1, getSettings().radarRadiusNm || 25));
    origin = await resolveOrigin();
    if (!origin) {
      el.setup().hidden = false;
      el.live().hidden = true;
      setBadge("zzz", true);
      return;
    }
    el.setup().hidden = true;
    el.live().hidden = false;
    setBadge("…", true);

    const { aircraft: fresh, source } = await fetchNearbyAircraft(origin.lat, origin.lon, radiusNm);
    aircraft = fresh;
    lastLoadedAt = Date.now();
    setBadge(String(aircraft.length), false);
    el.badge().title = `via ${source}`;
    render();
  } catch (err) {
    setBadge("err", true);
    setStatus(`radar unreachable (${err instanceof Error ? err.message : String(err)})`);
  } finally {
    loading = false;
  }
}

function startAutoRefresh(): void {
  stopAutoRefresh();
  refreshTimer = setInterval(() => void refreshRadar(), REFRESH_MS);
}

function stopAutoRefresh(): void {
  if (refreshTimer != null) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

export function initRadarPane(): void {
  el.refresh().hidden = false;
  el.refresh().addEventListener("click", () => void refreshRadar({ force: true }));

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopAutoRefresh();
    } else {
      startAutoRefresh();
      if (Date.now() - lastLoadedAt > REFRESH_MS) void refreshRadar();
    }
  });

  startAutoRefresh();
  void refreshRadar({ force: true });
}
