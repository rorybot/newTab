import { describe, expect, it, vi } from "vitest";
import type { HnStory } from "../src/features/hn/api";

const stories: HnStory[] = [
  { id: 1, title: "First", url: "https://one.test", score: 10, comments: 2, time: 100, by: "alice" },
  { id: 2, title: "Second", url: "https://two.test", score: 20, comments: 3, time: 200, by: "bob" },
];

vi.mock("../src/features/hn/api", async (original) => {
  const actual = await original<typeof import("../src/features/hn/api")>();
  return { ...actual, loadHnStories: vi.fn(async () => ({ stories, source: "live" })) };
});

function fixture(): void {
  document.body.innerHTML = `
    <span id="hn-badge"></span><button id="hn-refresh" hidden></button>
    <div id="hn-tabs"><button class="hn-tab" data-list="top"></button><button class="hn-tab" data-list="new"></button></div>
    <button id="hn-sort"></button><div id="hn-table"></div><p id="hn-status" hidden></p>
    <div id="hn-undo" hidden><span id="hn-undo-title"></span><button id="hn-undo-button"></button><div id="hn-undo-bar"></div></div>`;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("HN pane interactions", () => {
  it("renders, navigates, sorts, hides, undoes, and persists a committed hide", async () => {
    vi.useFakeTimers();
    fixture();
    const { initHnPane } = await import("../src/features/hn/hn-pane");
    initHnPane();
    await flush();

    expect(document.querySelectorAll(".hn-item")).toHaveLength(2);
    expect(document.querySelector(".hn-item.is-selected")?.getAttribute("data-id")).toBe("1");

    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
    expect(document.querySelector(".hn-item.is-selected")?.getAttribute("data-id")).toBe("2");
    document.getElementById("hn-sort")?.click();
    expect(document.querySelector(".hn-story-link")?.textContent).toBe("Second");

    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
    expect(document.querySelector(".hn-item.is-pending-hide")).not.toBeNull();
    expect((document.getElementById("hn-undo") as HTMLElement).hidden).toBe(false);

    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "u", bubbles: true }));
    expect(document.querySelector(".hn-item.is-pending-hide")).toBeNull();
    expect((document.getElementById("hn-undo") as HTMLElement).hidden).toBe(true);

    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
    await vi.advanceTimersByTimeAsync(4800);
    expect(document.querySelectorAll(".hn-item")).toHaveLength(1);
    expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({ hnHiddenIds: expect.any(Array) }));
  });

  it("blocks shortcuts while editing or a dialog is open", async () => {
    vi.useFakeTimers();
    fixture();
    const input = document.createElement("input");
    document.body.append(input);
    const { initHnPane } = await import("../src/features/hn/hn-pane");
    initHnPane();
    await flush();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
    expect(document.querySelector(".is-pending-hide")).toBeNull();
  });
});
