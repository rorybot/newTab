/**
 * Generic snapshot-feed loader — GETs pre-shaped JSON built by
 * backend/build_feeds.py. See OPTIMIZATION_PLAN.md for the pattern.
 *
 * Failure is normal (backend not running): callers keep their bundled
 * fallback data, so a new tab never blocks on the network.
 */

import { FEED_BASE_URL } from "../config/backend.js";

export interface FeedEnvelope<T> {
  version: number;
  updatedAt: string;
  entries: T[];
}

const FEED_TIMEOUT_MS = 3000;

export async function loadFeed<T>(name: string): Promise<FeedEnvelope<T> | null> {
  try {
    const res = await fetch(`${FEED_BASE_URL}/${name}.json`, {
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as FeedEnvelope<T>;
    if (!Array.isArray(data.entries) || data.entries.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}
