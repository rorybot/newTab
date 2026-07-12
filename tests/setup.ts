import { afterEach, beforeEach, vi } from "vitest";

type Store = Record<string, unknown>;

export function makeChrome(initial: Store = {}): typeof chrome & { __store: Store } {
  const store: Store = { ...initial };
  const local = {
    get: vi.fn(async (keys?: string | string[] | Store | null) => {
      if (typeof keys === "string") return { [keys]: store[keys] };
      if (Array.isArray(keys)) return Object.fromEntries(keys.map((key) => [key, store[key]]));
      if (keys && typeof keys === "object") return { ...keys, ...store };
      return { ...store };
    }),
    set: vi.fn(async (items: Store) => { Object.assign(store, items); }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key];
    }),
    clear: vi.fn(async () => { for (const key of Object.keys(store)) delete store[key]; }),
  };
  return {
    __store: store,
    storage: { local, sync: local },
    identity: {
      getRedirectURL: vi.fn(() => "https://extension.chromiumapp.org/"),
      launchWebAuthFlow: vi.fn(),
    },
    runtime: { lastError: undefined },
  } as unknown as typeof chrome & { __store: Store };
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
  vi.stubGlobal("chrome", makeChrome());
  vi.stubGlobal("fetch", vi.fn());
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
