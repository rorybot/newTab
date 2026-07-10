export function requireEl<T extends Element>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required element #${id}`);
  return el as unknown as T;
}

export function optionalEl<T extends Element>(id: string): T | null {
  return document.getElementById(id) as unknown as T | null;
}

/** Hide all [data-feature="name"] nodes when a flag is off. */
export function applyFeatureVisibility(
  flags: Record<string, boolean>,
): void {
  document.querySelectorAll<HTMLElement>("[data-feature]").forEach((el) => {
    const name = el.dataset.feature;
    if (!name) return;
    const on = flags[name] === true;
    el.hidden = !on;
    el.classList.toggle("feature-off", !on);
  });
}
