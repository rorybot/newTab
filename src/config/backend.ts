/**
 * Backend feed endpoint — where build_feeds.py output is served from.
 *
 * Dev default matches serve_feed.py (backend/out/ → port 8765).
 * Promote to a settings field when the backend moves to a real server
 * (Phase 3 in OPTIMIZATION_PLAN.md).
 */
export const FEED_BASE_URL = "http://127.0.0.1:8765/feeds";
