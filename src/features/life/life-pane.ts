import { ageInYears, expectedDeathDate, parseBirthDateTime } from "../../lib/age.js";
import { formatAge, formatClock, formatDuration } from "../../lib/format.js";
import { getSettings } from "../../settings/store.js";
import { els } from "../../ui/refs.js";

const RING_R = 82;
const RING_CX = 100;
const RING_CY = 100;

/**
 * Life pane used to tick every 50ms (20 Hz), rewriting the clock, age digits,
 * ring SVG, and death countdown on every tick. That alone can pin a few % CPU
 * on a new-tab page that sits open all day.
 *
 * Split cadence:
 * - AGE_MS: only the high-precision age string (mortality-style decimals)
 * - SLOW_MS: clock, ring, badge, segments, death countdown
 * Pause entirely while the document is hidden.
 */
const AGE_MS = 250;
const SLOW_MS = 1000;

let ticksDrawnFor: number | null = null;
let ageTimer: ReturnType<typeof setInterval> | null = null;
let slowTimer: ReturnType<typeof setInterval> | null = null;

let lastClockText = "";
let lastAgeText = "";
let lastAgeLabel = "";
let lastBadge = "";
let lastSegments = "";
let lastDeathText = "";
let lastDeathHidden: boolean | null = null;
let lastRingKey = "";
let lastNeedsSetup: boolean | null = null;

function setTextIfChanged(el: HTMLElement, next: string, prev: string): string {
  if (next === prev) return prev;
  el.textContent = next;
  return next;
}

export function updateClock(): void {
  const now = new Date();
  const text = formatClock(now);
  if (text === lastClockText) return;
  lastClockText = text;
  els.clock.textContent = text;
  els.clock.dateTime = now.toISOString();
}

/** Draw tick marks around the life ring. */
function ensureRingTicks(lifespanYears: number): void {
  const n = Math.max(1, Math.min(150, Math.round(lifespanYears)));
  if (ticksDrawnFor === n) return;
  ticksDrawnFor = n;

  const frag = document.createDocumentFragment();
  const outer = RING_R + 6;
  const innerYear = RING_R + 1;
  const innerDecade = RING_R - 2;

  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    const isDecade = i % 10 === 0;
    const inner = isDecade ? innerDecade : innerYear;
    const x1 = RING_CX + Math.cos(angle) * outer;
    const y1 = RING_CY + Math.sin(angle) * outer;
    const x2 = RING_CX + Math.cos(angle) * inner;
    const y2 = RING_CY + Math.sin(angle) * inner;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(x1));
    line.setAttribute("y1", String(y1));
    line.setAttribute("x2", String(x2));
    line.setAttribute("y2", String(y2));
    if (isDecade) line.classList.add("decade");
    frag.appendChild(line);
  }

  els.ringTicks.replaceChildren(frag);
}

function updateRing(livedFraction: number): void {
  // Quantize so tiny fractional changes don't thrash stroke-dasharray every tick.
  const lived = Math.round(Math.max(0, Math.min(1, livedFraction)) * 1000) / 10;
  const key = String(lived);
  if (key === lastRingKey) return;
  lastRingKey = key;
  const remain = 100 - lived;
  els.ringProgress.style.strokeDasharray = `${lived} ${100 - lived}`;
  els.ringRemaining.style.strokeDasharray = `0 ${lived} ${remain} 0`;
}

/** Fast path: only the rolling age digits. */
function updateAgeDigitsOnly(): void {
  const settings = getSettings();
  const birth = parseBirthDateTime(settings.birthDate, settings.birthTime);
  if (!birth) return;

  const years = ageInYears(birth);
  lastAgeText = setTextIfChanged(els.ageDisplay, formatAge(years), lastAgeText);
}

export function updateAge(opts: { full?: boolean } = {}): void {
  const full = opts.full !== false;
  const settings = getSettings();
  const birth = parseBirthDateTime(settings.birthDate, settings.birthTime);
  const lifespan = Number(settings.lifespan) || 80;

  if (full) {
    ensureRingTicks(lifespan);
  }

  if (!birth) {
    if (lastNeedsSetup !== true) {
      els.lifePane.classList.add("needs-setup");
      lastNeedsSetup = true;
    }
    lastAgeText = setTextIfChanged(els.ageDisplay, "set birth date", lastAgeText);
    lastAgeLabel = setTextIfChanged(els.ageLabel, "⚙ settings to start", lastAgeLabel);
    if (lastDeathHidden !== true) {
      els.deathCountdown.hidden = true;
      lastDeathHidden = true;
    }
    lastSegments = setTextIfChanged(
      els.lifeSegments,
      "life ring idle · no birthday yet",
      lastSegments,
    );
    lastBadge = setTextIfChanged(els.lifeBadge, "setup", lastBadge);
    if (full) updateRing(0);
    return;
  }

  if (lastNeedsSetup !== false) {
    els.lifePane.classList.remove("needs-setup");
    lastNeedsSetup = false;
  }

  const now = new Date();
  const years = ageInYears(birth, now);
  const fraction = years / lifespan;

  lastAgeText = setTextIfChanged(els.ageDisplay, formatAge(years), lastAgeText);
  lastAgeLabel = setTextIfChanged(els.ageLabel, "years old", lastAgeLabel);

  if (!full) return;

  lastBadge = setTextIfChanged(
    els.lifeBadge,
    `${Math.min(100, fraction * 100).toFixed(1)}%`,
    lastBadge,
  );

  updateRing(fraction);

  const wholeYears = Math.floor(years);
  const decade = Math.floor(years / 10) * 10;
  const yearInDecade = wholeYears - decade;
  lastSegments = setTextIfChanged(
    els.lifeSegments,
    `segment ${wholeYears + 1}/${lifespan} · decade ${decade}–${decade + 9} · +${yearInDecade}y in block · ` +
      `${Math.max(0, lifespan - years).toFixed(2)}y est. left`,
    lastSegments,
  );

  if (settings.showDeath) {
    const death = expectedDeathDate(birth, lifespan);
    const remaining = death.getTime() - now.getTime();
    const deathText =
      remaining > 0
        ? `~${formatDuration(remaining)} left @ ${lifespan}y`
        : "outlived the estimate · keep going";
    lastDeathText = setTextIfChanged(els.deathCountdown, deathText, lastDeathText);
    if (lastDeathHidden !== false) {
      els.deathCountdown.hidden = false;
      lastDeathHidden = false;
    }
  } else if (lastDeathHidden !== true) {
    els.deathCountdown.hidden = true;
    lastDeathHidden = true;
  }
}

export function tickLife(): void {
  updateClock();
  updateAge({ full: true });
}

function stopLifeTimers(): void {
  if (ageTimer != null) {
    clearInterval(ageTimer);
    ageTimer = null;
  }
  if (slowTimer != null) {
    clearInterval(slowTimer);
    slowTimer = null;
  }
}

function startLifeTimers(): void {
  stopLifeTimers();
  tickLife();
  ageTimer = setInterval(updateAgeDigitsOnly, AGE_MS);
  slowTimer = setInterval(() => {
    updateClock();
    updateAge({ full: true });
  }, SLOW_MS);
}

export function initLifePane(): void {
  startLifeTimers();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopLifeTimers();
    } else {
      startLifeTimers();
    }
  });
}
