import { getSettings } from "../settings/store.js";
import { els } from "./refs.js";

export function applyBackground(): void {
  const url = (getSettings().bgImage || "").trim();
  if (url) {
    els.bgLayer.classList.add("has-image");
    document.body.classList.add("has-bg-image");
    const safe = url.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    els.bgLayer.style.backgroundImage = `url("${safe}")`;
  } else {
    els.bgLayer.classList.remove("has-image");
    document.body.classList.remove("has-bg-image");
    els.bgLayer.style.backgroundImage = "";
  }
}
