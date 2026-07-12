import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/feeds", () => ({ loadFeed: vi.fn() }));
import { loadFeed } from "../src/lib/feeds";
import { domainOf, itemUrl, loadHnStories, timeAgo } from "../src/features/hn/api";

describe("HN API", () => {
  beforeEach(() => vi.mocked(loadFeed).mockResolvedValue(null));

  it("formats URLs, domains, and ages", () => {
    expect(itemUrl(42)).toBe("https://news.ycombinator.com/item?id=42");
    expect(domainOf("https://www.example.com/a")).toBe("example.com");
    expect(domainOf(itemUrl(1))).toBe("");
    expect(domainOf("bad")).toBe("");
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    expect(timeAgo(999)).toBe("1s");
    expect(timeAgo(940)).toBe("1m");
    expect(timeAgo(0)).toBe("");
  });

  it("uses a fresh top feed", async () => {
    vi.mocked(loadFeed).mockResolvedValue({ version: 1, updatedAt: new Date().toISOString(), entries: [{ id: 1 }] as never });
    await expect(loadHnStories("top")).resolves.toMatchObject({ source: "feed", stories: [{ id: 1 }] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches, filters, and maps live items", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify([1, 2, 3])))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 1, title: "One", score: 4, descendants: 2, time: 10, by: "a" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 2, title: "Dead", dead: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 3, title: "Three", url: "https://x.test" })));
    const result = await loadHnStories("new");
    expect(result.source).toBe("live");
    expect(result.stories).toHaveLength(2);
    expect(result.stories[0]).toMatchObject({ id: 1, url: itemUrl(1), comments: 2 });
  });

  it("throws when the list fetch fails", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 503 }));
    await expect(loadHnStories("show")).rejects.toThrow("HN list fetch failed (503)");
  });
});
