/**
 * Spotify OAuth (Authorization Code) for Chrome extensions.
 *
 * Flow:
 * 1. Client ID + secret live in settings (local only).
 * 2. User clicks Connect → chrome.identity.launchWebAuthFlow.
 * 3. Code exchanged for access + refresh tokens (stored separately).
 * 4. Access token refreshed automatically before expiry.
 */

import {
  SPOTIFY_AUTH_KEY,
  type SpotifyAuth,
} from "../../settings/types.js";
import { getSettings } from "../../settings/store.js";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";

/** Scopes for now-playing + basic playback state. */
export const SPOTIFY_SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state",
].join(" ");

/** Refresh a little early so in-flight requests don't race expiry. */
const EXPIRY_SKEW_MS = 60_000;

function hasExtensionStorage(): boolean {
  return typeof chrome !== "undefined" && chrome?.storage?.local != null;
}

function hasIdentityApi(): boolean {
  return typeof chrome !== "undefined" && chrome?.identity != null;
}

export function getSpotifyRedirectUri(): string | null {
  if (!hasIdentityApi() || typeof chrome.identity.getRedirectURL !== "function") {
    return null;
  }
  try {
    return chrome.identity.getRedirectURL();
  } catch {
    return null;
  }
}

export function hasSpotifyCredentials(): boolean {
  const s = getSettings();
  return Boolean(s.spotifyClientId?.trim() && s.spotifyClientSecret?.trim());
}

export async function loadSpotifyAuth(): Promise<SpotifyAuth | null> {
  if (hasExtensionStorage()) {
    try {
      const result = await chrome.storage.local.get(SPOTIFY_AUTH_KEY);
      const raw = result[SPOTIFY_AUTH_KEY];
      if (isSpotifyAuth(raw)) return raw;
    } catch {
      /* fall through */
    }
  }
  try {
    const raw = localStorage.getItem(SPOTIFY_AUTH_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isSpotifyAuth(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function saveSpotifyAuth(auth: SpotifyAuth): Promise<void> {
  if (hasExtensionStorage()) {
    try {
      await chrome.storage.local.set({ [SPOTIFY_AUTH_KEY]: auth });
    } catch (err) {
      console.warn("[spotify] save auth failed", err);
    }
  }
  try {
    localStorage.setItem(SPOTIFY_AUTH_KEY, JSON.stringify(auth));
  } catch {
    /* ignore */
  }
}

export async function clearSpotifyAuth(): Promise<void> {
  if (hasExtensionStorage()) {
    try {
      await chrome.storage.local.remove(SPOTIFY_AUTH_KEY);
    } catch {
      /* ignore */
    }
  }
  try {
    localStorage.removeItem(SPOTIFY_AUTH_KEY);
  } catch {
    /* ignore */
  }
}

function isSpotifyAuth(value: unknown): value is SpotifyAuth {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.accessToken === "string" &&
    typeof v.refreshToken === "string" &&
    typeof v.expiresAt === "number"
  );
}

function randomState(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  // client id/secret are ASCII; btoa is fine
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

async function exchangeToken(
  body: URLSearchParams,
  clientId: string,
  clientSecret: string,
): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(clientId, clientSecret),
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Token exchange failed (${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }
  return (await res.json()) as TokenResponse;
}

function authFromTokenResponse(
  data: TokenResponse,
  prevRefresh?: string,
): SpotifyAuth {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || prevRefresh || "",
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
}

/**
 * Launch Spotify authorize UI and store tokens.
 * Requires extension context (chrome.identity) + credentials in settings.
 */
export async function connectSpotify(): Promise<SpotifyAuth> {
  if (!hasSpotifyCredentials()) {
    throw new Error("Add Spotify Client ID and Secret in settings first.");
  }
  if (!hasIdentityApi()) {
    throw new Error(
      "Spotify auth needs the extension (chrome.identity). Load unpacked in brave://extensions.",
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
    show_dialog: "true",
  });

  const authUrl = `${AUTHORIZE_URL}?${params.toString()}`;

  console.log("[spotify] starting OAuth, redirectUri=", redirectUri);
  console.log("[spotify] authUrl=", authUrl);

  let responseUrl: string | undefined;
  try {
    responseUrl = await new Promise<string | undefined>((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: authUrl, interactive: true },
        (url) => {
          console.log("[spotify] launchWebAuthFlow callback url=", url, "lastError=", chrome.runtime.lastError);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(url);
        },
      );
    });
    console.log("[spotify] got responseUrl=", responseUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
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
  // chrome.identity may put params on hash or query
  const q =
    returned.searchParams.get("code") != null
      ? returned.searchParams
      : new URLSearchParams(returned.hash.replace(/^#/, ""));

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
    throw new Error("OAuth state mismatch — try connecting again.");
  }

  console.log("[spotify] code and state valid, exchanging for tokens");
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const data = await exchangeToken(tokenBody, clientId, clientSecret);
  console.log("[spotify] token exchange response keys:", Object.keys(data));
  if (!data.refresh_token) {
    throw new Error("No refresh token returned — check app settings / scopes.");
  }

  const auth = authFromTokenResponse(data);
  await saveSpotifyAuth(auth);
  return auth;
}

export async function refreshSpotifyToken(
  auth: SpotifyAuth,
): Promise<SpotifyAuth> {
  if (!hasSpotifyCredentials()) {
    throw new Error("Missing Spotify credentials.");
  }
  if (!auth.refreshToken) {
    throw new Error("No refresh token — reconnect Spotify.");
  }

  const clientId = getSettings().spotifyClientId.trim();
  const clientSecret = getSettings().spotifyClientSecret.trim();

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: auth.refreshToken,
  });

  const data = await exchangeToken(body, clientId, clientSecret);
  const next = authFromTokenResponse(data, auth.refreshToken);
  await saveSpotifyAuth(next);
  return next;
}

/**
 * Return a valid access token, refreshing if needed.
 * Returns null if not connected.
 */
export async function getValidAccessToken(): Promise<string | null> {
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
    // Stale tokens — force reconnect
    await clearSpotifyAuth();
    return null;
  }
}

export async function isSpotifyConnected(): Promise<boolean> {
  const auth = await loadSpotifyAuth();
  return Boolean(auth?.accessToken && auth?.refreshToken);
}
