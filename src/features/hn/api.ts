/**
 * HN data source — feed-first per OPTIMIZATION_PLAN.md: try the backend
 * snapshot (build_feeds.py → hn.json), fall back to the live Firebase API
 * when the feed is missing or stale so the pane is never dead.
 *
 * Only "top" is snapshotted; the other lists always fetch live.
 */

import { loadFeed } from "../../lib/feeds.js";

export type HnList = "top" | "new" | "ask" | "show";

export interface HnStory {
  id: number;
  title: string;
  url: string;
  score: number;
  comments: number;
  /** Unix seconds. */
  time: number;
  by: string;
}

export type HnSource = "feed" | "live";

const API = "https://hacker-news.firebaseio.com/v0";

const LIST_ENDPOINTS: Record<HnList, string> = {
  top: "topstories",
  new: "newstories",
  ask: "askstories",
  show: "showstories",
};

const STORY_LIMIT = 30;
const FEED_FRESH_MS = 30 * 60 * 1000;
const FETCH_CONCURRENCY = 12;

export function itemUrl(id: number): string {
  return `https://news.ycombinator.com/item?id=${id}`;
}

export async function loadHnStories(
  list: HnList,
): Promise<{ stories: HnStory[]; source: HnSource }> {
  if (list === "top") {
    const feed = await loadFeed<HnStory>("hn");
    if (feed && Date.now() - Date.parse(feed.updatedAt) < FEED_FRESH_MS) {
      return { stories: feed.entries.slice(0, STORY_LIMIT), source: "feed" };
    }
  }
  return { stories: await fetchLive(list), source: "live" };
}

interface RawItem {
  id: number;
  title?: string;
  url?: string;
  score?: number;
  descendants?: number;
  time?: number;
  by?: string;
  deleted?: boolean;
  dead?: boolean;
}

async function fetchLive(list: HnList): Promise<HnStory[]> {
  const res = await fetch(`${API}/${LIST_ENDPOINTS[list]}.json`);
  if (!res.ok) throw new Error(`HN list fetch failed (${res.status})`);
  const ids = ((await res.json()) as number[]).slice(0, STORY_LIMIT);
  const items = await fetchItems(ids);
  return items
    .filter((it): it is RawItem => Boolean(it && !it.deleted && !it.dead && it.title))
    .map((it) => ({
      id: it.id,
      title: it.title ?? "(untitled)",
      url: it.url || itemUrl(it.id),
      score: it.score ?? 0,
      comments: it.descendants ?? 0,
      time: it.time ?? 0,
      by: it.by ?? "",
    }));
}

async function fetchItems(ids: number[]): Promise<Array<RawItem | null>> {
  const results: Array<RawItem | null> = new Array(ids.length).fill(null);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < ids.length) {
      const idx = next++;
      try {
        const res = await fetch(`${API}/item/${ids[idx]}.json`);
        results[idx] = res.ok ? ((await res.json()) as RawItem | null) : null;
      } catch {
        results[idx] = null;
      }
    }
  }

  const n = Math.min(FETCH_CONCURRENCY, Math.max(ids.length, 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

export function timeAgo(unixSeconds: number): string {
  if (!unixSeconds) return "";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - unixSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(mo / 12)}y`;
}

export function domainOf(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host === "news.ycombinator.com" ? "" : host;
  } catch {
    return "";
  }
}
