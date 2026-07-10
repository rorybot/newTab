/**
 * Spotify now-playing pane.
 *
 * States:
 * - no credentials → point at settings
 * - credentials, not connected → Connect button
 * - connected, idle → nothing playing
 * - connected, live → track + progress
 */

import { pad } from "../../lib/format.js";
import {
  clearSpotifyAuth,
  connectSpotify,
  getSpotifyRedirectUri,
  hasSpotifyCredentials,
  isSpotifyConnected,
} from "./auth.js";
import {
  fetchCurrentlyPlaying,
  SpotifyApiError,
  type CurrentlyPlaying,
} from "./api.js";
import { els } from "../../ui/refs.js";

const POLL_MS = 8_000;
const PROGRESS_TICK_MS = 1_000;

type ViewState = "setup" | "auth" | "idle" | "live";

let pollTimer: ReturnType<typeof setInterval> | null = null;
let progressTimer: ReturnType<typeof setInterval> | null = null;
let lastPlaying: CurrentlyPlaying | null = null;
let fetchInFlight = false;
let connected = false;

function setBadge(text: string, dim = true): void {
  els.spotifyBadge.textContent = text;
  els.spotifyBadge.classList.toggle("dim", dim);
}

function showView(state: ViewState): void {
  els.spotifySetup.hidden = state !== "setup";
  els.spotifyAuth.hidden = state !== "auth";
  els.spotifyIdle.hidden = state !== "idle";
  els.spotifyLive.hidden = state !== "live";
}

function clearError(): void {
  els.spotifyError.hidden = true;
  els.spotifyError.textContent = "";
}

function showError(msg: string): void {
  els.spotifyError.textContent = msg;
  els.spotifyError.hidden = false;
}

function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${pad(s, 2)}`;
}

function estimatedProgress(cp: CurrentlyPlaying): number {
  if (!cp.isPlaying) return cp.progressMs;
  const elapsed = Date.now() - cp.fetchedAt;
  return Math.min(cp.progressMs + elapsed, cp.track.durationMs || Infinity);
}

function renderLive(cp: CurrentlyPlaying): void {
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
  setBadge(cp.isPlaying ? "▶" : "❚❚", false);
  showView("live");
  els.spotifyDisconnect.hidden = false;
  els.spotifyRefresh.hidden = false;
}

function updateProgressUi(cp: CurrentlyPlaying): void {
  const progress = estimatedProgress(cp);
  const duration = cp.track.durationMs || 0;
  els.spProgressText.textContent =
    duration > 0
      ? `${formatMs(progress)} / ${formatMs(duration)}`
      : formatMs(progress);

  const pct = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;
  els.spBarFill.style.width = `${pct}%`;
}

function renderIdle(): void {
  lastPlaying = null;
  setBadge("idle", true);
  showView("idle");
  els.spotifyDisconnect.hidden = false;
  els.spotifyRefresh.hidden = false;
}

function renderSetup(): void {
  lastPlaying = null;
  setBadge("setup", true);
  showView("setup");
  els.spotifyDisconnect.hidden = true;
  els.spotifyRefresh.hidden = true;
  clearError();
}

function renderAuth(): void {
  lastPlaying = null;
  setBadge("auth", true);
  showView("auth");
  els.spotifyDisconnect.hidden = true;
  els.spotifyRefresh.hidden = true;
  clearError();
}

function stopProgressTick(): void {
  if (progressTimer != null) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

function startProgressTick(): void {
  stopProgressTick();
  progressTimer = setInterval(() => {
    if (lastPlaying && !els.spotifyLive.hidden) {
      updateProgressUi(lastPlaying);
    }
  }, PROGRESS_TICK_MS);
}

async function refreshNowPlaying(opts?: { force?: boolean }): Promise<void> {
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
      showError("Session expired — connect again.");
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

async function syncConnectionState(): Promise<void> {
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

function startPoll(): void {
  stopPoll();
  pollTimer = setInterval(() => {
    void refreshNowPlaying();
  }, POLL_MS);
}

function stopPoll(): void {
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function onConnectClick(): Promise<void> {
  els.spotifyConnect.disabled = true;
  els.spotifyConnect.textContent = "Connecting…";
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
    // stay on auth view
    showView("auth");
  } finally {
    els.spotifyConnect.disabled = false;
    els.spotifyConnect.textContent = "Connect Spotify";
  }
}

async function onDisconnectClick(): Promise<void> {
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

/** Called after settings save when credentials may have changed. */
export async function onSpotifySettingsChanged(): Promise<void> {
  await syncConnectionState();
}

export function getSpotifyRedirectUriForSettings(): string {
  return getSpotifyRedirectUri() || "(load as extension to see redirect URI)";
}

export function initSpotifyPane(): void {
  els.spotifyConnect.addEventListener("click", () => {
    void onConnectClick();
  });
  els.spotifyDisconnect.addEventListener("click", () => {
    void onDisconnectClick();
  });
  els.spotifyRefresh.addEventListener("click", () => {
    void refreshNowPlaying({ force: true });
  });

  // Visibility: pause polling when tab hidden
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
