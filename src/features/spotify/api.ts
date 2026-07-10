/**
 * Spotify Web API helpers (currently playing).
 */

import { getValidAccessToken } from "./auth.js";

const API = "https://api.spotify.com/v1";

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: string;
  album: string;
  albumArtUrl: string | null;
  durationMs: number;
  externalUrl: string | null;
}

export interface CurrentlyPlaying {
  isPlaying: boolean;
  progressMs: number;
  track: SpotifyTrack;
  fetchedAt: number;
}

interface SpotifyApiImage {
  url?: string;
  height?: number;
  width?: number;
}

interface SpotifyApiArtist {
  name?: string;
}

interface SpotifyApiAlbum {
  name?: string;
  images?: SpotifyApiImage[];
}

interface SpotifyApiExternalUrls {
  spotify?: string;
}

interface SpotifyApiItem {
  id?: string;
  name?: string;
  duration_ms?: number;
  artists?: SpotifyApiArtist[];
  album?: SpotifyApiAlbum;
  external_urls?: SpotifyApiExternalUrls;
}

interface CurrentlyPlayingResponse {
  is_playing?: boolean;
  progress_ms?: number;
  item?: SpotifyApiItem | null;
  currently_playing_type?: string;
}

export class SpotifyApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SpotifyApiError";
    this.status = status;
  }
}

async function spotifyFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await getValidAccessToken();
  if (!token) {
    throw new SpotifyApiError(401, "Not connected to Spotify.");
  }

  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  return res;
}

/**
 * Current playback. Returns null when nothing is playing (204)
 * or item is not a track.
 */
export async function fetchCurrentlyPlaying(): Promise<CurrentlyPlaying | null> {
  const res = await spotifyFetch("/me/player/currently-playing");

  if (res.status === 204) {
    return null;
  }

  if (res.status === 401) {
    throw new SpotifyApiError(401, "Session expired — reconnect Spotify.");
  }

  if (res.status === 403) {
    throw new SpotifyApiError(
      403,
      "Spotify denied access — check app mode / scopes.",
    );
  }

  if (res.status === 429) {
    throw new SpotifyApiError(429, "Rate limited — try again shortly.");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new SpotifyApiError(
      res.status,
      `Spotify API ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}`,
    );
  }

  const data = (await res.json()) as CurrentlyPlayingResponse;
  const item = data.item;
  if (!item?.name) {
    return null;
  }

  // Only full tracks for now (not episodes)
  if (data.currently_playing_type && data.currently_playing_type !== "track") {
    return null;
  }

  const images = item.album?.images ?? [];
  // Prefer a small-ish image for the pane
  const art =
    images.find((i) => (i.width ?? 0) >= 64 && (i.width ?? 0) <= 300) ||
    images[images.length - 1] ||
    images[0];

  return {
    isPlaying: Boolean(data.is_playing),
    progressMs: Number(data.progress_ms) || 0,
    fetchedAt: Date.now(),
    track: {
      id: item.id || "",
      name: item.name || "Unknown",
      artists: (item.artists || [])
        .map((a) => a.name || "")
        .filter(Boolean)
        .join(", ") || "Unknown",
      album: item.album?.name || "",
      albumArtUrl: art?.url || null,
      durationMs: Number(item.duration_ms) || 0,
      externalUrl: item.external_urls?.spotify || null,
    },
  };
}
