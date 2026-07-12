/**
 * Hacker News pane — retro TUI story table, ported from hackerNews4me.crx.
 *
 * Table layout (# · TITLE · PTS · CMT · AGE · BY), reverse-video selection,
 * j/k keyboard nav, list tabs (top/new/ask/show), client-side points sort.
 * Read-only: no vote/hide (those need an HN session on news.ycombinator.com).
 */

import { requireEl } from "../../lib/dom.js";
import {
  domainOf,
  itemUrl,
  loadHnStories,
  timeAgo,
  type HnList,
  type HnStory,
} from "./api.js";

const REFRESH_MS = 5 * 60 * 1000;

const LISTS: HnList[] = ["top", "new", "ask", "show"];

let stories: HnStory[] = [];
let currentList: HnList = "top";
let selectedIndex = 0;
let sortByPoints = false;
let loading = false;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let lastLoadedAt = 0;

const el = {
  badge: () => requireEl<HTMLElement>("hn-badge"),
  refresh: () => requireEl<HTMLButtonElement>("hn-refresh"),
  tabs: () => requireEl<HTMLElement>("hn-tabs"),
  sort: () => requireEl<HTMLButtonElement>("hn-sort"),
  table: () => requireEl<HTMLElement>("hn-table"),
  status: () => requireEl<HTMLElement>("hn-status"),
};

function setBadge(text: string, dim = true): void {
  el.badge().textContent = text;
  el.badge().classList.toggle("dim", dim);
}

function setStatus(msg: string | null): void {
  const status = el.status();
  status.hidden = !msg;
  status.textContent = msg ?? "";
}

function visibleStories(): HnStory[] {
  if (!sortByPoints) return stories;
  return [...stories].sort((a, b) => b.score - a.score || b.time - a.time);
}

function openStory(story: HnStory): void {
  window.open(story.url, "_blank", "noopener");
}

function openComments(story: HnStory): void {
  window.open(itemUrl(story.id), "_blank", "noopener");
}

function renderTable(): void {
  const table = el.table();
  table.innerHTML = "";

  const head = document.createElement("div");
  head.className = "hn-row hn-head";
  head.setAttribute("role", "row");
  for (const label of ["#", "title", "pts", "cmt", "age", "by"]) {
    const cell = document.createElement("span");
    cell.className = `hn-cell hn-col-${label === "#" ? "rank" : label}`;
    cell.setAttribute("role", "columnheader");
    cell.textContent = label === "pts" && sortByPoints ? "pts↓" : label;
    head.appendChild(cell);
  }
  table.appendChild(head);

  visibleStories().forEach((story, index) => {
    const row = document.createElement("div");
    row.className = "hn-row hn-item";
    row.setAttribute("role", "row");
    if (index === selectedIndex) row.classList.add("is-selected");

    const rank = document.createElement("span");
    rank.className = "hn-cell hn-col-rank";
    rank.textContent = String(index + 1);

    const title = document.createElement("span");
    title.className = "hn-cell hn-col-title";
    const link = document.createElement("a");
    link.className = "hn-story-link";
    link.href = story.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = story.title;
    link.addEventListener("click", () => selectRow(index));
    title.appendChild(link);
    const domain = domainOf(story.url);
    if (domain) {
      const d = document.createElement("span");
      d.className = "hn-domain";
      d.textContent = domain;
      title.appendChild(d);
    }

    const pts = document.createElement("span");
    pts.className = "hn-cell hn-col-pts";
    pts.textContent = String(story.score);

    const cmt = document.createElement("span");
    cmt.className = "hn-cell hn-col-cmt";
    const cLink = document.createElement("a");
    cLink.href = itemUrl(story.id);
    cLink.target = "_blank";
    cLink.rel = "noopener noreferrer";
    cLink.textContent = String(story.comments);
    cLink.title = "Open comments (Enter)";
    cLink.addEventListener("click", () => selectRow(index));
    cmt.appendChild(cLink);

    const age = document.createElement("span");
    age.className = "hn-cell hn-col-age";
    age.textContent = timeAgo(story.time);
    age.title = story.time ? new Date(story.time * 1000).toLocaleString() : "";

    const by = document.createElement("span");
    by.className = "hn-cell hn-col-by";
    by.textContent = story.by;

    row.append(rank, title, pts, cmt, age, by);
    row.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("a")) return;
      selectRow(index);
    });
    row.addEventListener("dblclick", (e) => {
      if ((e.target as HTMLElement).closest("a")) return;
      openComments(story);
    });
    table.appendChild(row);
  });

  if (!stories.length && !loading) {
    const empty = document.createElement("p");
    empty.className = "hn-empty muted";
    empty.textContent = "no stories";
    table.appendChild(empty);
  }
}

function selectRow(index: number): void {
  const max = stories.length - 1;
  selectedIndex = Math.max(0, Math.min(index, max));
  el.table()
    .querySelectorAll(".hn-item")
    .forEach((row, i) => row.classList.toggle("is-selected", i === selectedIndex));
  el.table()
    .querySelector(".hn-item.is-selected")
    ?.scrollIntoView({ block: "nearest" });
}

function renderTabs(): void {
  el.tabs()
    .querySelectorAll<HTMLButtonElement>(".hn-tab")
    .forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.list === currentList);
    });
  el.sort().textContent = sortByPoints ? "sort: pts↓" : "sort: feed";
}

async function refresh(): Promise<void> {
  if (loading) return;
  loading = true;
  setBadge("…", true);
  setStatus(null);
  try {
    const { stories: fresh, source } = await loadHnStories(currentList);
    stories = fresh;
    lastLoadedAt = Date.now();
    selectedIndex = Math.min(selectedIndex, Math.max(0, stories.length - 1));
    setBadge(source === "feed" ? "feed" : "live", false);
  } catch (err) {
    setBadge("err", true);
    setStatus(
      `hn unreachable (${err instanceof Error ? err.message : String(err)}) — press r to retry`,
    );
  } finally {
    loading = false;
    renderTable();
  }
}

function switchList(list: HnList): void {
  if (list === currentList) return;
  currentList = list;
  selectedIndex = 0;
  renderTabs();
  void refresh();
}

function startAutoRefresh(): void {
  stopAutoRefresh();
  refreshTimer = setInterval(() => void refresh(), REFRESH_MS);
}

function stopAutoRefresh(): void {
  if (refreshTimer != null) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function keyboardTargetBlocked(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return true;
  const target = e.target as HTMLElement | null;
  if (target && target.closest("input, textarea, select, [contenteditable]")) return true;
  return Boolean(document.querySelector("dialog[open]"));
}

function onKeyDown(e: KeyboardEvent): void {
  if (keyboardTargetBlocked(e)) return;
  const story = visibleStories()[selectedIndex];
  switch (e.key) {
    case "j":
      e.preventDefault();
      selectRow(selectedIndex + 1);
      break;
    case "k":
      e.preventDefault();
      selectRow(selectedIndex - 1);
      break;
    case "Enter":
      if (story) openComments(story);
      break;
    case "l":
    case "o":
      if (story) openStory(story);
      break;
    case "r":
      void refresh();
      break;
  }
}

export function initHnPane(): void {
  el.refresh().hidden = false;
  el.refresh().addEventListener("click", () => void refresh());

  el.tabs().addEventListener("click", (e) => {
    const tab = (e.target as HTMLElement).closest<HTMLButtonElement>(".hn-tab");
    const list = tab?.dataset.list as HnList | undefined;
    if (list && LISTS.includes(list)) switchList(list);
  });

  el.sort().addEventListener("click", () => {
    sortByPoints = !sortByPoints;
    selectedIndex = 0;
    renderTabs();
    renderTable();
  });

  document.addEventListener("keydown", onKeyDown);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopAutoRefresh();
    } else {
      startAutoRefresh();
      if (Date.now() - lastLoadedAt > REFRESH_MS) void refresh();
    }
  });

  renderTabs();
  startAutoRefresh();
  void refresh();
}
