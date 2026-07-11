/**
 * Anglish pane — Germanic alternatives (mock TUI).
 *
 * Demo list only. Real implementation would map common Romance/Latin
 * loanwords to their historical or constructed Germanic counterparts.
 */

interface AnglishEntry {
  modern: string;
  anglish: string;
  note: string;
}

const ENTRIES: AnglishEntry[] = [
  {
    modern: "television",
    anglish: "far-seer",
    note: "OE feorr + sēon; calque of Greek tele- + vision",
  },
  {
    modern: "information",
    anglish: "in-form-ing",
    note: "or ‘tidings’ (still alive in ‘good tidings’)",
  },
  {
    modern: "education",
    anglish: "up-bringing",
    note: "or ‘learning’ — the Latin root educare = ‘lead out’",
  },
];

let current: AnglishEntry | null = null;

function pickRandom(): AnglishEntry {
  return ENTRIES[Math.floor(Math.random() * ENTRIES.length)];
}

function render(): void {
  if (!current) current = pickRandom();

  const m = document.getElementById("ang-word");
  const a = document.getElementById("ang-alt");
  const n = document.getElementById("ang-note");

  if (m) m.textContent = current.modern;
  if (a) a.textContent = current.anglish;
  if (n) n.textContent = current.note;
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
}
