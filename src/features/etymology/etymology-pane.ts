/**
 * Etymology pane — Root of the Day (mock TUI).
 *
 * Uses a tiny hardcoded list (demo). When a real data source is wired,
 * replace the array with a fetch from etymonline.com or a snapshot JSON.
 */

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

const ROOTS: RootEntry[] = [
  {
    word: "husband",
    senses: "n. & v.",
    earliest: "c. 1290",
    oe: "hūsbōnda 'house-master' (rare)",
    on: "húsbóndi 'house-master, husband' (hús + bóndi 'dweller, farmer')",
    composition: "hús 'house' + bóndi 'freeholder, farmer'",
    pie: "*bʰuH- 'to be, dwell' + *dʰeh₁- 'to put, place'",
    note: "The modern 'spouse' sense narrowed in Middle English; the verb 'to husband' (manage thriftily) is 16c.",
  },
  {
    word: "window",
    senses: "n.",
    earliest: "c. 1225",
    oe: "(no direct cognate; window concept expressed with ēagþyrel 'eye-hole')",
    on: "vindauga 'wind-eye' (vindr + auga)",
    composition: "vindr 'wind' + auga 'eye' — a literal hole to let the wind in",
    pie: "*h₂weh₁- 'to blow' + *h₃ekʷ- 'to see'",
    note: "Replaced OE ēagþyrel; the 'eye' metaphor survives in many Germanic languages.",
  },
  {
    word: "ghost",
    senses: "n.",
    earliest: "OE (Beowulf c. 725)",
    oe: "gāst 'soul, spirit, breath'",
    on: "(cognate) andi 'spirit' (modern Scandinavian forms)",
    composition: "from PIE root for 'to blow, breathe' — the soul as breath",
    pie: "*gʰeh₁- 'to gape, yawn' or *gʰews- 'to breathe' (disputed)",
    note: "The gh- spelling is a 16c. affectation; cognate with Ger. Geist and the -geist in Zeitgeist.",
  },
];

let current: RootEntry | null = null;

function pickRandom(): RootEntry {
  return ROOTS[Math.floor(Math.random() * ROOTS.length)];
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
  if (senses) senses.textContent = current.senses;
  if (earliest) earliest.textContent = current.earliest;
  if (oe) oe.textContent = current.oe;
  if (on) on.textContent = current.on;
  if (comp) comp.textContent = current.composition;
  if (pie) pie.textContent = current.pie;
  if (n) n.textContent = current.note;

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
}
