/**
 * Feature flags — flip when a module is ready for real use.
 *
 * Room is off until scrape + login architecture is settled
 * (session cookies / storage state on the server side).
 */
export const FEATURES = {
  /** Life ring + age clock (core). */
  life: true,
  /** Weather TUI via Open-Meteo. */
  weather: true,
  /** Spotify now-playing (needs client id/secret + user OAuth). */
  spotify: true,
  /**
   * Room snapshot JSON (recent shouts).
   * Disabled: needs login-aware scrape on the backend first.
   */
  room: false,
  /** Hacker News TUI story table (feed-first, live Firebase fallback). */
  hn: true,
  /** Etymology / Root of the Day (mock TUI) */
  etymology: true,
  /** Anglish Germanic alternatives (mock TUI) */
  anglish: true,
} as const;

export type FeatureName = keyof typeof FEATURES;

export function isFeatureEnabled(name: FeatureName): boolean {
  return FEATURES[name] === true;
}
