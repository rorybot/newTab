/**
 * Radar data source — free ADS-B point queries, no API key.
 *
 * Primary: adsb.fi open data. Fallback: airplanes.live. Both serve the same
 * readsb-style JSON ({ ac: [...] }) for aircraft within N nautical miles of
 * a point, and both ask for gentle polling (the pane refreshes once a minute).
 */

export interface Aircraft {
  /** ICAO 24-bit hex id. */
  hex: string;
  /** Callsign / flight number ("" when not broadcast). */
  flight: string;
  /** Registration (tail number), when known. */
  reg: string;
  /** ICAO type code (B738, A320…), when known. */
  type: string;
  /** Barometric altitude in ft, or null when on the ground / unknown. */
  altFt: number | null;
  onGround: boolean;
  /** Vertical rate in ft/min (negative = descending), when known. */
  baroRate: number | null;
  /** Ground speed in knots. */
  gsKt: number | null;
  /** True track in degrees. */
  track: number | null;
  lat: number;
  lon: number;
  /** Great-circle distance from the query point, nautical miles. */
  distNm: number;
  /** Initial bearing from the query point, degrees. */
  bearing: number;
  /** Seconds since last position report. */
  seenPosS: number;
}

export type RadarSource = "adsb.fi" | "airplanes.live";

interface RawAircraft {
  hex?: string;
  flight?: string;
  r?: string;
  t?: string;
  alt_baro?: number | "ground";
  baro_rate?: number;
  gs?: number;
  track?: number;
  lat?: number;
  lon?: number;
  seen_pos?: number;
}

/** adsb.fi keys the list "aircraft"; airplanes.live keys it "ac". */
interface RadarResponse {
  ac?: RawAircraft[];
  aircraft?: RawAircraft[];
}

const FETCH_TIMEOUT_MS = 8000;

const SOURCES: Array<{ name: RadarSource; url: (lat: number, lon: number, nm: number) => string }> = [
  {
    name: "adsb.fi",
    url: (lat, lon, nm) => `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${nm}`,
  },
  {
    name: "airplanes.live",
    url: (lat, lon, nm) => `https://api.airplanes.live/v2/point/${lat}/${lon}/${nm}`,
  },
];

export async function fetchNearbyAircraft(
  lat: number,
  lon: number,
  radiusNm: number,
): Promise<{ aircraft: Aircraft[]; source: RadarSource }> {
  const nm = Math.min(250, Math.max(1, Math.round(radiusNm)));
  let lastErr: unknown = null;

  for (const source of SOURCES) {
    try {
      const res = await fetch(source.url(lat, lon, nm), {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`${source.name} ${res.status}`);
      const data = (await res.json()) as RadarResponse;
      const list = data.ac ?? data.aircraft ?? [];
      return { aircraft: normalize(list, lat, lon, nm), source: source.name };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("all radar sources failed");
}

function normalize(raw: RawAircraft[], lat: number, lon: number, radiusNm: number): Aircraft[] {
  const planes: Aircraft[] = [];
  for (const ac of raw) {
    if (typeof ac.lat !== "number" || typeof ac.lon !== "number") continue;
    const distNm = haversineNm(lat, lon, ac.lat, ac.lon);
    if (distNm > radiusNm) continue;
    const onGround = ac.alt_baro === "ground";
    planes.push({
      hex: (ac.hex ?? "").trim(),
      flight: (ac.flight ?? "").trim(),
      reg: (ac.r ?? "").trim(),
      type: (ac.t ?? "").trim(),
      altFt: typeof ac.alt_baro === "number" ? ac.alt_baro : null,
      onGround,
      baroRate: typeof ac.baro_rate === "number" ? ac.baro_rate : null,
      gsKt: typeof ac.gs === "number" ? ac.gs : null,
      track: typeof ac.track === "number" ? ac.track : null,
      lat: ac.lat,
      lon: ac.lon,
      distNm,
      bearing: bearingDeg(lat, lon, ac.lat, ac.lon),
      seenPosS: typeof ac.seen_pos === "number" ? ac.seen_pos : 0,
    });
  }
  return planes.sort((a, b) => a.distNm - b.distNm);
}

const EARTH_RADIUS_NM = 3440.065;

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(a));
}

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLon = (lon2 - lon1) * rad;
  const y = Math.sin(dLon) * Math.cos(lat2 * rad);
  const x =
    Math.cos(lat1 * rad) * Math.sin(lat2 * rad) -
    Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos(dLon);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

/** Map link for one aircraft (adsb.fi globe view). */
export function globeUrl(ac: Aircraft): string {
  return `https://globe.adsb.fi/?icao=${encodeURIComponent(ac.hex)}`;
}

export function fmtAlt(ac: Aircraft): string {
  if (ac.onGround) return "gnd";
  if (ac.altFt == null) return "—";
  return `${(ac.altFt / 1000).toFixed(1)}k`;
}

/** Climb/descend marker from vertical rate (dead-band ±128 ft/min). */
export function trendChar(ac: Aircraft): string {
  if (ac.baroRate == null || Math.abs(ac.baroRate) < 128) return " ";
  return ac.baroRate > 0 ? "↑" : "↓";
}

export function fmtSpeed(ac: Aircraft): string {
  return ac.gsKt == null ? "—" : String(Math.round(ac.gsKt));
}

export function fmtDist(nm: number): string {
  return nm < 10 ? nm.toFixed(1) : String(Math.round(nm));
}

const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];

/** 8-way arrow for a track/bearing in degrees. */
export function arrowFor(deg: number | null): string {
  if (deg == null) return "·";
  return ARROWS[Math.round(((deg % 360) + 360) % 360 / 45) % 8]!;
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function compassFor(deg: number): string {
  return COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8]!;
}
