import { describe, expect, it } from "vitest";
import { nextSyncAt } from "../../../src/core/feedback/sync-cadence.js";
import type { UploadCursor } from "../../../src/core/feedback/upload-cursor.js";

const NOW = Date.parse("2026-11-20T12:00:00.000Z");
const DAY_MS = 86_400_000;
const EMPTY: UploadCursor = { history: null, logs: null, lastUploadAt: null, lastSyncAt: null };
const at = (daysFromNow: number) => new Date(NOW + daysFromNow * DAY_MS).toISOString();

describe("nextSyncAt", () => {
  it("is due now while no sync has completed", () => {
    expect(nextSyncAt(EMPTY, NOW, 7)).toBeNull();
  });

  it("waits the interval after a completed sync", () => {
    expect(nextSyncAt({ ...EMPTY, lastSyncAt: at(-3) }, NOW, 7)).toBe(NOW + 4 * DAY_MS);
    expect(nextSyncAt({ ...EMPTY, lastSyncAt: at(-7) }, NOW, 7)).toBeNull();
  });

  it("is due now when a batch was acknowledged after the last completed sync", () => {
    const unfinished = { ...EMPTY, lastSyncAt: at(-3), lastUploadAt: at(-1) };

    expect(nextSyncAt(unfinished, NOW, 7)).toBeNull();
  });

  it("is due now when the last sync is dated in the future (the clock was set back)", () => {
    expect(nextSyncAt({ ...EMPTY, lastSyncAt: at(30) }, NOW, 7)).toBeNull();
  });
});
