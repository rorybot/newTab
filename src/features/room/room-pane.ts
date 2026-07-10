/**
 * Room snapshot pane — one-shot recent shouts via JSON URL.
 *
 * Feature-flagged off until backend scrape + login/session story is solid.
 * Enable in src/config/features.ts → FEATURES.room = true
 *
 * TODO (login): scraper must authenticate first (Playwright storage_state /
 * cookies). Extension only fetches the resulting JSON snapshot.
 */

import { pad } from "../../lib/format.js";
import { getSettings } from "../../settings/store.js";
import type { RoomEls } from "../../ui/refs.js";

/** Bundled demo snapshot when roomJsonUrl is empty. */
const ROOM_DEMO_PATH = "examples/room-feed.example.json";

interface RoomMessage {
  id: string;
  user: string;
  time: string;
  text: string;
  images?: string[];
}

interface RoomFeed {
  version?: number;
  updatedAt?: string;
  source?: string;
  messages: RoomMessage[];
}

const URL_IN_TEXT_RE = /(https?:\/\/[^\s<>"']+)/gi;

let roomEls: RoomEls | null = null;
let roomFetchInFlight = false;
let lastRoomUrl = "";

function setRoomStatus(text: string): void {
  if (!roomEls) return;
  roomEls.roomStatus.textContent = text;
}

function demoRoomFeedUrl(): string {
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(ROOM_DEMO_PATH);
  }
  return ROOM_DEMO_PATH;
}

function resolveRoomFeedUrl(): { url: string; label: string; isDemo: boolean } {
  const configured = (getSettings().roomJsonUrl || "").trim();
  if (configured) {
    return { url: configured, label: configured, isDemo: false };
  }
  const demo = demoRoomFeedUrl();
  return { url: demo, label: "bundled example snapshot", isDemo: true };
}

function hideImgTooltip(): void {
  if (!roomEls) return;
  roomEls.imgTooltip.hidden = true;
  roomEls.imgTooltipSrc.removeAttribute("src");
}

function showImgTooltip(src: string, clientX: number, clientY: number): void {
  if (!roomEls) return;
  roomEls.imgTooltipSrc.src = src;
  roomEls.imgTooltip.hidden = false;
  const gap = 12;
  const tw = 280;
  const th = 220;
  let left = clientX + gap;
  let top = clientY + gap;
  if (left + tw > window.innerWidth) left = clientX - tw - gap;
  if (top + th > window.innerHeight) top = clientY - th - gap;
  roomEls.imgTooltip.style.left = `${Math.max(4, left)}px`;
  roomEls.imgTooltip.style.top = `${Math.max(4, top)}px`;
}

function renderRoomText(
  container: HTMLElement,
  text: string,
  images: string[],
): void {
  container.replaceChildren();
  const parts = text.split(/(\[img\])/i);
  let imgIdx = 0;

  for (const part of parts) {
    if (/^\[img\]$/i.test(part)) {
      const src = images[imgIdx++];
      const span = document.createElement("span");
      span.className = "room-img-ref";
      span.textContent = "[img]";
      if (src) {
        span.dataset.src = src;
        span.title = "hover preview";
        span.addEventListener("mouseenter", (ev) => {
          showImgTooltip(src, ev.clientX, ev.clientY);
        });
        span.addEventListener("mousemove", (ev) => {
          if (roomEls && !roomEls.imgTooltip.hidden) {
            showImgTooltip(src, ev.clientX, ev.clientY);
          }
        });
        span.addEventListener("mouseleave", hideImgTooltip);
      }
      container.appendChild(span);
      container.appendChild(document.createTextNode(" "));
      continue;
    }

    let last = 0;
    const re = new RegExp(URL_IN_TEXT_RE.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(part)) !== null) {
      if (m.index > last) {
        container.appendChild(document.createTextNode(part.slice(last, m.index)));
      }
      const href = m[1] || m[0] || "";
      const a = document.createElement("a");
      a.className = "room-link";
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = href;
      container.appendChild(a);
      last = m.index + m[0].length;
    }
    if (last < part.length) {
      container.appendChild(document.createTextNode(part.slice(last)));
    }
  }

  while (imgIdx < images.length) {
    const src = images[imgIdx++];
    if (!src) continue;
    container.appendChild(document.createTextNode(" "));
    const span = document.createElement("span");
    span.className = "room-img-ref";
    span.textContent = "[img]";
    span.dataset.src = src;
    span.title = "hover preview";
    span.addEventListener("mouseenter", (ev) =>
      showImgTooltip(src, ev.clientX, ev.clientY),
    );
    span.addEventListener("mousemove", (ev) => {
      if (roomEls && !roomEls.imgTooltip.hidden) {
        showImgTooltip(src, ev.clientX, ev.clientY);
      }
    });
    span.addEventListener("mouseleave", hideImgTooltip);
    container.appendChild(span);
  }
}

function normalizeRoomFeed(raw: unknown): RoomFeed {
  if (!raw || typeof raw !== "object") {
    throw new Error("snapshot is not a JSON object");
  }
  const obj = raw as Record<string, unknown>;
  const list = Array.isArray(obj.messages) ? obj.messages : [];
  const messages: RoomMessage[] = [];

  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    if (!row || typeof row !== "object") continue;
    const m = row as Record<string, unknown>;
    const user =
      String(m.user ?? m.author ?? m.name ?? "unknown").trim() || "unknown";
    const time = String(m.time ?? m.date ?? m.timestamp ?? "").trim();
    let text = String(m.text ?? m.body ?? m.message ?? "").trim();
    const images = Array.isArray(m.images)
      ? m.images.map((x) => String(x)).filter(Boolean)
      : [];
    if (!text && images.length === 0) continue;
    if (!text && images.length) text = "[img]";
    const id = String(m.id ?? `${user}-${time}-${i}`);
    messages.push({ id, user, time, text, images });
  }

  return {
    version: typeof obj.version === "number" ? obj.version : 1,
    updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : undefined,
    source: typeof obj.source === "string" ? obj.source : undefined,
    messages,
  };
}

function renderRoomFeed(feed: RoomFeed, meta: string): void {
  if (!roomEls) return;
  roomEls.roomLog.replaceChildren();
  setRoomStatus(meta);

  if (!feed.messages.length) {
    const empty = document.createElement("p");
    empty.className = "room-empty";
    empty.textContent = "no messages in snapshot";
    roomEls.roomLog.appendChild(empty);
    return;
  }

  const stickToBottom =
    roomEls.roomLog.scrollHeight -
      roomEls.roomLog.scrollTop -
      roomEls.roomLog.clientHeight <
    40;

  for (const msg of feed.messages) {
    const row = document.createElement("article");
    row.className = "room-msg";
    row.dataset.id = msg.id;

    const head = document.createElement("div");
    head.className = "room-msg-head";
    const user = document.createElement("span");
    user.className = "room-user";
    user.textContent = msg.user;
    head.appendChild(user);
    if (msg.time) {
      const time = document.createElement("span");
      time.className = "room-time";
      time.textContent = msg.time;
      head.appendChild(time);
    }
    row.appendChild(head);

    const body = document.createElement("div");
    body.className = "room-text";
    renderRoomText(body, msg.text, msg.images || []);
    row.appendChild(body);

    roomEls.roomLog.appendChild(row);
  }

  if (stickToBottom || roomEls.roomLog.dataset.initial !== "0") {
    roomEls.roomLog.scrollTop = roomEls.roomLog.scrollHeight;
    roomEls.roomLog.dataset.initial = "0";
  }
}

function formatRoomUpdated(iso: string | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

/**
 * Load a room snapshot JSON (recent shouts only).
 * Does not scrape the chat site — only fetches whatever snapshot URL is configured.
 */
export async function refreshRoom(opts: { force?: boolean } = {}): Promise<void> {
  if (!roomEls) return;
  const { url, label, isDemo } = resolveRoomFeedUrl();
  if (
    !opts.force &&
    url === lastRoomUrl &&
    roomEls.roomLog.childElementCount > 0
  ) {
    return;
  }
  if (roomFetchInFlight) return;
  roomFetchInFlight = true;

  roomEls.roomBadge.textContent = "…";
  roomEls.roomBadge.classList.add("dim");
  setRoomStatus(
    isDemo ? "demo snapshot · loading…" : `loading snapshot · ${label}…`,
  );

  try {
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText || ""}`.trim());
    }
    const raw: unknown = await res.json();
    const feed = normalizeRoomFeed(raw);
    lastRoomUrl = url;

    const when = formatRoomUpdated(feed.updatedAt);
    const hostLabel = (() => {
      if (isDemo) return "example";
      try {
        return new URL(url).host;
      } catch {
        return "snapshot";
      }
    })();

    roomEls.roomBadge.textContent = String(feed.messages.length);
    roomEls.roomBadge.classList.remove("dim");
    const meta = [
      hostLabel,
      `${feed.messages.length} msgs`,
      when,
      feed.source ? feed.source.slice(0, 40) : "",
      isDemo ? "demo" : "snapshot",
      "↻",
    ]
      .filter(Boolean)
      .join(" · ");
    renderRoomFeed(feed, meta);
  } catch (err) {
    console.warn("room snapshot failed", err);
    const msg = err instanceof Error ? err.message : String(err);
    roomEls.roomBadge.textContent = "err";
    roomEls.roomBadge.classList.add("dim");
    roomEls.roomLog.replaceChildren();
    roomEls.roomLog.dataset.initial = "1";
    const p = document.createElement("p");
    p.className = "room-empty";
    p.textContent = isDemo
      ? `demo load failed · ${msg}`
      : `could not load snapshot · ${msg} · run scrape + serve, or check URL`;
    roomEls.roomLog.appendChild(p);
    setRoomStatus(isDemo ? `demo · error` : `error · ${label}`);
  } finally {
    roomFetchInFlight = false;
  }
}

export function getLastRoomUrl(): string {
  return lastRoomUrl;
}

export function fillRoomSettingsField(): void {
  if (!roomEls) return;
  roomEls.roomJsonUrl.value = getSettings().roomJsonUrl || "";
}

export function readRoomSettingsField(): string {
  if (!roomEls) return "";
  return (roomEls.roomJsonUrl.value || "").trim();
}

export function initRoomPane(els: RoomEls): void {
  roomEls = els;
  roomEls.roomRefresh.addEventListener("click", () => {
    void refreshRoom({ force: true });
  });
  void refreshRoom();
}
