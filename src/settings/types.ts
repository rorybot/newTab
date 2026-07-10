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
}

export const DEFAULTS: Settings = {
  birthDate: "",
  birthTime: "00:00:00",
  lifespan: 80,
  showDeath: false,
  zipCode: "",
  roomJsonUrl: "",
  bgImage: "",
};

export const STORAGE_KEY = "newTabSettings";
