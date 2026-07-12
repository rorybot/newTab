import { beforeEach, describe, expect, it, vi } from "vitest";
import { SPOTIFY_AUTH_KEY } from "../src/settings/types";
import { makeChrome } from "./setup";

const settings = { spotifyClientId: "client", spotifyClientSecret: "secret" };
vi.mock("../src/settings/store", () => ({ getSettings: () => settings }));

describe("Spotify auth", () => {
  beforeEach(() => vi.resetModules());

  it("reports credentials and redirect URI", async () => {
    const auth = await import("../src/features/spotify/auth");
    expect(auth.hasSpotifyCredentials()).toBe(true);
    expect(auth.getSpotifyRedirectUri()).toContain("chromiumapp.org");
  });

  it("validates stored auth and falls back to localStorage", async () => {
    vi.stubGlobal("chrome", makeChrome({ [SPOTIFY_AUTH_KEY]: { accessToken: "a", refreshToken: "r", expiresAt: 2 } }));
    let auth = await import("../src/features/spotify/auth");
    await expect(auth.loadSpotifyAuth()).resolves.toMatchObject({ accessToken: "a" });
    vi.stubGlobal("chrome", undefined);
    localStorage.setItem(SPOTIFY_AUTH_KEY, JSON.stringify({ accessToken: "b", refreshToken: "r", expiresAt: 3 }));
    vi.resetModules();
    auth = await import("../src/features/spotify/auth");
    await expect(auth.loadSpotifyAuth()).resolves.toMatchObject({ accessToken: "b" });
  });

  it("saves and clears tokens in both stores", async () => {
    const auth = await import("../src/features/spotify/auth");
    const token = { accessToken: "a", refreshToken: "r", expiresAt: 10 };
    await auth.saveSpotifyAuth(token);
    expect(localStorage.getItem(SPOTIFY_AUTH_KEY)).toContain('"accessToken":"a"');
    await auth.clearSpotifyAuth();
    expect(localStorage.getItem(SPOTIFY_AUTH_KEY)).toBeNull();
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(SPOTIFY_AUTH_KEY);
  });

  it("returns a fresh token without network work", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    vi.stubGlobal("chrome", makeChrome({ [SPOTIFY_AUTH_KEY]: { accessToken: "fresh", refreshToken: "r", expiresAt: 100_000 } }));
    const auth = await import("../src/features/spotify/auth");
    await expect(auth.getValidAccessToken()).resolves.toBe("fresh");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refreshes an expiring token and preserves refresh token", async () => {
    vi.stubGlobal("chrome", makeChrome({ [SPOTIFY_AUTH_KEY]: { accessToken: "old", refreshToken: "refresh", expiresAt: 0 } }));
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ access_token: "new", expires_in: 3600 })));
    const auth = await import("../src/features/spotify/auth");
    await expect(auth.getValidAccessToken()).resolves.toBe("new");
    expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({ [SPOTIFY_AUTH_KEY]: expect.objectContaining({ refreshToken: "refresh" }) }));
  });

  it("clears stale auth when refresh fails", async () => {
    vi.stubGlobal("chrome", makeChrome({ [SPOTIFY_AUTH_KEY]: { accessToken: "old", refreshToken: "refresh", expiresAt: 0 } }));
    vi.mocked(fetch).mockResolvedValue(new Response("no", { status: 400 }));
    const auth = await import("../src/features/spotify/auth");
    await expect(auth.getValidAccessToken()).resolves.toBeNull();
    expect(chrome.storage.local.remove).toHaveBeenCalled();
  });

  it("completes the authorization-code flow with state validation", async () => {
    const launch = vi.mocked(chrome.identity.launchWebAuthFlow);
    launch.mockImplementation(((details: { url: string }, callback: (url?: string) => void) => {
      const state = new URL(details.url).searchParams.get("state");
      callback(`https://extension.chromiumapp.org/?code=code&state=${state}`);
    }) as typeof chrome.identity.launchWebAuthFlow);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      access_token: "access", refresh_token: "refresh", expires_in: 3600, scope: "scope",
    })));
    const auth = await import("../src/features/spotify/auth");
    await expect(auth.connectSpotify()).resolves.toMatchObject({ accessToken: "access", refreshToken: "refresh" });
    expect(fetch).toHaveBeenCalledWith("https://accounts.spotify.com/api/token", expect.objectContaining({ method: "POST" }));
  });

  it("rejects OAuth state mismatch", async () => {
    vi.mocked(chrome.identity.launchWebAuthFlow).mockImplementation(((details: { url: string }, callback: (url?: string) => void) => {
      callback("https://extension.chromiumapp.org/?code=code&state=wrong");
    }) as typeof chrome.identity.launchWebAuthFlow);
    const auth = await import("../src/features/spotify/auth");
    await expect(auth.connectSpotify()).rejects.toThrow("OAuth state mismatch");
  });
});
