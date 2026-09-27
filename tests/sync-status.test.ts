// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { syncOnce } from "../apps/web/src/sync-core";
import { synchronize, useSyncState } from "../apps/web/src/sync";

vi.mock("../apps/web/src/db", () => ({ db: {} }));
vi.mock("../apps/web/src/supabase", () => ({ supabase: {} }));
vi.mock("../apps/web/src/sync-core", () => ({ syncOnce: vi.fn() }));

const previous = "2026-09-26T12:00:00.000Z";
beforeEach(() => {
  vi.mocked(syncOnce).mockReset();
  localStorage.clear();
  vi.stubGlobal("navigator", { onLine: true });
});
afterEach(() => vi.unstubAllGlobals());

it.each(["skipped", "error", "disconnect"])(
  "preserves the last successful timestamp after %s",
  async (scenario) => {
    const key = `lv:lastSync:${scenario}`;
    localStorage.setItem(key, previous);
    vi.mocked(syncOnce).mockImplementation(async () => {
      if (scenario === "error") throw new Error("Upload failed");
      if (scenario === "disconnect")
        vi.stubGlobal("navigator", { onLine: false });
      return scenario === "disconnect";
    });
    if (scenario === "error")
      await expect(synchronize(scenario)).rejects.toThrow("Upload failed");
    else await synchronize(scenario);
    expect(localStorage.getItem(key)).toBe(previous);
    const { result, unmount } = renderHook(() => useSyncState(scenario));
    expect(result.current.lastSync).toBe(previous);
    expect(result.current.syncing).toBe(false);
    if (scenario === "error")
      expect(result.current.error).toBe("Upload failed");
    unmount();
  },
);

it("does not start or update the timestamp offline", async () => {
  localStorage.setItem("lv:lastSync:offline", previous);
  vi.stubGlobal("navigator", { onLine: false });
  await synchronize("offline");
  expect(syncOnce).not.toHaveBeenCalled();
  expect(localStorage.getItem("lv:lastSync:offline")).toBe(previous);
});

it("records success only after the queued rerun completes", async () => {
  localStorage.setItem("lv:lastSync:rerun", previous);
  let finish!: (completed: boolean) => void;
  vi.mocked(syncOnce)
    .mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    )
    .mockImplementationOnce(async () => {
      expect(localStorage.getItem("lv:lastSync:rerun")).toBe(previous);
      return true;
    });
  const running = synchronize("rerun");
  const queued = synchronize("rerun");
  finish(false);
  await Promise.all([running, queued]);
  expect(syncOnce).toHaveBeenCalledTimes(2);
  expect(localStorage.getItem("lv:lastSync:rerun")).not.toBe(previous);
  const { result, unmount } = renderHook(() => useSyncState("rerun"));
  expect(result.current.lastSync).toBe(
    localStorage.getItem("lv:lastSync:rerun"),
  );
  expect(result.current.error).toBe("");
  unmount();
});
