import { ageInYears, expectedDeathDate, parseBirthDateTime } from "../../lib/age.js";
import { formatAge, formatClock, formatDuration } from "../../lib/format.js";
import { getSettings } from "../../settings/store.js";
import { els } from "../../ui/refs.js";

const RING_R = 82;
const RING_CX = 100;
const RING_CY = 100;

let ticksDrawnFor: number | null = null;

export function updateClock(): void {
  const now = new Date();
  els.clock.textContent = formatClock(now);
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
  const lived = Math.max(0, Math.min(1, livedFraction)) * 100;
  const remain = 100 - lived;
  els.ringProgress.style.strokeDasharray = `${lived} ${100 - lived}`;
  els.ringRemaining.style.strokeDasharray = `0 ${lived} ${remain} 0`;
}

export function updateAge(): void {
  const settings = getSettings();
  const birth = parseBirthDateTime(settings.birthDate, settings.birthTime);
  const lifespan = Number(settings.lifespan) || 80;
  ensureRingTicks(lifespan);

  if (!birth) {
    els.lifePane.classList.add("needs-setup");
    els.ageDisplay.textContent = "set birth date";
    els.ageLabel.textContent = "⚙ settings to start";
    els.deathCountdown.hidden = true;
    els.lifeSegments.textContent = "life ring idle · no birthday yet";
    els.lifeBadge.textContent = "setup";
    updateRing(0);
    return;
  }

  els.lifePane.classList.remove("needs-setup");
  const now = new Date();
  const years = ageInYears(birth, now);
  const fraction = years / lifespan;

  els.ageDisplay.textContent = formatAge(years);
  els.ageLabel.textContent = "years old";
  els.lifeBadge.textContent = `${Math.min(100, fraction * 100).toFixed(1)}%`;

  updateRing(fraction);

  const wholeYears = Math.floor(years);
  const decade = Math.floor(years / 10) * 10;
  const yearInDecade = wholeYears - decade;
  els.lifeSegments.textContent =
    `segment ${wholeYears + 1}/${lifespan} · decade ${decade}–${decade + 9} · +${yearInDecade}y in block · ` +
    `${Math.max(0, lifespan - years).toFixed(2)}y est. left`;

  if (settings.showDeath) {
    const death = expectedDeathDate(birth, lifespan);
    const remaining = death.getTime() - now.getTime();
    if (remaining > 0) {
      els.deathCountdown.textContent = `~${formatDuration(remaining)} left @ ${lifespan}y`;
    } else {
      els.deathCountdown.textContent = "outlived the estimate · keep going";
    }
    els.deathCountdown.hidden = false;
  } else {
    els.deathCountdown.hidden = true;
  }
}

export function tickLife(): void {
  updateClock();
  updateAge();
}

export function initLifePane(): void {
  tickLife();
  setInterval(tickLife, 50);
}
