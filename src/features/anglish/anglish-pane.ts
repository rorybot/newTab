/**
 * Anglish pane — Germanic alternatives (mock TUI).
 *
 * Bundled with a 9k-word dataset built by backend/build_feeds.py, scraped
 * from the Anglish Moot Wordbook + the Hurlebatte wordbook. Also tries the
 * live backend snapshot feed, which — once a server is actually running it —
 * overrides the bundled copy with a fresher one.
 */

import { loadFeed } from "../../lib/feeds.js";
import ANGLISH_DATA from "./anglish-data.json" with { type: "json" };

interface AnglishEntry {
  modern: string;
  anglish: string;
  note: string;
}

let entries: AnglishEntry[] = ANGLISH_DATA as AnglishEntry[];
let current: AnglishEntry | null = null;

function pickRandom(): AnglishEntry {
  return entries[Math.floor(Math.random() * entries.length)]!;
}

function render(): void {
  if (!current) current = pickRandom();

  const m = document.getElementById("ang-word");
  const a = document.getElementById("ang-alt");
  const n = document.getElementById("ang-note");

  if (m) m.textContent = current.modern;
  if (a) a.textContent = current.anglish;
  if (n) n.textContent = current.note || "—";
}

export function initAnglishPane(): void {
  render();
  const pane = document.getElementById("anglish-pane");
  if (pane) {
    pane.addEventListener("click", () => {
      current = pickRandom();
      render();
    });
  }

  void loadFeed<AnglishEntry>("anglish").then((feed) => {
    if (!feed) return;
    entries = feed.entries;
    current = pickRandom();
    render();
  });
}
