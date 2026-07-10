export interface Settings {
  birthDate: string;
  birthTime: string;
  lifespan: number;
  showDeath: boolean;
  /** US ZIP / postal — drives weather pane */
  zipCode: string;
  /**
   * URL of a one-shot room snapshot JSON (recent shouts only — not a live feed).
   * Only used when FEATURES.room is enabled.
   * Empty → bundled example at examples/room-feed.example.json
   */
  roomJsonUrl: string;
  bgImage: string;
  /** Spotify Developer Dashboard → Client ID (local only; never commit). */
  spotifyClientId: string;
  /** Spotify Client Secret (local only; never commit). */
  spotifyClientSecret: string;
}

export const DEFAULTS: Settings = {
  birthDate: "",
  birthTime: "00:00:00",
  lifespan: 80,
  showDeath: false,
  zipCode: "",
  roomJsonUrl: "",
  bgImage: "",
  spotifyClientId: "",
  spotifyClientSecret: "",
};

export const STORAGE_KEY = "newTabSettings";

/** OAuth tokens for Spotify — stored separately from settings form values. */
export const SPOTIFY_AUTH_KEY = "spotifyAuth";

export interface SpotifyAuth {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when access token is considered expired. */
  expiresAt: number;
  scope?: string;
}
