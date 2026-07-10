import { requireEl } from "../lib/dom.js";

/** Core DOM refs always present on the new-tab page. */
export const els = {
  clock: requireEl<HTMLTimeElement>("clock"),
  ageDisplay: requireEl<HTMLElement>("age-display"),
  ageLabel: requireEl<HTMLElement>("age-label"),
  deathCountdown: requireEl<HTMLElement>("death-countdown"),
  lifeSegments: requireEl<HTMLElement>("life-segments"),
  lifeBadge: requireEl<HTMLElement>("life-badge"),
  lifePane: requireEl<HTMLElement>("life-pane"),
  ringProgress: requireEl<SVGCircleElement>("ring-progress"),
  ringRemaining: requireEl<SVGCircleElement>("ring-remaining"),
  ringTicks: requireEl<SVGGElement>("ring-ticks"),
  bgLayer: requireEl<HTMLElement>("bg-layer"),
  settingsToggle: requireEl<HTMLButtonElement>("settings-toggle"),
  settingsDialog: requireEl<HTMLDialogElement>("settings-dialog"),
  settingsForm: requireEl<HTMLFormElement>("settings-form"),
  settingsCancel: requireEl<HTMLButtonElement>("settings-cancel"),
  birthDate: requireEl<HTMLInputElement>("birth-date"),
  birthTime: requireEl<HTMLInputElement>("birth-time"),
  lifespan: requireEl<HTMLInputElement>("lifespan"),
  showDeath: requireEl<HTMLInputElement>("show-death"),
  bgImage: requireEl<HTMLInputElement>("bg-image"),
  zipCode: requireEl<HTMLInputElement>("zip-code"),
  weatherBadge: requireEl<HTMLElement>("weather-badge"),
  weatherSetup: requireEl<HTMLElement>("weather-setup"),
  weatherLive: requireEl<HTMLElement>("weather-live"),
  wxTemp: requireEl<HTMLElement>("wx-temp"),
  wxPlace: requireEl<HTMLElement>("wx-place"),
  wxHumidity: requireEl<HTMLElement>("wx-humidity"),
  wxWind: requireEl<HTMLElement>("wx-wind"),
  wxSunrise: requireEl<HTMLElement>("wx-sunrise"),
  wxSunset: requireEl<HTMLElement>("wx-sunset"),
  wxHours: requireEl<HTMLElement>("wx-hours"),
  wxTemps: requireEl<HTMLElement>("wx-temps"),
  wxWinds: requireEl<HTMLElement>("wx-winds"),
  wxUvs: requireEl<HTMLElement>("wx-uvs"),
  wxBars: requireEl<HTMLElement>("wx-bars"),
  wxWindBars: requireEl<HTMLElement>("wx-wind-bars"),
  wxUvBars: requireEl<HTMLElement>("wx-uv-bars"),
  wxSky: requireEl<HTMLElement>("wx-sky"),
  wxWindIco: requireEl<HTMLElement>("wx-wind-ico"),
  wxHumBar: requireEl<HTMLElement>("wx-hum-bar"),
  wxUv: requireEl<HTMLElement>("wx-uv"),
  wxError: requireEl<HTMLElement>("wx-error"),
};

/** Optional room DOM — only required when FEATURES.room is on. */
export interface RoomEls {
  roomJsonUrl: HTMLInputElement;
  roomBadge: HTMLElement;
  roomStatus: HTMLElement;
  roomLog: HTMLElement;
  roomRefresh: HTMLButtonElement;
  imgTooltip: HTMLElement;
  imgTooltipSrc: HTMLImageElement;
}

export function getRoomEls(): RoomEls | null {
  const ids = [
    "room-json-url",
    "room-badge",
    "room-status",
    "room-log",
    "room-refresh",
    "img-tooltip",
    "img-tooltip-src",
  ] as const;
  for (const id of ids) {
    if (!document.getElementById(id)) return null;
  }
  return {
    roomJsonUrl: requireEl<HTMLInputElement>("room-json-url"),
    roomBadge: requireEl<HTMLElement>("room-badge"),
    roomStatus: requireEl<HTMLElement>("room-status"),
    roomLog: requireEl<HTMLElement>("room-log"),
    roomRefresh: requireEl<HTMLButtonElement>("room-refresh"),
    imgTooltip: requireEl<HTMLElement>("img-tooltip"),
    imgTooltipSrc: requireEl<HTMLImageElement>("img-tooltip-src"),
  };
}
