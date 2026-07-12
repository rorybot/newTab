/**
 * Etymology pane — Root of the Day (mock TUI).
 *
 * Bundled with a 10k-word dataset built by backend/build_feeds.py from the
 * yosevu/etymonline dump (see that script for how OE/ON/PIE fields are
 * extracted). Also tries the live backend snapshot feed, which — once a
 * server is actually running it — overrides the bundled copy with a fresher
 * one; the bundled copy is what actually renders day to day.
 */

import { loadFeed } from "../../lib/feeds.js";
import ETYMOLOGY_DATA from "./etymology-data.json" with { type: "json" };

interface RootEntry {
  word: string;
  senses: string;           // noun / verb / etc.
  earliest: string;         // e.g. "c. 1290"
  oe: string;               // Old English form + gloss
  on: string;               // Old Norse source
  composition: string;      // how it was put together
  pie: string;              // PIE root + meaning
  note: string;             // extra commentary
}

let entries: RootEntry[] = ETYMOLOGY_DATA as RootEntry[];
let current: RootEntry | null = null;

function pickRandom(): RootEntry {
  return entries[Math.floor(Math.random() * entries.length)]!;
}

function render(): void {
  if (!current) current = pickRandom();

  const w = document.getElementById("etym-word");
  const senses = document.getElementById("etym-senses");
  const earliest = document.getElementById("etym-earliest");
  const oe = document.getElementById("etym-oe");
  const on = document.getElementById("etym-on");
  const comp = document.getElementById("etym-comp");
  const pie = document.getElementById("etym-pie");
  const n = document.getElementById("etym-note");
  const timeline = document.getElementById("etym-timeline");

  if (w) w.textContent = current.word;
  if (senses) senses.textContent = current.senses || "—";
  if (earliest) earliest.textContent = current.earliest || "—";
  if (oe) oe.textContent = current.oe || "—";
  if (on) on.textContent = current.on || "—";
  if (comp) comp.textContent = current.composition || "—";
  if (pie) pie.textContent = current.pie || "—";
  if (n) n.textContent = current.note || "—";

  // Visual timeline: ON → OE/ME → ModE (very compact TUI style)
  if (timeline) {
    timeline.innerHTML = `
      <span class="layer">ON</span>
      <span class="arrow">→</span>
      <span class="layer">OE/ME</span>
      <span class="arrow">→</span>
      <span class="layer">ModE</span>
      <span class="arrow">→</span>
      <span class="layer pie">PIE</span>
    `;
  }
}



export function initEtymologyPane(): void {
  render();
  const pane = document.getElementById("etymology-pane");
  if (pane) {
    pane.addEventListener("click", () => {
      current = pickRandom();
      render();
    });
  }

  void loadFeed<RootEntry>("etymology").then((feed) => {
    if (!feed) return;
    entries = feed.entries;
    current = pickRandom();
    render();
  });
}
