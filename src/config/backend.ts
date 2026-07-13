/**
 * Backend feed endpoint — where build_feeds.py output is served from.
 *
 * Points at the gondolin home server (Docker Compose: newtab-weather-builder
 * + newtab-weather-server, see ~/docker/containers/newtab-weather on that
 * host), not localhost — the backend runs on a different machine than the
 * browser. Promote to a settings field if this ever needs to be per-install
 * (Phase 3 in OPTIMIZATION_PLAN.md).
 */
export const FEED_BASE_URL = "http://192.168.1.26:8765/feeds";
