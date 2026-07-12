/**
 * Hacker News pane — retro TUI story table, ported from hackerNews4me.crx.
 *
 * Table layout (# · TITLE · PTS · CMT · AGE · BY), reverse-video selection,
 * j/k keyboard nav, list tabs (top/new/ask/show), client-side points sort,
 * and RES-style hide with a short undo window.
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
const HIDE_UNDO_MS = 4800;
const HIDDEN_IDS_KEY = "hnHiddenIds";

const LISTS: HnList[] = ["top", "new", "ask", "show"];

let stories: HnStory[] = [];
let currentList: HnList = "top";
let selectedIndex = 0;
let sortByPoints = false;
let loading = false;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let lastLoadedAt = 0;
let hiddenIds = new Set<number>();

interface PendingHide {
  story: HnStory;
  timer: ReturnType<typeof setTimeout>;
  startedAt: number;
}

const pendingHides = new Map<number, PendingHide>();

const el = {
  badge: () => requireEl<HTMLElement>("hn-badge"),
  refresh: () => requireEl<HTMLButtonElement>("hn-refresh"),
  tabs: () => requireEl<HTMLElement>("hn-tabs"),
  sort: () => requireEl<HTMLButtonElement>("hn-sort"),
  table: () => requireEl<HTMLElement>("hn-table"),
  status: () => requireEl<HTMLElement>("hn-status"),
  undo: () => requireEl<HTMLElement>("hn-undo"),
  undoTitle: () => requireEl<HTMLElement>("hn-undo-title"),
  undoBar: () => requireEl<HTMLElement>("hn-undo-bar"),
  undoButton: () => requireEl<HTMLButtonElement>("hn-undo-button"),
};

async function loadHiddenIds(): Promise<void> {
  let raw: unknown;
  try {
    raw = (await chrome.storage.local.get(HIDDEN_IDS_KEY))[HIDDEN_IDS_KEY];
  } catch {
    try {
      raw = JSON.parse(localStorage.getItem(HIDDEN_IDS_KEY) ?? "[]");
    } catch {
      raw = [];
    }
  }
  hiddenIds = new Set(
    Array.isArray(raw)
      ? raw.filter((id): id is number => Number.isFinite(id)).map(Math.trunc).slice(-500)
      : [],
  );
}

async function persistHiddenIds(): Promise<void> {
  const ids = [...hiddenIds].slice(-500);
  hiddenIds = new Set(ids);
  try { localStorage.setItem(HIDDEN_IDS_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
  try { await chrome.storage.local.set({ [HIDDEN_IDS_KEY]: ids }); } catch { /* mirror remains */ }
}

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
    row.dataset.id = String(story.id);
    row.setAttribute("role", "row");
    if (index === selectedIndex) row.classList.add("is-selected");
    if (pendingHides.has(story.id)) row.classList.add("is-pending-hide");

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
  const max = visibleStories().length - 1;
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
    stories = fresh.filter((story) => !hiddenIds.has(story.id));
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

function showUndoToast(story: HnStory, durationMs = HIDE_UNDO_MS): void {
  el.undoTitle().textContent = story.title;
  el.undo().hidden = false;
  const bar = el.undoBar();
  bar.style.animation = "none";
  void bar.offsetWidth;
  bar.style.animation = "";
  bar.style.animationDuration = `${durationMs}ms`;
}

function refreshUndoToast(): void {
  const last = [...pendingHides.values()].at(-1);
  if (!last) {
    el.undo().hidden = true;
    return;
  }
  showUndoToast(last.story, Math.max(200, HIDE_UNDO_MS - (Date.now() - last.startedAt)));
}

function hideSelected(): void {
  const shown = visibleStories();
  const story = shown[selectedIndex];
  if (!story || pendingHides.has(story.id)) return;

  const row = el.table().querySelector<HTMLElement>(`[data-id="${story.id}"]`);
  row?.classList.add("is-pending-hide");
  row?.style.setProperty("--hn-hide-ms", `${HIDE_UNDO_MS}ms`);
  selectedIndex = selectedIndex < shown.length - 1 ? selectedIndex + 1 : Math.max(0, selectedIndex - 1);
  selectRow(selectedIndex);

  const timer = setTimeout(() => void commitHide(story.id), HIDE_UNDO_MS);
  pendingHides.set(story.id, { story, timer, startedAt: Date.now() });
  showUndoToast(story);
  setStatus(`hiding… press u to undo (${Math.round(HIDE_UNDO_MS / 1000)}s)`);
}

function undoHide(preferId?: number): void {
  let id = preferId;
  if (id == null) {
    const selected = visibleStories()[selectedIndex];
    id = selected && pendingHides.has(selected.id) ? selected.id : [...pendingHides.keys()].at(-1);
  }
  if (id == null) {
    setStatus("nothing left to undo");
    return;
  }
  const pending = pendingHides.get(id);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingHides.delete(id);
  const row = el.table().querySelector<HTMLElement>(`[data-id="${id}"]`);
  row?.classList.remove("is-pending-hide");
  row?.style.removeProperty("--hn-hide-ms");
  const index = visibleStories().findIndex((story) => story.id === id);
  if (index >= 0) selectRow(index);
  refreshUndoToast();
  setStatus("hide undone");
}

async function commitHide(id: number): Promise<void> {
  if (!pendingHides.has(id)) return;
  pendingHides.delete(id);
  hiddenIds.add(id);
  void persistHiddenIds();
  void hideOnHn(id);
  const removedIndex = visibleStories().findIndex((story) => story.id === id);
  stories = stories.filter((story) => story.id !== id);
  if (removedIndex >= 0 && selectedIndex > removedIndex) selectedIndex--;
  selectedIndex = Math.min(selectedIndex, Math.max(0, visibleStories().length - 1));
  renderTable();
  refreshUndoToast();
  setStatus("hidden");
}

async function hideOnHn(id: number): Promise<void> {
  try {
    const item = await fetch(`https://news.ycombinator.com/item?id=${id}`, { credentials: "include" });
    const html = await item.text();
    if (!/logout\?auth=/i.test(html)) return;
    const match = html.match(new RegExp(`href="(hide\\?id=${id}[^\"]*)"`, "i"));
    if (!match?.[1]) return;
    const url = new URL(match[1].replace(/&amp;/g, "&"), "https://news.ycombinator.com/");
    if (url.origin !== "https://news.ycombinator.com" || url.pathname !== "/hide") return;
    await fetch(url, { credentials: "include", redirect: "follow" });
  } catch { /* local hide still succeeds */ }
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
    case "x":
      e.preventDefault();
      hideSelected();
      break;
    case "u":
      e.preventDefault();
      undoHide();
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
  el.undoButton().addEventListener("click", () => undoHide());

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
  void loadHiddenIds().then(refresh);
}
