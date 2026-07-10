const YEAR_MS = 365.2425 * 24 * 60 * 60 * 1000;

export function parseBirthDateTime(
  birthDate: string,
  birthTime: string,
): Date | null {
  if (!birthDate) return null;
  const time = birthTime && birthTime.length >= 5 ? birthTime : "00:00:00";
  const normalized = time.length === 5 ? `${time}:00` : time;
  const d = new Date(`${birthDate}T${normalized}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Precise age in years with high fractional resolution (Mortality-style). */
export function ageInYears(birth: Date, now = new Date()): number {
  const ms = now.getTime() - birth.getTime();
  if (ms < 0) return 0;
  return ms / YEAR_MS;
}

export function expectedDeathDate(birth: Date, lifespanYears: number): Date {
  return new Date(birth.getTime() + lifespanYears * YEAR_MS);
}
