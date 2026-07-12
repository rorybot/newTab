import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/features/spotify/auth", () => ({ getValidAccessToken: vi.fn() }));
import { getValidAccessToken } from "../src/features/spotify/auth";
import { fetchCurrentlyPlaying, SpotifyApiError } from "../src/features/spotify/api";

describe("Spotify API", () => {
  beforeEach(() => vi.mocked(getValidAccessToken).mockResolvedValue("token"));

  it("rejects calls without a token", async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue(null);
    await expect(fetchCurrentlyPlaying()).rejects.toMatchObject({ status: 401 });
  });

  it.each([[204], [401], [403], [429]])("handles status %s", async (status) => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status }));
    if (status === 204) await expect(fetchCurrentlyPlaying()).resolves.toBeNull();
    else await expect(fetchCurrentlyPlaying()).rejects.toBeInstanceOf(SpotifyApiError);
  });

  it("surfaces other HTTP errors with bounded response text", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("bad", { status: 500 }));
    await expect(fetchCurrentlyPlaying()).rejects.toThrow("Spotify API 500: bad");
  });

  it("maps a track and chooses appropriately sized art", async () => {
    vi.spyOn(Date, "now").mockReturnValue(123);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      is_playing: true,
      progress_ms: 42,
      currently_playing_type: "track",
      item: {
        id: "id", name: "Song", duration_ms: 100,
        artists: [{ name: "A" }, { name: "B" }],
        album: { name: "Album", images: [{ url: "large", width: 640 }, { url: "small", width: 128 }] },
        external_urls: { spotify: "https://open.spotify.com/x" },
      },
    })));
    await expect(fetchCurrentlyPlaying()).resolves.toEqual({
      isPlaying: true, progressMs: 42, fetchedAt: 123,
      track: { id: "id", name: "Song", artists: "A, B", album: "Album", albumArtUrl: "small", durationMs: 100, externalUrl: "https://open.spotify.com/x" },
    });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("currently-playing"), expect.objectContaining({ headers: { Authorization: "Bearer token" } }));
  });

  it("ignores non-track and empty playback payloads", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ item: null })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ currently_playing_type: "episode", item: { name: "Podcast" } })));
    await expect(fetchCurrentlyPlaying()).resolves.toBeNull();
    await expect(fetchCurrentlyPlaying()).resolves.toBeNull();
  });
});
